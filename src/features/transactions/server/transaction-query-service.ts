import type { TransactionQuery } from "@/features/transactions/models/transaction-form";
import {
    isTransactionDateInRange,
    toTransactionDateInputValue,
} from "@/features/transactions/models/transaction-date";
import { normalizeTransactionIds } from "@/features/transactions/models/transaction-ids";
import {
    listTransactionChildren,
    listTransactionChildrenByTransactionId,
} from "@/features/transactions/server/transaction-child-service";
import { listAccountActivityTransactionIds } from "@/features/transactions/server/transaction-reference-service";
import {
    toPublicTransactionRecord,
    type TransactionRecord,
    type TransactionWithPostings,
} from "@/features/transactions/server/transaction-write-model";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import {
    listTransactionImportActivities,
    listTransactionImportActivitiesForTransaction,
} from "@/features/transaction-importers/server/transaction-import-activity-service";
import { groupBy } from "@/lib/collections";

const DIRECT_TRANSACTION_LOOKUP_LIMIT = 10;
const DYNAMODB_BATCH_GET_LIMIT = 100;
const BATCH_GET_RETRY_DELAYS_MS = [20, 40, 80] as const;

export type TransactionPrimaryKey = {
    ledgerId: string;
    occurredAt: string;
    transactionId: string;
};

export type StoredTransactionBatchReadResult = {
    transactions: TransactionRecord[];
    unprocessedKeys: TransactionPrimaryKey[];
};

function transactionPrimaryKeySignature(key: TransactionPrimaryKey) {
    return `${key.ledgerId}\u001f${key.occurredAt}\u001f${key.transactionId}`;
}

function waitBeforeBatchGetRetry(attempt: number) {
    const delay = BATCH_GET_RETRY_DELAYS_MS[attempt];

    return delay === undefined
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
              setTimeout(resolve, delay);
          });
}

async function readStoredTransactionBatch(keys: TransactionPrimaryKey[]) {
    const { entities } = getBudgetedSchema();
    const transactions: TransactionRecord[] = [];
    let unprocessedKeys = keys;

    for (
        let attempt = 0;
        attempt <= BATCH_GET_RETRY_DELAYS_MS.length && unprocessedKeys.length > 0;
        attempt += 1
    ) {
        if (attempt > 0) {
            await waitBeforeBatchGetRetry(attempt - 1);
        }

        const result = await entities.transactions.get(unprocessedKeys).go({
            consistent: true,
        });

        transactions.push(...(result.data as TransactionRecord[]));

        unprocessedKeys = result.unprocessed as TransactionPrimaryKey[];
    }

    return { transactions, unprocessedKeys };
}

export async function listStoredTransactionsByPrimaryKeys(
    keys: Iterable<TransactionPrimaryKey>,
): Promise<StoredTransactionBatchReadResult> {
    const uniqueKeys = [
        ...new Map(
            [...keys].map((key) => [transactionPrimaryKeySignature(key), key]),
        ).values(),
    ];

    if (uniqueKeys.length === 0) {
        return { transactions: [], unprocessedKeys: [] };
    }

    const batches: TransactionPrimaryKey[][] = [];

    for (
        let startIndex = 0;
        startIndex < uniqueKeys.length;
        startIndex += DYNAMODB_BATCH_GET_LIMIT
    ) {
        batches.push(
            uniqueKeys.slice(startIndex, startIndex + DYNAMODB_BATCH_GET_LIMIT),
        );
    }

    const results = await Promise.all(batches.map(readStoredTransactionBatch));
    const transactionsByKey = new Map(
        results
            .flatMap((result) => result.transactions)
            .map((transaction) => [
                transactionPrimaryKeySignature(transaction),
                transaction,
            ]),
    );

    return {
        transactions: uniqueKeys.flatMap((key) => {
            const transaction = transactionsByKey.get(
                transactionPrimaryKeySignature(key),
            );

            return transaction ? [transaction] : [];
        }),
        unprocessedKeys: results.flatMap((result) => result.unprocessedKeys),
    };
}

