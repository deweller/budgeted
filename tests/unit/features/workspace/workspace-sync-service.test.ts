import { describe, expect, it } from "vitest";

import {
    createWorkspaceMutationBatch,
    getRetainedChangesAfter,
    getWorkspaceChangeExpiresAt,
    getOldestUsableWorkspaceRevision,
    getWorkspaceRevisionBatchRange,
    hasContiguousWorkspaceRevisions,
    findChangedLedgerCatalogRecords,
    partitionWorkspaceChangesForPersistence,
    toWorkspaceMutationBatchRecord,
    toWorkspaceMutationReceiptRecord,
} from "@/features/workspace/server/workspace-sync-service";

describe("workspace sync service", () => {
    it("isolates global ledger catalog edits by ledger id", () => {
        const ledger = {
            createdAt: "2026-01-01T00:00:00.000Z",
            isDefault: false,
            ledgerId: "ledger-1",
            name: "Ledger one",
            status: "active" as const,
            updatedAt: "2026-01-01T00:00:00.000Z",
            workspaceId: "global",
        };

        expect(
            findChangedLedgerCatalogRecords({
                beforeLedgers: [
                    ledger,
                    { ...ledger, ledgerId: "ledger-2", name: "Ledger two" },
                ],
                afterLedgers: [
                    ledger,
                    {
                        ...ledger,
                        ledgerId: "ledger-2",
                        name: "Renamed ledger two",
                        updatedAt: "2026-02-01T00:00:00.000Z",
                    },
                ],
            }),
        ).toMatchObject([
            {
                entityId: "ledger-2",
                entityType: "ledger",
                operation: "upsert",
                record: { name: "Renamed ledger two" },
            },
        ]);
    });

    it("sets change record expiration thirty days after the change", () => {
        const now = new Date("2026-06-05T12:00:00.000Z");

        expect(getWorkspaceChangeExpiresAt(now)).toBe(
            Math.floor(
                new Date("2026-07-05T12:00:00.000Z").getTime() / 1000,
            ),
        );
    });

    it("reports the retained change window thirty days behind generated knowledge", () => {
        const now = new Date("2026-06-05T12:00:00.000Z");

        expect(getRetainedChangesAfter(now)).toBe(
            "2026-05-06T12:00:00.000Z",
        );
    });

    it("creates one ordered durable manifest for a complete mutation", () => {
        const batch = createWorkspaceMutationBatch({
            changes: [
                {
                    entityId: "transaction-1",
                    entityType: "transaction",
                    operation: "upsert",
                    previousRecordDigest: null,
                    record: { transactionId: "transaction-1" },
                },
                {
                    entityId: "line-1",
                    entityType: "transactionLine",
                    operation: "upsert",
                    previousRecordDigest: null,
                    record: { lineId: "line-1" },
                },
            ],
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            mutationType: "transaction.create",
            response: { transaction: { transactionId: "transaction-1" } },
            workspaceGeneration: 1,
        });

        expect(batch.changeCursor).toBe(batch.changes.at(-1)?.changeId);
        expect(batch.changes).toHaveLength(2);
        expect(batch.changes).toMatchObject([
            { changeCount: 2, changeIndex: 0, workspaceRevision: 0 },
            { changeCount: 2, changeIndex: 1, workspaceRevision: 0 },
        ]);
        expect(batch.changes[0]?.changeId.localeCompare(batch.changes[1]!.changeId)).toBeLessThan(0);
        expect(toWorkspaceMutationBatchRecord(batch)).toMatchObject({
            changeCursor: batch.changeCursor,
            changeCount: 2,
            mutationId: "mutation-1",
            workspaceRevision: 0,
            workspaceRevisionKey: "0000000000000000",
        });
        expect(toWorkspaceMutationReceiptRecord(batch)).toEqual({
            batchId: batch.batchId,
            changeCursor: batch.changeCursor,
            expiresAt: batch.expiresAt,
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            mutationType: "transaction.create",
            workspaceId: "global",
        });
    });

    it("refuses to serialize a revisioned batch without prior-state proofs", () => {
        const batch = createWorkspaceMutationBatch({
            changes: [
                {
                    entityId: "transaction-1",
                    entityType: "transaction",
                    operation: "upsert",
                    previousRecordDigest: undefined as unknown as null,
                    record: { transactionId: "transaction-1" },
                },
            ],
            ledgerId: "ledger-1",
            mutationId: "mutation-proofless",
            mutationType: "transaction.update",
            response: {},
            workspaceGeneration: 1,
        });

        expect(() => toWorkspaceMutationBatchRecord(batch)).toThrow(
            "missing its previous record digest",
        );
    });

    it("does not republish workspace changes that are already in a durable batch", () => {
        const batch = createWorkspaceMutationBatch({
            changes: [
                {
                    entityId: "transaction-1",
                    entityType: "transaction",
                    operation: "upsert",
                    previousRecordDigest: null,
                    record: { transactionId: "transaction-1" },
                },
            ],
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            mutationType: "transaction.update",
            response: {},
            workspaceGeneration: 1,
        });

        expect(
            partitionWorkspaceChangesForPersistence([
                batch.changes[0]!,
                {
                    entityId: "amazon:amazon-payment-1",
                    entityType: "transactionImportActivity",
                    operation: "upsert",
                    previousRecordDigest: null,
                    record: { activityId: "amazon:amazon-payment-1" },
                },
            ]),
        ).toEqual({
            persistedChanges: [batch.changes[0]],
            unpublishedChanges: [
                {
                    entityId: "amazon:amazon-payment-1",
                    entityType: "transactionImportActivity",
                    operation: "upsert",
                    previousRecordDigest: null,
                    record: { activityId: "amazon:amazon-payment-1" },
                },
            ],
        });
    });

    it("requires every workspace revision between the cursor and knowledge", () => {
        expect(
            hasContiguousWorkspaceRevisions({
                afterRevision: 4,
                batches: [
                    { workspaceGeneration: 2, workspaceRevision: 5 },
                    { workspaceGeneration: 2, workspaceRevision: 6 },
                ],
                workspaceGeneration: 2,
                workspaceRevision: 6,
            }),
        ).toBe(true);

        expect(
            hasContiguousWorkspaceRevisions({
                afterRevision: 4,
                batches: [{ workspaceGeneration: 2, workspaceRevision: 6 }],
                workspaceGeneration: 2,
                workspaceRevision: 6,
            }),
        ).toBe(false);
    });

    it("bounds revision queries to complete batches through the captured revision", () => {
        expect(getWorkspaceRevisionBatchRange(4, 6)).toEqual({
            end: {
                batchId: "\uffff",
                workspaceRevisionKey: "0000000000000006",
            },
            start: {
                batchId: "\uffff",
                workspaceRevisionKey: "0000000000000004",
            },
        });
        expect(() => getWorkspaceRevisionBatchRange(7, 6)).toThrow(
            /backwards/i,
        );
    });

    it("derives the oldest usable cursor from non-expired complete batches", () => {
        expect(
            getOldestUsableWorkspaceRevision({
                batches: [
                    {
                        expiresAt: 1,
                        workspaceGeneration: 2,
                        workspaceRevision: 3,
                    },
                    {
                        expiresAt: 2_000_000_000,
                        workspaceGeneration: 2,
                        workspaceRevision: 6,
                    },
                ],
                now: new Date("2026-07-16T00:00:00.000Z"),
                workspaceGeneration: 2,
                workspaceRevision: 8,
            }),
        ).toBe(5);

        expect(
            getOldestUsableWorkspaceRevision({
                batches: [],
                now: new Date("2026-07-16T00:00:00.000Z"),
                workspaceGeneration: 2,
                workspaceRevision: 8,
            }),
        ).toBe(8);
    });
});
