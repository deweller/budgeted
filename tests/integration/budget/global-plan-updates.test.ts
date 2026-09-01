// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    accountsByAccountGo: vi.fn(),
    accountsByAccount: vi.fn(() => ({
        go: mocks.accountsByAccountGo,
    })),
    budgetPeriodsGetGo: vi.fn(),
    budgetPeriodsGet: vi.fn(() => ({ go: mocks.budgetPeriodsGetGo })),
    budgetPeriodsPutGo: vi.fn(),
    budgetPeriodsPut: vi.fn(() => ({ go: mocks.budgetPeriodsPutGo })),
    budgetPeriodsUpsertGo: vi.fn(),
    budgetPeriodsUpsert: vi.fn(() => ({ go: mocks.budgetPeriodsUpsertGo })),
    categoryAllocationsByAllocationGo: vi.fn(),
    categoryAllocationsByAllocation: vi.fn(() => ({
        go: mocks.categoryAllocationsByAllocationGo,
    })),
    categoryAllocationsByPeriodGo: vi.fn(),
    categoryAllocationsByPeriod: vi.fn(() => ({
        go: mocks.categoryAllocationsByPeriodGo,
    })),
    categoryAllocationsUpsertGo: vi.fn(),
    categoryAllocationsUpsert: vi.fn(() => ({
        go: mocks.categoryAllocationsUpsertGo,
    })),
    ledgerPostingsByPeriodGo: vi.fn(),
    ledgerPostingsByPeriod: vi.fn(() => ({
        go: mocks.ledgerPostingsByPeriodGo,
    })),
    listAccounts: vi.fn(),
    listBudgetCategories: vi.fn(),
    transactionsByTransactionGo: vi.fn(),
    transactionsByTransaction: vi.fn(() => ({
        go: mocks.transactionsByTransactionGo,
    })),
    transactionLinesByLineGo: vi.fn(),
    transactionLinesByLine: vi.fn(() => ({
        go: mocks.transactionLinesByLineGo,
    })),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: {
                query: {
                    byAccount: mocks.accountsByAccount,
                },
            },
            budgetPeriods: {
                get: mocks.budgetPeriodsGet,
                put: mocks.budgetPeriodsPut,
                upsert: mocks.budgetPeriodsUpsert,
            },
            categoryAllocations: {
                query: {
                    byAllocation: mocks.categoryAllocationsByAllocation,
                    byPeriod: mocks.categoryAllocationsByPeriod,
                },
                upsert: mocks.categoryAllocationsUpsert,
            },
            ledgerPostings: {
                query: {
                    byPeriod: mocks.ledgerPostingsByPeriod,
                },
            },
            transactions: {
                query: {
                    byTransaction: mocks.transactionsByTransaction,
                },
            },
            transactionLines: {
                query: {
                    byLine: mocks.transactionLinesByLine,
                },
            },
        },
    }),
}));

vi.mock("@/features/accounts/server/account-service", () => ({
    listAccounts: mocks.listAccounts,
}));

vi.mock("@/features/budget/server/category-service", () => ({
    isUserVisibleBudgetCategory: (category: { systemCategoryKey?: string }) =>
        category.systemCategoryKey !== "startingBalances",
    listBudgetCategories: mocks.listBudgetCategories,
}));

import { buildBudgetPeriodSummary } from "@/features/budget/server/budget-period-service";

