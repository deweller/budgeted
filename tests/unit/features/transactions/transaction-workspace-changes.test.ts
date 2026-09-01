import { describe, expect, it } from "vitest";

import { createMergeWorkspaceChanges } from "@/features/transactions/server/transaction-workspace-changes";

const now = "2026-07-18T16:25:00.000Z";

function createTransaction(transactionId: string) {
    return {
        displayAmountCents: -1_250,
        enteredAt: now,
        kind: "standard" as const,
        ledgerId: "ledger-1",
        occurredAt: "2026-07-18",
        periodId: "2026-07",
        referenceAccountId: "account-1",
        status: "cleared" as const,
        transactionId,
        updatedAt: now,
    };
}

describe("createMergeWorkspaceChanges", () => {
    it("deletes then reinserts a line moved from the duplicate transaction", () => {
        const duplicateLine = {
            amountCents: 1_250,
            createdAt: now,
            fromAccountId: "account-1",
            ledgerId: "ledger-1",
            lineId: "line-1",
            sortOrder: 0,
            toAccountId: "__no_to_account__",
            transactionId: "duplicate-transaction",
            updatedAt: now,
        };
        const changes = createMergeWorkspaceChanges({
            duplicate: {
                children: { lines: [duplicateLine], postings: [] },
                plaidTransactionSyncRecords: [],
                transaction: createTransaction("duplicate-transaction"),
            },
            merged: createTransaction("survivor-transaction"),
            movedPlaidTransactionSyncRecords: [],
            survivor: {
                children: { lines: [], postings: [] },
                plaidTransactionSyncRecords: [],
                transaction: createTransaction("survivor-transaction"),
            },
            survivorChildrenAfterMerge: {
                lines: [
                    {
                        ...duplicateLine,
                        transactionId: "survivor-transaction",
                        updatedAt: "2026-07-18T16:26:00.000Z",
                    },
                ],
                postings: [],
            },
        });

        const lineChanges = changes.filter(
            (change) =>
                change.entityType === "transactionLine" &&
                change.entityId === duplicateLine.lineId,
        );

        expect(lineChanges).toHaveLength(2);
        expect(lineChanges[0]).toMatchObject({
            operation: "delete",
            previousRecordDigest: expect.any(String),
            record: null,
        });
        expect(lineChanges[1]).toMatchObject({
            operation: "upsert",
            previousRecordDigest: null,
            record: expect.objectContaining({
                transactionId: "survivor-transaction",
            }),
        });
    });
});
