import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    commitAtomicWorkspaceMutation: vi.fn(),
    findWorkspaceMutationBatch: vi.fn(),
    getStoredTransaction: vi.fn(),
    listPlaidTransactionSyncsForTransaction: vi.fn(),
    listTransactionChildren: vi.fn(),
}));

vi.mock(
    "@/features/plaid/server/plaid-transaction-sync-record-service",
    () => ({
        listPlaidTransactionSyncsForTransaction:
            mocks.listPlaidTransactionSyncsForTransaction,
    }),
);

vi.mock("@/features/transactions/server/transaction-child-service", () => ({
    listTransactionChildren: mocks.listTransactionChildren,
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    getStoredTransaction: mocks.getStoredTransaction,
}));

vi.mock("@/features/workspace/server/workspace-atomic-commit", () => ({
    commitAtomicWorkspaceMutation: mocks.commitAtomicWorkspaceMutation,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", async () => {
    const actual = await vi.importActual<
        typeof import("@/features/workspace/server/workspace-sync-service")
    >("@/features/workspace/server/workspace-sync-service");

    return {
        ...actual,
        findWorkspaceMutationBatch: mocks.findWorkspaceMutationBatch,
    };
});

import {
    getTransactionStatusBatchMutations,
    updateTransactionsStatusWithWorkspaceChanges,
} from "@/features/transactions/server/transaction-status-service";

describe("transaction status service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.findWorkspaceMutationBatch.mockResolvedValue(null);
        mocks.getStoredTransaction.mockResolvedValue({
            createdAt: "2026-07-18T10:00:00.000Z",
            displayAmountCents: -1_234,
            kind: "standard",
            ledgerId: "ledger-1",
            occurredAt: "2026-07-18T00:00:00.000Z",
            periodId: "2026-07",
            referenceAccountId: "account-1",
            source: "manual",
            status: "cleared",
            transactionId: "transaction-1",
            updatedAt: "2026-07-18T10:00:00.000Z",
        });
        mocks.listTransactionChildren.mockResolvedValue({
            lines: [],
            postings: [],
        });
        mocks.listPlaidTransactionSyncsForTransaction.mockResolvedValue([]);
        mocks.commitAtomicWorkspaceMutation.mockImplementation(
            async (input: {
                buildDomainItems: (entities: {
                    transactionAuditLogs: {
                        put: (record: unknown) => {
                            commit: () => unknown;
                        };
                    };
                    transactions: {
                        put: (record: unknown) => {
                            commit: () => unknown;
                            where: (
                                condition: (
                                    attributes: { updatedAt: string },
                                    operations: {
                                        eq: (attribute: string, value: string) => string;
                                    },
                                ) => string,
                            ) => {
                                commit: () => unknown;
                            };
                        };
                    };
                }) => unknown[];
                changes: unknown[];
                response: unknown;
            }) => {
                const items = input.buildDomainItems({
                    transactionAuditLogs: {
                        put: (record) => ({
                            commit: () => ({ record, type: "audit" }),
                        }),
                    },
                    transactions: {
                        put: (record) => ({
                            commit: () => ({ record, type: "transaction" }),
                            where: (condition) => {
                                condition(
                                    { updatedAt: "updatedAt" },
                                    {
                                        eq: (attribute, value) =>
                                            `${attribute} = ${value}`,
                                    },
                                );

                                return {
                                    commit: () => ({
                                        record,
                                        type: "transaction",
                                    }),
                                };
                            },
                        }),
                    },
                });

                return {
                    replayed: false,
                    response: input.response,
                    workspaceChanges: input.changes,
                    items,
                };
            },
        );
    });

    it("persists the status and audit record in the same atomic mutation", async () => {
        const result = await updateTransactionsStatusWithWorkspaceChanges({
            actorUserId: "user-1",
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            status: "reconciled",
            transactionIds: ["transaction-1"],
        });

        expect(result.updatedCount).toBe(1);
        expect(mocks.commitAtomicWorkspaceMutation).toHaveBeenCalledTimes(1);
        const atomicInput = mocks.commitAtomicWorkspaceMutation.mock.calls[0]?.[0];

        expect(atomicInput).toMatchObject({
            domainItemCount: 2,
            mutationId: expect.stringMatching(
                /^mutation-1:reconciled:batch:[a-f0-9]{16}$/,
            ),
            mutationType: "transaction.status:reconciled:batch",
        });
        const committedItems = atomicInput.buildDomainItems({
            transactionAuditLogs: {
                put: (record: unknown) => ({
                    commit: () => ({ record, type: "audit" }),
                }),
            },
            transactions: {
                put: (record: unknown) => ({
                    where: () => ({
                        commit: () => ({ record, type: "transaction" }),
                    }),
                }),
            },
        });

        expect(committedItems).toHaveLength(2);
        expect(committedItems[0]).toMatchObject({
            record: { status: "reconciled" },
            type: "transaction",
        });
        expect(committedItems[1]).toMatchObject({
            record: {
                action: "lock",
                actorUserId: "user-1",
                transactionId: "transaction-1",
            },
            type: "audit",
        });
    });

    it("persists up to forty status changes in one atomic workspace mutation", async () => {
        mocks.getStoredTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) => ({
                createdAt: "2026-07-18T10:00:00.000Z",
                displayAmountCents: -1_234,
                kind: "standard",
                ledgerId: "ledger-1",
                occurredAt: "2026-07-18T00:00:00.000Z",
                periodId: "2026-07",
                referenceAccountId: "account-1",
                source: "manual",
                status: "cleared",
                transactionId,
                updatedAt: "2026-07-18T10:00:00.000Z",
            }),
        );

        const result = await updateTransactionsStatusWithWorkspaceChanges({
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            status: "reconciled",
            transactionIds: [
                "transaction-1",
                "transaction-2",
                "transaction-3",
            ],
        });

        expect(result.updatedCount).toBe(3);
        expect(mocks.commitAtomicWorkspaceMutation).toHaveBeenCalledTimes(1);
        expect(mocks.commitAtomicWorkspaceMutation.mock.calls[0]?.[0]).toMatchObject({
            domainItemCount: 6,
        });
    });

    it("limits a stable status batch to the current lock candidates", async () => {
        mocks.getStoredTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) => ({
                createdAt: "2026-07-18T10:00:00.000Z",
                displayAmountCents: -1_234,
                kind: "standard",
                ledgerId: "ledger-1",
                occurredAt: "2026-07-18T00:00:00.000Z",
                periodId: "2026-07",
                referenceAccountId: "account-1",
                source: "manual",
                status: "cleared",
                transactionId,
                updatedAt: "2026-07-18T10:00:00.000Z",
            }),
        );

        await updateTransactionsStatusWithWorkspaceChanges({
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            status: "reconciled",
            transactionIds: ["transaction-2"],
            workspaceMutationTransactionIds: [
                "transaction-1",
                "transaction-2",
            ],
        });

        expect(mocks.getStoredTransaction).toHaveBeenCalledTimes(1);
        expect(mocks.getStoredTransaction).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-2",
        );
        expect(mocks.commitAtomicWorkspaceMutation.mock.calls[0]?.[0]).toMatchObject({
            domainItemCount: 2,
            mutationId:
                getTransactionStatusBatchMutations({
                    mutationId: "mutation-1",
                    status: "reconciled",
                    transactionIds: ["transaction-1", "transaction-2"],
                })[0]?.mutationId,
        });
    });

    it("reuses known transaction state without reloading its record or children", async () => {
        const knownTransaction = {
            createdAt: "2026-07-18T10:00:00.000Z",
            displayAmountCents: -1_234,
            enteredAt: "2026-07-18T10:00:00.000Z",
            kind: "standard" as const,
            ledgerId: "ledger-1",
            lines: [],
            occurredAt: "2026-07-18T00:00:00.000Z",
            periodId: "2026-07",
            postings: [],
            referenceAccountId: "account-1",
            source: "manual" as const,
            status: "cleared" as const,
            transactionId: "transaction-1",
            updatedAt: "2026-07-18T10:00:00.000Z",
        };

        await updateTransactionsStatusWithWorkspaceChanges({
            knownTransactions: [knownTransaction],
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            status: "reconciled",
            transactionIds: ["transaction-1"],
        });

        expect(mocks.getStoredTransaction).not.toHaveBeenCalled();
        expect(mocks.listTransactionChildren).not.toHaveBeenCalled();
        expect(mocks.listPlaidTransactionSyncsForTransaction).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
            undefined,
        );
    });

    it("replays a committed status batch without reading or writing transactions", async () => {
        const replayChange = {
            entityId: "transaction-1",
            entityType: "transaction",
            operation: "upsert",
            record: { transactionId: "transaction-1" },
        };
        mocks.findWorkspaceMutationBatch.mockResolvedValue({
            changes: [replayChange],
            response: { updatedCount: 3 },
        });

        const result = await updateTransactionsStatusWithWorkspaceChanges({
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            status: "reconciled",
            transactionIds: [
                "transaction-1",
                "transaction-2",
                "transaction-3",
            ],
        });

        expect(result).toEqual({
            updatedCount: 3,
            workspaceChanges: [replayChange],
        });
        expect(mocks.getStoredTransaction).not.toHaveBeenCalled();
        expect(mocks.commitAtomicWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("atomically advances a supplied operation checkpoint without a receipt preflight", async () => {
        const checkpoint = {
            completedStepCount: 1,
            createdAt: "2026-07-18T10:00:00.000Z",
            expiresAt: 1_800_000_000,
            ledgerId: "ledger-1",
            mutationId: "reconciliation-1",
            mutationType: "account.reconcile",
            operation: { operationVersion: 1 },
            status: "completed" as const,
            updatedAt: "2026-07-18T10:01:00.000Z",
        };

        await updateTransactionsStatusWithWorkspaceChanges({
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            skipExistingBatchLookup: true,
            status: "reconciled",
            transactionIds: ["transaction-1"],
            workspaceMutationOperation: checkpoint,
        });

        expect(mocks.findWorkspaceMutationBatch).not.toHaveBeenCalled();
        expect(mocks.commitAtomicWorkspaceMutation).toHaveBeenCalledWith(
            expect.objectContaining({ operation: checkpoint }),
        );
    });
});
