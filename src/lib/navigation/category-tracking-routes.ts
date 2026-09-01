export function getCategoryTrackingHref(categoryId: string) {
    const params = new URLSearchParams({ category: categoryId });

    return `/reporting/category-tracking?${params.toString()}`;
}
