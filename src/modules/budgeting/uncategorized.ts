export const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";
export const UNCATEGORIZED_CATEGORY_NAME = "Uncategorized";
export const UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID = "equity_uncategorized";

export function isUncategorizedCategoryId(categoryId: string) {
    return categoryId === UNCATEGORIZED_CATEGORY_ID;
}
