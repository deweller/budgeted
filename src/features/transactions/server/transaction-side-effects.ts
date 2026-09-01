import {
    deleteTransactionClassificationEmbeddingForSource,
    syncTransactionClassificationEmbeddingForSourceRecord,
} from "@/features/transaction-classification/server/transaction-classification-embedding-service";
import {
    deleteTransactionClassificationSourceRecord,
    syncTransactionClassificationSourceForTransaction,
} from "@/features/transaction-classification/server/transaction-classification-source-service";
import type {
    TransactionAuditAction,
    TransactionAuditContext,
    TransactionAuditSource,
} from "@/features/transactions/server/transaction-audit-service";
import type { PersistedTransactionLine } from "@/features/transactions/server/transaction-line-service";
import type { TransactionRecord } from "@/features/transactions/server/transaction-write-model";

export async function syncTransactionClassificationCaches(input: {
    ledgerId: string;
    lines: PersistedTransactionLine[];
    transaction: TransactionRecord;
}) {
    try {
        const { record } =
            await syncTransactionClassificationSourceForTransaction(input);

        await syncTransactionClassificationEmbeddingForSourceRecord({
            ledgerId: input.ledgerId,
            record,
            transactionId: input.transaction.transactionId,
        });
    } catch (error) {
        console.error(error);
    }
}

export async function deleteTransactionClassificationCaches(input: {
    ledgerId: string;
    transactionId: string;
}) {
    await Promise.all([
        deleteTransactionClassificationEmbeddingForSource({
            ledgerId: input.ledgerId,
            sourceId: input.transactionId,
            sourceType: "transaction",
        }),
        deleteTransactionClassificationSourceRecord(input),
    ]);
}

export async function deleteTransactionClassificationCachesSafely(input: {
    ledgerId: string;
    transactionId: string;
}) {
    try {
        await deleteTransactionClassificationCaches(input);
    } catch (error) {
        console.error(error);
    }
}

export function resolveTransactionAuditSource(input: {
    audit?: TransactionAuditContext;
    transactionSource?: "manual" | "plaid" | "venmo";
}): TransactionAuditSource {
    if (input.audit?.source) {
        return input.audit.source;
    }

    if (input.transactionSource === "plaid") return "plaidSync";
    if (input.transactionSource === "venmo") return "venmoEmail";
    return "manual";
}

export function getTransactionAuditAction(input: {
    audit?: TransactionAuditContext;
    defaultAction: TransactionAuditAction;
}) {
    return input.audit?.action ?? input.defaultAction;
}
