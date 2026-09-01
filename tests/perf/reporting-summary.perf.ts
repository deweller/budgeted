// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatPerfResult, measureAsyncP95 } from "./benchmark";

const periodIds = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `2025-${month}`;
});

const accounts = Array.from({ length: 6 }, (_, index) => ({
    accountId: `account-${index + 1}`,
    balanceCents: 15_000 + index * 2_000,
    status: "active" as const,
}));

const categories = Array.from({ length: 18 }, (_, index) => ({
    categoryId: `category-${index + 1}`,
    ledgerAccountId: `cat_${index + 1}`,
    name: `Category ${index + 1}`,
}));

const carryForwardByPeriod = new Map(
    periodIds.map((periodId, periodIndex) => [
        periodId,
        categories.map((category, categoryIndex) => ({
            categoryId: category.categoryId,
            availableCents: 4_000 + categoryIndex * 25,
            carriedForwardCents:
                periodIndex % 4 === 0 && categoryIndex % 6 === 0 ? -500 : 750,
        })),
    ]),
);

const transactions = periodIds.flatMap((periodId, periodIndex) =>
    Array.from({ length: 20 }, (_, index) => {
        const category = categories[(periodIndex + index) % categories.length];

        return {
            transactionId: `${periodId}-tx-${index + 1}`,
            periodId,
            status: "entered" as const,
            type: index % 5 === 0 ? ("inflow" as const) : ("outflow" as const),
            referenceCategoryId: category.categoryId,
            displayAmountCents: index % 5 === 0 ? 9_500 : -2_500,
            postings: [
                {
                    ledgerAccountId: category.ledgerAccountId,
                    ledgerAccountKind: "category" as const,
                    direction: "debit" as const,
                    amountCents: 2_500,
                },
                {
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial" as const,
                    direction:
                        index % 5 === 0
                            ? ("debit" as const)
                            : ("credit" as const),
                    amountCents: index % 5 === 0 ? 9_500 : 2_500,
                },
            ],
        };
    }),
);

const mocks = vi.hoisted(() => ({
    accountsByAccount: vi.fn(),
    budgetPeriodGet: vi.fn(),
    budgetPeriodUpsert: vi.fn(),
    budgetPeriodUpsertGo: vi.fn(),
    categoryAllocationsByAllocation: vi.fn(),
    categoryAllocationsByPeriod: vi.fn(),
    ledgerPostingsByPeriod: vi.fn(),
    listAccounts: vi.fn(),
    listBudgetCategories: vi.fn(),
    listTransactionsWithPostings: vi.fn(),
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
                get: mocks.budgetPeriodGet,
                upsert: mocks.budgetPeriodUpsert,
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

vi.mock(
    "@/features/transactions/server/transaction-query-service",
    () => ({
        listTransactionsWithPostings:
            mocks.listTransactionsWithPostings,
    }),
);

import { buildReportingView } from "@/features/reporting/server/reporting-service";

describe("reporting summary performance", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mocks.listAccounts.mockResolvedValue(accounts);
        mocks.listBudgetCategories.mockResolvedValue(categories);
        mocks.listTransactionsWithPostings.mockResolvedValue(transactions);
        mocks.accountsByAccount.mockReturnValue({
            go: async () => ({ data: accounts }),
        });
        mocks.budgetPeriodUpsert.mockReturnValue({
            go: mocks.budgetPeriodUpsertGo,
        });
        mocks.budgetPeriodUpsertGo.mockResolvedValue({});
        mocks.categoryAllocationsByAllocation.mockReturnValue({
            go: async () => ({
                data: Array.from(carryForwardByPeriod.entries()).flatMap(
                    ([periodId, allocations]) =>
                        allocations.map((allocation) => ({
                            ...allocation,
                            periodId,
                        })),
                ),
            }),
        });
        mocks.budgetPeriodGet.mockImplementation(
            ({ periodId }: { periodId: string }) => ({
                go: async () => ({
                    data: {
                        periodId,
                        availableToBudgetCents:
                            periodId.endsWith("03") || periodId.endsWith("09")
                                ? -1_500
                                : 12_000,
                    },
                }),
            }),
        );
        mocks.categoryAllocationsByPeriod.mockImplementation(
            ({ periodId }: { periodId: string }) => ({
                go: async () => ({
                    data: carryForwardByPeriod.get(periodId) ?? [],
                }),
            }),
        );
        mocks.ledgerPostingsByPeriod.mockImplementation(
            ({ periodId }: { periodId: string }) => ({
                go: async () => ({
                    data: transactions
                        .filter((transaction) => transaction.periodId === periodId)
                        .flatMap((transaction) => transaction.postings),
                }),
            }),
        );
        mocks.transactionsByTransaction.mockReturnValue({
            go: async () => ({ data: transactions }),
        });
        mocks.transactionLinesByLine.mockReturnValue({
            go: async () => ({ data: [] }),
        });
    });

    it("keeps p95 under the 2000ms reporting target", async () => {
        const result = await measureAsyncP95(
            () =>
                buildReportingView("owner-1", {
                    startDate: "2025-01-01",
                    endDate: "2025-12-31",
                }),
            {
                iterations: 20,
                warmup: 5,
            },
        );

        console.info(formatPerfResult("reporting-summary", result));

        expect(result.p95Ms).toBeLessThan(2_000);
        expect(mocks.budgetPeriodGet).toHaveBeenCalled();
    });
});
