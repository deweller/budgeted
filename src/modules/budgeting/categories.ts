const SYSTEM_CATEGORY_KEY_STARTING_BALANCES = "startingBalances";

function isSystemManagedCategory(input: { systemCategoryKey?: string }) {
    return input.systemCategoryKey === SYSTEM_CATEGORY_KEY_STARTING_BALANCES;
}

export function isUserVisibleBudgetCategory(input: {
    systemCategoryKey?: string;
}) {
    return !isSystemManagedCategory(input);
}
