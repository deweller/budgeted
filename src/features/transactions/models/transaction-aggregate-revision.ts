import {
    toPublicTransactionLineCategoryId,
    toPublicTransactionLineFromAccountId,
    toPublicTransactionLineToAccountId,
} from "@/features/transactions/models/transaction-line-normalization";
import { toVisibleReferenceCategoryId } from "@/features/transactions/models/reference-category";
import { calculateWorkspaceContentDigest } from "@/lib/workspace/revision";

type AggregateTransaction = Record<string, unknown> & {
    transactionId: string;
};

type AggregateLine = Record<string, unknown> & {
    lineId: string;
};

type AggregatePosting = Record<string, unknown> & {
    postingId: string;
};

type AggregatePlaidTransactionSync = Record<string, unknown> & {
    plaidTransactionSyncId: string;
};

export type TransactionAggregateMetadata = {
    aggregateLineCount: number;
    aggregateLineDigest: string;
    aggregatePlaidSyncCount: number;
    aggregatePlaidSyncDigest: string;
    aggregatePostingCount: number;
    aggregatePostingDigest: string;
    aggregateRevision: string;
};

function sortById<TRecord>(
    records: readonly TRecord[],
    getId: (record: TRecord) => string,
) {
    return [...records].sort((left, right) =>
        getId(left).localeCompare(getId(right)),
    );
}

/**
 * A stable token for the complete transaction state that can affect an edit.
 * The records are sorted so query order never changes the concurrency result.
 */
export function createTransactionAggregateRevision(input: {
    ledgerPostings: readonly AggregatePosting[];
    plaidTransactionSyncs?: readonly AggregatePlaidTransactionSync[];
    transaction: AggregateTransaction;
    transactionLines: readonly AggregateLine[];
}) {
    return `transactionAggregate:${calculateWorkspaceContentDigest({
        ledgerPostings: sortById(input.ledgerPostings, (posting) =>
            posting.postingId,
        ),
        plaidTransactionSyncs: sortById(
            input.plaidTransactionSyncs ?? [],
            (sync) => sync.plaidTransactionSyncId,
        ),
        transaction: stripAggregateMetadata(input.transaction),
        transactionLines: sortById(
            input.transactionLines.map(toCanonicalAggregateLine),
            (line) => line.lineId,
        ),
    })}`;
}

function stripAggregateMetadata(transaction: AggregateTransaction) {
    const next = { ...transaction };

    delete next.aggregateRevision;
    delete next.aggregateLineCount;
    delete next.aggregateLineDigest;
    delete next.aggregatePostingCount;
    delete next.aggregatePostingDigest;
    delete next.aggregatePlaidSyncCount;
    delete next.aggregatePlaidSyncDigest;
    delete next.lines;
    delete next.postings;

    const referenceCategoryId = toVisibleReferenceCategoryId(
        typeof next.referenceCategoryId === "string"
            ? next.referenceCategoryId
            : undefined,
    );

    if (referenceCategoryId) {
        next.referenceCategoryId = referenceCategoryId;
    } else {
        delete next.referenceCategoryId;
    }

    return next;
}

function toCanonicalAggregateLine(line: AggregateLine) {
    const next = { ...line };
    const categoryId = toPublicTransactionLineCategoryId(
        typeof next.categoryId === "string" ? next.categoryId : undefined,
    );
    const fromAccountId = toPublicTransactionLineFromAccountId(
        typeof next.fromAccountId === "string" ? next.fromAccountId : undefined,
    );
    const toAccountId = toPublicTransactionLineToAccountId(
        typeof next.toAccountId === "string" ? next.toAccountId : undefined,
    );

    if (categoryId) next.categoryId = categoryId;
    else delete next.categoryId;
    if (fromAccountId) next.fromAccountId = fromAccountId;
    else delete next.fromAccountId;
    if (toAccountId) next.toAccountId = toAccountId;
    else delete next.toAccountId;

    return next;
}

function createRecordSetDigest<TRecord>(
    records: readonly TRecord[],
    getId: (record: TRecord) => string,
) {
    return calculateWorkspaceContentDigest(sortById(records, getId));
}

