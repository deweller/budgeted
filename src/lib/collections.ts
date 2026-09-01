export function groupBy<TItem, TKey>(
    items: readonly TItem[],
    getKey: (item: TItem) => TKey,
) {
    const groups = new Map<TKey, TItem[]>();

    for (const item of items) {
        const key = getKey(item);
        const group = groups.get(key);

        if (group) {
            group.push(item);
        } else {
            groups.set(key, [item]);
        }
    }

    return groups;
}

export function getOrCreateMapValue<TKey, TValue>(
    values: Map<TKey, TValue>,
    key: TKey,
    createValue: () => TValue,
) {
    if (values.has(key)) {
        return values.get(key)!;
    }

    const value = createValue();
    values.set(key, value);

    return value;
}
