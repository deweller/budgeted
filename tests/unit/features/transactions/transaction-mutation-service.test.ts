// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStoredWorkspaceStateFixture } from "../../helpers/workspace-mutation-fixture";

type MockPostingRecordInput = {
    createdAt?: string;
    occurredAt: string;
    periodId: string;
    postings: Array<Record<string, unknown>>;
    transactionId: string;
    userId: string;
};

type MockTransactionLineRecordInput = {
    now?: string;
    lines: Array<
        Record<string, unknown> & {
            sortOrder?: number;
            lineId?: string;
        }
    >;
    transactionId: string;
    userId: string;
};

const mocks = vi.hoisted(() => ({
    accountsByAccountGo: vi.fn(),
    budgetCategoriesByCategoryGo: vi.fn(),
    categoryAllocationsByAllocationBegins: vi.fn(),
    categoryAllocationsByAllocationGo: vi.fn(),
    categoryAllocationsUpsert: vi.fn(),
    categoryAllocationsUpsertGo: vi.fn(),
    byTransactionGo: vi.fn(),
    transactionsById: vi.fn(),
    transactionsByIdGo: vi.fn(),
    transactionsByTransactionBegins: vi.fn(),
    transactionsByTransactionBeginsGo: vi.fn(),
    createLedgerPostingRecords: vi.fn((input: MockPostingRecordInput) =>
        input.postings.map((posting, index) => ({
            ...posting,
            postingId: `posting-${index}`,
            transactionId: input.transactionId,
            userId: input.userId,
            occurredAt: input.occurredAt,
            periodId: input.periodId,
            createdAt: input.createdAt ?? "2026-05-18T12:00:00.000Z",
        })),
    ),
    createTransactionLineRecords: vi.fn(
        (input: MockTransactionLineRecordInput) =>
            input.lines.map((line, index) => ({
                ...line,
                lineId:
                    line.lineId ??
                    `line-${index}`,
                transactionId: input.transactionId,
                userId: input.userId,
                sortOrder: line.sortOrder ?? index,
                createdAt: input.now ?? "2026-05-18T12:00:00.000Z",
                updatedAt: input.now ?? "2026-05-18T12:00:00.000Z",
            })),
    ),
    deleteTransactionClassificationEmbeddingForSource: vi.fn(),
    deleteTransactionClassificationSourceRecord: vi.fn(),
    listLedgerPostingsForTransaction: vi.fn(),
    listTransactionImportActivities: vi.fn(),
    listTransactionLinesForTransaction: vi.fn(),
    ledgerPostingsDelete: vi.fn(),
    ledgerPostingsDeleteCommit: vi.fn(),
    ledgerPostingsDeleteGo: vi.fn(),
    ledgerPostingsGet: vi.fn(),
    ledgerPostingsGetGo: vi.fn(),
    ledgerPostingsByLedgerAccount: vi.fn(),
    ledgerPostingsByLedgerAccountGo: vi.fn(),
    ledgerPostingsPut: vi.fn(),
    ledgerPostingsPutCommit: vi.fn(),
    plaidTransactionSyncsByTransaction: vi.fn(),
    plaidTransactionSyncsGet: vi.fn(),
    plaidTransactionSyncsGetGo: vi.fn(),
    plaidTransactionSyncsDeleteGo: vi.fn(),
    plaidTransactionSyncsDelete: vi.fn(() => ({
        go: mocks.plaidTransactionSyncsDeleteGo,
    })),
    plaidTransactionSyncsPut: vi.fn(),
    plaidTransactionSyncsPutCommit: vi.fn(),
    recordTransactionAuditLog: vi.fn(),
    removeLedgerPostings: vi.fn(),
    removeTransactionLines: vi.fn(),
    resolveTransactionReferences: vi.fn(),
    serviceTransactionWrite: vi.fn(),
    serviceTransactionWriteGo: vi.fn(),
    syncAffectedBudgetPeriodActivity: vi.fn(),
    syncBudgetPeriodActivity: vi.fn(),
    syncTransactionClassificationEmbeddingForSourceRecord: vi.fn(),
    syncTransactionClassificationSourceForTransaction: vi.fn(),
    transactionLinesDelete: vi.fn(),
    transactionLinesDeleteCommit: vi.fn(),
    transactionLinesDeleteGo: vi.fn(),
    transactionLinesGet: vi.fn(),
    transactionLinesGetGo: vi.fn(),
    transactionLinesPut: vi.fn(),
    transactionLinesPutCommit: vi.fn(),
    transactionAutoMatchRejectionsByRejection: vi.fn(),
    transactionAutoMatchRejectionsDelete: vi.fn(),
    transactionAutoMatchRejectionsDeleteGo: vi.fn(),
    transactionAutoMatchRejectionsPut: vi.fn(),
    transactionAutoMatchRejectionsPutGo: vi.fn(),
    transactionsDeleteGo: vi.fn(),
    transactionsDeleteCommit: vi.fn(),
    transactionsDelete: vi.fn(() => ({
        commit: mocks.transactionsDeleteCommit,
        go: mocks.transactionsDeleteGo,
    })),
    transactionsPutWhere: vi.fn(),
    transactionsPutGo: vi.fn(),
    transactionsPutCommit: vi.fn(),
    transactionsPut: vi.fn(() => ({
        commit: mocks.transactionsPutCommit,
        go: mocks.transactionsPutGo,
        where: mocks.transactionsPutWhere,
    })),
    ledgersGet: vi.fn(),
    ledgersUpdate: vi.fn(),
    ledgersUpdateCommit: vi.fn(),
    ledgersUpdateSet: vi.fn(),
    ledgersUpdateWhere: vi.fn(),
    workspaceMutationBatchesPut: vi.fn(),
    workspaceMutationBatchesPutCommit: vi.fn(),
    workspaceMutationBatchesPutWhere: vi.fn(),
    workspaceMutationBatchesGet: vi.fn(),
    workspaceMutationReceiptsPut: vi.fn(),
    workspaceMutationReceiptsPutCommit: vi.fn(),
    workspaceMutationReceiptsPutWhere: vi.fn(),
    workspaceMutationReceiptsGet: vi.fn(),
    workspaceMutationOperationsGet: vi.fn(),
    workspaceMutationOperationsPut: vi.fn(),
    workspaceMutationOperationsPutGo: vi.fn(),
    workspaceStateEnabled: false,
    workspaceStatesGet: vi.fn(),
    workspaceStatesGetGo: vi.fn(),
    workspaceStatesPut: vi.fn(),
    workspaceStatesPutCommit: vi.fn(),
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

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-source-service",
    () => ({
        deleteTransactionClassificationSourceRecord:
            mocks.deleteTransactionClassificationSourceRecord,
        syncTransactionClassificationSourceForTransaction:
            mocks.syncTransactionClassificationSourceForTransaction,
    }),
);

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        service: {
            transaction: {
                write: mocks.serviceTransactionWrite,
            },
        },
        entities: {
            transactions: {
                query: {
                    byId: mocks.transactionsById,
                    byTransaction: () => ({
                        begins: mocks.transactionsByTransactionBegins,
                        go: mocks.byTransactionGo,
                    }),
                },
                put: mocks.transactionsPut,
                delete: mocks.transactionsDelete,
            },
            accounts: {
                query: {
                    byAccount: () => ({ go: mocks.accountsByAccountGo }),
                },
            },
            ledgerPostings: {
                get: mocks.ledgerPostingsGet,
                query: {
                    byLedgerAccount: mocks.ledgerPostingsByLedgerAccount,
                },
                put: mocks.ledgerPostingsPut,
                delete: mocks.ledgerPostingsDelete,
            },
            plaidTransactionSyncs: {
                get: mocks.plaidTransactionSyncsGet,
                query: {
                    byTransaction: mocks.plaidTransactionSyncsByTransaction,
                },
                put: mocks.plaidTransactionSyncsPut,
                delete: mocks.plaidTransactionSyncsDelete,
            },
            transactionLines: {
                get: mocks.transactionLinesGet,
                put: mocks.transactionLinesPut,
                delete: mocks.transactionLinesDelete,
            },
            transactionAutoMatchRejections: {
                query: {
                    byRejection: mocks.transactionAutoMatchRejectionsByRejection,
                },
                delete: mocks.transactionAutoMatchRejectionsDelete,
                put: mocks.transactionAutoMatchRejectionsPut,
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
            ledgers: {
                get: mocks.ledgersGet,
                update: mocks.ledgersUpdate,
            },
            workspaceMutationBatches: {
                get: mocks.workspaceMutationBatchesGet,
                put: mocks.workspaceMutationBatchesPut,
            },
            workspaceMutationReceipts: {
                get: mocks.workspaceMutationReceiptsGet,
                put: mocks.workspaceMutationReceiptsPut,
            },
            workspaceMutationOperations: {
                get: mocks.workspaceMutationOperationsGet,
                put: mocks.workspaceMutationOperationsPut,
            },
            ...(mocks.workspaceStateEnabled
                ? {
                      workspaceStates: {
                          get: mocks.workspaceStatesGet,
                          put: mocks.workspaceStatesPut,
                      },
                  }
                : {}),
        },
    }),
}));

