// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    accountsByAccountGo: vi.fn(),
    byTransactionGo: vi.fn(),
    budgetCategoriesByCategoryGo: vi.fn(),
    categoryAllocationsByAllocationBegins: vi.fn(),
    categoryAllocationsByAllocationGo: vi.fn(),
    categoryAllocationsUpsert: vi.fn(),
    categoryAllocationsUpsertGo: vi.fn(),
    ledgersGetGo: vi.fn(),
    ledgersUpdate: vi.fn(),
    ledgerPostingsCommit: vi.fn(),
    createLedgerPostingRecords: vi.fn(),
    createTransactionLineRecords: vi.fn(),
    deleteTransactionClassificationEmbeddingForSource: vi.fn(),
    deleteTransactionClassificationSourceRecord: vi.fn(),
    ledgerPostingsDeleteGo: vi.fn(),
    ledgerPostingsDelete: vi.fn(() => ({
        commit: mocks.ledgerPostingsCommit,
        go: mocks.ledgerPostingsDeleteGo,
    })),
    ledgerPostingsPutGo: vi.fn(),
    ledgerPostingsPut: vi.fn(() => ({
        commit: mocks.ledgerPostingsCommit,
        go: mocks.ledgerPostingsPutGo,
    })),
    listLedgerPostingsForTransaction: vi.fn(),
    listTransactionImportActivities: vi.fn(),
    listTransactionLinesForTransaction: vi.fn(),
    plaidTransactionSyncsByTransactionGo: vi.fn(),
    plaidTransactionSyncsByTransaction: vi.fn(() => ({
        go: mocks.plaidTransactionSyncsByTransactionGo,
    })),
    plaidTransactionSyncsDeleteGo: vi.fn(),
    plaidTransactionSyncsDelete: vi.fn(() => ({
        commit: mocks.ledgerPostingsCommit,
        go: mocks.plaidTransactionSyncsDeleteGo,
    })),
    plaidTransactionSyncsPutGo: vi.fn(),
    plaidTransactionSyncsPut: vi.fn(() => ({
        commit: mocks.ledgerPostingsCommit,
        go: mocks.plaidTransactionSyncsPutGo,
    })),
    recordTransactionAuditLog: vi.fn(),
    removeLedgerPostings: vi.fn(),
    removeTransactionLines: vi.fn(),
    syncAffectedBudgetPeriodActivity: vi.fn(),
    syncAffectedBudgetPeriods: vi.fn(),
    syncBudgetPeriodActivity: vi.fn(),
    syncTransactionClassificationEmbeddingForSourceRecord: vi.fn(),
    syncTransactionClassificationSourceForTransaction: vi.fn(),
    transactionsDeleteGo: vi.fn(),
    serviceTransactionWrite: vi.fn(),
    serviceTransactionWriteGo: vi.fn(),
    transactionAutoMatchRejectionsByRejectionGo: vi.fn(),
    transactionAutoMatchRejectionsDelete: vi.fn(),
    transactionLinesCommit: vi.fn(),
    transactionsDelete: vi.fn(() => ({
        commit: mocks.transactionLinesCommit,
        go: mocks.transactionsDeleteGo,
    })),
    transactionsPutGo: vi.fn(),
    transactionsPut: vi.fn(() => ({
        commit: mocks.transactionLinesCommit,
        go: mocks.transactionsPutGo,
    })),
    transactionLinesDeleteGo: vi.fn(),
    transactionLinesDelete: vi.fn(() => ({
        commit: mocks.transactionLinesCommit,
        go: mocks.transactionLinesDeleteGo,
    })),
    transactionLinesPutGo: vi.fn(),
    transactionLinesPut: vi.fn(() => ({
        commit: mocks.transactionLinesCommit,
        go: mocks.transactionLinesPutGo,
    })),
    workspaceMutationBatchesPut: vi.fn(),
    workspaceMutationBatchesGetGo: vi.fn(),
    workspaceMutationOperationsGetGo: vi.fn(),
    workspaceMutationOperationsPut: vi.fn(),
    workspaceMutationReceiptsGetGo: vi.fn(),
    workspaceMutationReceiptsPut: vi.fn(),
}));

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-embedding-service",
    () => ({
        deleteTransactionClassificationEmbeddingForSource:
            mocks.deleteTransactionClassificationEmbeddingForSource,
        syncTransactionClassificationEmbeddingForSourceRecord:
            mocks.syncTransactionClassificationEmbeddingForSourceRecord,
    }),
);

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-source-service",
    () => ({
        deleteTransactionClassificationSourceRecord:
            mocks.deleteTransactionClassificationSourceRecord,
        syncTransactionClassificationSourceForTransaction:
            mocks.syncTransactionClassificationSourceForTransaction,
    }),
);

