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
import { syncBudgetPeriodActivity } from "@/features/budget/server/activity-sync-service";

describe("budget plan initialization flow", () => {
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
                periodId: "2026-07",
                startsOn: "2026-07-01",
                endsOn: "2026-07-31",
                currency: "USD",
                availableToBudgetCents: 0,
                status: "open",
                carryForwardFromPeriodId: "2026-06",
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
        });
        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "groceries",
                userId: "owner-1",
                name: "Groceries",
                groupId: "living",
                defaultAssignedCents: 4_500,
                isIncomeCategory: false,
                ledgerAccountId: "cat_groceries",
                status: "active",
                sortOrder: 1,
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
        ]);
        mocks.listAccounts.mockResolvedValue([
            {
                accountId: "checking",
                accountType: "checking",
                balanceCents: 10_000,
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

    it("derives untouched month rows without auto-assigning category dollars on read", async () => {
        mocks.categoryAllocationsByAllocationGo.mockResolvedValueOnce({
            data: [
                {
                    periodId: "2026-06",
                },
            ],
        });
        mocks.categoryAllocationsByPeriodGo
            .mockResolvedValueOnce({
                data: [
                    {
                        allocationId: "2026-06:groceries",
                        userId: "owner-1",
                        periodId: "2026-06",
                        categoryId: "groceries",
                        assignedCents: 2_000,
                        carriedForwardCents: 500,
                        activityCents: -250,
                        availableCents: 2_250,
                        updatedAt: "2026-06-15T00:00:00.000Z",
                    },
                ],
            })
            .mockResolvedValueOnce({ data: [] });

        const summary = await buildBudgetPeriodSummary("owner-1", "2026-07");

        expect(summary.periodId).toBe("2026-07");
        expect(summary.hasSavedAssignments).toBe(false);
        expect(summary.categories).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                assignedCents: 0,
                carriedForwardCents: 2_000,
                activityCents: 0,
                defaultAssignedCents: 4_500,
                availableCents: 2_000,
            }),
        ]);
        expect(summary.assignedAllocationTotalCents).toBe(0);
        expect(summary.allocationDifferenceCents).toBe(0);
        expect(summary.availableToBudgetCents).toBe(0);
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
    });

    it("does not create or repair budget period records while reading summaries", async () => {
        mocks.budgetPeriodsGetGo.mockResolvedValueOnce({ data: null });
        mocks.categoryAllocationsByAllocationGo.mockResolvedValueOnce({
            data: [],
        });
        mocks.categoryAllocationsByPeriodGo.mockResolvedValueOnce({
            data: [],
        });

        const summary = await buildBudgetPeriodSummary("owner-1", "2026-07");

        expect(summary.periodId).toBe("2026-07");
        expect(summary.status).toBe("open");
        expect(summary.availableToBudgetCents).toBe(0);
        expect(mocks.budgetPeriodsPut).not.toHaveBeenCalled();
        expect(mocks.budgetPeriodsUpsert).not.toHaveBeenCalled();
    });

    it("includes current-period activity for unsaved derived month allocations", async () => {
        mocks.categoryAllocationsByPeriodGo
            .mockResolvedValueOnce({ data: [] })
            .mockResolvedValueOnce({ data: [] });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "grocery-activity",
                    periodId: "2026-07",
                    kind: "standard",
                    status: "entered",
                },
            ],
        });
        mocks.transactionLinesByLineGo.mockResolvedValue({
            data: [
                {
                    lineId: "grocery-activity-line",
                    transactionId: "grocery-activity",
                    categoryId: "groceries",
                    fromAccountId: "checking",
                    amountCents: 1_250,
                },
            ],
        });

        const summary = await buildBudgetPeriodSummary("owner-1", "2026-07");

        expect(summary.hasSavedAssignments).toBe(false);
        expect(summary.categories).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                assignedCents: 0,
                activityCents: -1_250,
                defaultAssignedCents: 4_500,
                availableCents: -1_250,
            }),
        ]);
        expect(
            mocks.categoryAllocationsByPeriodGo.mock.calls.every(
                ([options]) =>
                    options?.pages === "all" &&
                    !("consistent" in options),
            ),
        ).toBe(true);
    });

    it("carries prior computed availability into future saved months", async () => {
        mocks.listAccounts.mockResolvedValue([
            {
                accountId: "checking",
                accountType: "checking",
                balanceCents: 7_500,
                openedOn: "2026-01-01",
                status: "active",
            },
        ]);
        mocks.categoryAllocationsByAllocationGo.mockResolvedValueOnce({
            data: [
                {
                    periodId: "2026-07",
                },
                {
                    periodId: "2026-08",
                },
            ],
        });
        mocks.categoryAllocationsByPeriodGo
            .mockResolvedValueOnce({
                data: [
                    {
                        allocationId: "2026-07:groceries",
                        userId: "owner-1",
                        periodId: "2026-07",
                        categoryId: "groceries",
                        assignedCents: 10_000,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 10_000,
                        updatedAt: "2026-07-10T00:00:00.000Z",
                    },
                ],
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        allocationId: "2026-08:groceries",
                        userId: "owner-1",
                        periodId: "2026-08",
                        categoryId: "groceries",
                        assignedCents: 0,
                        carriedForwardCents: 10_000,
                        activityCents: 0,
                        availableCents: 10_000,
                        updatedAt: "2026-08-10T00:00:00.000Z",
                    },
                ],
            });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "july-groceries",
                    periodId: "2026-07",
                    kind: "standard",
                    status: "entered",
                },
            ],
        });
        mocks.transactionLinesByLineGo.mockResolvedValue({
            data: [
                {
                    lineId: "july-groceries-line",
                    transactionId: "july-groceries",
                    categoryId: "groceries",
                    fromAccountId: "checking",
                    amountCents: 2_500,
                },
            ],
        });

        const summary = await buildBudgetPeriodSummary("owner-1", "2026-08");

        expect(summary.hasSavedAssignments).toBe(true);
        expect(summary.availableToBudgetCents).toBe(0);
        expect(summary.categories).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                assignedCents: 0,
                carriedForwardCents: 7_500,
                activityCents: 0,
                availableCents: 7_500,
            }),
        ]);
    });

    it("shows previous category availability as category carry forward", async () => {
        mocks.categoryAllocationsByAllocationGo.mockResolvedValueOnce({
            data: [
                {
                    periodId: "2026-07",
                },
            ],
        });
        mocks.categoryAllocationsByPeriodGo
            .mockResolvedValueOnce({
                data: [
                    {
                        allocationId: "2026-07:groceries",
                        userId: "owner-1",
                        periodId: "2026-07",
                        categoryId: "groceries",
                        assignedCents: 5_000,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 5_000,
                        updatedAt: "2026-07-10T00:00:00.000Z",
                    },
                ],
            })
            .mockResolvedValueOnce({ data: [] });

        const summary = await buildBudgetPeriodSummary("owner-1", "2026-08");

        expect(summary.categories).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                carriedForwardCents: 5_000,
                availableCents: 5_000,
            }),
        ]);
        expect(summary.availableToBudgetCents).toBe(0);
    });

    it("keeps categorized inflows out of Unassigned when the saved month is missing an allocation row", async () => {
        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "groceries",
                userId: "owner-1",
                name: "Groceries",
                groupId: "living",
                defaultAssignedCents: 4_500,
                isIncomeCategory: false,
                ledgerAccountId: "cat_groceries",
                status: "active",
                sortOrder: 1,
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
            {
                categoryId: "paycheck",
                userId: "owner-1",
                name: "Paycheck",
                groupId: "income",
                defaultAssignedCents: 0,
                isIncomeCategory: false,
                ledgerAccountId: "cat_paycheck",
                status: "active",
                sortOrder: 2,
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
        ]);
        mocks.listAccounts.mockResolvedValue([
            {
                accountId: "checking",
                accountType: "checking",
                balanceCents: 14_500,
                openedOn: "2026-01-01",
                status: "active",
            },
        ]);
        mocks.categoryAllocationsByPeriodGo
            .mockResolvedValueOnce({
                data: [
                    {
                        allocationId: "2026-07:groceries",
                        userId: "owner-1",
                        periodId: "2026-07",
                        categoryId: "groceries",
                        assignedCents: 10_000,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 10_000,
                        updatedAt: "2026-07-10T00:00:00.000Z",
                    },
                ],
            })
            .mockResolvedValueOnce({ data: [] });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "paycheck-activity",
                    periodId: "2026-07",
                    kind: "standard",
                    status: "entered",
                },
            ],
        });
        mocks.transactionLinesByLineGo.mockResolvedValue({
            data: [
                {
                    lineId: "paycheck-activity-line",
                    transactionId: "paycheck-activity",
                    categoryId: "paycheck",
                    toAccountId: "checking",
                    amountCents: 4_500,
                },
            ],
        });

        const summary = await buildBudgetPeriodSummary("owner-1", "2026-07");

        expect(summary.hasSavedAssignments).toBe(true);
        expect(summary.availableToBudgetCents).toBe(-10_000);
        expect(summary.categories).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                assignedCents: 10_000,
                activityCents: 0,
                availableCents: 10_000,
            }),
            expect.objectContaining({
                categoryId: "paycheck",
                assignedCents: 0,
                activityCents: 4_500,
                availableCents: 4_500,
            }),
        ]);
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
    });

    it("persists missing saved-month category rows when syncing categorized inflow activity", async () => {
        const groceriesAllocation = {
            allocationId: "2026-07:groceries",
            userId: "owner-1",
            periodId: "2026-07",
            categoryId: "groceries",
            assignedCents: 10_000,
            carriedForwardCents: 0,
            activityCents: 0,
            availableCents: 10_000,
            updatedAt: "2026-07-10T00:00:00.000Z",
        };
        const paycheckAllocation = {
            allocationId: "2026-07:paycheck",
            userId: "owner-1",
            periodId: "2026-07",
            categoryId: "paycheck",
            assignedCents: 0,
            carriedForwardCents: 0,
            activityCents: 4_500,
            availableCents: 4_500,
            updatedAt: "2026-07-10T00:00:00.000Z",
        };

        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "groceries",
                userId: "owner-1",
                name: "Groceries",
                groupId: "living",
                defaultAssignedCents: 4_500,
                isIncomeCategory: false,
                ledgerAccountId: "cat_groceries",
                status: "active",
                sortOrder: 1,
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
            {
                categoryId: "paycheck",
                userId: "owner-1",
                name: "Paycheck",
                groupId: "income",
                defaultAssignedCents: 0,
                isIncomeCategory: false,
                ledgerAccountId: "cat_paycheck",
                status: "active",
                sortOrder: 2,
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
        ]);
        mocks.listAccounts.mockResolvedValue([
            {
                accountId: "checking",
                accountType: "checking",
                balanceCents: 14_500,
                openedOn: "2026-01-01",
                status: "active",
            },
        ]);
        mocks.categoryAllocationsByPeriodGo
            .mockResolvedValueOnce({ data: [groceriesAllocation] })
            .mockResolvedValueOnce({ data: [groceriesAllocation] })
            .mockResolvedValueOnce({
                data: [groceriesAllocation, paycheckAllocation],
            });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "paycheck-activity",
                    periodId: "2026-07",
                    kind: "standard",
                    status: "entered",
                },
            ],
        });
        mocks.transactionLinesByLineGo.mockResolvedValue({
            data: [
                {
                    lineId: "paycheck-activity-line",
                    transactionId: "paycheck-activity",
                    categoryId: "paycheck",
                    toAccountId: "checking",
                    amountCents: 4_500,
                },
            ],
        });

        const summary = await syncBudgetPeriodActivity("owner-1", "2026-07");

        expect(summary.availableToBudgetCents).toBe(-10_000);
        expect(summary.categories).toContainEqual(
            expect.objectContaining({
                categoryId: "paycheck",
                activityCents: 4_500,
                availableCents: 4_500,
            }),
        );
        expect(mocks.categoryAllocationsUpsert).not.toHaveBeenCalled();
    });
});