export function createTransactionAggregateMetadata(input: {
    ledgerPostings: readonly AggregatePosting[];
    plaidTransactionSyncs?: readonly AggregatePlaidTransactionSync[];
    transaction: AggregateTransaction;
    transactionLines: readonly AggregateLine[];
}): TransactionAggregateMetadata {
    const plaidTransactionSyncs = input.plaidTransactionSyncs ?? [];

    return {
        aggregateLineCount: input.transactionLines.length,
        aggregateLineDigest: createRecordSetDigest(
            input.transactionLines.map(toCanonicalAggregateLine),
            (line) => line.lineId,
        ),
        aggregatePlaidSyncCount: plaidTransactionSyncs.length,
        aggregatePlaidSyncDigest: createRecordSetDigest(
            plaidTransactionSyncs,
            (sync) => sync.plaidTransactionSyncId,
        ),
        aggregatePostingCount: input.ledgerPostings.length,
        aggregatePostingDigest: createRecordSetDigest(
            input.ledgerPostings,
            (posting) => posting.postingId,
        ),
        aggregateRevision: createTransactionAggregateRevision(input),
    };
}

export function withCanonicalTransactionAggregateMetadata<
    TTransaction extends AggregateTransaction,
>(input: {
    ledgerPostings: readonly (AggregatePosting & { transactionId: string })[];
    plaidTransactionSyncs: readonly (AggregatePlaidTransactionSync & {
        transactionId: string;
    })[];
    transactionLines: readonly (AggregateLine & { transactionId: string })[];
    transactions: readonly TTransaction[];
}) {
    return input.transactions.map((transaction) => ({
        ...transaction,
        ...createTransactionAggregateMetadata({
            ledgerPostings: input.ledgerPostings.filter(
                (posting) => posting.transactionId === transaction.transactionId,
            ),
            plaidTransactionSyncs: input.plaidTransactionSyncs.filter(
                (sync) => sync.transactionId === transaction.transactionId,
            ),
            transaction,
            transactionLines: input.transactionLines.filter(
                (line) => line.transactionId === transaction.transactionId,
            ),
        }),
    }));
}

export function hasValidTransactionAggregateMetadata(input: {
    ledgerPostings: readonly AggregatePosting[];
    plaidTransactionSyncs?: readonly AggregatePlaidTransactionSync[];
    transaction: AggregateTransaction;
    transactionLines: readonly AggregateLine[];
}) {
    const transaction = input.transaction as Record<string, unknown>;
    const stored = {
        aggregateLineCount: transaction.aggregateLineCount,
        aggregateLineDigest: transaction.aggregateLineDigest,
        aggregatePlaidSyncCount: transaction.aggregatePlaidSyncCount,
        aggregatePlaidSyncDigest: transaction.aggregatePlaidSyncDigest,
        aggregatePostingCount: transaction.aggregatePostingCount,
        aggregatePostingDigest: transaction.aggregatePostingDigest,
        aggregateRevision: transaction.aggregateRevision,
    };

    if (Object.values(stored).some((value) => value === undefined)) {
        return false;
    }

    const expected = createTransactionAggregateMetadata(input);

    return Object.entries(expected).every(
        ([key, value]) => stored[key as keyof typeof stored] === value,
    );
}

export function hasValidWorkspaceTransactionAggregates(input: {
    ledgerPostings: readonly (AggregatePosting & { transactionId: string })[];
    plaidTransactionSyncs: readonly (AggregatePlaidTransactionSync & {
        transactionId: string;
    })[];
    transactionLines: readonly (AggregateLine & { transactionId: string })[];
    transactions: readonly AggregateTransaction[];
}) {
    const transactionIds = new Set(
        input.transactions.map((transaction) => transaction.transactionId),
    );
    const hasOrphanedChild = [
        ...input.ledgerPostings,
        ...input.plaidTransactionSyncs,
        ...input.transactionLines,
    ].some((record) => !transactionIds.has(record.transactionId));

    if (hasOrphanedChild) {
        return false;
    }

    return input.transactions.every((transaction) =>
        hasValidTransactionAggregateMetadata({
            ledgerPostings: input.ledgerPostings.filter(
                (posting) => posting.transactionId === transaction.transactionId,
            ),
            plaidTransactionSyncs: input.plaidTransactionSyncs.filter(
                (sync) => sync.transactionId === transaction.transactionId,
            ),
            transaction,
            transactionLines: input.transactionLines.filter(
                (line) => line.transactionId === transaction.transactionId,
            ),
        }),
    );
}
