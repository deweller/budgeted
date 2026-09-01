import {
    TRANSACTION_CLASSIFICATION_BATCH_LIMIT,
    transactionClassificationPromptVersion,
    transactionClassificationPendingPublicSchema,
    transactionClassificationSuggestionSchema,
    type TransactionClassificationFieldSelection,
    type TransactionClassificationPendingPublic,
    type TransactionClassificationPendingSource,
    type TransactionClassificationPendingStatus,
    type TransactionClassificationSuggestion,
} from "@/features/transaction-classification/models/transaction-classification";
import {
    applyTransactionClassificationSuggestionToTransaction,
    generateTransactionClassificationSuggestionsForPreloadedRun,
    isTransactionClassificationEligible,
    loadTransactionClassificationPreloadedRunContext,
} from "@/features/transaction-classification/server/transaction-classification-service";
import {
    getTransactionWithPostings,
    listReferenceAccountTransactionsWithPostings,
} from "@/features/transactions/server/transaction-query-service";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { HttpError } from "@/lib/api/errors";
import { chunkRecords } from "@/lib/db/chunked-write";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";

const PENDING_CLASSIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PENDING_CLASSIFICATION_READ_CHUNK_SIZE = 50;
const PENDING_CLASSIFICATION_WRITE_CHUNK_SIZE = 10;

export type TransactionClassificationPendingRecord = {
    accountId: string;
    createdAt: string;
    expiresAt: number;
    ledgerId: string;
    modelId: string;
    promptVersion: string;
    rejectedAt?: string;
    source: TransactionClassificationPendingSource;
    suggestionJson: string;
    suggestionType: TransactionClassificationSuggestion["type"];
    status?: TransactionClassificationPendingStatus;
    transactionId: string;
    transactionUpdatedAt: string;
    updatedAt: string;
};

export type ClassifyAccountNowResult = {
    accountId: string;
    categoryCount: number;
    eligibleCount: number;
    errorCount: number;
    errors: string[];
    noSuggestionCount: number;
    savedCount: number;
    skippedCount: number;
};

export type ClassifyLedgerNowResult = Omit<ClassifyAccountNowResult, "accountId"> & {
    accountCount: number;
};

export function getTransactionClassificationPendingExpiresAt(now = new Date()) {
    return Math.floor(
        (now.getTime() + PENDING_CLASSIFICATION_RETENTION_MS) / 1000,
    );
}

function parsePendingSuggestion(
    record: TransactionClassificationPendingRecord,
) {
    let raw: unknown;

    try {
        raw = JSON.parse(record.suggestionJson);
    } catch {
        return null;
    }

    const parsed = transactionClassificationSuggestionSchema.safeParse(raw);

    return parsed.success ? parsed.data : null;
}

function isPendingRecordExpired(
    record: Pick<TransactionClassificationPendingRecord, "expiresAt">,
    now = new Date(),
) {
    return record.expiresAt <= Math.floor(now.getTime() / 1000);
}

function isPendingRecordCurrentVersion(
    record: Pick<TransactionClassificationPendingRecord, "promptVersion">,
) {
    return record.promptVersion === transactionClassificationPromptVersion;
}

function toPendingPublic(
    record: TransactionClassificationPendingRecord,
): TransactionClassificationPendingPublic | null {
    const suggestion = parsePendingSuggestion(record);

    if (!suggestion) {
        return null;
    }

    const parsed = transactionClassificationPendingPublicSchema.safeParse({
        accountId: record.accountId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        modelId: record.modelId,
        promptVersion: record.promptVersion,
        rejectedAt: record.rejectedAt ?? null,
        source: record.source,
        suggestion,
        suggestionType: record.suggestionType,
        status: record.status ?? "pending",
        transactionId: record.transactionId,
        transactionUpdatedAt: record.transactionUpdatedAt,
        updatedAt: record.updatedAt,
    });

    return parsed.success ? parsed.data : null;
}

function isPendingFreshForTransaction(input: {
    now?: Date;
    record: TransactionClassificationPendingRecord;
    transaction: TransactionWithPostings | undefined;
}) {
    return Boolean(
        input.transaction &&
            !isPendingRecordExpired(input.record, input.now) &&
            isPendingRecordCurrentVersion(input.record) &&
            input.record.transactionUpdatedAt === input.transaction.updatedAt &&
            isTransactionClassificationEligible(input.transaction),
    );
}

