// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatPerfResult, measureAsyncP95 } from "./benchmark";

type MockPostingRecordInput = {
    createdAt?: string;
    occurredAt: string;
    periodId: string;
    postings: Array<Record<string, unknown>>;
    transactionId: string;
    userId: string;
};

const mocks = vi.hoisted(() => ({
    accountsByAccount: vi.fn(),
    budgetCategoriesByCategory: vi.fn(),
    byTransactionGo: vi.fn(),
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
    createTransactionLineRecords: vi.fn(() => []),
    ledgerPostingsDeleteCommit: vi.fn(),
    ledgerPostingsDelete: vi.fn(() => ({
        commit: mocks.ledgerPostingsDeleteCommit,
    })),
    ledgerPostingsPutCommit: vi.fn(),
    ledgerPostingsPut: vi.fn(() => ({
        commit: mocks.ledgerPostingsPutCommit,
    })),
    removeLedgerPostings: vi.fn(),
    plaidTransactionSyncsByTransaction: vi.fn(),
    serviceTransactionWrite: vi.fn(),
    serviceTransactionWriteGo: vi.fn(),
    transactionsPutGo: vi.fn(),
    transactionsPutCommit: vi.fn(),
    transactionsDeleteGo: vi.fn(),
    transactionsDeleteCommit: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        service: {
            transaction: {
                write: mocks.serviceTransactionWrite,
            },
        },
        entities: {
            accounts: {
                query: {
                    byAccount: mocks.accountsByAccount,
                },
            },
            budgetCategories: {
                query: {
                    byCategory: mocks.budgetCategoriesByCategory,
                },
            },
            transactions: {
                query: {
                    byTransaction: () => ({ go: mocks.byTransactionGo }),
                },
                put: () => ({
                    commit: mocks.transactionsPutCommit,
                    go: mocks.transactionsPutGo,
                }),
                delete: () => ({
                    commit: mocks.transactionsDeleteCommit,
                    go: mocks.transactionsDeleteGo,
                }),
            },
            ledgerPostings: {
                put: mocks.ledgerPostingsPut,
                delete: mocks.ledgerPostingsDelete,
            },
            plaidTransactionSyncs: {
                query: {
                    byTransaction:
                        mocks.plaidTransactionSyncsByTransaction,
                },
            },
            transactionLines: {
                put: vi.fn(),
                delete: vi.fn(),
            },
        },
    }),
}));

vi.mock("@/features/transactions/server/posting-service", () => ({
    createLedgerPostingRecords: mocks.createLedgerPostingRecords,
    listLedgerPostingsForTransaction: vi.fn(),
    removeLedgerPostings: mocks.removeLedgerPostings,
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    createTransactionLineRecords: mocks.createTransactionLineRecords,
    listTransactionLinesForTransaction: vi.fn(),
    removeTransactionLines: vi.fn(),
    toStoredTransactionLineRecord: (line: unknown) => line,
}));

vi.mock("@/features/transactions/server/transaction-side-effects", () => ({
    deleteTransactionClassificationCaches: vi.fn(),
    deleteTransactionClassificationCachesSafely: vi.fn(),
    getTransactionAuditAction: ({
        defaultAction,
    }: {
        defaultAction: string;
    }) => defaultAction,
    resolveTransactionAuditSource: () => "manual",
    syncTransactionClassificationCaches: vi.fn(),
}));

import { upsertTransactionWithinWorkspaceMutation } from "@/features/transactions/server/transaction-save-service";

describe("transaction write performance", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.accountsByAccount.mockReturnValue({
            go: async () => ({
                data: [
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        ledgerAccountId: "acct_account_1",
                    },
                ],
            }),
        });
        mocks.budgetCategoriesByCategory.mockReturnValue({
            go: async () => ({
                data: [
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "cat_groceries",
                    },
                ],
            }),
        });
        mocks.plaidTransactionSyncsByTransaction.mockReturnValue({
            go: async () => ({ data: [] }),
        });
        mocks.byTransactionGo.mockResolvedValue({ data: [] });
        mocks.removeLedgerPostings.mockResolvedValue(undefined);
        mocks.ledgerPostingsPutCommit.mockReturnValue({});
        mocks.ledgerPostingsDeleteCommit.mockReturnValue({});
        mocks.transactionsPutCommit.mockReturnValue({});
        mocks.transactionsDeleteCommit.mockReturnValue({});
        mocks.serviceTransactionWrite.mockImplementation((callback) => {
            callback({
                ledgerPostings: {
                    put: mocks.ledgerPostingsPut,
                    delete: mocks.ledgerPostingsDelete,
                },
                transactionLines: {
                    put: vi.fn(() => ({ commit: vi.fn() })),
                    delete: vi.fn(() => ({ commit: vi.fn() })),
                },
                transactions: {
                    put: vi.fn(() => ({
                        commit: mocks.transactionsPutCommit,
                    })),
                    delete: vi.fn(() => ({
                        commit: mocks.transactionsDeleteCommit,
                    })),
                },
            });

            return { go: mocks.serviceTransactionWriteGo };
        });
        mocks.serviceTransactionWriteGo.mockResolvedValue({
            canceled: false,
            data: [],
        });
        mocks.transactionsPutGo.mockResolvedValue(undefined);
        mocks.transactionsDeleteGo.mockResolvedValue(undefined);
    });

    it("keeps p95 under the 500ms write target", async () => {
        const result = await measureAsyncP95(
            () =>
                upsertTransactionWithinWorkspaceMutation("owner-1", {
                    audit: { suppress: true },
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
            {
                iterations: 30,
                warmup: 5,
            },
        );

        console.info(formatPerfResult("transaction-write", result));

        expect(result.p95Ms).toBeLessThan(500);
        expect(mocks.serviceTransactionWrite).toHaveBeenCalled();
    });
});
