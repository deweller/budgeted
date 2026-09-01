export const UNASSIGNED_CATEGORY_ID = "__unassigned__";
export const UNASSIGNED_CATEGORY_NAME = "Unassigned";

export function isUnassignedCategoryId(categoryId: string) {
    return categoryId === UNASSIGNED_CATEGORY_ID;
}