function getPendingStatus(
    record: Pick<TransactionClassificationPendingRecord, "status">,
) {
    return record.status ?? "pending";
}

async function getPendingRecord(
    ledgerId: string,
    transactionId: string,
): Promise<TransactionClassificationPendingRecord | null> {
    const { entities } = getBudgetedSchema();
    const result = await entities.transactionClassificationPending
        .get({ ledgerId, transactionId })
        .go();

    return (result.data as TransactionClassificationPendingRecord | null) ?? null;
}

async function getPendingRecords(
    ledgerId: string,
    transactionIds: string[],
) {
    const uniqueTransactionIds = Array.from(new Set(transactionIds));
    const records: Array<TransactionClassificationPendingRecord | null> = [];

    for (const transactionIdChunk of chunkRecords(
        uniqueTransactionIds,
        PENDING_CLASSIFICATION_READ_CHUNK_SIZE,
    )) {
        records.push(
            ...(await Promise.all(
                transactionIdChunk.map((transactionId) =>
                    getPendingRecord(ledgerId, transactionId),
                ),
            )),
        );
    }

    return records;
}

async function listPendingRecordsForAccount(input: {
    accountId: string;
    ledgerId: string;
}) {
    const { entities } = getBudgetedSchema();
    const records = await queryAllPages(
        entities.transactionClassificationPending.query.byAccount({
            accountId: input.accountId,
            ledgerId: input.ledgerId,
        }),
    );

    return records as TransactionClassificationPendingRecord[];
}

function toCurrentPendingPublicRecords(
    records: Array<TransactionClassificationPendingRecord | null>,
) {
    return records
        .filter((record): record is TransactionClassificationPendingRecord =>
            Boolean(record),
        )
        .filter((record) => !isPendingRecordExpired(record))
        .filter(isPendingRecordCurrentVersion)
        .map(toPendingPublic)
        .filter(
            (
                record,
            ): record is NonNullable<ReturnType<typeof toPendingPublic>> =>
                Boolean(record),
        );
}

async function deletePendingRecord(ledgerId: string, transactionId: string) {
    const { entities } = getBudgetedSchema();

    await entities.transactionClassificationPending
        .delete({ ledgerId, transactionId })
        .go();
}

