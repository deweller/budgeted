// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    budgetCategoriesDeleteGo: vi.fn(),
    budgetCategoriesDelete: vi.fn(() => ({
        go: mocks.budgetCategoriesDeleteGo,
    })),
    budgetCategoriesGetGo: vi.fn(),
    budgetCategoriesGet: vi.fn(() => ({ go: mocks.budgetCategoriesGetGo })),
    budgetCategoriesUpsertGo: vi.fn(),
    budgetCategoriesUpsert: vi.fn(() => ({
        go: mocks.budgetCategoriesUpsertGo,
    })),
    categoryAllocationsByCategoryGo: vi.fn(),
    categoryAllocationsByCategory: vi.fn(() => ({
        go: mocks.categoryAllocationsByCategoryGo,
    })),
    categoryAllocationsDeleteGo: vi.fn(),
    categoryAllocationsDelete: vi.fn(() => ({
        go: mocks.categoryAllocationsDeleteGo,
    })),
    categoryAllocationsUpsertGo: vi.fn(),
    categoryAllocationsUpsert: vi.fn(() => ({
        go: mocks.categoryAllocationsUpsertGo,
    })),
    listLedgerPostingsForTransaction: vi.fn(),
    listStoredTransactionsByIds: vi.fn(
        async (_ledgerId: string, transactionIds: Iterable<string>) => {
            const ids = new Set(transactionIds);
            const result = await mocks.transactionsByTransactionGo();

            return (result.data as Array<{ transactionId: string }>).filter(
                (transaction) => ids.has(transaction.transactionId),
            );
        },
    ),
    listTransactionLinesForCategory: vi.fn(),
    listTransactionLinesForTransaction: vi.fn(),
    replaceLedgerPostings: vi.fn(),
    replaceTransactionLines: vi.fn(),
    syncAffectedBudgetPeriodActivity: vi.fn(),
    syncAffectedBudgetPeriods: vi.fn(),
    syncBudgetPeriodActivity: vi.fn(),
    transactionsByCategoryGo: vi.fn(),
    transactionsByCategory: vi.fn(() => ({
        go: mocks.transactionsByCategoryGo,
    })),
    transactionsByTransactionGo: vi.fn(),
    transactionsByTransaction: vi.fn(() => ({
        go: mocks.transactionsByTransactionGo,
    })),
    transactionsPutGo: vi.fn(),
    transactionsPut: vi.fn(() => ({ go: mocks.transactionsPutGo })),
    upsertTransaction: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            budgetCategories: {
                get: mocks.budgetCategoriesGet,
                delete: mocks.budgetCategoriesDelete,
                upsert: mocks.budgetCategoriesUpsert,
                query: {
                    byStatus: vi.fn(() => ({
                        go: vi.fn().mockResolvedValue({ data: [] }),
                    })),
                },
            },
            categoryAllocations: {
                query: {
                    byCategory: mocks.categoryAllocationsByCategory,
                },
                delete: mocks.categoryAllocationsDelete,
                upsert: mocks.categoryAllocationsUpsert,
            },
            transactions: {
                query: {
                    byCategory: mocks.transactionsByCategory,
                    byTransaction: mocks.transactionsByTransaction,
                },
                put: mocks.transactionsPut,
            },
        },
    }),
}));

vi.mock("@/features/transactions/server/posting-service", () => ({
    listLedgerPostingsForTransaction: mocks.listLedgerPostingsForTransaction,
    replaceLedgerPostings: mocks.replaceLedgerPostings,
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    listTransactionLinesForCategory: mocks.listTransactionLinesForCategory,
    listTransactionLinesForTransaction:
        mocks.listTransactionLinesForTransaction,
    replaceTransactionLines: mocks.replaceTransactionLines,
    toTransactionLineInputs: (lines: unknown[]) => lines,
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    listStoredTransactionsByIds: mocks.listStoredTransactionsByIds,
}));

