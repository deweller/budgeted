import {
    getUnclassifiedTransactionLineIds,
    generateTransactionClassificationDebugRun,
    isTransactionClassificationEligible,
} from "@/features/transaction-classification/server/transaction-classification-service";
import {
    TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS,
    TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID,
    buildTransactionClassificationEmbeddingSourceForTransaction,
    createEmbeddingId,
    createEmbeddingTextHash,
    ensureTransactionClassificationEmbeddings,
    listTransactionClassificationEmbeddingRecords,
    type TransactionClassificationEmbeddingRecord,
    type TransactionClassificationEmbeddingSource,
} from "@/features/transaction-classification/server/transaction-classification-embedding-service";
import { listTransactionsWithPostings } from "@/features/transactions/server/transaction-query-service";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import type {
    WorkspaceAccountRecord,
    WorkspacePlaidTransactionSyncRecord,
} from "@/lib/workspace/sync-types";

type EmbeddingStatus = "current" | "missing" | "notEmbeddable" | "stale";

function sortAccounts(left: WorkspaceAccountRecord, right: WorkspaceAccountRecord) {
    return left.name.localeCompare(right.name) || left.accountId.localeCompare(right.accountId);
}

function getRecordBySourceKey(records: TransactionClassificationEmbeddingRecord[]) {
    return new Map(
        records.map((record) => [
            createEmbeddingId({
                sourceId: record.sourceId,
                sourceType: record.sourceType,
            }),
            record,
        ]),
    );
}

function getPlaidSyncByTransactionId(records: WorkspacePlaidTransactionSyncRecord[]) {
    return new Map(
        records
            .filter((record) => record.status === "active")
            .map((record) => [record.transactionId, record]),
    );
}

function isDebugEmbeddableTransaction(transaction: {
    kind: "adjustment" | "standard";
    status: "entered" | "cleared" | "reconciled" | "voided";
}) {
    return transaction.kind === "standard" && transaction.status !== "voided";
}

function getEmbeddingStatus(input: {
    record?: TransactionClassificationEmbeddingRecord;
    source: TransactionClassificationEmbeddingSource | null;
}) {
    if (!input.source) {
        return {
            status: "notEmbeddable" as const,
        };
    }

    const embeddingTextHash = createEmbeddingTextHash(input.source.text);

    if (!input.record) {
        return {
            embeddingTextHash,
            sourceText: input.source.text,
            status: "missing" as const,
        };
    }

    const isCurrent =
        input.record.modelId === TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID &&
        input.record.dimensions === TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS &&
        input.record.sourceUpdatedAt === input.source.sourceUpdatedAt &&
        input.record.embeddingTextHash === embeddingTextHash;

    return {
        dimensions: input.record.dimensions,
        embeddingTextHash,
        modelId: input.record.modelId,
        recordUpdatedAt: input.record.updatedAt,
        sourceText: input.source.text,
        sourceUpdatedAt: input.record.sourceUpdatedAt,
        status: (isCurrent ? "current" : "stale") satisfies EmbeddingStatus,
    };
}

async function loadDebugReferenceRecords(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const [accounts, plaidSyncs, embeddingRecords] = await Promise.all([
        queryAllPages(entities.accounts.query.byAccount({ ledgerId }), {
            consistent: true,
        }) as Promise<WorkspaceAccountRecord[]>,
        queryAllPages(entities.plaidTransactionSyncs.query.bySync({ ledgerId }), {
            consistent: true,
        }) as Promise<WorkspacePlaidTransactionSyncRecord[]>,
        listTransactionClassificationEmbeddingRecords(ledgerId),
    ]);

    return {
        accounts: accounts.sort(sortAccounts),
        embeddingRecordBySourceKey: getRecordBySourceKey(embeddingRecords),
        plaidSyncByTransactionId: getPlaidSyncByTransactionId(plaidSyncs),
    };
}

export async function getTransactionClassificationDebugPage(input: {
    accountId?: string | null;
    ledgerId: string;
}) {
    const references = await loadDebugReferenceRecords(input.ledgerId);
    const selectedAccount = input.accountId
        ? references.accounts.find((account) => account.accountId === input.accountId) ??
          null
        : null;
    const transactions = selectedAccount
        ? await listTransactionsWithPostings(input.ledgerId, {
              accountId: selectedAccount.accountId,
          })
        : [];

    return {
        accounts: references.accounts.map((account) => ({
            accountId: account.accountId,
            accountType: account.accountType,
            name: account.name,
        })),
        selectedAccountId: selectedAccount?.accountId ?? null,
        transactions: transactions.map((transaction) => {
            const source =
                isDebugEmbeddableTransaction(transaction)
                    ? buildTransactionClassificationEmbeddingSourceForTransaction({
                          plaidSync: references.plaidSyncByTransactionId.get(
                              transaction.transactionId,
                          ),
                          transaction,
                      })
                    : null;
            const record = references.embeddingRecordBySourceKey.get(
                createEmbeddingId({
                    sourceId: transaction.transactionId,
                    sourceType: "transaction",
                }),
            );

            return {
                amountCents: transaction.displayAmountCents,
                embedding: getEmbeddingStatus({ record, source }),
                isClassificationEligible:
                    isTransactionClassificationEligible(transaction),
                kind: transaction.kind,
                memo: transaction.memo ?? null,
                importActivities: transaction.importActivities ?? [],
                occurredAt: transaction.occurredAt,
                payee: transaction.payee ?? null,
                status: transaction.status,
                targetLineCount:
                    getUnclassifiedTransactionLineIds(transaction).length,
                transactionId: transaction.transactionId,
                updatedAt: transaction.updatedAt,
            };
        }),
    };
}

export async function createTransactionClassificationDebugEmbeddings(input: {
    ledgerId: string;
    transactionIds: string[];
}) {
    const transactions = await listTransactionsWithPostings(input.ledgerId);
    const requestedIds = new Set(input.transactionIds);
    const { plaidSyncByTransactionId } = await loadDebugReferenceRecords(
        input.ledgerId,
    );
    const sources = transactions
        .filter((transaction) => requestedIds.has(transaction.transactionId))
        .filter(isDebugEmbeddableTransaction)
        .map((transaction) =>
            buildTransactionClassificationEmbeddingSourceForTransaction({
                plaidSync: plaidSyncByTransactionId.get(transaction.transactionId),
                transaction,
            }),
        )
        .filter(
            (source): source is NonNullable<typeof source> => Boolean(source),
        );
    const result = await ensureTransactionClassificationEmbeddings({
        ledgerId: input.ledgerId,
        sources,
    });

    return {
        ...result,
        requestedCount: input.transactionIds.length,
        sourceCount: sources.length,
    };
}

export async function runTransactionClassificationDebugTrial(input: {
    ledgerId: string;
    transactionIds: string[];
}) {
    return generateTransactionClassificationDebugRun(input.ledgerId, {
        transactionIds: input.transactionIds,
    });
}
