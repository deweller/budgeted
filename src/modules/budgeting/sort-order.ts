export type SortableBudgetItem = {
    name: string;
    sortOrder: number;
};

export function compareBudgetItemsBySortOrder(
    left: SortableBudgetItem,
    right: SortableBudgetItem,
) {
    if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
}
