import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    allocationFundingSourcesByPeriodGo: vi.fn(),
    allocationFundingSourcesByPeriod: vi.fn(() => ({
        go: mocks.allocationFundingSourcesByPeriodGo,
    })),
    allocationFundingSourcesDeleteGo: vi.fn(),
    allocationFundingSourcesDelete: vi.fn(() => ({
        go: mocks.allocationFundingSourcesDeleteGo,
    })),
    allocationFundingSourcesUpsertGo: vi.fn(),
    allocationFundingSourcesUpsert: vi.fn(() => ({
        go: mocks.allocationFundingSourcesUpsertGo,
    })),
    buildBudgetPeriodSummary: vi.fn(),
    listBudgetCategories: vi.fn(),
    categoryAllocationsByPeriodGo: vi.fn(),
    categoryAllocationsByPeriod: vi.fn(() => ({
        go: mocks.categoryAllocationsByPeriodGo,
    })),
    categoryAllocationsDeleteGo: vi.fn(),
    categoryAllocationsDelete: vi.fn(() => ({
        go: mocks.categoryAllocationsDeleteGo,
    })),
    upsertGo: vi.fn(),
    upsert: vi.fn(() => ({ go: mocks.upsertGo })),
}));

vi.mock("@/features/budget/server/budget-period-service", () => ({
    buildBudgetPeriodSummary: mocks.buildBudgetPeriodSummary,
}));

vi.mock("@/features/budget/server/category-service", () => ({
    isUserVisibleBudgetCategory: (category: { systemCategoryKey?: string }) =>
        category.systemCategoryKey !== "startingBalances",
    listBudgetCategories: mocks.listBudgetCategories,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            categoryAllocations: {
                query: {
                    byPeriod: mocks.categoryAllocationsByPeriod,
                },
                delete: mocks.categoryAllocationsDelete,
                upsert: mocks.upsert,
            },
            allocationFundingSources: {
                query: {
                    byPeriod: mocks.allocationFundingSourcesByPeriod,
                },
                delete: mocks.allocationFundingSourcesDelete,
                upsert: mocks.allocationFundingSourcesUpsert,
            },
        },
    }),
}));

import {
    replaceBudgetAllocations,
    resetBudgetAllocations,
} from "@/features/budget/server/allocation-service";
import { HttpError } from "@/lib/api/errors";
import { UNASSIGNED_CATEGORY_ID } from "@/modules/budgeting/unassigned";

