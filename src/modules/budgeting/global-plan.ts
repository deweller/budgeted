import { calculateAvailableCents } from "@/modules/budgeting/availability";
import type { BudgetCategoryAllocationCadence } from "@/modules/budgeting/allocation-schedule";
import type { BudgetCategoryType } from "@/modules/budgeting/category-type";
import { compareBudgetItemsBySortOrder } from "@/modules/budgeting/sort-order";

export type GlobalPlanCategory = {
    allocationCadence?: BudgetCategoryAllocationCadence;
    allocationStartMonth?: number;
    categoryId: string;
    categoryType?: BudgetCategoryType;
    defaultAssignedCents: number;
    groupId: string;
    isIncomeCategory: boolean;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
    systemCategoryKey?: "startingBalances";
};

export type DerivedMonthAllocation = {
    activityCents: number;
    assignedCents: number;
    availableCents: number;
    carriedForwardCents: number;
    categoryId: string;
    source: "global-plan-derived";
};

export function deriveUntouchedMonthAllocations(input: {
    categories: GlobalPlanCategory[];
    activityByCategoryId?: Map<string, number>;
    carriedForwardByCategoryId?: Map<string, number>;
}) {
    const activityByCategoryId = input.activityByCategoryId ?? new Map();
    const carriedForwardByCategoryId =
        input.carriedForwardByCategoryId ?? new Map();

    return input.categories
        .filter((category) => category.status === "active")
        .sort(compareBudgetItemsBySortOrder)
        .map<DerivedMonthAllocation>((category) => {
            const activityCents =
                activityByCategoryId.get(category.categoryId) ?? 0;
            const carriedForwardCents =
                carriedForwardByCategoryId.get(category.categoryId) ?? 0;
            const assignedCents = 0;

            return {
                categoryId: category.categoryId,
                assignedCents,
                carriedForwardCents,
                activityCents,
                availableCents: calculateAvailableCents({
                    assignedCents,
                    carriedForwardCents,
                    activityCents,
                }),
                source: "global-plan-derived",
            };
        });
}