function compareTransactions(
    left: { occurredAt: string; transactionId: string },
    right: { occurredAt: string; transactionId: string },
) {
    const occurredComparison = toTransactionDateInputValue(
        right.occurredAt,
    ).localeCompare(toTransactionDateInputValue(left.occurredAt));

    if (occurredComparison !== 0) {
        return occurredComparison;
    }

    return right.transactionId.localeCompare(left.transactionId);
}

export async function listStoredTransactionsByIds(
    ledgerId: string,
    transactionIds: Iterable<string>,
) {
    const ids = new Set(normalizeTransactionIds(transactionIds));

    if (ids.size === 0) {
        return [];
    }

    if (ids.size <= DIRECT_TRANSACTION_LOOKUP_LIMIT) {
        const transactions = await Promise.all(
            Array.from(ids).map((transactionId) =>
                findStoredTransactionDirect(ledgerId, transactionId),
            ),
        );

        return transactions.filter(
            (transaction): transaction is TransactionRecord =>
                Boolean(transaction),
        );
    }

    return listStoredTransactionsByIdsFromLedgerScan(ledgerId, ids);
}

async function listStoredTransactionsByIdsFromLedgerScan(
    ledgerId: string,
    ids: Set<string>,
) {
    const { entities } = getBudgetedSchema();
    const transactions = await queryAllPages(
        entities.transactions.query.byTransaction({ ledgerId }),
        { consistent: true },
    );

    return (transactions as TransactionRecord[]).filter((transaction) =>
        ids.has(transaction.transactionId),
    );
}

async function findStoredTransactionByPrimaryKey(input: {
    ledgerId: string;
    occurredAt: string;
    transactionId: string;
}) {
    const { entities } = getBudgetedSchema();
    const query = entities.transactions.query
        .byTransaction({ ledgerId: input.ledgerId })
        .begins({
            occurredAt: input.occurredAt,
            transactionId: input.transactionId,
        });
    const transactions = await queryAllPages(query, { consistent: true });

    return (transactions as TransactionRecord[]).find(
        (transaction) => transaction.transactionId === input.transactionId,
    );
}

async function findStoredTransactionDirect(
    ledgerId: string,
    transactionId: string,
) {
    const { entities } = getBudgetedSchema();
    const byId = entities.transactions.query.byId;

    if (typeof byId === "function") {
        try {
            const [candidate] = (await queryAllPages(
                byId({ ledgerId, transactionId }),
            )) as TransactionRecord[];

            if (candidate) {
                const transaction = await findStoredTransactionByPrimaryKey({
                    ledgerId,
                    occurredAt: candidate.occurredAt,
                    transactionId,
                });

                if (transaction) {
                    return transaction;
                }
            }
        } catch {
            // Local/test tables can temporarily lack the GSI during rollout.
        }
    }

    const [transaction] = await listStoredTransactionsByIdsFromLedgerScan(
        ledgerId,
        new Set([transactionId]),
    );

    return transaction;
}

export async function findStoredTransaction(
    ledgerId: string,
    transactionId: string,
) {
    return findStoredTransactionDirect(ledgerId, transactionId);
}

export async function getStoredTransaction(
    ledgerId: string,
    transactionId: string,
) {
    const transaction = await findStoredTransaction(ledgerId, transactionId);

    if (!transaction) {
        throw new HttpError(
            404,
            "transaction_missing",
            "The transaction could not be found.",
        );
    }

    return transaction;
}

async function listStoredTransactions(
    ledgerId: string,
    query: TransactionQuery = {},
) {
    const { entities } = getBudgetedSchema();
    const accountActivityTransactionIds = query.accountId
        ? await listAccountActivityTransactionIds(ledgerId, query.accountId)
        : null;
    const transactions = await queryAllPages(
        entities.transactions.query.byTransaction({ ledgerId }),
        { consistent: true },
    );

    return (transactions as TransactionRecord[])
        .filter((transaction) => {
            if (
                query.accountId &&
                transaction.referenceAccountId !== query.accountId &&
                !accountActivityTransactionIds?.has(transaction.transactionId)
            ) {
                return false;
            }

            if (query.periodId && transaction.periodId !== query.periodId) {
                return false;
            }

            return isTransactionDateInRange(
                transaction.occurredAt,
                query.startDate,
                query.endDate,
            );
        })
        .sort(compareTransactions);
}