vi.mock("@/features/transactions/server/transaction-save-service", () => ({
    upsertTransactionWithinWorkspaceMutation: mocks.upsertTransaction,
}));

vi.mock("@/features/shared/server/post-delete-consistency-service", () => ({
    syncAffectedBudgetPeriods: mocks.syncAffectedBudgetPeriods,
}));

vi.mock("@/features/budget/server/activity-sync-service", () => ({
    syncAffectedBudgetPeriodActivity:
        mocks.syncAffectedBudgetPeriodActivity,
    syncBudgetPeriodActivity: mocks.syncBudgetPeriodActivity,
}));

import {
    deleteBudgetCategory,
    getBudgetCategoryDeletionImpact,
} from "@/features/budget/server/category-service";

describe("category deletion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.budgetCategoriesGetGo.mockResolvedValue({
            data: {
                categoryId: "category-1",
                userId: "owner-1",
                name: "Groceries",
                groupId: "essentials",
                ledgerAccountId: "cat_groceries",
                status: "active",
                sortOrder: 0,
                createdAt: "2026-05-01T00:00:00.000Z",
                updatedAt: "2026-05-25T12:00:00.000Z",
            },
        });
        mocks.categoryAllocationsByCategoryGo.mockResolvedValue({
            data: [
                {
                    allocationId: "2026-05:category-1",
                    userId: "owner-1",
                    periodId: "2026-05",
                    categoryId: "category-1",
                    assignedCents: 20000,
                    carriedForwardCents: 0,
                    activityCents: -6500,
                    availableCents: 13500,
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
            ],
        });
        mocks.transactionsByCategoryGo.mockResolvedValue({
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
        mocks.transactionsByTransactionGo.mockResolvedValue({ data: [] });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([
            {
                postingId: "posting-1",
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
            {
                postingId: "posting-2",
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
        ]);
        mocks.listTransactionLinesForCategory.mockResolvedValue([]);
        mocks.listTransactionLinesForTransaction.mockResolvedValue([
            {
                lineId: "line-1",
                transactionId: "transaction-1",
                userId: "owner-1",
                amountCents: 6500,
                categoryId: "category-1",
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: "2026-05-18T12:00:00.000Z",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
        ]);
        mocks.transactionsPutGo.mockResolvedValue(undefined);
        mocks.upsertTransaction.mockResolvedValue({});
        mocks.replaceLedgerPostings.mockResolvedValue(undefined);
        mocks.replaceTransactionLines.mockResolvedValue(undefined);
        mocks.categoryAllocationsDeleteGo.mockResolvedValue(undefined);
        mocks.budgetCategoriesDeleteGo.mockResolvedValue(undefined);
        mocks.categoryAllocationsUpsertGo.mockResolvedValue(undefined);
        mocks.budgetCategoriesUpsertGo.mockResolvedValue(undefined);
        mocks.syncAffectedBudgetPeriodActivity.mockResolvedValue(["2026-05"]);
    });

    it("builds a preview that separates removed history from preserved transactions", async () => {
        await expect(
            getBudgetCategoryDeletionImpact("owner-1", "category-1"),
        ).resolves.toMatchObject({
            target: {
                targetType: "category",
                targetId: "category-1",
                displayName: "Groceries",
            },
            dependentCounts: [
                { label: "Category ledger postings", count: 2 },
                { label: "Category allocations", count: 1 },
                { label: "Transaction lines recategorized", count: 1 },
            ],
            preservedRecords: [
                {
                    label: "Transactions kept as uncategorized activity",
                    count: 1,
                },
            ],
            affectedPeriods: ["2026-05"],
        });
    });

    it("deletes category history while preserving transactions as uncategorized activity", async () => {
        const preview = await getBudgetCategoryDeletionImpact(
            "owner-1",
            "category-1",
        );

        await expect(
            deleteBudgetCategory(
                "owner-1",
                "category-1",
                preview.previewRevision,
            ),
        ).resolves.toMatchObject({
            target: {
                targetId: "category-1",
            },
        });

        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            "owner-1",
            expect.objectContaining({
                accountId: "account-1",
                lines: [
                    expect.objectContaining({
                        lineId: "line-1",
                        categoryId: undefined,
                    }),
                ],
                transactionId: "transaction-1",
            }),
        );
        expect(mocks.categoryAllocationsDelete).toHaveBeenCalledTimes(1);
        expect(mocks.budgetCategoriesDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            categoryId: "category-1",
        });
        expect(mocks.syncAffectedBudgetPeriodActivity).toHaveBeenCalledTimes(1);
    });

    it("converts affected transaction lines to uncategorized without changing the parent category reference", async () => {
        mocks.transactionsByCategoryGo.mockResolvedValue({ data: [] });
        mocks.listTransactionLinesForCategory.mockResolvedValue([
            {
                lineId: "line-1",
                transactionId: "split-1",
                userId: "owner-1",
                amountCents: 4_000,
                categoryId: "category-1",
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: "2026-05-18T12:00:00.000Z",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
        ]);
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "split-1",
                    userId: "owner-1",
                    occurredAt: "2026-05-18T12:00:00.000Z",
                    enteredAt: "2026-05-18T12:00:00.000Z",
                    kind: "standard",
                    payee: "Store",
                    referenceAccountId: "account-1",
                    displayAmountCents: -6_000,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
            ],
        });
        mocks.listTransactionLinesForTransaction.mockResolvedValue([
            {
                lineId: "line-1",
                transactionId: "split-1",
                userId: "owner-1",
                amountCents: 4_000,
                categoryId: "category-1",
                fromAccountId: "account-1",
                sortOrder: 0,
                createdAt: "2026-05-18T12:00:00.000Z",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
            {
                lineId: "line-2",
                transactionId: "split-1",
                userId: "owner-1",
                amountCents: 2_000,
                categoryId: "category-2",
                fromAccountId: "account-1",
                sortOrder: 1,
                createdAt: "2026-05-18T12:00:00.000Z",
                updatedAt: "2026-05-18T12:00:00.000Z",
            },
        ]);

        const preview = await getBudgetCategoryDeletionImpact(
            "owner-1",
            "category-1",
        );

        await deleteBudgetCategory(
            "owner-1",
            "category-1",
            preview.previewRevision,
        );

        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            "owner-1",
            expect.objectContaining({
                lines: [
                    expect.objectContaining({
                        lineId: "line-1",
                        categoryId: undefined,
                    }),
                    expect.objectContaining({
                        lineId: "line-2",
                        categoryId: "category-2",
                    }),
                ],
                transactionId: "split-1",
            }),
        );
    });

    it("rejects stale category delete confirmations", async () => {
        await expect(
            deleteBudgetCategory("owner-1", "category-1", "stale-preview"),
        ).rejects.toThrow(/stale/i);

        expect(mocks.transactionsPut).not.toHaveBeenCalled();
        expect(mocks.budgetCategoriesDelete).not.toHaveBeenCalled();
    });

    it("rejects deletion of system-managed categories", async () => {
        mocks.budgetCategoriesGetGo.mockResolvedValue({
            data: {
                categoryId: "starting-balances",
                userId: "owner-1",
                name: "Starting Balances",
                groupId: "income",
                systemCategoryKey: "startingBalances",
                ledgerAccountId: "cat_starting-balances",
                status: "active",
                sortOrder: 1,
                createdAt: "2026-05-01T00:00:00.000Z",
                updatedAt: "2026-05-25T12:00:00.000Z",
            },
        });

        await expect(
            deleteBudgetCategory("owner-1", "starting-balances", "any-preview"),
        ).rejects.toThrow(/system-managed/i);

        expect(mocks.budgetCategoriesDelete).not.toHaveBeenCalled();
    });
});
