export function normalizeTransactionIds(transactionIds: Iterable<string>) {
    return Array.from(
        new Set(
            Array.from(transactionIds)
                .map((transactionId) => transactionId.trim())
                .filter(Boolean),
        ),
    ).sort();
}