describe("budget allocation service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.categoryAllocationsByPeriodGo.mockResolvedValue({
            data: [],
        });
        mocks.allocationFundingSourcesByPeriodGo.mockResolvedValue({
            data: [],
        });
        mocks.listBudgetCategories.mockResolvedValue([]);
    });

    it("deletes saved allocation and funding-source records for a selected month", async () => {
        mocks.categoryAllocationsByPeriodGo.mockResolvedValue({
            data: [
                {
                    activityCents: 0,
                    allocationId: "2026-05:groceries",
                    assignedCents: 3_000,
                    availableCents: 3_000,
                    carriedForwardCents: 0,
                    categoryId: "groceries",
                    ledgerId: "owner-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });
        mocks.allocationFundingSourcesByPeriodGo.mockResolvedValue({
            data: [
                {
                    allocationId: "2026-05:groceries",
                    amountCents: 1_000,
                    categoryId: "groceries",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    fundingSourceId: "funding-1",
                    ledgerId: "owner-1",
                    periodId: "2026-05",
                    sourceId: "buffer",
                    sourceType: "incomeCategory",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });
        mocks.buildBudgetPeriodSummary.mockResolvedValue({
            periodId: "2026-05",
            availableToBudgetCents: 3_000,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            categories: [],
            hasSavedAssignments: false,
        });

        const result = await resetBudgetAllocations("owner-1", "2026-05");

        expect(mocks.categoryAllocationsByPeriod).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            periodId: "2026-05",
        });
        expect(mocks.categoryAllocationsDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            periodId: "2026-05",
            categoryId: "groceries",
        });
        expect(mocks.allocationFundingSourcesDelete).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            fundingSourceId: "funding-1",
        });
        expect(result.hasSavedAssignments).toBe(false);
    });

    it("restores deleted allocation records when reset refresh fails", async () => {
        const allocation = {
            activityCents: 0,
            allocationId: "2026-05:groceries",
            assignedCents: 3_000,
            availableCents: 3_000,
            carriedForwardCents: 0,
            categoryId: "groceries",
            ledgerId: "owner-1",
            periodId: "2026-05",
            updatedAt: "2026-05-01T00:00:00.000Z",
        };
        const fundingSource = {
            allocationId: "2026-05:groceries",
            amountCents: 1_000,
            categoryId: "groceries",
            createdAt: "2026-05-01T00:00:00.000Z",
            fundingSourceId: "funding-1",
            ledgerId: "owner-1",
            periodId: "2026-05",
            sourceId: "buffer",
            sourceType: "incomeCategory" as const,
            updatedAt: "2026-05-01T00:00:00.000Z",
        };

        mocks.categoryAllocationsByPeriodGo.mockResolvedValue({
            data: [allocation],
        });
        mocks.allocationFundingSourcesByPeriodGo.mockResolvedValue({
            data: [fundingSource],
        });
        mocks.buildBudgetPeriodSummary.mockRejectedValue(
            new Error("summary failed"),
        );

        await expect(
            resetBudgetAllocations("owner-1", "2026-05"),
        ).rejects.toThrow("summary failed");

        expect(mocks.upsert).toHaveBeenCalledWith({
            ...allocation,
            updatedAt: expect.any(String),
        });
        expect(mocks.allocationFundingSourcesUpsert).toHaveBeenCalledWith({
            ...fundingSource,
            updatedAt: expect.any(String),
        });
    });

    it("updates allocation records and returns the refreshed summary", async () => {
        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2026-05",
                assignedAllocationTotalCents: 2_000,
                availableToBudgetCents: 3_000,
                fundingReconciliationCents: 3_000,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 2_000,
                        carriedForwardCents: 500,
                        activityCents: 0,
                        availableCents: 2_500,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                periodId: "2026-05",
                assignedAllocationTotalCents: 3_000,
                availableToBudgetCents: 2_000,
                fundingReconciliationCents: 2_000,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 3_000,
                        carriedForwardCents: 500,
                        activityCents: 0,
                        availableCents: 3_500,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            });

        const result = await replaceBudgetAllocations("owner-1", "2026-05", [
            { categoryId: "groceries", assignedCents: 3_000 },
        ]);

        expect(mocks.upsert).toHaveBeenCalledTimes(1);
        expect(mocks.upsertGo).toHaveBeenCalledTimes(1);
        expect(result.availableToBudgetCents).toBe(2_000);
    });

    it("does not create funding-source provenance for saved assignments", async () => {
        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2026-05",
                assignedAllocationTotalCents: 0,
                availableToBudgetCents: 6_500,
                fundingReconciliationCents: 6_500,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 0,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 0,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                periodId: "2026-05",
                assignedAllocationTotalCents: 6_500,
                availableToBudgetCents: 0,
                fundingReconciliationCents: 0,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 6_500,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 6_500,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            });

        await replaceBudgetAllocations("owner-1", "2026-05", [
            {
                categoryId: "groceries",
                assignedCents: 6_500,
            },
        ]);

        expect(mocks.allocationFundingSourcesUpsert).not.toHaveBeenCalled();
    });

    it("does not persist assignments for the computed Unassigned row", async () => {
        mocks.buildBudgetPeriodSummary.mockResolvedValue({
            periodId: "2026-05",
            assignedAllocationTotalCents: 0,
            availableToBudgetCents: 6_500,
            fundingReconciliationCents: 6_500,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            categories: [],
        });

        await expect(
            replaceBudgetAllocations("owner-1", "2026-05", [
                {
                    categoryId: UNASSIGNED_CATEGORY_ID,
                    assignedCents: 1_000,
                },
            ]),
        ).rejects.toBeInstanceOf(HttpError);

        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("allows unchanged assignments against the computed Unassigned balance", async () => {
        const summary = {
            periodId: "2026-05",
            availableToBudgetCents: 0,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    assignedCents: 600,
                    carriedForwardCents: 0,
                    activityCents: 0,
                    availableCents: 600,
                    isIncomeCategory: false,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        };

        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce(summary)
            .mockResolvedValueOnce(summary);

        await expect(
            replaceBudgetAllocations("owner-1", "2026-05", [
                {
                    categoryId: "groceries",
                    assignedCents: 600,
                },
            ]),
        ).resolves.toMatchObject({
            periodId: "2026-05",
        });

        expect(mocks.upsert).toHaveBeenCalled();
    });

    it("keeps a non-current selected period bound through allocation saves", async () => {
        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2025-12",
                availableToBudgetCents: 4_000,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "travel",
                        name: "Travel",
                        assignedCents: 1_000,
                        carriedForwardCents: 250,
                        activityCents: 0,
                        availableCents: 1_250,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                periodId: "2025-12",
                availableToBudgetCents: 3_500,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "travel",
                        name: "Travel",
                        assignedCents: 1_500,
                        carriedForwardCents: 250,
                        activityCents: 0,
                        availableCents: 1_750,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            });

        await replaceBudgetAllocations("owner-1", "2025-12", [
            { categoryId: "travel", assignedCents: 1_500 },
        ]);

        expect(mocks.buildBudgetPeriodSummary).toHaveBeenNthCalledWith(
            1,
            "owner-1",
            "2025-12",
        );
        expect(mocks.buildBudgetPeriodSummary).toHaveBeenNthCalledWith(
            2,
            "owner-1",
            "2025-12",
        );
        expect(mocks.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                allocationId: "2025-12:travel",
                periodId: "2025-12",
            }),
        );
    });

    it("allows saved allocations to exceed current funding and return a negative total", async () => {
        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2026-05",
                assignedAllocationTotalCents: 2_000,
                availableToBudgetCents: 500,
                fundingReconciliationCents: 500,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 2_000,
                        carriedForwardCents: 500,
                        activityCents: 0,
                        availableCents: 2_500,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                periodId: "2026-05",
                assignedAllocationTotalCents: 4_000,
                availableToBudgetCents: -1_500,
                fundingReconciliationCents: -1_500,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 4_000,
                        carriedForwardCents: 500,
                        activityCents: 0,
                        availableCents: 4_500,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            });

        await expect(
            replaceBudgetAllocations("owner-1", "2026-05", [
                { categoryId: "groceries", assignedCents: 4_000 },
            ]),
        ).resolves.toMatchObject({
            availableToBudgetCents: -1_500,
        });

        expect(mocks.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                assignedCents: 4_000,
                categoryId: "groceries",
            }),
        );
        const [savedAllocation] = mocks.upsert.mock.calls[0] as unknown as [
            Record<string, unknown>,
        ];

        expect(savedAllocation).not.toHaveProperty("availableCents");
        expect(savedAllocation).not.toHaveProperty("carriedForwardCents");
    });

    it("persists auto-assign funding-source provenance for configured source categories", async () => {
        mocks.listBudgetCategories.mockResolvedValue([
            {
                autoAssignSourceEnabled: false,
                autoAssignSourceSortOrder: undefined,
                categoryId: "groceries",
                name: "Groceries",
                status: "active",
                systemCategoryKey: undefined,
            },
            {
                autoAssignSourceEnabled: true,
                autoAssignSourceSortOrder: 0,
                categoryId: "buffer",
                name: "Buffer",
                status: "active",
                systemCategoryKey: undefined,
            },
        ]);
        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2026-05",
                availableToBudgetCents: 0,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 0,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 0,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                    {
                        categoryId: "buffer",
                        name: "Buffer",
                        assignedCents: 0,
                        carriedForwardCents: 3_000,
                        activityCents: 0,
                        availableCents: 3_000,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                periodId: "2026-05",
                availableToBudgetCents: 0,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 3_000,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 3_000,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                    {
                        categoryId: "buffer",
                        name: "Buffer",
                        assignedCents: -3_000,
                        carriedForwardCents: 3_000,
                        activityCents: 0,
                        availableCents: 0,
                        isIncomeCategory: false,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            });

        await replaceBudgetAllocations("owner-1", "2026-05", [
            {
                categoryId: "groceries",
                assignedCents: 3_000,
                fundingSources: [
                    {
                        amountCents: 3_000,
                        sourceId: "buffer",
                        sourceType: "budgetCategory",
                    },
                ],
            },
            {
                categoryId: "buffer",
                assignedCents: -3_000,
            },
        ]);

        expect(mocks.allocationFundingSourcesUpsert).toHaveBeenCalledWith({
            allocationId: "2026-05:groceries",
            amountCents: 3_000,
            categoryId: "groceries",
            createdAt: expect.any(String),
            fundingSourceId: "2026-05:groceries:budgetCategory:buffer",
            ledgerId: "owner-1",
            periodId: "2026-05",
            sourceId: "buffer",
            sourceType: "budgetCategory",
            updatedAt: expect.any(String),
        });
    });

    it("rejects auto-assign funding sources that rely on Unassigned for part of the assignment", async () => {
        mocks.listBudgetCategories.mockResolvedValue([
            {
                autoAssignSourceEnabled: false,
                autoAssignSourceSortOrder: undefined,
                categoryId: "groceries",
                name: "Groceries",
                status: "active",
                systemCategoryKey: undefined,
            },
            {
                autoAssignSourceEnabled: true,
                autoAssignSourceSortOrder: 0,
                categoryId: "buffer",
                name: "Buffer",
                status: "active",
                systemCategoryKey: undefined,
            },
        ]);
        mocks.buildBudgetPeriodSummary.mockResolvedValue({
            periodId: "2026-05",
            availableToBudgetCents: 1_000,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    assignedCents: 0,
                    carriedForwardCents: 0,
                    activityCents: 0,
                    availableCents: 0,
                    isIncomeCategory: false,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
                {
                    categoryId: "buffer",
                    name: "Buffer",
                    assignedCents: 0,
                    carriedForwardCents: 2_000,
                    activityCents: 0,
                    availableCents: 2_000,
                    isIncomeCategory: false,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        await expect(
            replaceBudgetAllocations("owner-1", "2026-05", [
                {
                    categoryId: "groceries",
                    assignedCents: 3_000,
                    fundingSources: [
                        {
                            amountCents: 2_000,
                            sourceId: "buffer",
                            sourceType: "budgetCategory",
                        },
                    ],
                },
                {
                    categoryId: "buffer",
                    assignedCents: -2_000,
                },
            ]),
        ).rejects.toMatchObject({
            code: "funding_source_mismatch",
            message:
                "Auto assign source records must balance category assignment movement.",
            status: 422,
        });

        expect(mocks.allocationFundingSourcesUpsert).not.toHaveBeenCalled();
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it("rejects auto-assign funding sources that are not configured", async () => {
        mocks.listBudgetCategories.mockResolvedValue([
            {
                autoAssignSourceEnabled: false,
                categoryId: "buffer",
                name: "Buffer",
                status: "active",
                systemCategoryKey: undefined,
            },
        ]);
        mocks.buildBudgetPeriodSummary.mockResolvedValue({
            periodId: "2026-05",
            availableToBudgetCents: 0,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    assignedCents: 0,
                    carriedForwardCents: 0,
                    activityCents: 0,
                    availableCents: 0,
                    isIncomeCategory: false,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
                {
                    categoryId: "buffer",
                    name: "Buffer",
                    assignedCents: 0,
                    carriedForwardCents: 2_000,
                    activityCents: 0,
                    availableCents: 2_000,
                    isIncomeCategory: false,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        await expect(
            replaceBudgetAllocations("owner-1", "2026-05", [
                {
                    categoryId: "groceries",
                    assignedCents: 2_000,
                    fundingSources: [
                        {
                            amountCents: 2_000,
                            sourceId: "buffer",
                            sourceType: "budgetCategory",
                        },
                    ],
                },
                {
                    categoryId: "buffer",
                    assignedCents: -2_000,
                },
            ]),
        ).rejects.toBeInstanceOf(HttpError);
    });

    it("allows manual assignments in an earlier month even when the total becomes negative", async () => {
        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2026-01",
                assignedAllocationTotalCents: 0,
                availableToBudgetCents: 0,
                fundingReconciliationCents: 0,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "travel",
                        name: "Travel",
                        assignedCents: 0,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 0,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                periodId: "2026-01",
                assignedAllocationTotalCents: 1_000,
                availableToBudgetCents: -1_000,
                fundingReconciliationCents: -1_000,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "travel",
                        name: "Travel",
                        assignedCents: 1_000,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 1_000,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            });

        await expect(
            replaceBudgetAllocations("owner-1", "2026-01", [
                { categoryId: "travel", assignedCents: 1_000 },
            ]),
        ).resolves.toMatchObject({
            availableToBudgetCents: -1_000,
        });
    });

    it("allows assignments in the month where funding exists by month end", async () => {
        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2026-02",
                availableToBudgetCents: 1_000,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "travel",
                        name: "Travel",
                        assignedCents: 0,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 0,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockResolvedValueOnce({
                periodId: "2026-02",
                availableToBudgetCents: 0,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "travel",
                        name: "Travel",
                        assignedCents: 1_000,
                        carriedForwardCents: 0,
                        activityCents: 0,
                        availableCents: 1_000,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            });

        const result = await replaceBudgetAllocations("owner-1", "2026-02", [
            { categoryId: "travel", assignedCents: 1_000 },
        ]);

        expect(result.periodId).toBe("2026-02");
        expect(result.availableToBudgetCents).toBe(0);
        expect(mocks.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                allocationId: "2026-02:travel",
                assignedCents: 1_000,
                periodId: "2026-02",
            }),
        );
    });

    it("restores the last committed allocation state when the refreshed summary fails", async () => {
        const refreshFailure = new Error("summary rebuild failed");

        mocks.buildBudgetPeriodSummary
            .mockResolvedValueOnce({
                periodId: "2026-05",
                availableToBudgetCents: 3_000,
                status: "open",
                attentionStates: [],
                carryForwardSummaries: [],
                categories: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        assignedCents: 2_000,
                        carriedForwardCents: 500,
                        activityCents: 0,
                        availableCents: 2_500,
                        reducedByOverspending: false,
                        attentionStates: [],
                    },
                ],
            })
            .mockRejectedValueOnce(refreshFailure);
        mocks.upsertGo
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);
        mocks.categoryAllocationsByPeriodGo.mockResolvedValueOnce({
            data: [
                {
                    allocationId: "2026-05:groceries",
                    assignedCents: 2_000,
                    categoryId: "groceries",
                    ledgerId: "owner-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });

        await expect(
            replaceBudgetAllocations("owner-1", "2026-05", [
                { categoryId: "groceries", assignedCents: 3_000 },
            ]),
        ).rejects.toThrow("summary rebuild failed");

        expect(mocks.upsert).toHaveBeenCalledTimes(2);
        expect(mocks.upsert).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                categoryId: "groceries",
                assignedCents: 3_000,
            }),
        );
        const [savedAllocation] = mocks.upsert.mock.calls[0] as unknown as [
            Record<string, unknown>,
        ];

        expect(savedAllocation).not.toHaveProperty("availableCents");
        expect(savedAllocation).not.toHaveProperty("carriedForwardCents");
        expect(mocks.upsert).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                categoryId: "groceries",
                assignedCents: 2_000,
            }),
        );
        const [rolledBackAllocation] = mocks.upsert.mock.calls[1] as unknown as [
            Record<string, unknown>,
        ];

        expect(rolledBackAllocation).not.toHaveProperty("availableCents");
        expect(rolledBackAllocation).not.toHaveProperty("carriedForwardCents");
    });
});
