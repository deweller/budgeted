export const BUDGET_CATEGORY_ALLOCATION_CADENCES = [
    "monthly",
    "yearly",
] as const;

export type BudgetCategoryAllocationCadence =
    (typeof BUDGET_CATEGORY_ALLOCATION_CADENCES)[number];

export const DEFAULT_BUDGET_CATEGORY_ALLOCATION_CADENCE =
    "monthly" satisfies BudgetCategoryAllocationCadence;
export const DEFAULT_BUDGET_CATEGORY_ALLOCATION_START_MONTH = 1;

export const BUDGET_CATEGORY_ALLOCATION_MONTHS = [
    { label: "January", value: 1 },
    { label: "February", value: 2 },
    { label: "March", value: 3 },
    { label: "April", value: 4 },
    { label: "May", value: 5 },
    { label: "June", value: 6 },
    { label: "July", value: 7 },
    { label: "August", value: 8 },
    { label: "September", value: 9 },
    { label: "October", value: 10 },
    { label: "November", value: 11 },
    { label: "December", value: 12 },
] as const;

export type BudgetCategoryAllocationSchedule = {
    allocationCadence?: BudgetCategoryAllocationCadence;
    allocationStartMonth?: number;
    defaultAssignedCents: number;
};

export function normalizeBudgetCategoryAllocationCadence(
    value?: string | null,
): BudgetCategoryAllocationCadence {
    return value === "yearly"
        ? "yearly"
        : DEFAULT_BUDGET_CATEGORY_ALLOCATION_CADENCE;
}

export function normalizeBudgetCategoryAllocationStartMonth(
    value?: number | null,
): number {
    return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 12
        ? value
        : DEFAULT_BUDGET_CATEGORY_ALLOCATION_START_MONTH;
}

export function getMonthlyPeriodMonth(periodId: string) {
    const month = Number(periodId.slice(5, 7));

    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error("Monthly period identifiers must use a month between 01 and 12.");
    }

    return month;
}

export function getEffectiveBudgetCategoryDefaultAssignedCents(
    category: BudgetCategoryAllocationSchedule,
    periodId: string,
) {
    const cadence = normalizeBudgetCategoryAllocationCadence(
        category.allocationCadence,
    );

    if (cadence === "monthly") {
        return category.defaultAssignedCents;
    }

    return getMonthlyPeriodMonth(periodId) ===
        normalizeBudgetCategoryAllocationStartMonth(category.allocationStartMonth)
        ? category.defaultAssignedCents
        : 0;
}
