import { describe, expect, it } from "vitest";

import { deriveBudgetPeriodAllocationState } from "@/modules/budgeting";

const categories = [
    {
        categoryId: "rent",
        defaultAssignedCents: 0,
        groupId: "monthly",
        isIncomeCategory: false,
        ledgerAccountId: "cat_rent",
        name: "Rent",
        sortOrder: 1,
        status: "active" as const,
    },
    {
        categoryId: "food",
        defaultAssignedCents: 0,
        groupId: "monthly",
        isIncomeCategory: false,
        ledgerAccountId: "cat_food",
        name: "Food",
        sortOrder: 0,
        status: "active" as const,
    },
    {
        categoryId: "archived",
        defaultAssignedCents: 0,
        groupId: "old",
        isIncomeCategory: false,
        ledgerAccountId: "cat_archived",
        name: "Archived",
        sortOrder: 2,
        status: "archived" as const,
    },
];

describe("budget period allocation state", () => {
    it("selects saved, active, and carried-forward categories once in budget order", () => {
        const result = deriveBudgetPeriodAllocationState({
            activityByCategoryId: new Map([
                ["food", -1_200],
                ["rent", -5_000],
            ]),
            currentAllocations: [
                {
                    allocationId: "allocation-food",
                    assignedCents: 2_000,
                    categoryId: "food",
                },
                {
                    allocationId: "allocation-retired",
                    assignedCents: 10_000,
                    categoryId: "retired",
                },
            ],
            previousAvailableByCategoryId: new Map([["archived", 500]]),
            retiredCategoryIds: new Set(["retired"]),
            visibleCategories: categories,
        });

        expect(result.hasSavedAssignments).toBe(true);
        expect(result.categories.map((category) => category.categoryId)).toEqual(
            ["food", "rent", "archived"],
        );
        expect(result.allocations).toEqual([
            {
                allocationId: "allocation-food",
                activityCents: -1_200,
                assignedCents: 2_000,
                availableCents: 800,
                carriedForwardCents: 0,
                categoryId: "food",
            },
            {
                activityCents: -5_000,
                assignedCents: 0,
                availableCents: -5_000,
                carriedForwardCents: 0,
                categoryId: "rent",
            },
            {
                activityCents: 0,
                assignedCents: 0,
                availableCents: 500,
                carriedForwardCents: 500,
                categoryId: "archived",
            },
        ]);
    });

    it("creates a historical fallback category for saved unknown allocations", () => {
        const result = deriveBudgetPeriodAllocationState({
            activityByCategoryId: new Map(),
            currentAllocations: [
                {
                    assignedCents: 300,
                    categoryId: "deleted-category",
                },
            ],
            previousAvailableByCategoryId: new Map(),
            retiredCategoryIds: new Set(),
            visibleCategories: [],
        });

        expect(result.categories).toEqual([
            expect.objectContaining({
                categoryId: "deleted-category",
                groupId: "historical",
                name: "deleted-category",
                status: "archived",
            }),
        ]);
        expect(result.allocations[0]).toMatchObject({
            assignedCents: 300,
            availableCents: 300,
            categoryId: "deleted-category",
        });
    });

    it("starts at zero when no previous month is available", () => {
        const result = deriveBudgetPeriodAllocationState({
            activityByCategoryId: new Map([["food", -300]]),
            currentAllocations: [
                {
                    assignedCents: 1_000,
                    categoryId: "food",
                },
            ],
            previousAvailableByCategoryId: new Map(),
            retiredCategoryIds: new Set(),
            visibleCategories: categories,
        });
        const foodAllocation = result.allocations.find(
            (allocation) => allocation.categoryId === "food",
        );

        expect(foodAllocation).toMatchObject({
            assignedCents: 1_000,
            availableCents: 700,
            carriedForwardCents: 0,
            categoryId: "food",
        });
    });

    it("ignores legacy saved carried-forward values and carries prior computed availability", () => {
        const result = deriveBudgetPeriodAllocationState({
            activityByCategoryId: new Map([["food", -300]]),
            currentAllocations: [
                {
                    assignedCents: 1_000,
                    carriedForwardCents: 200,
                    categoryId: "food",
                },
            ],
            previousAvailableByCategoryId: new Map([["food", 500]]),
            retiredCategoryIds: new Set(),
            visibleCategories: categories,
        });
        const foodAllocation = result.allocations.find(
            (allocation) => allocation.categoryId === "food",
        );

        expect(foodAllocation).toMatchObject({
            assignedCents: 1_000,
            availableCents: 1_200,
            carriedForwardCents: 500,
            categoryId: "food",
        });
    });

    it("treats missing live activity as zero instead of stored allocation activity", () => {
        const result = deriveBudgetPeriodAllocationState({
            activityByCategoryId: new Map(),
            currentAllocations: [
                {
                    activityCents: -200,
                    assignedCents: 1_000,
                    categoryId: "food",
                },
            ],
            previousAvailableByCategoryId: new Map(),
            retiredCategoryIds: new Set(),
            visibleCategories: categories,
        });
        const foodAllocation = result.allocations.find(
            (allocation) => allocation.categoryId === "food",
        );

        expect(foodAllocation).toMatchObject({
            activityCents: 0,
            availableCents: 1_000,
        });
    });
});