vi.mock(
    "@/features/transaction-importers/server/transaction-import-activity-service",
    async () => {
        const actual = await vi.importActual<
            typeof import("@/features/transaction-importers/server/transaction-import-activity-service")
        >(
            "@/features/transaction-importers/server/transaction-import-activity-service",
        );

        return {
            ...actual,
            listTransactionImportActivities:
                mocks.listTransactionImportActivities,
        };
    },
);

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            transactions: {
                query: {
                    byTransaction: () => ({ go: mocks.byTransactionGo }),
                },
                put: mocks.transactionsPut,
                delete: mocks.transactionsDelete,
            },
            accounts: {
                query: {
                    byAccount: () => ({ go: mocks.accountsByAccountGo }),
                },
            },
            budgetCategories: {
                query: {
                    byCategory: () => ({
                        go: mocks.budgetCategoriesByCategoryGo,
                    }),
                },
            },
            categoryAllocations: {
                query: {
                    byAllocation: () => ({
                        begins: mocks.categoryAllocationsByAllocationBegins,
                    }),
                },
                upsert: mocks.categoryAllocationsUpsert,
            },
            ledgerPostings: {
                delete: mocks.ledgerPostingsDelete,
                put: mocks.ledgerPostingsPut,
            },
            transactionLines: {
                delete: mocks.transactionLinesDelete,
                put: mocks.transactionLinesPut,
            },
            plaidTransactionSyncs: {
                put: mocks.plaidTransactionSyncsPut,
                delete: mocks.plaidTransactionSyncsDelete,
                query: {
                    byTransaction: mocks.plaidTransactionSyncsByTransaction,
                },
            },
            transactionAutoMatchRejections: {
                delete: mocks.transactionAutoMatchRejectionsDelete,
                query: {
                    byRejection: () => ({
                        go: mocks.transactionAutoMatchRejectionsByRejectionGo,
                    }),
                },
            },
            workspaceMutationOperations: {
                get: () => ({ go: mocks.workspaceMutationOperationsGetGo }),
                put: mocks.workspaceMutationOperationsPut,
            },
            workspaceMutationBatches: {
                get: () => ({ go: mocks.workspaceMutationBatchesGetGo }),
                put: mocks.workspaceMutationBatchesPut,
            },
            workspaceMutationReceipts: {
                get: () => ({ go: mocks.workspaceMutationReceiptsGetGo }),
                put: mocks.workspaceMutationReceiptsPut,
            },
            ledgers: {
                get: () => ({ go: mocks.ledgersGetGo }),
                update: mocks.ledgersUpdate,
            },
        },
        service: {
            transaction: {
                write: mocks.serviceTransactionWrite,
            },
        },
    }),
}));

vi.mock("@/features/transactions/server/posting-service", () => ({
    createLedgerPostingRecords: mocks.createLedgerPostingRecords,
    listLedgerPostingsForTransaction: mocks.listLedgerPostingsForTransaction,
    persistLedgerPostings: vi.fn(),
    removeLedgerPostings: mocks.removeLedgerPostings,
    replaceLedgerPostings: vi.fn(),
    resolveTransactionReferences: vi.fn(),
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    createTransactionLineRecords: mocks.createTransactionLineRecords,
    listTransactionLinesForTransaction:
        mocks.listTransactionLinesForTransaction,
    removeTransactionLines: mocks.removeTransactionLines,
    toStoredTransactionLineRecord: (line: unknown) => line,
}));