export async function listTransactions(
    ledgerId: string,
    query: TransactionQuery = {},
) {
    return (await listStoredTransactions(ledgerId, query)).map(
        toPublicTransactionRecord,
    );
}

export async function getTransaction(
    ledgerId: string,
    transactionId: string,
) {
    return toPublicTransactionRecord(
        await getStoredTransaction(ledgerId, transactionId),
    );
}

export async function getTransactionWithPostings(
    ledgerId: string,
    transactionId: string,
): Promise<TransactionWithPostings> {
    const transaction = await getStoredTransaction(ledgerId, transactionId);
    const [{ lines, postings }, importActivities] = await Promise.all([
        listTransactionChildren(ledgerId, transactionId),
        listTransactionImportActivitiesForTransaction({
            ledgerId,
            transactionId,
        }),
    ]);

    return {
        ...toPublicTransactionRecord(transaction),
        importActivities,
        lines,
        postings,
    };
}

export async function listTransactionsWithPostings(
    ledgerId: string,
    query: TransactionQuery = {},
): Promise<TransactionWithPostings[]> {
    const transactions = await listTransactions(ledgerId, query);
    const [{ linesByTransactionId, postingsByTransactionId }, importActivities] =
        await Promise.all([
            listTransactionChildrenByTransactionId(
            ledgerId,
            transactions.map((transaction) => transaction.transactionId),
            ),
            listTransactionImportActivities(ledgerId),
        ]);
    const importActivitiesByTransactionId = groupBy(
        importActivities,
        (activity) => activity.linkedTransactionId ?? "",
    );

    return transactions.map((transaction) => ({
        ...transaction,
        importActivities:
            importActivitiesByTransactionId.get(transaction.transactionId) ?? [],
        postings: postingsByTransactionId.get(transaction.transactionId) ?? [],
        lines: linesByTransactionId.get(transaction.transactionId) ?? [],
    }));
}

export async function listStoredTransactionsWithPostings(
    ledgerId: string,
    query: TransactionQuery = {},
): Promise<TransactionWithPostings[]> {
    const transactions = await listStoredTransactions(ledgerId, query);
    const [{ linesByTransactionId, postingsByTransactionId }, importActivities] =
        await Promise.all([
            listTransactionChildrenByTransactionId(
            ledgerId,
            transactions.map((transaction) => transaction.transactionId),
            ),
            listTransactionImportActivities(ledgerId),
        ]);
    const importActivitiesByTransactionId = groupBy(
        importActivities,
        (activity) => activity.linkedTransactionId ?? "",
    );

    return transactions.map((transaction) => ({
        ...transaction,
        importActivities:
            importActivitiesByTransactionId.get(transaction.transactionId) ?? [],
        postings: postingsByTransactionId.get(transaction.transactionId) ?? [],
        lines: linesByTransactionId.get(transaction.transactionId) ?? [],
    }));
}

export async function listReferenceAccountTransactionsWithPostings(
    ledgerId: string,
    accountId: string,
): Promise<TransactionWithPostings[]> {
    const { entities } = getBudgetedSchema();
    const transactions = (await queryAllPages(
        entities.transactions.query.byAccount({
            ledgerId,
            referenceAccountId: accountId,
        }),
    )) as TransactionRecord[];
    const publicTransactions = transactions
        .sort(compareTransactions)
        .map(toPublicTransactionRecord);
    const [{ linesByTransactionId, postingsByTransactionId }, importActivities] =
        await Promise.all([
            listTransactionChildrenByTransactionId(
            ledgerId,
            publicTransactions.map((transaction) => transaction.transactionId),
            ),
            listTransactionImportActivities(ledgerId),
        ]);
    const importActivitiesByTransactionId = groupBy(
        importActivities,
        (activity) => activity.linkedTransactionId ?? "",
    );

    return publicTransactions.map((transaction) => ({
        ...transaction,
        importActivities:
            importActivitiesByTransactionId.get(transaction.transactionId) ?? [],
        postings: postingsByTransactionId.get(transaction.transactionId) ?? [],
        lines: linesByTransactionId.get(transaction.transactionId) ?? [],
    }));
}
