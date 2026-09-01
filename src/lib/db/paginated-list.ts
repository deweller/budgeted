export type PaginatedListPage<TItem> = {
    items: TItem[];
    lastEvaluatedKey?: Record<string, unknown>;
};

export type PaginatedListPageLoader<TItem> = (input: {
    exclusiveStartKey?: Record<string, unknown>;
}) => Promise<PaginatedListPage<TItem>>;

export async function listAllPaginatedItems<TItem>(
    listPage: PaginatedListPageLoader<TItem>,
) {
    const items: TItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
        const page = await listPage({ exclusiveStartKey });

        items.push(...page.items);
        exclusiveStartKey = page.lastEvaluatedKey;
    } while (exclusiveStartKey);

    return items;
}
