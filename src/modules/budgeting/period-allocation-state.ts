import { calculateAvailableCents } from "@/modules/budgeting/availability";
import type { BudgetCategoryAllocationCadence } from "@/modules/budgeting/allocation-schedule";
import { compareBudgetItemsBySortOrder } from "@/modules/budgeting/sort-order";

export type BudgetPeriodCategoryState = {
    allocationCadence?: BudgetCategoryAllocationCadence;
    allocationStartMonth?: number;
    categoryId: string;
    defaultAssignedCents: number;
    groupId: string;
    isIncomeCategory: boolean;
    ledgerAccountId: string;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
    systemCategoryKey?: string;
};

export type BudgetPeriodAllocationInput = {
    assignedCents?: number;
    categoryId: string;
};

export type DerivedBudgetPeriodAllocation<
    TAllocation extends BudgetPeriodAllocationInput,
> = Omit<
    TAllocation,
    "assignedCents"
> & {
    activityCents: number;
    assignedCents: number;
    availableCents: number;
    carriedForwardCents: number;
    categoryId: string;
};

function createFallbackCategory(categoryId: string): BudgetPeriodCategoryState {
    return {
        allocationCadence: "monthly",
        categoryId,
        defaultAssignedCents: 0,
        groupId: "historical",
        isIncomeCategory: false,
        ledgerAccountId: `historical_${categoryId}`,
        name: categoryId,
        sortOrder: Number.MAX_SAFE_INTEGER,
        status: "archived",
    };
}

function appendCategoryOnce<TCategory extends BudgetPeriodCategoryState>(
    categories: BudgetPeriodCategoryState[],
    seenCategoryIds: Set<string>,
    category: TCategory | BudgetPeriodCategoryState,
) {
    if (seenCategoryIds.has(category.categoryId)) {
        return;
    }

    seenCategoryIds.add(category.categoryId);
    categories.push(category);
}

export function deriveBudgetPeriodAllocationState<
    TCategory extends BudgetPeriodCategoryState,
    TAllocation extends BudgetPeriodAllocationInput,
>(input: {
    activityByCategoryId: Map<string, number>;
    currentAllocations: TAllocation[];
    // Retained for older callers; stored allocation activity is no longer
    // authoritative and missing live activity always resolves to zero.
    missingActivityFallback?: "allocation" | "zero";
    previousAvailableByCategoryId: Map<string, number>;
    retiredCategoryIds: Set<string>;
    visibleCategories: TCategory[];
}) {
    const categoriesById = new Map(
        input.visibleCategories.map((category) => [
            category.categoryId,
            category,
        ]),
    );
    const visibleCurrentAllocations = input.currentAllocations.filter(
        (allocation) => !input.retiredCategoryIds.has(allocation.categoryId),
    );
    const allocationsByCategoryId = new Map(
        visibleCurrentAllocations.map((allocation) => [
            allocation.categoryId,
            allocation,
        ]),
    );
    const selectedCategories: BudgetPeriodCategoryState[] = [];
    const selectedCategoryIds = new Set<string>();

    for (const allocation of visibleCurrentAllocations) {
        appendCategoryOnce(
            selectedCategories,
            selectedCategoryIds,
            categoriesById.get(allocation.categoryId) ??
                createFallbackCategory(allocation.categoryId),
        );
    }

    for (const category of input.visibleCategories) {
        if (category.status === "active") {
            appendCategoryOnce(
                selectedCategories,
                selectedCategoryIds,
                category,
            );
        }
    }

    for (const category of input.visibleCategories) {
        if (
            (input.previousAvailableByCategoryId.get(category.categoryId) ??
                0) !== 0
        ) {
            appendCategoryOnce(
                selectedCategories,
                selectedCategoryIds,
                category,
            );
        }
    }

    selectedCategories.sort(compareBudgetItemsBySortOrder);

    return {
        allocations: selectedCategories.map((category) => {
            const existingAllocation = allocationsByCategoryId.get(
                category.categoryId,
            );
            const assignedCents = existingAllocation?.assignedCents ?? 0;
            const carriedForwardCents =
                input.previousAvailableByCategoryId.get(category.categoryId) ?? 0;
            const activityCents =
                input.activityByCategoryId.get(category.categoryId) ?? 0;
            const availableCents = calculateAvailableCents({
                activityCents,
                assignedCents,
                carriedForwardCents,
            });

            return {
                ...existingAllocation,
                activityCents,
                assignedCents,
                availableCents,
                carriedForwardCents,
                categoryId: category.categoryId,
            } as DerivedBudgetPeriodAllocation<TAllocation>;
        }),
        categories: selectedCategories,
        hasSavedAssignments: visibleCurrentAllocations.length > 0,
    };
}
