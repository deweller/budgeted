import { listPlaidTransactionSyncsForTransaction } from "@/features/plaid/server/plaid-transaction-sync-record-service";
import {
    isUncategorizedAccountMovementLine,
    toDisplayTransactionLineCategoryId,
} from "@/features/transactions/models/transaction-line-normalization";
import { hasTransferTransactionLine } from "@/features/transactions/models/transaction-shape";
import {
    toPublicTransactionLineRecord,
    type PersistedTransactionLine,
} from "@/features/transactions/server/transaction-line-service";
import { writeChunkedRecords } from "@/lib/db/chunked-write";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { normalizeOptionalString } from "@/lib/strings";
import type {
    WorkspacePlaidTransactionSyncRecord,
    WorkspaceTransactionRecord,
} from "@/lib/workspace/sync-types";

export const TRANSACTION_CLASSIFICATION_SOURCE_INDEX_VERSION = "2";
export const TRANSACTION_CLASSIFICATION_SOURCE_WRITE_CONCURRENCY = 10;

export type TransactionClassificationSourceCategoryAssignment = {
    amountCents: number;
    categoryId: string;
};

export type TransactionClassificationSourceRecord = {
    accountId: string;
    amountCents: number;
    categoryAssignmentsJson: string;
    createdAt: string;
    hasMemo: boolean;
    indexVersion: string;
    ledgerId: string;
    memo?: string;
    normalizedPlaidOriginalDescription?: string;
    normalizedPayee?: string;
    normalizedPlaidCategoryText?: string;
    normalizedPlaidMerchantName?: string;
    normalizedPlaidName?: string;
    normalizedPlaidPfcDetailed?: string;
    normalizedPlaidPfcPrimary?: string;
    occurredAt: string;
    payee?: string;
    plaidCategoryText?: string;
    plaidMerchantName?: string;
    plaidName?: string;
    plaidOriginalDescription?: string;
    plaidPfcDetailed?: string;
    plaidPfcPrimary?: string;
    sourceUpdatedAt: string;
    transactionId: string;
    updatedAt: string;
};

export type TransactionClassificationSourceSnapshot = {
    records: TransactionClassificationSourceRecord[];
};

export function normalizeTransactionClassificationSourceText(
    value?: string | null,
) {
    return (normalizeOptionalString(value) ?? "")
        .toLocaleLowerCase()
        .replaceAll(/[^a-z0-9]+/g, " ")
        .trim();
}

export function parseTransactionClassificationSourceCategories(
    record: Pick<TransactionClassificationSourceRecord, "categoryAssignmentsJson">,
) {
    try {
        const parsed = JSON.parse(record.categoryAssignmentsJson) as unknown;

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(
            (value): value is TransactionClassificationSourceCategoryAssignment =>
                Boolean(
                    value &&
                        typeof value === "object" &&
                        typeof Reflect.get(value, "categoryId") === "string" &&
                        typeof Reflect.get(value, "amountCents") === "number",
                ),
        );
    } catch {
        return [];
    }
}

function getCategoryAssignments(lines: PersistedTransactionLine[]) {
    return lines.flatMap((line) => {
        const categoryId = toDisplayTransactionLineCategoryId(line.categoryId);

        return categoryId
            ? [{ amountCents: line.amountCents, categoryId }]
            : [];
    });
}

export function isTransactionClassificationSourceEligible(input: {
    lines: PersistedTransactionLine[];
    transaction: WorkspaceTransactionRecord;
}) {
    return (
        input.transaction.kind === "standard" &&
        input.transaction.status !== "voided" &&
        input.transaction.displayAmountCents !== 0 &&
        !hasTransferTransactionLine({ lines: input.lines }) &&
        !input.lines.some(isUncategorizedAccountMovementLine) &&
        getCategoryAssignments(input.lines).length > 0
    );
}

function getSourceUpdatedAt(input: {
    plaidSync?: WorkspacePlaidTransactionSyncRecord;
    transaction: WorkspaceTransactionRecord;
}) {
    return input.plaidSync?.updatedAt &&
        input.plaidSync.updatedAt > input.transaction.updatedAt
        ? input.plaidSync.updatedAt
        : input.transaction.updatedAt;
}