vi.mock("@/features/shared/server/post-delete-consistency-service", () => ({
    syncAffectedBudgetPeriods: mocks.syncAffectedBudgetPeriods,
}));

vi.mock("@/features/budget/server/activity-sync-service", () => ({
    syncAffectedBudgetPeriodActivity:
        mocks.syncAffectedBudgetPeriodActivity,
    syncBudgetPeriodActivity: mocks.syncBudgetPeriodActivity,
}));

vi.mock("@/features/transactions/server/transaction-audit-service", () => ({
    createTransactionAuditAggregate: vi.fn((input: Record<string, unknown>) => ({
        ledgerPostings: input.ledgerPostings ?? [],
        plaidTransactionSyncs: input.plaidTransactionSyncs ?? [],
        transaction: input.transaction,
        transactionLines: input.transactionLines ?? [],
    })),
    recordTransactionAuditLog: mocks.recordTransactionAuditLog,
}));

import {
    createBulkTransactionDeleteRequestDigest,
    deleteTransactions,
    deleteTransaction,
    getTransactionDeletionImpact,
    getTransactionsDeletionImpact,
    validateDeleteWorkspaceMutation,
} from "@/features/transactions/server/transaction-delete-service";

describe("transaction deletion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listTransactionImportActivities.mockResolvedValue([]);
        mocks.deleteTransactionClassificationEmbeddingForSource.mockResolvedValue(
            undefined,
        );
        mocks.deleteTransactionClassificationSourceRecord.mockResolvedValue(
            undefined,
        );
        mocks.syncTransactionClassificationEmbeddingForSourceRecord.mockResolvedValue(
            undefined,
        );
        mocks.syncTransactionClassificationSourceForTransaction.mockResolvedValue({
            record: null,
        });
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transaction-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    payee: "Grocer",
                    memo: "Weekly groceries",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "category-1",
                    displayAmountCents: -6500,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
            ],
        });
        mocks.accountsByAccountGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    ledgerAccountId: "acct_checking",
                },
            ],
        });
        mocks.budgetCategoriesByCategoryGo.mockResolvedValue({
            data: [
                {
                    categoryId: "category-1",
                    ledgerAccountId: "cat_groceries",
                    systemCategoryKey: undefined,
                },
            ],
        });
        mocks.categoryAllocationsByAllocationBegins.mockImplementation(
            ({ periodId }: { periodId: string }) => ({
                go: vi.fn().mockResolvedValue({
                    data: [
                        {
                            allocationId: `${periodId}:category-1`,
                            ledgerId: "owner-1",
                            periodId,
                            categoryId: "category-1",
                            assignedCents: 10_000,
                            carriedForwardCents: 0,
                            activityCents:
                                periodId === "2026-06" ? -2_500 : -6_500,
                            availableCents:
                                periodId === "2026-06" ? 7_500 : 3_500,
                            updatedAt: `${periodId}-01T00:00:00.000Z`,
                        },
                    ],
                }),
            }),
        );
        mocks.categoryAllocationsUpsert.mockReturnValue({
            go: mocks.categoryAllocationsUpsertGo,
        });
        mocks.categoryAllocationsUpsertGo.mockResolvedValue(undefined);
        mocks.ledgersGetGo.mockResolvedValue({
            data: {
                workspaceGeneration: 1,
                workspaceRevision: 0,
            },
        });
        mocks.transactionAutoMatchRejectionsByRejectionGo.mockResolvedValue({
            data: [],
        });
        mocks.workspaceMutationOperationsGetGo.mockResolvedValue({ data: null });
        mocks.workspaceMutationBatchesGetGo.mockResolvedValue({ data: null });
        mocks.workspaceMutationReceiptsGetGo.mockResolvedValue({ data: null });
        mocks.workspaceMutationBatchesPut.mockReturnValue({
            where: () => ({ commit: vi.fn() }),
        });
        mocks.workspaceMutationReceiptsPut.mockReturnValue({
            where: () => ({ commit: vi.fn() }),
        });
        mocks.workspaceMutationOperationsPut.mockReturnValue({
            commit: vi.fn(),
        });
        mocks.transactionAutoMatchRejectionsDelete.mockReturnValue({
            commit: vi.fn(),
        });
        mocks.ledgersUpdate.mockReturnValue({
            set: () => ({ where: () => ({ commit: vi.fn() }) }),
        });
        mocks.serviceTransactionWrite.mockImplementation((write) => {
            write({
                ledgerPostings: {
                    delete: mocks.ledgerPostingsDelete,
                    put: mocks.ledgerPostingsPut,
                },
                ledgers: { update: mocks.ledgersUpdate },
                plaidTransactionSyncs: {
                    delete: mocks.plaidTransactionSyncsDelete,
                    put: mocks.plaidTransactionSyncsPut,
                },
                transactionAutoMatchRejections: {
                    delete: mocks.transactionAutoMatchRejectionsDelete,
                },
                transactionLines: {
                    delete: mocks.transactionLinesDelete,
                    put: mocks.transactionLinesPut,
                },
                transactions: {
                    delete: mocks.transactionsDelete,
                    put: mocks.transactionsPut,
                },
                workspaceMutationBatches: {
                    put: mocks.workspaceMutationBatchesPut,
                },
                workspaceMutationOperations: {
                    put: mocks.workspaceMutationOperationsPut,
                },
                workspaceMutationReceipts: {
                    put: mocks.workspaceMutationReceiptsPut,
                },
            });

            return { go: mocks.serviceTransactionWriteGo };
        });
        mocks.serviceTransactionWriteGo.mockResolvedValue(undefined);
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([
            {
                postingId: "posting-1",
                transactionId: "transaction-1",
                userId: "owner-1",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
                direction: "credit",
                amountCents: 6500,
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-18T12:00:00.000Z",
            },
            {
                postingId: "posting-2",
                transactionId: "transaction-1",
                userId: "owner-1",
                ledgerAccountId: "cat_groceries",
                ledgerAccountKind: "category",
                direction: "debit",
                amountCents: 6500,
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-18T12:00:00.000Z",
            },
        ]);
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) => [
                {
                    lineId: `${transactionId}-line-1`,
                    transactionId,
                    userId: "owner-1",
                    amountCents:
                        transactionId === "transaction-2" ? 2_500 : 6_500,
                    categoryId: "category-1",
                    fromAccountId: "account-1",
                    sortOrder: 0,
                    createdAt: "2026-05-18T12:00:00.000Z",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
            ],
        );
        mocks.removeLedgerPostings.mockResolvedValue([]);
        mocks.removeTransactionLines.mockResolvedValue([]);
        mocks.plaidTransactionSyncsByTransactionGo.mockResolvedValue({
            data: [],
        });
        mocks.plaidTransactionSyncsDeleteGo.mockResolvedValue(undefined);
        mocks.plaidTransactionSyncsPutGo.mockResolvedValue(undefined);
        mocks.transactionsDeleteGo.mockResolvedValue(undefined);
        mocks.transactionsPutGo.mockResolvedValue(undefined);
        mocks.ledgerPostingsDeleteGo.mockResolvedValue(undefined);
        mocks.ledgerPostingsPutGo.mockResolvedValue(undefined);
        mocks.transactionLinesDeleteGo.mockResolvedValue(undefined);
        mocks.transactionLinesPutGo.mockResolvedValue(undefined);
        mocks.syncAffectedBudgetPeriodActivity.mockResolvedValue(["2026-05"]);
    });

    it("builds a preview that names dependent ledger postings", async () => {
        await expect(
            getTransactionDeletionImpact("owner-1", "transaction-1"),
        ).resolves.toMatchObject({
            target: {
                targetType: "transaction",
                targetId: "transaction-1",
                displayName: "Grocer",
            },
            dependentCounts: expect.arrayContaining([
                { label: "Ledger postings", count: 2 },
            ]),
            affectedPeriods: ["2026-05"],
        });
    });

    it("builds a bulk preview with all selected transaction revisions", async () => {
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transaction-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    payee: "Grocer",
                    memo: "Weekly groceries",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "category-1",
                    displayAmountCents: -6500,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
                {
                    transactionId: "transaction-2",
                    userId: "owner-1",
                    occurredAt: "2026-06-02T12:00:00.000Z",
                    enteredAt: "2026-06-02T12:00:00.000Z",
                    kind: "standard",
                    payee: "Hardware",
                    memo: "",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "category-1",
                    displayAmountCents: -2500,
                    status: "entered",
                    periodId: "2026-06",
                    updatedAt: "2026-06-02T12:00:00.000Z",
                },
            ],
        });

        await expect(
            getTransactionsDeletionImpact("owner-1", [
                "transaction-1",
                "transaction-2",
            ]),
        ).resolves.toMatchObject({
            target: {
                targetId: "bulk:transaction-1|transaction-2",
                displayName: "2 transactions",
            },
            dependentCounts: expect.arrayContaining([
                { label: "Transactions", count: 2 },
                { label: "Transaction lines", count: 2 },
            ]),
            affectedPeriods: ["2026-05", "2026-06"],
            previewRevision: expect.stringContaining(
                "transaction:transaction-2:2026-06-02T12:00:00.000Z",
            ),
        });
    });

    it("permanently deletes the transaction after preview confirmation", async () => {
        const preview = await getTransactionDeletionImpact(
            "owner-1",
            "transaction-1",
        );

        await expect(
            deleteTransaction(
                "owner-1",
                "transaction-1",
                preview.previewRevision,
            ),
        ).resolves.toMatchObject({
            target: {
                targetId: "transaction-1",
            },
        });

        expect(mocks.removeLedgerPostings).not.toHaveBeenCalled();
        expect(mocks.removeTransactionLines).not.toHaveBeenCalled();
        expect(mocks.ledgerPostingsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-1",
            postingId: "posting-1",
        });
        expect(mocks.transactionLinesDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-1",
            lineId: "transaction-1-line-1",
        });
        expect(mocks.transactionsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            transactionId: "transaction-1",
        });
        expect(
            mocks.deleteTransactionClassificationEmbeddingForSource,
        ).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            sourceId: "transaction-1",
            sourceType: "transaction",
        });
        expect(
            mocks.deleteTransactionClassificationSourceRecord,
        ).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-1",
        });
        expect(mocks.syncAffectedBudgetPeriodActivity).not.toHaveBeenCalled();
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
        expect(mocks.recordTransactionAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "delete",
                ledgerId: "owner-1",
                source: "manual",
                transactionId: "transaction-1",
            }),
        );
    });

    it("rejects a durable bulk delete replay with a different preview revision", async () => {
        const transactionIds = ["transaction-1"];
        const requestDigest = createBulkTransactionDeleteRequestDigest({
            ledgerId: "owner-1",
            mutationType: "transaction.bulkDelete",
            previewRevision: "preview-1",
            transactionIds,
        });
        mocks.workspaceMutationOperationsGetGo.mockResolvedValue({
            data: {
                completedStepCount: 0,
                createdAt: "2026-07-16T00:00:00.000Z",
                expiresAt: 1,
                ledgerId: "owner-1",
                mutationId: "bulk-delete-1",
                mutationType: "transaction.bulkDelete",
                operationJson: JSON.stringify({
                    affectedPeriodIds: ["2026-05"],
                    bulkPreviewRevision: "preview-1",
                    deletedCount: 1,
                    expectedPreviewRevisions: { "transaction-1": "preview-1" },
                    operationVersion: 3,
                    requestDigest,
                    transactionIds,
                }),
                status: "running",
                updatedAt: "2026-07-16T00:00:00.000Z",
            },
        });

        await expect(
            validateDeleteWorkspaceMutation({
                ledgerId: "owner-1",
                previewRevision: "preview-2",
                transactionIds,
                workspaceMutation: {
                    mutationId: "bulk-delete-1",
                    mutationType: "transaction.bulkDelete",
                },
            }),
        ).rejects.toMatchObject({ code: "workspace_mutation_mismatch" });
    });

    it("deletes ledger-scoped Plaid sync records with the transaction", async () => {
        mocks.plaidTransactionSyncsByTransactionGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    ledgerId: "owner-1",
                    plaidTransactionSyncId: "sync-1",
                    transactionId: "transaction-1",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                },
            ],
        });
        const preview = await getTransactionDeletionImpact(
            "owner-1",
            "transaction-1",
        );

        expect(preview.dependentCounts).toContainEqual({
            label: "Plaid transaction sync records",
            count: 1,
        });

        await deleteTransaction(
            "owner-1",
            "transaction-1",
            preview.previewRevision,
        );

        expect(mocks.plaidTransactionSyncsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            plaidTransactionSyncId: "sync-1",
        });
    });

    it("bulk deletes selected transactions and syncs affected periods once", async () => {
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transaction-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    payee: "Grocer",
                    memo: "Weekly groceries",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "category-1",
                    displayAmountCents: -6500,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
                {
                    transactionId: "transaction-2",
                    userId: "owner-1",
                    occurredAt: "2026-06-02T12:00:00.000Z",
                    enteredAt: "2026-06-02T12:00:00.000Z",
                    kind: "standard",
                    payee: "Hardware",
                    memo: "",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "category-1",
                    displayAmountCents: -2500,
                    status: "entered",
                    periodId: "2026-06",
                    updatedAt: "2026-06-02T12:00:00.000Z",
                },
            ],
        });

        const preview = await getTransactionsDeletionImpact("owner-1", [
            "transaction-1",
            "transaction-2",
            "transaction-1",
        ]);

        await expect(
            deleteTransactions(
                "owner-1",
                ["transaction-1", "transaction-2", "transaction-1"],
                preview.previewRevision,
            ),
        ).resolves.toEqual({ deletedCount: 2 });

        expect(mocks.removeLedgerPostings).not.toHaveBeenCalled();
        expect(mocks.removeTransactionLines).not.toHaveBeenCalled();
        expect(mocks.ledgerPostingsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-1",
            postingId: "posting-1",
        });
        expect(mocks.ledgerPostingsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-1",
            postingId: "posting-2",
        });
        expect(mocks.transactionLinesDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-1",
            lineId: "transaction-1-line-1",
        });
        expect(mocks.transactionLinesDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-2",
            lineId: "transaction-2-line-1",
        });
        expect(mocks.transactionsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            transactionId: "transaction-1",
        });
        expect(mocks.transactionsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            occurredAt: "2026-06-02T12:00:00.000Z",
            transactionId: "transaction-2",
        });
        expect(mocks.syncAffectedBudgetPeriodActivity).not.toHaveBeenCalled();
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
        expect(mocks.recordTransactionAuditLog).toHaveBeenCalledTimes(1);
        expect(mocks.recordTransactionAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "bulkDelete",
                ledgerId: "owner-1",
                source: "manual",
                transactionIds: ["transaction-1", "transaction-2"],
            }),
        );
        expect(mocks.workspaceMutationBatchesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                responseJson: expect.stringContaining("requestDigest"),
            }),
        );
    });

    it("rejects stale deletion confirmations", async () => {
        await expect(
            deleteTransaction("owner-1", "transaction-1", "stale-preview"),
        ).rejects.toThrow(/stale/i);

        expect(mocks.removeLedgerPostings).not.toHaveBeenCalled();
        expect(mocks.transactionsDelete).not.toHaveBeenCalled();
    });

    it("rejects stale bulk deletion confirmations", async () => {
        await expect(
            deleteTransactions(
                "owner-1",
                ["transaction-1"],
                "stale-preview",
            ),
        ).rejects.toThrow(/stale/i);

        expect(mocks.removeLedgerPostings).not.toHaveBeenCalled();
        expect(mocks.transactionsDelete).not.toHaveBeenCalled();
    });
});
