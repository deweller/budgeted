import { describe, expect, it } from "vitest";

import {
    createWorkspaceDeleteChange,
    createWorkspaceUpsertChange,
} from "@/features/workspace/server/workspace-change-builder";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";

describe("workspace change builder", () => {
    it("marks a newly created record with an explicit absent prior state", () => {
        expect(
            createWorkspaceUpsertChange({
                entityId: "account-1",
                entityType: "account",
                previousRecord: null,
                record: { accountId: "account-1", name: "Checking" },
            }),
        ).toMatchObject({
            operation: "upsert",
            previousRecordDigest: null,
        });
    });

    it("digests the exact prior record for updates and deletes", () => {
        const previousRecord = { accountId: "account-1", name: "Checking" };
        const expectedDigest = calculateWorkspaceRecordDigest({
            entityType: "account",
            record: previousRecord,
        });

        expect(
            createWorkspaceUpsertChange({
                entityId: "account-1",
                entityType: "account",
                previousRecord,
                record: { ...previousRecord, name: "Everyday" },
            }).previousRecordDigest,
        ).toBe(expectedDigest);
        expect(
            createWorkspaceDeleteChange({
                entityId: "account-1",
                entityType: "account",
                previousRecord,
            }).previousRecordDigest,
        ).toBe(expectedDigest);
    });

    it("normalizes hidden transaction-line sentinels before digesting", () => {
        const previousRecord = {
            categoryId: "__no_category__",
            fromAccountId: "account-1",
            ledgerId: "ledger-1",
            lineId: "line-1",
            toAccountId: "__no_to_account__",
            transactionId: "transaction-1",
        };
        const publicRecord = {
            fromAccountId: "account-1",
            ledgerId: "ledger-1",
            lineId: "line-1",
            transactionId: "transaction-1",
        };

        expect(
            createWorkspaceDeleteChange({
                entityId: "line-1",
                entityType: "transactionLine",
                previousRecord,
            }).previousRecordDigest,
        ).toBe(
            calculateWorkspaceRecordDigest({
                entityType: "transactionLine",
                record: publicRecord,
            }),
        );
    });
});