export function buildTransactionClassificationSourceRecord(input: {
    ledgerId: string;
    lines: PersistedTransactionLine[];
    now?: string;
    plaidSync?: WorkspacePlaidTransactionSyncRecord;
    transaction: WorkspaceTransactionRecord;
}): TransactionClassificationSourceRecord | null {
    if (!isTransactionClassificationSourceEligible(input)) {
        return null;
    }

    const now = input.now ?? new Date().toISOString();
    const memo = normalizeOptionalString(input.transaction.memo);
    const payee = normalizeOptionalString(input.transaction.payee);
    const plaidCategoryText = normalizeOptionalString(input.plaidSync?.categoryText);
    const plaidMerchantName = normalizeOptionalString(input.plaidSync?.merchantName);
    const plaidName = normalizeOptionalString(input.plaidSync?.name);
    const plaidOriginalDescription = normalizeOptionalString(
        input.plaidSync?.originalDescription,
    );
    const plaidPfcDetailed = normalizeOptionalString(
        input.plaidSync?.personalFinanceCategoryDetailed,
    );
    const plaidPfcPrimary = normalizeOptionalString(
        input.plaidSync?.personalFinanceCategoryPrimary,
    );

    return {
        accountId: input.transaction.referenceAccountId,
        amountCents: input.transaction.displayAmountCents,
        categoryAssignmentsJson: JSON.stringify(getCategoryAssignments(input.lines)),
        createdAt: now,
        hasMemo: Boolean(memo),
        indexVersion: TRANSACTION_CLASSIFICATION_SOURCE_INDEX_VERSION,
        ledgerId: input.ledgerId,
        memo,
        normalizedPayee:
            normalizeTransactionClassificationSourceText(payee) || undefined,
        normalizedPlaidOriginalDescription:
            normalizeTransactionClassificationSourceText(
                plaidOriginalDescription,
            ) || undefined,
        normalizedPlaidCategoryText:
            normalizeTransactionClassificationSourceText(plaidCategoryText) ||
            undefined,
        normalizedPlaidMerchantName:
            normalizeTransactionClassificationSourceText(plaidMerchantName) ||
            undefined,
        normalizedPlaidName:
            normalizeTransactionClassificationSourceText(plaidName) || undefined,
        normalizedPlaidPfcDetailed:
            normalizeTransactionClassificationSourceText(plaidPfcDetailed) ||
            undefined,
        normalizedPlaidPfcPrimary:
            normalizeTransactionClassificationSourceText(plaidPfcPrimary) ||
            undefined,
        occurredAt: input.transaction.occurredAt,
        payee,
        plaidCategoryText,
        plaidMerchantName,
        plaidName,
        plaidOriginalDescription,
        plaidPfcDetailed,
        plaidPfcPrimary,
        sourceUpdatedAt: getSourceUpdatedAt(input),
        transactionId: input.transaction.transactionId,
        updatedAt: now,
    };
}

async function getActivePlaidSync(input: {
    ledgerId: string;
    transaction: WorkspaceTransactionRecord;
}) {
    if (!input.transaction.plaidTransactionSyncId) {
        return undefined;
    }

    const records = await listPlaidTransactionSyncsForTransaction(
        input.ledgerId,
        input.transaction.transactionId,
        input.transaction.plaidTransactionSyncId,
    );

    return records.find(
        (record) =>
            record.status === "active" &&
            record.plaidTransactionSyncId ===
                input.transaction.plaidTransactionSyncId,
    );
}

export async function listTransactionClassificationSourceRecords(
    ledgerId: string,
) {
    const { entities } = getBudgetedSchema();

    return queryAllPages(
        entities.transactionClassificationSources.query.bySource({ ledgerId }),
        { consistent: true },
    ) as Promise<TransactionClassificationSourceRecord[]>;
}

export async function deleteTransactionClassificationSourceRecord(input: {
    ledgerId: string;
    transactionId: string;
}) {
    const { entities } = getBudgetedSchema();

    await entities.transactionClassificationSources
        .delete({ ledgerId: input.ledgerId, transactionId: input.transactionId })
        .go();
}

export async function syncTransactionClassificationSourceForTransaction(input: {
    ledgerId: string;
    lines: PersistedTransactionLine[];
    transaction: WorkspaceTransactionRecord;
}) {
    const publicLines = input.lines.map(toPublicTransactionLineRecord);
    const plaidSync = await getActivePlaidSync({
        ledgerId: input.ledgerId,
        transaction: input.transaction,
    });
    const record = buildTransactionClassificationSourceRecord({
        ...input,
        lines: publicLines,
        plaidSync,
    });

    if (!record) {
        await deleteTransactionClassificationSourceRecord({
            ledgerId: input.ledgerId,
            transactionId: input.transaction.transactionId,
        });
        return { plaidSync, record: null };
    }

    const { entities } = getBudgetedSchema();
    const existing = await entities.transactionClassificationSources
        .get({ ledgerId: input.ledgerId, transactionId: record.transactionId })
        .go();

    await entities.transactionClassificationSources
        .put({
            ...record,
            createdAt:
                (existing.data as TransactionClassificationSourceRecord | null)
                    ?.createdAt ?? record.createdAt,
        })
        .go();

    return { plaidSync, record };
}

