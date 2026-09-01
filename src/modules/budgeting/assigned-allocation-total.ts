type AssignedAllocationCategory = {
    assignedCents: number;
};

export function calculateAssignedAllocationTotalCents(
    categories: AssignedAllocationCategory[],
) {
    return categories.reduce(
        (total, category) => total + category.assignedCents,
        0,
    );
}