describe("budget plan updates flow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.budgetPeriodsGetGo.mockReset();
        mocks.budgetPeriodsPutGo.mockReset();
        mocks.budgetPeriodsUpsertGo.mockReset();
        mocks.categoryAllocationsByAllocationGo.mockReset();
        mocks.categoryAllocationsByPeriodGo.mockReset();
        mocks.categoryAllocationsUpsertGo.mockReset();
        mocks.ledgerPostingsByPeriodGo.mockReset();
        mocks.accountsByAccountGo.mockReset();
        mocks.transactionsByTransactionGo.mockReset();
        mocks.transactionLinesByLineGo.mockReset();
        mocks.budgetPeriodsGetGo.mockResolvedValue({
            data: {
                userId: "owner-1",
                periodId: "2026-08",
                startsOn: "2026-08-01",
                endsOn: "2026-08-31",
                currency: "USD",
                availableToBudgetCents: 0,
                status: "open",
                carryForwardFromPeriodId: "2026-07",
                createdAt: "2026-07-01T00:00:00.000Z",
                updatedAt: "2026-07-01T00:00:00.000Z",
            },
        });
        mocks.listAccounts.mockResolvedValue([
            {
                accountId: "checking",
                accountType: "checking",
                balanceCents: 12_000,
                openedOn: "2026-01-01",
                status: "active",
            },
        ]);
        mocks.accountsByAccountGo.mockResolvedValue({
            data: [
                {
                    accountId: "checking",
                    accountType: "checking",
                },
                {
                    accountId: "account-1",
                    accountType: "checking",
                },
            ],
        });
        mocks.categoryAllocationsByAllocationGo.mockResolvedValue({
            data: [],
        });
        mocks.ledgerPostingsByPeriodGo.mockResolvedValue({ data: [] });
        mocks.transactionsByTransactionGo.mockResolvedValue({ data: [] });
        mocks.transactionLinesByLineGo.mockResolvedValue({ data: [] });
    });

    it("keeps saved month allocations unchanged after the budget plan changes", async () => {
        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "groceries",
                userId: "owner-1",
                name: "Groceries",
                groupId: "living",
                defaultAssignedCents: 9_900,
                isIncomeCategory: false,
                ledgerAccountId: "cat_groceries",
                status: "active",
                sortOrder: 1,
                createdAt: "2026-07-01T00:00:00.000Z",
                updatedAt: "2026-07-01T00:00:00.000Z",
            },
        ]);
        mocks.categoryAllocationsByPeriodGo.mockResolvedValueOnce({
            data: [
                {
                    allocationId: "2026-08:groceries",
                    userId: "owner-1",
                    periodId: "2026-08",
                    categoryId: "groceries",
                    assignedCents: 2_000,
                    carriedForwardCents: 100,
                    activityCents: 0,
                    availableCents: 2_100,
                    updatedAt: "2026-08-10T00:00:00.000Z",
                },
            ],
        });
        const summary = await buildBudgetPeriodSummary("owner-1", "2026-08");

        expect(summary.hasSavedAssignments).toBe(true);
        expect(summary.categories).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                assignedCents: 2_000,
                defaultAssignedCents: 9_900,
                carriedForwardCents: 0,
                availableCents: 2_000,
            }),
        ]);
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
    });

    it("renders archived categories for historical saved months", async () => {
        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "archived-category",
                userId: "owner-1",
                name: "Old Travel",
                groupId: "trips",
                defaultAssignedCents: 0,
                isIncomeCategory: false,
                ledgerAccountId: "cat_archived",
                status: "archived",
                sortOrder: 5,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-09-01T00:00:00.000Z",
            },
        ]);
        mocks.categoryAllocationsByPeriodGo.mockResolvedValueOnce({
            data: [
                {
                    allocationId: "2026-08:archived-category",
                    userId: "owner-1",
                    periodId: "2026-08",
                    categoryId: "archived-category",
                    assignedCents: 4_000,
                    carriedForwardCents: 500,
                    activityCents: -250,
                    availableCents: 4_250,
                    updatedAt: "2026-08-10T00:00:00.000Z",
                },
            ],
        });
        const summary = await buildBudgetPeriodSummary("owner-1", "2026-08");

        expect(summary.hasSavedAssignments).toBe(true);
        expect(summary.categories).toEqual([
            expect.objectContaining({
                categoryId: "archived-category",
                name: "Old Travel",
                assignedCents: 4_000,
                carriedForwardCents: 0,
                activityCents: 0,
                availableCents: 4_000,
            }),
        ]);
    });
});
