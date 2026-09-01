export const BUDGET_CATEGORY_TYPES = ["spending", "savings"] as const;

export type BudgetCategoryType = (typeof BUDGET_CATEGORY_TYPES)[number];

export const DEFAULT_BUDGET_CATEGORY_TYPE =
    "spending" satisfies BudgetCategoryType;

export function normalizeBudgetCategoryType(
    value: string | undefined,
): BudgetCategoryType {
    return value === "savings" ? "savings" : DEFAULT_BUDGET_CATEGORY_TYPE;
}

export function formatBudgetCategoryType(value: BudgetCategoryType) {
    return value === "savings" ? "Savings" : "Spending";
}