vi.mock("@/features/transactions/server/posting-service", () => ({
    createLedgerPostingRecords: mocks.createLedgerPostingRecords,
    listLedgerPostingsForTransaction: mocks.listLedgerPostingsForTransaction,
    removeLedgerPostings: mocks.removeLedgerPostings,
    resolveTransactionReferences: mocks.resolveTransactionReferences,
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    createTransactionLineRecords: mocks.createTransactionLineRecords,
    listTransactionLinesForTransaction:
        mocks.listTransactionLinesForTransaction,
    removeTransactionLines: mocks.removeTransactionLines,
    toTransactionLineInputs: (lines: Array<Record<string, unknown>>) =>
        lines,
    toPublicTransactionLineRecord: (line: unknown) => line,
    toStoredTransactionLineRecord: (line: unknown) => line,
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
    listStoredTransactionsByIds,
    listTransactions,
} from "@/features/transactions/server/transaction-query-service";
import {
    categorizeTransactionsWithWorkspaceChanges,
} from "@/features/transactions/server/transaction-categorize-service";
import {
    mergeTransactions,
    mergeTransactionsWithWorkspaceChanges,
} from "@/features/transactions/server/transaction-merge-service";
import {
    upsertTransaction,
    upsertTransactionWithinWorkspaceMutation,
    upsertTransactionWithWorkspaceChanges,
    updateTransactionMemoWithWorkspaceChanges,
    voidTransaction,
} from "@/features/transactions/server/transaction-save-service";
import { createTransactionAggregateRevision } from "@/features/transactions/models/transaction-aggregate-revision";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";

describe("transaction service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.workspaceStateEnabled = false;
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
        mocks.accountsByAccountGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                },
                {
                    accountId: "savings-1",
                    accountType: "savings",
                    ledgerAccountId: "acct_savings",
                    name: "Savings",
                },
                {
                    accountId: "credit-card-1",
                    accountType: "creditCard",
                    ledgerAccountId: "acct_credit_card",
                    name: "Credit Card",
                },
            ],
        });
        mocks.budgetCategoriesByCategoryGo.mockResolvedValue({
            data: [
                {
                    categoryId: "groceries",
                    ledgerAccountId: "cat_groceries",
                    systemCategoryKey: undefined,
                },
                {
                    categoryId: "utilities",
                    ledgerAccountId: "cat_utilities",
                    systemCategoryKey: undefined,
                },
            ],
        });
        mocks.categoryAllocationsByAllocationBegins.mockReturnValue({
            go: mocks.categoryAllocationsByAllocationGo,
        });
        mocks.categoryAllocationsByAllocationGo.mockResolvedValue({ data: [] });
        mocks.categoryAllocationsUpsert.mockReturnValue({
            go: mocks.categoryAllocationsUpsertGo,
        });
        mocks.categoryAllocationsUpsertGo.mockResolvedValue({});
        mocks.byTransactionGo.mockResolvedValue({ data: [] });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([]);
        mocks.listTransactionLinesForTransaction.mockResolvedValue([]);
        mocks.ledgerPostingsByLedgerAccount.mockReturnValue({
            go: mocks.ledgerPostingsByLedgerAccountGo,
        });
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({ data: [] });
        mocks.resolveTransactionReferences.mockResolvedValue({
            referenceAccountId: "account-1",
            referenceCategoryId: "category-1",
        });
        mocks.removeLedgerPostings.mockResolvedValue([]);
        mocks.removeTransactionLines.mockResolvedValue([]);
        mocks.ledgerPostingsDelete.mockReturnValue({
            commit: mocks.ledgerPostingsDeleteCommit,
            go: mocks.ledgerPostingsDeleteGo,
        });
        mocks.ledgerPostingsDeleteCommit.mockReturnValue({});
        mocks.ledgerPostingsDeleteGo.mockResolvedValue({});
        mocks.ledgerPostingsGet.mockReturnValue({
            go: mocks.ledgerPostingsGetGo,
        });
        mocks.ledgerPostingsGetGo.mockResolvedValue({ data: null });
        mocks.ledgerPostingsPut.mockReturnValue({
            commit: mocks.ledgerPostingsPutCommit,
            go: vi.fn().mockResolvedValue(undefined),
        });
        mocks.ledgerPostingsPutCommit.mockReturnValue({});
        mocks.plaidTransactionSyncsByTransaction.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: [] }),
        });
        mocks.plaidTransactionSyncsGet.mockReturnValue({
            go: mocks.plaidTransactionSyncsGetGo,
        });
        mocks.plaidTransactionSyncsGetGo.mockResolvedValue({ data: null });
        mocks.plaidTransactionSyncsPut.mockReturnValue({
            commit: mocks.plaidTransactionSyncsPutCommit,
            go: vi.fn().mockResolvedValue(undefined),
        });
        mocks.plaidTransactionSyncsPutCommit.mockReturnValue({});
        mocks.plaidTransactionSyncsDeleteGo.mockResolvedValue(undefined);
        mocks.transactionLinesDelete.mockReturnValue({
            commit: mocks.transactionLinesDeleteCommit,
            go: mocks.transactionLinesDeleteGo,
        });
        mocks.transactionLinesDeleteCommit.mockReturnValue({});
        mocks.transactionLinesDeleteGo.mockResolvedValue({});
        mocks.transactionLinesGet.mockReturnValue({
            go: mocks.transactionLinesGetGo,
        });
        mocks.transactionLinesGetGo.mockResolvedValue({ data: null });
        mocks.transactionLinesPut.mockReturnValue({
            commit: mocks.transactionLinesPutCommit,
            go: vi.fn().mockResolvedValue(undefined),
        });
        mocks.transactionLinesPutCommit.mockReturnValue({});
        mocks.transactionAutoMatchRejectionsByRejection.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: [] }),
        });
        mocks.transactionAutoMatchRejectionsDelete.mockReturnValue({
            go: mocks.transactionAutoMatchRejectionsDeleteGo,
        });
        mocks.transactionAutoMatchRejectionsDeleteGo.mockResolvedValue({});
        mocks.transactionAutoMatchRejectionsPut.mockReturnValue({
            go: mocks.transactionAutoMatchRejectionsPutGo,
        });
        mocks.transactionAutoMatchRejectionsPutGo.mockResolvedValue({});
        mocks.transactionsDeleteCommit.mockReturnValue({});
        mocks.transactionsPutWhere.mockReturnValue({
            commit: mocks.transactionsPutCommit,
        });
        mocks.transactionsPut.mockReturnValue({
            commit: mocks.transactionsPutCommit,
            go: mocks.transactionsPutGo,
            where: mocks.transactionsPutWhere,
        });
        mocks.transactionsPutCommit.mockReturnValue({});
        mocks.ledgersGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: {
                    workspaceGeneration: 1,
                    workspaceRevision: 0,
                },
            }),
        });
        mocks.ledgersUpdateWhere.mockReturnValue({
            commit: mocks.ledgersUpdateCommit,
        });
        mocks.ledgersUpdateSet.mockReturnValue({
            where: mocks.ledgersUpdateWhere,
        });
        mocks.ledgersUpdate.mockReturnValue({
            set: mocks.ledgersUpdateSet,
        });
        mocks.ledgersUpdateCommit.mockReturnValue({});
        mocks.workspaceMutationBatchesPutWhere.mockReturnValue({
            commit: mocks.workspaceMutationBatchesPutCommit,
        });
        mocks.workspaceMutationBatchesPut.mockReturnValue({
            where: mocks.workspaceMutationBatchesPutWhere,
        });
        mocks.workspaceMutationBatchesPutCommit.mockReturnValue({});
        mocks.workspaceMutationReceiptsPutWhere.mockReturnValue({
            commit: mocks.workspaceMutationReceiptsPutCommit,
        });
        mocks.workspaceMutationReceiptsPut.mockReturnValue({
            where: mocks.workspaceMutationReceiptsPutWhere,
        });
        mocks.workspaceMutationReceiptsPutCommit.mockReturnValue({});
        mocks.workspaceMutationReceiptsGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: null }),
        });
        mocks.workspaceMutationOperationsGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: null }),
        });
        mocks.workspaceMutationOperationsPut.mockReturnValue({
            go: mocks.workspaceMutationOperationsPutGo,
        });
        mocks.workspaceMutationOperationsPutGo.mockResolvedValue({});
        mocks.workspaceStatesGet.mockReturnValue({
            go: mocks.workspaceStatesGetGo,
        });
        mocks.workspaceStatesGetGo.mockResolvedValue({ data: null });
        mocks.workspaceStatesPut.mockReturnValue({
            commit: mocks.workspaceStatesPutCommit,
        });
        mocks.workspaceStatesPutCommit.mockReturnValue({});
        mocks.workspaceMutationBatchesGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: null }),
        });
        mocks.serviceTransactionWrite.mockImplementation((callback) => {
            callback({
                ledgerPostings: {
                    put: mocks.ledgerPostingsPut,
                    delete: mocks.ledgerPostingsDelete,
                },
                workspaceMutationBatches: {
                    put: mocks.workspaceMutationBatchesPut,
                },
                workspaceMutationReceipts: {
                    put: mocks.workspaceMutationReceiptsPut,
                },
                workspaceMutationOperations: {
                    put: mocks.workspaceMutationOperationsPut,
                },
                ...(mocks.workspaceStateEnabled
                    ? {
                          workspaceStates: {
                              put: mocks.workspaceStatesPut,
                          },
                      }
                    : {}),
                ledgers: {
                    update: mocks.ledgersUpdate,
                },
                plaidTransactionSyncs: {
                    put: mocks.plaidTransactionSyncsPut,
                    delete: mocks.plaidTransactionSyncsDelete,
                },
                transactionLines: {
                    put: mocks.transactionLinesPut,
                    delete: mocks.transactionLinesDelete,
                },
                transactions: {
                    put: mocks.transactionsPut,
                    delete: mocks.transactionsDelete,
                },
            });

            return { go: mocks.serviceTransactionWriteGo };
        });
        mocks.serviceTransactionWriteGo.mockResolvedValue({
            canceled: false,
            data: [],
        });
        mocks.syncBudgetPeriodActivity.mockResolvedValue(undefined);
        mocks.transactionsPutGo.mockResolvedValue(undefined);
        mocks.transactionsDeleteGo.mockResolvedValue(undefined);
        mocks.transactionsById.mockReturnValue({
            go: mocks.transactionsByIdGo,
        });
        mocks.transactionsByIdGo.mockResolvedValue({ data: [] });
        mocks.transactionsByTransactionBegins.mockReturnValue({
            go: mocks.transactionsByTransactionBeginsGo,
        });
        mocks.transactionsByTransactionBeginsGo.mockResolvedValue({ data: [] });
    });

    it("lists stored transactions by trimmed unique ids", async () => {
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transaction-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -1_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
                {
                    transactionId: "transaction-2",
                    userId: "owner-1",
                    occurredAt: "2026-05-19T12:00:00.000Z",
                    enteredAt: "2026-05-19T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -2_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-19T12:00:00.000Z",
                },
            ],
        });

        const transactions = await listStoredTransactionsByIds("owner-1", [
            " transaction-2 ",
            "",
            "transaction-2",
            "missing",
        ]);

        expect(
            transactions.map((transaction) => transaction.transactionId),
        ).toEqual(["transaction-2"]);
    });

    it("looks up small transaction id sets through the by-id index and confirms with a primary read", async () => {
        const transaction = {
            transactionId: "transaction-2",
            userId: "owner-1",
            occurredAt: "2026-05-19T12:00:00.000Z",
            enteredAt: "2026-05-19T12:00:00.000Z",
            kind: "standard",
            referenceAccountId: "account-1",
            displayAmountCents: -2_000,
            status: "entered",
            periodId: "2026-05",
            updatedAt: "2026-05-19T12:00:00.000Z",
        };

        mocks.transactionsByIdGo.mockResolvedValue({
            data: [
                {
                    occurredAt: transaction.occurredAt,
                    transactionId: transaction.transactionId,
                },
            ],
        });
        mocks.transactionsByTransactionBeginsGo.mockResolvedValue({
            data: [transaction],
        });

        const transactions = await listStoredTransactionsByIds("owner-1", [
            "transaction-2",
        ]);

        expect(transactions).toEqual([transaction]);
        expect(mocks.transactionsById).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            transactionId: "transaction-2",
        });
        expect(mocks.transactionsByTransactionBegins).toHaveBeenCalledWith({
            occurredAt: transaction.occurredAt,
            transactionId: transaction.transactionId,
        });
        expect(mocks.byTransactionGo).not.toHaveBeenCalled();
    });

    it("falls back to a ledger scan when the by-id index is unavailable", async () => {
        const transaction = {
            transactionId: "transaction-2",
            userId: "owner-1",
            occurredAt: "2026-05-19T12:00:00.000Z",
            enteredAt: "2026-05-19T12:00:00.000Z",
            kind: "standard",
            referenceAccountId: "account-1",
            displayAmountCents: -2_000,
            status: "entered",
            periodId: "2026-05",
            updatedAt: "2026-05-19T12:00:00.000Z",
        };

        mocks.transactionsByIdGo.mockRejectedValue(new Error("missing index"));
        mocks.byTransactionGo.mockResolvedValue({ data: [transaction] });

        const transactions = await listStoredTransactionsByIds("owner-1", [
            "transaction-2",
        ]);

        expect(transactions).toEqual([transaction]);
        expect(mocks.byTransactionGo).toHaveBeenCalledTimes(1);
    });

    it("includes transfers where the filtered account is the target account", async () => {
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transfer-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -1_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
                {
                    transactionId: "outflow-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-19T12:00:00.000Z",
                    enteredAt: "2026-05-19T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -2_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-19T12:00:00.000Z",
                },
            ],
        });
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transfer-1",
                },
            ],
        });

        const transactions = await listTransactions("owner-1", {
            accountId: "savings-1",
        });

        expect(transactions.map((transaction) => transaction.transactionId)).toEqual(
            ["transfer-1"],
        );
    });

    it("keeps UTC-midnight transaction records in their saved date range", async () => {
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "midnight-utc",
                    userId: "owner-1",
                    occurredAt: "2026-05-22T00:00:00.000Z",
                    enteredAt: "2026-05-22T00:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -1_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
        });

        const transactions = await listTransactions("owner-1", {
            endDate: "2026-05-22",
            startDate: "2026-05-22",
        });

        expect(transactions.map((transaction) => transaction.transactionId)).toEqual(
            ["midnight-utc"],
        );
    });

    it("does not materialize budget activity when creating a transaction", async () => {
        await expect(
            upsertTransaction("owner-1", {
                occurredAt: "2026-05-18T12:00:00.000Z",
                kind: "standard",
                payee: "Grocer",
                memo: "Weekly groceries",
                lines: [
                    {
                        amountCents: 6_500,
                        categoryId: "groceries",
                        fromAccountId: "account-1",
                    },
                ],
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                payee: "Grocer",
                periodId: "2026-05",
            }),
        );

        expect(mocks.categoryAllocationsByAllocationGo).not.toHaveBeenCalled();
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
        expect(
            mocks.syncTransactionClassificationSourceForTransaction,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                ledgerId: "owner-1",
                transaction: expect.objectContaining({ payee: "Grocer" }),
            }),
        );
        expect(
            mocks.syncTransactionClassificationEmbeddingForSourceRecord,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                ledgerId: "owner-1",
                record: null,
            }),
        );
    });

    it("does not materialize budget activity when moving a transaction between months", async () => {
        const existingTransaction = {
            transactionId: "transaction-1",
            userId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard" as const,
            payee: "Grocer",
            memo: "Old memo",
            referenceAccountId: "account-1",
            referenceCategoryId: "groceries",
            displayAmountCents: -6_500,
            status: "entered" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };

        mocks.byTransactionGo.mockResolvedValue({ data: [existingTransaction] });

        await expect(
            upsertTransaction("owner-1", {
                transactionId: "transaction-1",
                occurredAt: "2026-06-01T12:00:00.000Z",
                kind: "standard",
                payee: "Grocer",
                memo: "New memo",
                lines: [
                    {
                        amountCents: 6_500,
                        categoryId: "groceries",
                        fromAccountId: "account-1",
                    },
                ],
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                periodId: "2026-06",
                transactionId: "transaction-1",
            }),
        );

        expect(mocks.categoryAllocationsByAllocationGo).not.toHaveBeenCalled();
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
    });

    it("saves one-sided account activity as uncategorized when no category is selected", async () => {
        await expect(
            upsertTransaction("owner-1", {
                occurredAt: "2026-05-18T12:00:00.000Z",
                kind: "standard",
                payee: "Employer",
                memo: "Paycheck",
                lines: [
                    {
                        amountCents: 4_500,
                        toAccountId: "account-1",
                    },
                ],
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                displayAmountCents: 4_500,
                referenceCategoryId: undefined,
            }),
        );

        expect(mocks.createTransactionLineRecords).toHaveBeenCalledWith(
            expect.objectContaining({
                lines: [
                    expect.objectContaining({
                        amountCents: 4_500,
                        categoryId: undefined,
                        toAccountId: "account-1",
                    }),
                ],
            }),
        );
        expect(mocks.createLedgerPostingRecords).toHaveBeenCalledWith(
            expect.objectContaining({
                postings: [
                    {
                        amountCents: 4_500,
                        direction: "debit",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                    },
                    {
                        amountCents: 4_500,
                        direction: "credit",
                        ledgerAccountId: "equity_uncategorized",
                        ledgerAccountKind: "equity",
                    },
                ],
            }),
        );
        expect(mocks.serviceTransactionWrite).toHaveBeenCalled();
    });

    it("writes the transaction and its workspace mutation batch in one transaction", async () => {
        mocks.workspaceStateEnabled = true;
        mocks.ledgersGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: {
                    workspaceGeneration: 2,
                    workspaceRevision: 0,
                },
            }),
        });
        mocks.workspaceStatesGetGo.mockResolvedValue({
            data: createStoredWorkspaceStateFixture({
                ledgerId: "owner-1",
                records: {
                    ledgers: [
                        {
                            createdAt: "2026-05-01T00:00:00.000Z",
                            isDefault: true,
                            ledgerId: "owner-1",
                            name: "Ledger",
                            status: "active",
                            updatedAt: "2026-05-01T00:00:00.000Z",
                            workspaceId: "global",
                        },
                    ],
                },
                workspaceGeneration: 2,
                workspaceRevision: 0,
            }),
        });

        const result = await upsertTransactionWithWorkspaceChanges("owner-1", {
            occurredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            lines: [
                {
                    amountCents: 4_500,
                    fromAccountId: "account-1",
                },
            ],
            workspaceMutation: {
                mutationId: "mutation-1",
                mutationType: "transaction.create",
            },
        });

        expect(result.workspaceChanges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entityType: "transaction",
                    operation: "upsert",
                }),
            ]),
        );
        expect(mocks.serviceTransactionWrite).toHaveBeenCalledTimes(1);
        expect(mocks.workspaceMutationBatchesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                changesJson: expect.any(String),
                mutationId: "mutation-1",
            }),
        );
        expect(mocks.workspaceMutationReceiptsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                mutationId: "mutation-1",
            }),
        );
        expect(mocks.workspaceStatesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                ledgerId: "owner-1",
                workspaceGeneration: 2,
                workspaceRevision: 1,
            }),
        );
        const serializedBatch = mocks.workspaceMutationBatchesPut.mock.calls[0]?.[0];
        const serializedChanges = JSON.parse(
            serializedBatch.changesJson,
        ) as Array<{ previousRecordDigest?: string | null }>;

        expect(serializedChanges).not.toHaveLength(0);
        expect(
            serializedChanges.every(
                (change) => change.previousRecordDigest !== undefined,
            ),
        ).toBe(true);
        expect(mocks.ledgersUpdate).toHaveBeenCalled();
        expect(mocks.serviceTransactionWriteGo).toHaveBeenCalledTimes(1);
    });

    it("writes an aggregate without a nested workspace revision under an outer mutation", async () => {
        await upsertTransactionWithinWorkspaceMutation("owner-1", {
            occurredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            lines: [
                {
                    amountCents: 4_500,
                    fromAccountId: "account-1",
                },
            ],
        });

        expect(mocks.serviceTransactionWrite).toHaveBeenCalledTimes(1);
        expect(mocks.workspaceMutationBatchesPut).not.toHaveBeenCalled();
        expect(mocks.workspaceMutationReceiptsPut).not.toHaveBeenCalled();
        expect(mocks.ledgersUpdate).not.toHaveBeenCalled();
    });

    it("retries the complete transaction write after a workspace revision conflict", async () => {
        mocks.serviceTransactionWriteGo
            .mockResolvedValueOnce({
                canceled: true,
                data: [
                    { code: "None", rejected: false },
                    {
                        code: "ConditionalCheckFailed",
                        rejected: true,
                    },
                ],
            })
            .mockResolvedValueOnce({ canceled: false, data: [] });

        await expect(
            upsertTransactionWithWorkspaceChanges("owner-1", {
                occurredAt: "2026-05-18T12:00:00.000Z",
                kind: "standard",
                lines: [
                    {
                        amountCents: 4_500,
                        fromAccountId: "account-1",
                    },
                ],
            }),
        ).resolves.toEqual(
            expect.objectContaining({
                transaction: expect.objectContaining({
                    displayAmountCents: -4_500,
                }),
            }),
        );

        expect(mocks.serviceTransactionWrite).toHaveBeenCalledTimes(2);
        expect(mocks.serviceTransactionWriteGo).toHaveBeenCalledTimes(2);
    });

    it("does not retry a cancellation caused by a non-revision condition", async () => {
        mocks.serviceTransactionWriteGo.mockResolvedValueOnce({
            canceled: true,
            data: [
                {
                    code: "ConditionalCheckFailed",
                    rejected: true,
                },
                { code: "None", rejected: false },
            ],
        });

        await expect(
            upsertTransactionWithWorkspaceChanges("owner-1", {
                occurredAt: "2026-05-18T12:00:00.000Z",
                kind: "standard",
                lines: [
                    {
                        amountCents: 4_500,
                        fromAccountId: "account-1",
                    },
                ],
            }),
        ).rejects.toThrow("workspace transaction was canceled");

        expect(mocks.serviceTransactionWrite).toHaveBeenCalledTimes(1);
        expect(mocks.serviceTransactionWriteGo).toHaveBeenCalledTimes(1);
    });

    it("replays an existing durable transaction mutation without writing again", async () => {
        mocks.workspaceMutationReceiptsGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: {
                    batchId: "batch-1",
                    changeCursor: "change-1",
                    mutationType: "transaction.create",
                },
            }),
        });
        mocks.workspaceMutationBatchesGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: {
                    batchId: "batch-1",
                    changeCursor: "change-1",
                    changesJson: JSON.stringify([
                        {
                            batchId: "batch-1",
                            changedAt: "2026-05-18T12:00:00.000Z",
                            changeId: "change-1",
                            entityId: "transaction-1",
                            entityType: "transaction",
                            expiresAt: 1_780_000_000,
                            operation: "upsert",
                            record: { transactionId: "transaction-1" },
                        },
                    ]),
                    createdAt: "2026-05-18T12:00:00.000Z",
                    expiresAt: 1_780_000_000,
                    ledgerId: "owner-1",
                    mutationId: "mutation-1",
                    mutationType: "transaction.create",
                    responseJson: JSON.stringify({
                        transaction: { transactionId: "transaction-1" },
                    }),
                    workspaceGeneration: 1,
                },
            }),
        });

        const result = await upsertTransactionWithWorkspaceChanges("owner-1", {
            occurredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            lines: [
                {
                    amountCents: -1_000,
                    categoryId: "groceries",
                    fromAccountId: "account-1",
                },
            ],
            workspaceMutation: {
                mutationId: "mutation-1",
                mutationType: "transaction.create",
            },
        });

        expect(result.transaction).toEqual({ transactionId: "transaction-1" });
        expect(result.workspaceChanges).toHaveLength(1);
        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();
    });

    it("does not attempt a compensating write when the atomic mutation fails", async () => {
        mocks.serviceTransactionWriteGo.mockRejectedValueOnce(
            new Error("transaction canceled"),
        );

        await expect(
            upsertTransactionWithWorkspaceChanges("owner-1", {
                occurredAt: "2026-05-18T12:00:00.000Z",
                kind: "standard",
                lines: [
                    {
                        amountCents: 4_500,
                        fromAccountId: "account-1",
                    },
                ],
                workspaceMutation: {
                    mutationId: "mutation-failure",
                    mutationType: "transaction.create",
                },
            }),
        ).rejects.toThrow("transaction canceled");

        expect(mocks.transactionsPutGo).not.toHaveBeenCalled();
        expect(mocks.transactionsDeleteGo).not.toHaveBeenCalled();
    });

    it("rejects transfer lines that use the same account on both sides", async () => {
        await expect(
            upsertTransaction("owner-1", {
                occurredAt: "2026-05-18T12:00:00.000Z",
                kind: "standard",
                payee: "Grocer",
                memo: "Weekly groceries",
                lines: [
                    {
                        amountCents: 6_500,
                        fromAccountId: "account-1",
                        toAccountId: "account-1",
                    },
                ],
            }),
        ).rejects.toMatchObject({
            code: "line_validation_error",
            status: 422,
        });

        expect(mocks.transactionsPut).not.toHaveBeenCalled();
        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();
    });

    it("rejects lines with no account side", async () => {
        await expect(
            upsertTransaction("owner-1", {
                occurredAt: "2026-05-18T12:00:00.000Z",
                kind: "standard",
                lines: [
                    {
                        amountCents: 5_000,
                    },
                ],
            }),
        ).rejects.toMatchObject({
            code: "line_validation_error",
            status: 422,
        });

        expect(mocks.transactionsPut).not.toHaveBeenCalled();
        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();
    });

    it("returns a validation error for invalid transaction dates", async () => {
        await expect(
            upsertTransaction("owner-1", {
                occurredAt: "not-a-date",
                kind: "standard",
                lines: [
                    {
                        amountCents: 5_000,
                        categoryId: "groceries",
                        fromAccountId: "account-1",
                    },
                ],
            }),
        ).rejects.toMatchObject({
            code: "validation_error",
            status: 422,
        });
    });

    it("creates a multi-line outflow with parent, transaction lines, and generated ledger postings", async () => {
        const result = await upsertTransaction("owner-1", {
            accountId: "account-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            payee: "Big Box",
            memo: "Split receipt",
                lines: [
                    {
                        amountCents: 6_000,
                        categoryId: "groceries",
                        fromAccountId: "account-1",
                        memo: "Food",
                        payee: "Grocery counter",
                    },
                    {
                        amountCents: 4_000,
                        fromAccountId: "account-1",
                        toAccountId: "savings-1",
                        memo: "Cash reserve",
                    payee: "Savings",
                },
            ],
        });

        expect(result).toMatchObject({
            referenceAccountId: "account-1",
            referenceCategoryId: undefined,
        });
        expect(mocks.transactionsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                referenceAccountId: "account-1",
                referenceCategoryId: "__mixed__",
            }),
        );
        expect(mocks.transactionLinesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 6_000,
                categoryId: "groceries",
                fromAccountId: "account-1",
                sortOrder: 0,
            }),
        );
        expect(mocks.transactionLinesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 4_000,
                fromAccountId: "account-1",
                toAccountId: "savings-1",
                sortOrder: 1,
            }),
        );
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 10_000,
                direction: "credit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
            }),
        );
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 6_000,
                direction: "debit",
                ledgerAccountId: "cat_groceries",
                ledgerAccountKind: "category",
            }),
        );
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 4_000,
                direction: "debit",
                ledgerAccountId: "acct_savings",
                ledgerAccountKind: "financial",
            }),
        );
        expect(mocks.recordTransactionAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "create",
                ledgerId: "owner-1",
                source: "manual",
                transactionId: result.transactionId,
            }),
        );
    });

    it("preserves Plaid aggregate metadata and proves prior records for memo updates", async () => {
        const transaction = {
            displayAmountCents: -1_250,
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard" as const,
            ledgerId: "owner-1",
            memo: "Old memo",
            occurredAt: "2026-05-18T12:00:00.000Z",
            periodId: "2026-05",
            referenceAccountId: "account-1",
            source: "plaid" as const,
            status: "entered" as const,
            transactionId: "transaction-1",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const line = {
            amountCents: 1_250,
            createdAt: transaction.updatedAt,
            fromAccountId: "account-1",
            ledgerId: "owner-1",
            lineId: "line-1",
            memo: "Old memo",
            sortOrder: 0,
            transactionId: transaction.transactionId,
            updatedAt: transaction.updatedAt,
        };
        const posting = {
            amountCents: 1_250,
            createdAt: transaction.updatedAt,
            direction: "credit" as const,
            ledgerAccountId: "acct_checking",
            ledgerAccountKind: "financial" as const,
            ledgerId: "owner-1",
            occurredAt: transaction.occurredAt,
            periodId: transaction.periodId,
            postingId: "posting-1",
            transactionId: transaction.transactionId,
        };
        const plaidSync = {
            ledgerId: "owner-1",
            plaidTransactionSyncId: "plaid-sync-1",
            transactionId: transaction.transactionId,
            updatedAt: transaction.updatedAt,
        };

        mocks.byTransactionGo.mockResolvedValue({ data: [transaction] });
        mocks.listTransactionLinesForTransaction.mockResolvedValue([line]);
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([posting]);
        mocks.plaidTransactionSyncsByTransaction.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: [plaidSync] }),
        });

        const result = await updateTransactionMemoWithWorkspaceChanges({
            ledgerId: "owner-1",
            memo: "New memo",
            transactionId: transaction.transactionId,
        });

        expect(result.transaction).toMatchObject({
            aggregatePlaidSyncCount: 1,
            memo: "New memo",
        });
        expect(result.workspaceChanges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entityId: transaction.transactionId,
                    entityType: "transaction",
                    previousRecordDigest: calculateWorkspaceRecordDigest({
                        entityType: "transaction",
                        record: transaction,
                    }),
                }),
                expect.objectContaining({
                    entityId: line.lineId,
                    entityType: "transactionLine",
                    previousRecordDigest: calculateWorkspaceRecordDigest({
                        entityType: "transactionLine",
                        record: line,
                    }),
                }),
            ]),
        );
        expect(mocks.ledgerPostingsDelete).not.toHaveBeenCalled();
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(posting);
    });

    it("proves an existing Plaid sync record when a transaction update replaces it", async () => {
        const transaction = {
            displayAmountCents: -1_250,
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard" as const,
            ledgerId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            periodId: "2026-05",
            referenceAccountId: "account-1",
            source: "plaid" as const,
            status: "entered" as const,
            transactionId: "transaction-1",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const line = {
            amountCents: 1_250,
            createdAt: transaction.updatedAt,
            fromAccountId: "account-1",
            ledgerId: "owner-1",
            lineId: "line-1",
            sortOrder: 0,
            transactionId: transaction.transactionId,
            updatedAt: transaction.updatedAt,
        };
        const previousSync = {
            accountId: "account-1",
            firstSyncedAt: transaction.updatedAt,
            lastSyncedAt: transaction.updatedAt,
            ledgerId: "owner-1",
            name: "Merchant",
            pending: true,
            plaidAccountId: "plaid-account-1",
            plaidAccountLinkId: "link-1",
            plaidAmountCents: 1_250,
            plaidDate: "2026-05-18",
            plaidItemId: "item-1",
            plaidPayloadJson: "{}",
            plaidTransactionId: "plaid-transaction-1",
            plaidTransactionSyncId: "plaid-sync-1",
            status: "active" as const,
            transactionId: transaction.transactionId,
            updatedAt: transaction.updatedAt,
        };
        const nextSync = {
            ...previousSync,
            lastSyncedAt: "2026-05-19T12:00:00.000Z",
            pending: false,
            updatedAt: "2026-05-19T12:00:00.000Z",
        };

        mocks.byTransactionGo.mockResolvedValue({ data: [transaction] });
        mocks.listTransactionLinesForTransaction.mockResolvedValue([line]);
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([]);
        mocks.plaidTransactionSyncsByTransaction.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: [previousSync] }),
        });
        mocks.plaidTransactionSyncsGetGo.mockResolvedValue({
            data: previousSync,
        });

        const result = await upsertTransactionWithWorkspaceChanges("owner-1", {
            accountId: "account-1",
            kind: "standard",
            lines: [
                {
                    amountCents: 1_250,
                    fromAccountId: "account-1",
                    lineId: line.lineId,
                },
            ],
            occurredAt: transaction.occurredAt,
            plaidTransactionSyncRecordsToPut: [nextSync],
            source: "plaid",
            transactionId: transaction.transactionId,
        });

        expect(result.transaction).toMatchObject({
            aggregatePlaidSyncCount: 1,
            transactionId: transaction.transactionId,
        });
        expect(result.workspaceChanges).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entityId: previousSync.plaidTransactionSyncId,
                    entityType: "plaidTransactionSync",
                    previousRecordDigest: calculateWorkspaceRecordDigest({
                        entityType: "plaidTransactionSync",
                        record: previousSync,
                    }),
                    record: nextSync,
                }),
            ]),
        );
    });

    it("merges a manual transfer into a Plaid transaction while preserving Plaid metadata", async () => {
        const manualTransfer = {
            transactionId: "manual-transfer",
            userId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            payee: "Credit card payment",
            memo: "Manual transfer",
            referenceAccountId: "account-1",
            displayAmountCents: -5_000,
            status: "entered" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const plaidPayment = {
            transactionId: "plaid-payment",
            userId: "owner-1",
            occurredAt: "2026-05-20T12:00:00.000Z",
            enteredAt: "2026-05-20T12:00:00.000Z",
            kind: "standard",
            payee: "Payment Thank You",
            referenceAccountId: "savings-1",
            displayAmountCents: 5_000,
            plaidTransactionSyncId: "plaid-sync-1",
            source: "plaid" as const,
            status: "cleared" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-20T12:00:00.000Z",
        };
        const manualTransferPostings = [
            {
                postingId: "manual-posting-1",
                transactionId: "manual-transfer",
                userId: "owner-1",
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-18T12:00:00.000Z",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
                direction: "credit" as const,
                amountCents: 5_000,
            },
            {
                postingId: "manual-posting-2",
                transactionId: "manual-transfer",
                userId: "owner-1",
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-18T12:00:00.000Z",
                ledgerAccountId: "acct_savings",
                ledgerAccountKind: "financial" as const,
                direction: "debit" as const,
                amountCents: 5_000,
            },
        ];
        const plaidPostings = [
            {
                postingId: "plaid-posting-1",
                transactionId: "plaid-payment",
                userId: "owner-1",
                occurredAt: "2026-05-20T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-20T12:00:00.000Z",
                ledgerAccountId: "acct_savings",
                ledgerAccountKind: "financial" as const,
                direction: "debit" as const,
                amountCents: 5_000,
            },
            {
                postingId: "plaid-posting-2",
                transactionId: "plaid-payment",
                userId: "owner-1",
                occurredAt: "2026-05-20T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-20T12:00:00.000Z",
                ledgerAccountId: "cat_groceries",
                ledgerAccountKind: "category" as const,
                direction: "credit" as const,
                amountCents: 5_000,
            },
        ];
        const manualTransferLines = [
            {
                ledgerId: "owner-1",
                lineId: "manual-line-1",
                transactionId: "manual-transfer",
                userId: "owner-1",
                amountCents: 5_000,
                fromAccountId: "account-1",
                toAccountId: "savings-1",
                sortOrder: 0,
                createdAt: "2026-05-18T12:00:00.000Z",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
        ];
        const plaidPaymentLines = [
            {
                ledgerId: "owner-1",
                lineId: "plaid-line-1",
                transactionId: "plaid-payment",
                userId: "owner-1",
                amountCents: 5_000,
                categoryId: "groceries",
                toAccountId: "savings-1",
                sortOrder: 0,
                createdAt: "2026-05-20T12:00:00.000Z",
                updatedAt: "2026-05-20T12:00:00.000Z",
            },
        ];

        mocks.byTransactionGo.mockResolvedValue({
            data: [manualTransfer, plaidPayment],
        });
        mocks.listLedgerPostingsForTransaction.mockImplementation(
            async (_userId: string, transactionId: string) =>
                transactionId === "manual-transfer"
                    ? manualTransferPostings
                    : plaidPostings,
        );
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_userId: string, transactionId: string) =>
                transactionId === "manual-transfer"
                    ? manualTransferLines
                    : plaidPaymentLines,
        );
        mocks.resolveTransactionReferences.mockResolvedValue({
            referenceAccountId: "account-1",
            referenceCategoryId: null,
        });
        mocks.syncAffectedBudgetPeriodActivity.mockResolvedValue(["2026-05"]);

        const result = await mergeTransactionsWithWorkspaceChanges("owner-1", [
            "manual-transfer",
            "plaid-payment",
        ]);

        expect(result.transaction).toMatchObject({
            transactionId: "plaid-payment",
            kind: "standard",
            source: "plaid",
            plaidTransactionSyncId: "plaid-sync-1",
            occurredAt: "2026-05-20T00:00:00.000Z",
            payee: "Credit card payment",
            memo: "Manual transfer",
        });
        expect(mocks.transactionsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                transactionId: "plaid-payment",
                kind: "standard",
                source: "plaid",
                plaidTransactionSyncId: "plaid-sync-1",
                referenceAccountId: "account-1",
            }),
        );
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                transactionId: "plaid-payment",
                ledgerAccountId: "acct_checking",
                direction: "credit",
                amountCents: 5_000,
            }),
        );
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                transactionId: "plaid-payment",
                ledgerAccountId: "acct_savings",
                direction: "debit",
                amountCents: 5_000,
            }),
        );
        expect(mocks.transactionsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            transactionId: "manual-transfer",
        });
        expect(mocks.transactionLinesDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            lineId: "manual-line-1",
            transactionId: "manual-transfer",
        });
        expect(mocks.recordTransactionAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "merge",
                ledgerId: "owner-1",
                source: "merge",
                transactionId: "plaid-payment",
                transactionIds: ["manual-transfer", "plaid-payment"],
            }),
        );
        expect(
            result.workspaceChanges.map((change) => change.entityType),
        ).not.toContain("budgetPeriod");
        expect(
            result.workspaceChanges.map((change) => change.entityType),
        ).not.toContain("categoryAllocation");
        expect(
            result.workspaceChanges.find(
                (change) =>
                    change.entityType === "transaction" &&
                    change.operation === "upsert",
            ),
        ).toMatchObject({
            previousRecordDigest: calculateWorkspaceRecordDigest({
                entityType: "transaction",
                record: plaidPayment,
            }),
        });
        expect(mocks.syncAffectedBudgetPeriodActivity).not.toHaveBeenCalled();
    });

    it("authoritatively converts two Plaid payment sides into one bank-to-card transfer", async () => {
        const bankTransaction = {
            displayAmountCents: -5_000,
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard" as const,
            ledgerId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            payee: "Card payment",
            periodId: "2026-05",
            plaidTransactionSyncId: "bank-sync",
            referenceAccountId: "account-1",
            source: "plaid" as const,
            status: "cleared" as const,
            transactionId: "bank-payment",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const cardTransaction = {
            displayAmountCents: 5_000,
            enteredAt: "2026-05-20T12:00:00.000Z",
            kind: "standard" as const,
            ledgerId: "owner-1",
            occurredAt: "2026-05-20T12:00:00.000Z",
            payee: "Payment received",
            periodId: "2026-05",
            plaidTransactionSyncId: "card-sync",
            referenceAccountId: "credit-card-1",
            source: "plaid" as const,
            status: "cleared" as const,
            transactionId: "card-payment",
            updatedAt: "2026-05-20T12:00:00.000Z",
        };
        const bankLine = {
            amountCents: 5_000,
            createdAt: bankTransaction.updatedAt,
            fromAccountId: "account-1",
            ledgerId: "owner-1",
            lineId: "bank-line",
            sortOrder: 0,
            transactionId: bankTransaction.transactionId,
            updatedAt: bankTransaction.updatedAt,
        };
        const cardLine = {
            amountCents: 5_000,
            createdAt: cardTransaction.updatedAt,
            ledgerId: "owner-1",
            lineId: "card-line",
            sortOrder: 0,
            toAccountId: "credit-card-1",
            transactionId: cardTransaction.transactionId,
            updatedAt: cardTransaction.updatedAt,
        };
        const bankPosting = {
            amountCents: 5_000,
            createdAt: bankTransaction.updatedAt,
            direction: "credit" as const,
            ledgerAccountId: "acct_checking",
            ledgerAccountKind: "financial" as const,
            occurredAt: bankTransaction.occurredAt,
            periodId: bankTransaction.periodId,
            postingId: "bank-posting",
            transactionId: bankTransaction.transactionId,
        };
        const cardPosting = {
            amountCents: 5_000,
            createdAt: cardTransaction.updatedAt,
            direction: "debit" as const,
            ledgerAccountId: "acct_credit_card",
            ledgerAccountKind: "financial" as const,
            occurredAt: cardTransaction.occurredAt,
            periodId: cardTransaction.periodId,
            postingId: "card-posting",
            transactionId: cardTransaction.transactionId,
        };
        const bankSync = {
            ledgerId: "owner-1",
            plaidTransactionSyncId: "bank-sync",
            transactionId: bankTransaction.transactionId,
            updatedAt: bankTransaction.updatedAt,
        };
        const cardSync = {
            ledgerId: "owner-1",
            plaidTransactionSyncId: "card-sync",
            transactionId: cardTransaction.transactionId,
            updatedAt: cardTransaction.updatedAt,
        };

        mocks.byTransactionGo.mockResolvedValue({
            data: [bankTransaction, cardTransaction],
        });
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) =>
                transactionId === bankTransaction.transactionId
                    ? [bankLine]
                    : [cardLine],
        );
        mocks.listLedgerPostingsForTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) =>
                transactionId === bankTransaction.transactionId
                    ? [bankPosting]
                    : [cardPosting],
        );
        mocks.plaidTransactionSyncsByTransaction.mockImplementation(
            ({ transactionId }: { transactionId: string }) => ({
                go: vi.fn().mockResolvedValue({
                    data:
                        transactionId === bankTransaction.transactionId
                            ? [bankSync]
                            : [cardSync],
                }),
            }),
        );
        mocks.resolveTransactionReferences.mockResolvedValue({
            referenceAccountId: "account-1",
            referenceCategoryId: null,
        });

        await expect(
            mergeTransactionsWithWorkspaceChanges(
                "owner-1",
                [bankTransaction.transactionId, cardTransaction.transactionId],
                undefined,
                undefined,
                "duplicate",
            ),
        ).rejects.toMatchObject({
            code: "transaction_auto_match_stale",
            status: 409,
        });
        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();

        const result = await mergeTransactionsWithWorkspaceChanges(
            "owner-1",
            [bankTransaction.transactionId, cardTransaction.transactionId],
            undefined,
            undefined,
            "creditCardPayment",
        );

        expect(result.transaction).toMatchObject({
            displayAmountCents: -5_000,
            referenceAccountId: "account-1",
            transactionId: "bank-payment",
        });
        expect(mocks.transactionLinesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 5_000,
                categoryId: undefined,
                fromAccountId: "account-1",
                toAccountId: "credit-card-1",
                transactionId: "bank-payment",
            }),
        );
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 5_000,
                direction: "credit",
                ledgerAccountId: "acct_checking",
                transactionId: "bank-payment",
            }),
        );
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 5_000,
                direction: "debit",
                ledgerAccountId: "acct_credit_card",
                transactionId: "bank-payment",
            }),
        );
        expect(mocks.plaidTransactionSyncsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidTransactionSyncId: "card-sync",
                transactionId: "bank-payment",
            }),
        );
    });

    it("keeps categorized lines and defined text when merging an uncategorized manual transaction with Plaid", async () => {
        const manualTransaction = {
            transactionId: "manual-uncategorized",
            userId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard" as const,
            memo: "",
            payee: "Manual merchant",
            referenceAccountId: "account-1",
            displayAmountCents: -5_000,
            status: "entered" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const plaidTransaction = {
            transactionId: "plaid-categorized",
            userId: "owner-1",
            occurredAt: "2026-05-20T12:00:00.000Z",
            enteredAt: "2026-05-20T12:00:00.000Z",
            kind: "standard" as const,
            memo: "Plaid detail",
            payee: "",
            referenceAccountId: "account-1",
            displayAmountCents: -5_000,
            status: "cleared" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-20T12:00:00.000Z",
        };
        const manualLines = [
            {
                lineId: "manual-line",
                transactionId: manualTransaction.transactionId,
                userId: "owner-1",
                amountCents: 5_000,
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: manualTransaction.occurredAt,
                updatedAt: manualTransaction.updatedAt,
            },
        ];
        const plaidLines = [
            {
                lineId: "plaid-line",
                transactionId: plaidTransaction.transactionId,
                userId: "owner-1",
                amountCents: 5_000,
                categoryId: "groceries",
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: plaidTransaction.occurredAt,
                updatedAt: plaidTransaction.updatedAt,
            },
        ];

        mocks.byTransactionGo.mockResolvedValue({
            data: [manualTransaction, plaidTransaction],
        });
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) =>
                transactionId === manualTransaction.transactionId
                    ? manualLines
                    : plaidLines,
        );
        mocks.resolveTransactionReferences.mockResolvedValue({
            referenceAccountId: "account-1",
            referenceCategoryId: "groceries",
        });
        mocks.plaidTransactionSyncsByTransaction.mockImplementation(
            ({ transactionId }: { transactionId: string }) => ({
                go: vi.fn().mockResolvedValue({
                    data:
                        transactionId === plaidTransaction.transactionId
                            ? [
                                  {
                                      ledgerId: "owner-1",
                                      plaidTransactionSyncId: "plaid-sync-1",
                                      transactionId,
                                      updatedAt:
                                          "2026-05-20T12:00:00.000Z",
                                  },
                              ]
                            : [],
                }),
            }),
        );

        const result = await mergeTransactions("owner-1", [
            manualTransaction.transactionId,
            plaidTransaction.transactionId,
        ]);

        expect(result).toMatchObject({
            transactionId: plaidTransaction.transactionId,
            memo: "Plaid detail",
            payee: "Manual merchant",
            plaidTransactionSyncId: "plaid-sync-1",
            referenceCategoryId: "groceries",
            source: "plaid",
        });
        expect(mocks.transactionLinesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                categoryId: "groceries",
                lineId: "plaid-line",
            }),
        );
    });

    it("does not materialize allocation activity when a merge moves category activity across periods", async () => {
        const manualGroceries = {
            transactionId: "manual-groceries",
            userId: "owner-1",
            occurredAt: "2026-05-31T12:00:00.000Z",
            enteredAt: "2026-05-31T12:00:00.000Z",
            kind: "standard",
            payee: "Market",
            referenceAccountId: "account-1",
            referenceCategoryId: "groceries",
            displayAmountCents: -5_000,
            status: "entered" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-31T12:00:00.000Z",
        };
        const plaidGroceries = {
            transactionId: "plaid-groceries",
            userId: "owner-1",
            occurredAt: "2026-06-01T12:00:00.000Z",
            enteredAt: "2026-06-01T12:00:00.000Z",
            kind: "standard",
            payee: "Market",
            referenceAccountId: "account-1",
            displayAmountCents: -5_000,
            plaidTransactionSyncId: "plaid-sync-1",
            source: "plaid" as const,
            status: "cleared" as const,
            periodId: "2026-06",
            updatedAt: "2026-06-01T12:00:00.000Z",
        };
        const manualLines = [
            {
                lineId: "manual-line-1",
                transactionId: "manual-groceries",
                userId: "owner-1",
                amountCents: 5_000,
                categoryId: "groceries",
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: "2026-05-31T12:00:00.000Z",
                updatedAt: "2026-05-31T12:00:00.000Z",
            },
        ];
        const plaidLinesBefore = [
            {
                lineId: "plaid-line-1",
                transactionId: "plaid-groceries",
                userId: "owner-1",
                amountCents: 5_000,
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: "2026-06-01T12:00:00.000Z",
                updatedAt: "2026-06-01T12:00:00.000Z",
            },
        ];
        const plaidLinesAfter = [
            {
                ...manualLines[0],
                transactionId: "plaid-groceries",
                updatedAt: "2026-06-01T12:00:00.000Z",
            },
        ];
        let plaidLineReadCount = 0;

        mocks.byTransactionGo.mockResolvedValue({
            data: [manualGroceries, plaidGroceries],
        });
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_userId: string, transactionId: string) => {
                if (transactionId === "manual-groceries") {
                    return manualLines;
                }

                plaidLineReadCount += 1;

                return plaidLineReadCount === 1
                    ? plaidLinesBefore
                    : plaidLinesAfter;
            },
        );
        mocks.resolveTransactionReferences.mockResolvedValue({
            referenceAccountId: "account-1",
            referenceCategoryId: "groceries",
        });
        await mergeTransactionsWithWorkspaceChanges("owner-1", [
            "manual-groceries",
            "plaid-groceries",
        ]);

        expect(mocks.syncAffectedBudgetPeriodActivity).not.toHaveBeenCalled();
        expect(mocks.categoryAllocationsByAllocationBegins).not.toHaveBeenCalled();
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
    });

    it("merges the second Plaid side into an existing Plaid transfer", async () => {
        const plaidTransfer = {
            transactionId: "plaid-transfer",
            userId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            payee: "Credit card payment",
            memo: "Matched checking side",
            referenceAccountId: "account-1",
            plaidTransactionSyncId: "checking-sync",
            source: "plaid" as const,
            displayAmountCents: -5_000,
            status: "cleared" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const receivingPlaidPayment = {
            transactionId: "receiving-plaid-payment",
            userId: "owner-1",
            occurredAt: "2026-05-20T12:00:00.000Z",
            enteredAt: "2026-05-20T12:00:00.000Z",
            kind: "standard",
            payee: "Payment Thank You",
            referenceAccountId: "savings-1",
            plaidTransactionSyncId: "card-sync",
            source: "plaid" as const,
            displayAmountCents: 5_000,
            status: "cleared" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-20T12:00:00.000Z",
        };
        const transferPostings = [
            {
                postingId: "transfer-posting-1",
                transactionId: "plaid-transfer",
                userId: "owner-1",
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-18T12:00:00.000Z",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
                direction: "credit" as const,
                amountCents: 5_000,
            },
            {
                postingId: "transfer-posting-2",
                transactionId: "plaid-transfer",
                userId: "owner-1",
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-18T12:00:00.000Z",
                ledgerAccountId: "acct_savings",
                ledgerAccountKind: "financial" as const,
                direction: "debit" as const,
                amountCents: 5_000,
            },
        ];
        const receivingPostings = [
            {
                postingId: "receiving-posting-1",
                transactionId: "receiving-plaid-payment",
                userId: "owner-1",
                occurredAt: "2026-05-20T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-20T12:00:00.000Z",
                ledgerAccountId: "acct_savings",
                ledgerAccountKind: "financial" as const,
                direction: "debit" as const,
                amountCents: 5_000,
            },
            {
                postingId: "receiving-posting-2",
                transactionId: "receiving-plaid-payment",
                userId: "owner-1",
                occurredAt: "2026-05-20T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-20T12:00:00.000Z",
                ledgerAccountId: "cat_groceries",
                ledgerAccountKind: "category" as const,
                direction: "credit" as const,
                amountCents: 5_000,
            },
        ];
        const transferLines = [
            {
                lineId: "transfer-line-1",
                transactionId: "plaid-transfer",
                userId: "owner-1",
                amountCents: 5_000,
                fromAccountId: "account-1",
                toAccountId: "savings-1",
                sortOrder: 0,
                createdAt: "2026-05-18T12:00:00.000Z",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
        ];
        const receivingLines = [
            {
                lineId: "receiving-line-1",
                transactionId: "receiving-plaid-payment",
                userId: "owner-1",
                amountCents: 5_000,
                categoryId: "groceries",
                toAccountId: "savings-1",
                sortOrder: 0,
                createdAt: "2026-05-20T12:00:00.000Z",
                updatedAt: "2026-05-20T12:00:00.000Z",
            },
        ];

        mocks.byTransactionGo.mockResolvedValue({
            data: [plaidTransfer, receivingPlaidPayment],
        });
        mocks.listLedgerPostingsForTransaction.mockImplementation(
            async (_userId: string, transactionId: string) =>
                transactionId === "plaid-transfer"
                    ? transferPostings
                    : receivingPostings,
        );
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_userId: string, transactionId: string) =>
                transactionId === "plaid-transfer"
                    ? transferLines
                    : receivingLines,
        );
        mocks.plaidTransactionSyncsByTransaction.mockImplementation(
            ({ transactionId }: { transactionId: string }) => ({
                go: vi.fn().mockResolvedValue({
                    data:
                        transactionId === "plaid-transfer"
                            ? [
                                  {
                                      ledgerId: "ledger-1",
                                      plaidTransactionSyncId: "checking-sync",
                                      transactionId: "plaid-transfer",
                                      updatedAt:
                                          "2026-05-18T12:00:00.000Z",
                                  },
                              ]
                            : [
                                  {
                                      ledgerId: "owner-1",
                                      plaidTransactionSyncId: "card-sync",
                                      transactionId:
                                          "receiving-plaid-payment",
                                      updatedAt:
                                          "2026-05-20T12:00:00.000Z",
                                  },
                              ],
                }),
            }),
        );

        const result = await mergeTransactions(
            "owner-1",
            ["plaid-transfer", "receiving-plaid-payment"],
        );

        expect(result).toMatchObject({
            transactionId: "plaid-transfer",
            kind: "standard",
            source: "plaid",
            plaidTransactionSyncId: "checking-sync",
            occurredAt: "2026-05-18T00:00:00.000Z",
        });
        expect(mocks.plaidTransactionSyncsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidTransactionSyncId: "card-sync",
                transactionId: "plaid-transfer",
            }),
        );
        expect(mocks.plaidTransactionSyncsDelete).not.toHaveBeenCalled();
        expect(mocks.transactionsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            occurredAt: "2026-05-20T12:00:00.000Z",
            transactionId: "receiving-plaid-payment",
        });
    });

    it("rejects transaction merges when absolute totals do not match", async () => {
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transaction-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
                {
                    transactionId: "transaction-2",
                    userId: "owner-1",
                    occurredAt: "2026-05-19T12:00:00.000Z",
                    enteredAt: "2026-05-19T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-19T12:00:00.000Z",
                },
            ],
        });

        await expect(
            mergeTransactions("owner-1", ["transaction-1", "transaction-2"]),
        ).rejects.toMatchObject({
            code: "transaction_merge_amount",
            status: 422,
        });

        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();
    });

    it("rejects merging two multi-line transactions", async () => {
        mocks.byTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "split-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -5_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
                {
                    transactionId: "split-2",
                    userId: "owner-1",
                    occurredAt: "2026-05-19T12:00:00.000Z",
                    enteredAt: "2026-05-19T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -5_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-19T12:00:00.000Z",
                },
            ],
        });
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_userId: string, transactionId: string) => [
                {
                    lineId: `${transactionId}-line-1`,
                    transactionId,
                    userId: "owner-1",
                    amountCents: 2_500,
                    fromAccountId: "account-1",
                    sortOrder: 0,
                    createdAt: "2026-05-18T12:00:00.000Z",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
                {
                    lineId: `${transactionId}-line-2`,
                    transactionId,
                    userId: "owner-1",
                    amountCents: 2_500,
                    fromAccountId: "account-1",
                    sortOrder: 1,
                    createdAt: "2026-05-18T12:00:00.000Z",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
            ],
        );

        await expect(
            mergeTransactions("owner-1", ["split-1", "split-2"]),
        ).rejects.toMatchObject({
            code: "transaction_merge_line_conflict",
            status: 422,
        });

        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();
    });

    it("does not materialize budget activity when voiding a transaction", async () => {
        const existingTransaction = {
            transactionId: "transaction-1",
            userId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            payee: "Grocer",
            memo: "Weekly groceries",
            referenceAccountId: "account-1",
            referenceCategoryId: "groceries",
            status: "entered" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const previousPostings = [
            {
                postingId: "posting-1",
                transactionId: "transaction-1",
                userId: "owner-1",
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-18T12:00:00.000Z",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
                direction: "credit" as const,
                amountCents: 6_500,
            },
        ];
        const previousLines = [
            {
                lineId: "line-1",
                transactionId: "transaction-1",
                userId: "owner-1",
                amountCents: 6_500,
                categoryId: "groceries",
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: "2026-05-18T12:00:00.000Z",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
        ];

        mocks.byTransactionGo.mockResolvedValue({
            data: [existingTransaction],
        });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue(
            previousPostings,
        );
        mocks.listTransactionLinesForTransaction.mockResolvedValue(previousLines);
        mocks.removeLedgerPostings.mockResolvedValue(previousPostings);
        await expect(
            voidTransaction("owner-1", "transaction-1"),
        ).resolves.toEqual(
            expect.objectContaining({
                status: "voided",
                transactionId: "transaction-1",
            }),
        );

        expect(mocks.transactionsPut).toHaveBeenCalledTimes(1);
        expect(mocks.transactionsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                transactionId: "transaction-1",
                status: "voided",
            }),
        );
        expect(mocks.categoryAllocationsByAllocationGo).not.toHaveBeenCalled();
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
    });

    it("does not overwrite a changed pending transaction when a durable categorization resumes", async () => {
        const originalTransaction = {
            displayAmountCents: -1_000,
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard" as const,
            ledgerId: "owner-1",
            occurredAt: "2026-05-18T12:00:00.000Z",
            periodId: "2026-05",
            referenceAccountId: "account-1",
            source: "manual" as const,
            status: "entered" as const,
            transactionId: "transaction-1",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const currentTransaction = {
            ...originalTransaction,
            memo: "Edited after the bulk operation was confirmed.",
            updatedAt: "2026-05-18T12:05:00.000Z",
        };
        const lines = [
            {
                amountCents: -1_000,
                categoryId: "__no_category__",
                createdAt: "2026-05-18T12:00:00.000Z",
                fromAccountId: "account-1",
                ledgerId: "owner-1",
                lineId: "line-1",
                sortOrder: 0,
                transactionId: "transaction-1",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
        ];
        const postings = [
            {
                amountCents: 1_000,
                createdAt: "2026-05-18T12:00:00.000Z",
                direction: "credit" as const,
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
                ledgerId: "owner-1",
                occurredAt: "2026-05-18T12:00:00.000Z",
                periodId: "2026-05",
                postingId: "posting-1",
                transactionId: "transaction-1",
            },
        ];
        const expectedAggregateRevision = createTransactionAggregateRevision({
            ledgerPostings: postings,
            transaction: originalTransaction,
            transactionLines: lines,
        });

        mocks.transactionsByIdGo.mockResolvedValue({
            data: [currentTransaction],
        });
        mocks.transactionsByTransactionBeginsGo.mockResolvedValue({
            data: [currentTransaction],
        });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue(postings);
        mocks.listTransactionLinesForTransaction.mockResolvedValue(lines);
        mocks.workspaceMutationOperationsGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: {
                    completedStepCount: 0,
                    createdAt: "2026-05-18T12:00:00.000Z",
                    expiresAt: 1_800_000_000,
                    ledgerId: "owner-1",
                    mutationId: "categorize-1",
                    mutationType: "transaction.categorize",
                    operationJson: JSON.stringify({
                        categoryId: "groceries",
                        expectedAggregateRevisionByTransactionId: {
                            "transaction-1": expectedAggregateRevision,
                        },
                        operationVersion: 3,
                        transactionIds: ["transaction-1"],
                        updatedCount: 1,
                    }),
                    status: "running",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
            }),
        });

        await expect(
            categorizeTransactionsWithWorkspaceChanges({
                actorUserId: "owner-1",
                categoryId: "groceries",
                ledgerId: "owner-1",
                transactionIds: ["transaction-1"],
                workspaceMutation: {
                    mutationId: "categorize-1",
                    mutationType: "transaction.categorize",
                },
            }),
        ).rejects.toMatchObject({
            code: "transaction_categorization_conflict",
            details: {
                completedCount: 0,
                conflictedTransactionIds: ["transaction-1"],
            },
            status: 409,
        });

        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();
        const [failedOperationRecord] =
            mocks.workspaceMutationOperationsPut.mock.calls.at(-1) ?? [];

        expect(failedOperationRecord).toMatchObject({
            completedStepCount: 0,
            mutationId: "categorize-1",
            status: "failed",
        });
        expect(failedOperationRecord.operationJson).toContain(
            "conflictedTransactionIds",
        );

        mocks.workspaceMutationOperationsGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: failedOperationRecord }),
        });

        await expect(
            categorizeTransactionsWithWorkspaceChanges({
                actorUserId: "owner-1",
                categoryId: "groceries",
                ledgerId: "owner-1",
                transactionIds: ["transaction-1"],
                workspaceMutation: {
                    mutationId: "categorize-1",
                    mutationType: "transaction.categorize",
                },
            }),
        ).rejects.toMatchObject({
            code: "transaction_categorization_conflict",
            details: { conflictedTransactionIds: ["transaction-1"] },
        });
        expect(mocks.serviceTransactionWrite).not.toHaveBeenCalled();
    });
});