function chunkTransactionIds(transactionIds: string[]) {
    const chunks: string[][] = [];

    for (
        let index = 0;
        index < transactionIds.length;
        index += TRANSACTION_CLASSIFICATION_BATCH_LIMIT
    ) {
        chunks.push(
            transactionIds.slice(
                index,
                index + TRANSACTION_CLASSIFICATION_BATCH_LIMIT,
            ),
        );
    }

    return chunks;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

async function assertAccountExists(input: {
    accountId: string;
    ledgerId: string;
}) {
    const { entities } = getBudgetedSchema();
    const result = await entities.accounts
        .get({ accountId: input.accountId, ledgerId: input.ledgerId })
        .go();

    if (!result.data) {
        throw new HttpError(
            404,
            "account_missing",
            "The account could not be found.",
        );
    }
}

async function putPendingSuggestion(input: {
    accountId: string;
    ledgerId: string;
    modelId: string;
    promptVersion: string;
    source: TransactionClassificationPendingSource;
    suggestion: TransactionClassificationSuggestion;
}) {
    const { entities } = getBudgetedSchema();
    const now = new Date();
    const nowIso = now.toISOString();
    const record = {
        accountId: input.accountId,
        createdAt: nowIso,
        expiresAt: getTransactionClassificationPendingExpiresAt(now),
        ledgerId: input.ledgerId,
        modelId: input.modelId,
        promptVersion: input.promptVersion,
        rejectedAt: undefined,
        source: input.source,
        suggestionJson: JSON.stringify(input.suggestion),
        suggestionType: input.suggestion.type,
        status: "pending",
        transactionId: input.suggestion.transactionId,
        transactionUpdatedAt: input.suggestion.transactionUpdatedAt,
        updatedAt: nowIso,
    } satisfies TransactionClassificationPendingRecord;

    await entities.transactionClassificationPending.put(record).go();

    return record;
}

async function putPendingSuggestions(input: {
    accountId: string;
    ledgerId: string;
    modelId: string;
    promptVersion: string;
    source: TransactionClassificationPendingSource;
    suggestions: TransactionClassificationSuggestion[];
}) {
    const savedSuggestions: TransactionClassificationSuggestion[] = [];

    for (const suggestionChunk of chunkRecords(
        input.suggestions,
        PENDING_CLASSIFICATION_WRITE_CHUNK_SIZE,
    )) {
        await Promise.all(
            suggestionChunk.map((suggestion) =>
                putPendingSuggestion({
                    accountId: input.accountId,
                    ledgerId: input.ledgerId,
                    modelId: input.modelId,
                    promptVersion: input.promptVersion,
                    source: input.source,
                    suggestion,
                }),
            ),
        );
        savedSuggestions.push(...suggestionChunk);
    }

    return savedSuggestions;
}

export async function listTransactionClassificationPending(
    ledgerId: string,
    transactionIds: string[],
) {
    const pending = toCurrentPendingPublicRecords(
        await getPendingRecords(ledgerId, transactionIds),
    );

    return { pending };
}

export async function listTransactionClassificationPendingForAccount(
    ledgerId: string,
    accountId: string,
) {
    const pending = toCurrentPendingPublicRecords(
        await listPendingRecordsForAccount({ accountId, ledgerId }),
    );

    return { pending };
}

async function getFreshPendingSuggestion(input: {
    ledgerId: string;
    mutationId?: string;
    transactionId: string;
}) {
    const record = await getPendingRecord(input.ledgerId, input.transactionId);

    if (
        !record ||
        isPendingRecordExpired(record) ||
        !isPendingRecordCurrentVersion(record) ||
        getPendingStatus(record) !== "pending"
    ) {
        throw new HttpError(
            404,
            "classification_pending_missing",
            "No current AI classification was found for this transaction.",
        );
    }

    const suggestion = parsePendingSuggestion(record);

    if (!suggestion) {
        throw new HttpError(
            409,
            "classification_pending_invalid",
            "The AI classification could not be read.",
        );
    }

    const transaction = await getTransactionWithPostings(
        input.ledgerId,
        input.transactionId,
    );

    if (
        !isPendingFreshForTransaction({
            record,
            transaction,
        })
    ) {
        throw new HttpError(
            404,
            "classification_pending_missing",
            "No current AI classification was found for this transaction.",
        );
    }

    return { record, suggestion, transaction };
}

export async function classifyAccountNow(input: {
    accountId: string;
    ledgerId: string;
    source?: TransactionClassificationPendingSource;
}): Promise<ClassifyAccountNowResult> {
    const source = input.source ?? "manual";
    const [, transactions, existingPending] = await Promise.all([
        assertAccountExists({
            accountId: input.accountId,
            ledgerId: input.ledgerId,
        }),
        listReferenceAccountTransactionsWithPostings(
            input.ledgerId,
            input.accountId,
        ),
        listPendingRecordsForAccount({
            accountId: input.accountId,
            ledgerId: input.ledgerId,
        }),
    ]);
    const eligibleTransactions = transactions.filter(
        isTransactionClassificationEligible,
    );
    const pendingByTransactionId = new Map(
        existingPending
            .filter((record): record is TransactionClassificationPendingRecord =>
                Boolean(record),
            )
            .map((record) => [record.transactionId, record]),
    );
    const transactionsToClassify = eligibleTransactions.filter((transaction) => {
        const record = pendingByTransactionId.get(transaction.transactionId);

        return (
            !record ||
            !isPendingFreshForTransaction({
                record,
                transaction,
            })
        );
    });
    const result: ClassifyAccountNowResult = {
        accountId: input.accountId,
        categoryCount: 0,
        eligibleCount: eligibleTransactions.length,
        errorCount: 0,
        errors: [],
        noSuggestionCount: 0,
        savedCount: 0,
        skippedCount: eligibleTransactions.length - transactionsToClassify.length,
    };

    if (transactionsToClassify.length === 0) {
        return result;
    }

    const classificationContext =
        await loadTransactionClassificationPreloadedRunContext(input.ledgerId);

    for (const transactionIds of chunkTransactionIds(
        transactionsToClassify.map((transaction) => transaction.transactionId),
    )) {
        try {
            const suggestions =
                await generateTransactionClassificationSuggestionsForPreloadedRun(
                    input.ledgerId,
                    {
                        context: classificationContext,
                        transactionIds,
                        transactions: transactionsToClassify,
                    },
                );

            const savedSuggestions = await putPendingSuggestions({
                accountId: input.accountId,
                ledgerId: input.ledgerId,
                modelId: suggestions.modelId,
                promptVersion: suggestions.promptVersion,
                source,
                suggestions: suggestions.suggestions,
            });

            for (const suggestion of savedSuggestions) {
                result.savedCount += 1;

                if (suggestion.type === "category") {
                    result.categoryCount += 1;
                } else {
                    result.noSuggestionCount += 1;
                }
            }
        } catch (error) {
            result.errorCount += transactionIds.length;
            result.errors.push(getErrorMessage(error));
        }
    }

    return result;
}

export async function classifyLedgerNow(input: {
    ledgerId: string;
    source?: TransactionClassificationPendingSource;
}): Promise<ClassifyLedgerNowResult> {
    const { entities } = getBudgetedSchema();
    const accounts = await queryAllPages(
        entities.accounts.query.byAccount({ ledgerId: input.ledgerId }),
    );
    const result: ClassifyLedgerNowResult = {
        accountCount: accounts.length,
        categoryCount: 0,
        eligibleCount: 0,
        errorCount: 0,
        errors: [],
        noSuggestionCount: 0,
        savedCount: 0,
        skippedCount: 0,
    };

    for (const account of accounts) {
        const accountResult = await classifyAccountNow({
            accountId: account.accountId,
            ledgerId: input.ledgerId,
            source: input.source ?? "background",
        });

        result.categoryCount += accountResult.categoryCount;
        result.eligibleCount += accountResult.eligibleCount;
        result.errorCount += accountResult.errorCount;
        result.errors.push(...accountResult.errors);
        result.noSuggestionCount += accountResult.noSuggestionCount;
        result.savedCount += accountResult.savedCount;
        result.skippedCount += accountResult.skippedCount;
    }

    return result;
}

export async function applyTransactionClassificationPending(input: {
    actorUserId: string;
    fieldSelection?: Omit<
        TransactionClassificationFieldSelection,
        "transactionId"
    >;
    ledgerId: string;
    mutationId?: string;
    transactionId: string;
}): Promise<{
    appliedCount: number;
    workspaceChanges: WorkspaceMutationChangeInput[];
}> {
    const { record, suggestion, transaction } = await getFreshPendingSuggestion({
        ledgerId: input.ledgerId,
        transactionId: input.transactionId,
    });

    if (suggestion.type === "noSuggestion") {
        throw new HttpError(
            422,
            "classification_no_suggestion",
            "No-suggestion results cannot be applied.",
        );
    }

    const workspaceChanges =
        await applyTransactionClassificationSuggestionToTransaction({
            actorUserId: input.actorUserId,
            fieldSelection: {
                applySuggestedMemo: Boolean(
                    input.fieldSelection?.applySuggestedMemo,
                ),
                applySuggestedPayee: Boolean(
                    input.fieldSelection?.applySuggestedPayee,
                ),
                transactionId: input.transactionId,
            },
            ledgerId: input.ledgerId,
            modelId: record.modelId,
            mutationId: input.mutationId,
            suggestion,
            transaction,
        });

    try {
        await deletePendingRecord(input.ledgerId, input.transactionId);
    } catch (error) {
        console.error(error);
    }

    return {
        appliedCount: 1,
        workspaceChanges,
    };
}

export async function rejectTransactionClassificationPending(input: {
    ledgerId: string;
    transactionId: string;
}) {
    const { record } = await getFreshPendingSuggestion({
        ledgerId: input.ledgerId,
        transactionId: input.transactionId,
    });
    const now = new Date().toISOString();
    const rejectedRecord = {
        ...record,
        rejectedAt: now,
        status: "rejected" as const,
        updatedAt: now,
    } satisfies TransactionClassificationPendingRecord;
    const { entities } = getBudgetedSchema();

    await entities.transactionClassificationPending.put(rejectedRecord).go();

    return {
        pending: toPendingPublic(rejectedRecord),
    };
}
