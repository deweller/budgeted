export function countRecordGroups<TRecord>(
    recordGroups: Iterable<readonly TRecord[]>,
) {
    return Array.from(recordGroups).reduce(
        (total, records) => total + records.length,
        0,
    );
}

export function createRecordGroupRevisions<TRecord>(
    recordGroups: Iterable<readonly TRecord[]>,
    createRevision: (record: TRecord) => string,
) {
    return Array.from(recordGroups).flatMap((records) =>
        records.map(createRevision),
    );
}

export function createAllocationRevision(input: {
    allocationId: string;
    updatedAt: string;
}) {
    return `allocation:${input.allocationId}:${input.updatedAt}`;
}

export function createLedgerPostingRevision(input: {
    createdAt: string;
    postingId: string;
    transactionId: string;
}) {
    return `posting:${input.transactionId}:${input.postingId}:${input.createdAt}`;
}

export function createPlaidAccountLinkRevision(input: {
    plaidAccountLinkId: string;
    updatedAt: string;
}) {
    return `plaidLink:${input.plaidAccountLinkId}:${input.updatedAt}`;
}

export function createPlaidItemSyncStateRevision(input: {
    plaidItemId: string;
    updatedAt: string;
}) {
    return `plaidItemSyncState:${input.plaidItemId}:${input.updatedAt}`;
}

export function createPlaidTransactionSyncRevision(input: {
    plaidTransactionSyncId: string;
    updatedAt: string;
}) {
    return `plaidSync:${input.plaidTransactionSyncId}:${input.updatedAt}`;
}

export function createTransactionLineRevision(input: {
    lineId: string;
    transactionId: string;
    updatedAt: string;
}) {
    return `line:${input.transactionId}:${input.lineId}:${input.updatedAt}`;
}

export function createTransactionRevision(input: {
    transactionId: string;
    updatedAt: string;
}) {
    return `transaction:${input.transactionId}:${input.updatedAt}`;
}
