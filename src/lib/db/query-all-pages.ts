type QueryOptions = Record<string, unknown>;

type QueryResult<TRecord> = {
    data: TRecord[];
};

type QueryGo<TRecord> = {
    go: (options?: QueryOptions) => Promise<QueryResult<TRecord>>;
};

export async function queryAllPages<TRecord>(
    query: QueryGo<TRecord>,
    options: QueryOptions = {},
) {
    const go = query.go as (
        options?: QueryOptions,
    ) => Promise<QueryResult<TRecord>>;
    const result = await go({ ...options, pages: "all" });

    return result.data;
}