export async function loadTransactionClassificationSourceSnapshot(
    ledgerId: string,
): Promise<TransactionClassificationSourceSnapshot> {
    const { entities } = getBudgetedSchema();
    const [transactions, lines, plaidSyncs] = await Promise.all([
        queryAllPages(entities.transactions.query.byTransaction({ ledgerId }), {
            consistent: true,
        }) as Promise<WorkspaceTransactionRecord[]>,
        queryAllPages(entities.transactionLines.query.byLine({ ledgerId }), {
            consistent: true,
        }) as Promise<PersistedTransactionLine[]>,
        queryAllPages(entities.plaidTransactionSyncs.query.bySync({ ledgerId }), {
            consistent: true,
        }) as Promise<WorkspacePlaidTransactionSyncRecord[]>,
    ]);
    const linesByTransactionId = new Map<string, PersistedTransactionLine[]>();
    const plaidSyncById = new Map(
        plaidSyncs
            .filter((record) => record.status === "active")
            .map((record) => [record.plaidTransactionSyncId, record]),
    );

    for (const line of lines.map(toPublicTransactionLineRecord)) {
        const current = linesByTransactionId.get(line.transactionId) ?? [];
        current.push(line);
        linesByTransactionId.set(line.transactionId, current);
    }

    return {
        records: transactions.flatMap((transaction) => {
            const record = buildTransactionClassificationSourceRecord({
                ledgerId,
                lines: linesByTransactionId.get(transaction.transactionId) ?? [],
                plaidSync: transaction.plaidTransactionSyncId
                    ? plaidSyncById.get(transaction.plaidTransactionSyncId)
                    : undefined,
                transaction,
            });

            return record ? [record] : [];
        }),
    };
}

function isSourceRecordCurrent(input: {
    desired: TransactionClassificationSourceRecord;
    existing?: TransactionClassificationSourceRecord;
}) {
    return Boolean(
        input.existing &&
            input.existing.indexVersion ===
                TRANSACTION_CLASSIFICATION_SOURCE_INDEX_VERSION &&
            input.existing.sourceUpdatedAt === input.desired.sourceUpdatedAt,
    );
}

export function getTransactionClassificationSourceStatus(input: {
    existingRecords: TransactionClassificationSourceRecord[];
    snapshot: TransactionClassificationSourceSnapshot;
}) {
    const existingById = new Map(
        input.existingRecords.map((record) => [record.transactionId, record]),
    );
    const desiredIds = new Set(
        input.snapshot.records.map((record) => record.transactionId),
    );

    return {
        indexedSourceCount: input.existingRecords.length,
        sourceCount: input.snapshot.records.length,
        sourceOrphanCount: input.existingRecords.filter(
            (record) => !desiredIds.has(record.transactionId),
        ).length,
        sourceStaleCount: input.snapshot.records.filter(
            (record) =>
                !isSourceRecordCurrent({
                    desired: record,
                    existing: existingById.get(record.transactionId),
                }),
        ).length,
    };
}

export async function reconcileTransactionClassificationSourceRecords(input: {
    existingRecords?: TransactionClassificationSourceRecord[];
    ledgerId: string;
    snapshot: TransactionClassificationSourceSnapshot;
}) {
    const existingRecords =
        input.existingRecords ??
        (await listTransactionClassificationSourceRecords(input.ledgerId));
    const existingById = new Map(
        existingRecords.map((record) => [record.transactionId, record]),
    );
    const desiredById = new Map(
        input.snapshot.records.map((record) => [record.transactionId, record]),
    );
    const orphanRecords = existingRecords.filter(
        (record) => !desiredById.has(record.transactionId),
    );
    const staleRecords = input.snapshot.records.filter(
        (record) =>
            !isSourceRecordCurrent({
                desired: record,
                existing: existingById.get(record.transactionId),
            }),
    );
    const { entities } = getBudgetedSchema();

    await writeChunkedRecords(
        orphanRecords,
        (record) =>
            entities.transactionClassificationSources
                .delete({
                    ledgerId: record.ledgerId,
                    transactionId: record.transactionId,
                })
                .go(),
        TRANSACTION_CLASSIFICATION_SOURCE_WRITE_CONCURRENCY,
    );
    await writeChunkedRecords(
        staleRecords,
        (record) =>
            entities.transactionClassificationSources
                .put({
                    ...record,
                    createdAt:
                        existingById.get(record.transactionId)?.createdAt ??
                        record.createdAt,
                })
                .go(),
        TRANSACTION_CLASSIFICATION_SOURCE_WRITE_CONCURRENCY,
    );

    return {
        createdCount: staleRecords.filter(
            (record) => !existingById.has(record.transactionId),
        ).length,
        deletedOrphanCount: orphanRecords.length,
        refreshedCount: staleRecords.filter((record) =>
            existingById.has(record.transactionId),
        ).length,
        sourceCount: input.snapshot.records.length,
    };
}
