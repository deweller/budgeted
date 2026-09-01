// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatPerfResult, measureAsyncP95 } from "./benchmark";

const currentPeriodId = "2026-05";
const previousPeriodId = "2026-04";

const categories = Array.from({ length: 24 }, (_, index) => ({
    categoryId: `category-${index + 1}`,
    ledgerAccountId: `cat_${index + 1}`,
    name: `Category ${index + 1}`,
    status: "active" as const,
}));

const currentAllocations = categories.map((category, index) => ({
    allocationId: `${currentPeriodId}:${category.categoryId}`,
    categoryId: category.categoryId,
    assignedCents: 8_000 + index * 100,
    carriedForwardCents: index % 5 === 0 ? -500 : 1_000,
    activityCents: -2_500,
    availableCents: 5_000 + index * 50,
}));

const previousAllocations = categories.map((category) => ({
    allocationId: `${previousPeriodId}:${category.categoryId}`,
    categoryId: category.categoryId,
    assignedCents: 0,
    carriedForwardCents: 1_000,
    activityCents: 0,
    availableCents: 1_000,
}));

const activeAccounts = Array.from({ length: 8 }, (_, index) => ({
    accountId: `account-${index + 1}`,
    balanceCents: 25_000,
    status: "active" as const,
}));

const totalFunds = activeAccounts.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
);
const totalReserved = currentAllocations.reduce(
    (sum, allocation) => sum + allocation.availableCents,
    0,
);

const mocks = vi.hoisted(() => ({
    accountsByAccount: vi.fn(),
    budgetPeriodGetGo: vi.fn(),
    budgetPeriodUpsertGo: vi.fn(),
    categoryAllocationsByAllocation: vi.fn(),
    categoryAllocationsByPeriod: vi.fn(),
    ledgerPostingsByPeriod: vi.fn(),
    listAccounts: vi.fn(),
    listBudgetCategories: vi.fn(),
    transactionLinesByLine: vi.fn(),
    transactionsByTransaction: vi.fn(),
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
                get: () => ({ go: mocks.budgetPeriodGetGo }),
                upsert: () => ({ go: mocks.budgetPeriodUpsertGo }),
            },
            categoryAllocations: {
                query: {
                    byAllocation: mocks.categoryAllocationsByAllocation,
                    byPeriod: mocks.categoryAllocationsByPeriod,
                },
            },
            ledgerPostings: {
                query: {
                    byPeriod: mocks.ledgerPostingsByPeriod,
                },
            },
            transactionLines: {
                query: {
                    byLine: mocks.transactionLinesByLine,
                },
            },
            transactions: {
                query: {
                    byTransaction: mocks.transactionsByTransaction,
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

describe("budget summary performance", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.listAccounts.mockResolvedValue(activeAccounts);
        mocks.listBudgetCategories.mockResolvedValue(categories);
        mocks.accountsByAccount.mockReturnValue({
            go: async () => ({ data: activeAccounts }),
        });
        mocks.budgetPeriodGetGo.mockResolvedValue({
            data: {
                periodId: currentPeriodId,
                status: "open",
                availableToBudgetCents: totalFunds - totalReserved,
            },
        });
        mocks.budgetPeriodUpsertGo.mockResolvedValue({});
        mocks.categoryAllocationsByAllocation.mockReturnValue({
            go: async () => ({
                data: [...previousAllocations, ...currentAllocations],
            }),
        });
        mocks.categoryAllocationsByPeriod.mockImplementation(
            ({ periodId }: { periodId: string }) => ({
                go: async () => ({
                    data:
                        periodId === currentPeriodId
                            ? currentAllocations
                            : previousAllocations,
                }),
            }),
        );
        mocks.ledgerPostingsByPeriod.mockReturnValue({
            go: async () => ({ data: [] }),
        });
        mocks.transactionsByTransaction.mockReturnValue({
            go: async () => ({ data: [] }),
        });
        mocks.transactionLinesByLine.mockReturnValue({
            go: async () => ({ data: [] }),
        });
    });

    it("keeps p95 under the 300ms summary target", async () => {
        const result = await measureAsyncP95(
            () => buildBudgetPeriodSummary("owner-1", currentPeriodId),
            {
                iterations: 30,
                warmup: 5,
            },
        );

        console.info(formatPerfResult("budget-summary", result));

        expect(result.p95Ms).toBeLessThan(300);
    });
});
