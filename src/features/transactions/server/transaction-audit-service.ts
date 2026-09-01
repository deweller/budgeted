import { ulid } from "ulid";

import { listPlaidTransactionSyncsForTransaction } from "@/features/plaid/server/plaid-transaction-sync-record-service";
import { listTransactionChildren } from "@/features/transactions/server/transaction-child-service";
import { getBudgetedSchema } from "@/lib/db/schema";
import { stableStringify } from "@/lib/workspace/revision";

const AUDIT_JSON_MAX_LENGTH = 120_000;

export type TransactionAuditAction =
    | "bulkDelete"
    | "create"
    | "delete"
    | "importOrSync"
    | "lock"
    | "memoUpdate"
    | "merge"
    | "reconcile"
    | "rewrite"
    | "unlock"
    | "update"
    | "void";

export type TransactionAuditSource =
    | "accountDeleteRewrite"
    | "amazonOrders"
    | "aiClassification"
    | "categoryDeleteRewrite"
    | "manual"
    | "merge"
    | "plaidSync"
    | "system"
    | "venmoEmail";

export type TransactionAuditContext = {
    action?: TransactionAuditAction;
    actorUserId?: string;
    source?: TransactionAuditSource;
    suppress?: boolean;
};

export type TransactionAuditAggregate = {
    ledgerPostings: unknown[];
    plaidTransactionSyncs: unknown[];
    transaction: unknown;
    transactionLines: unknown[];
};

export type TransactionAuditLogInput = {
    action: TransactionAuditAction;
    actorUserId?: string;
    after?: TransactionAuditAggregate | null;
    before?: TransactionAuditAggregate | null;
    ledgerId: string;
    source: TransactionAuditSource;
    summary: Record<string, unknown>;
    transactionId?: string;
    transactionIds?: string[];
};

export function createTransactionAuditLogRecord(
    input: TransactionAuditLogInput,
) {
    const occurredAt = new Date().toISOString();

    return {
        action: input.action,
        actorUserId: input.actorUserId,
        afterJson: serializeAuditValue(input.after),
        auditLogId: ulid(),
        beforeJson: serializeAuditValue(input.before),
        ledgerId: input.ledgerId,
        occurredAt,
        source: input.source,
        summaryJson: stableStringify(input.summary),
        transactionId: input.transactionId,
        transactionIdsJson: input.transactionIds
            ? stableStringify(input.transactionIds)
            : undefined,
    };
}

function serializeAuditValue(value: unknown) {
    if (value === null || value === undefined) {
        return undefined;
    }

    const serialized = stableStringify(value);

    if (serialized.length <= AUDIT_JSON_MAX_LENGTH) {
        return serialized;
    }

    return stableStringify({
        omitted: true,
        originalLength: serialized.length,
        reason: "Transaction audit payload exceeded the storage limit.",
    });
}

export function createTransactionAuditAggregate(input: {
    ledgerPostings?: unknown[];
    plaidTransactionSyncs?: unknown[];
    transaction: unknown;
    transactionLines?: unknown[];
}): TransactionAuditAggregate {
    return {
        ledgerPostings: input.ledgerPostings ?? [],
        plaidTransactionSyncs: input.plaidTransactionSyncs ?? [],
        transaction: input.transaction,
        transactionLines: input.transactionLines ?? [],
    };
}

export async function captureTransactionAuditAggregate<
    TTransaction extends {
        plaidTransactionSyncId?: string;
        transactionId: string;
    },
>(input: {
    ledgerId: string;
    transaction: TTransaction;
}): Promise<TransactionAuditAggregate> {
    const [children, plaidTransactionSyncs] = await Promise.all([
        listTransactionChildren(input.ledgerId, input.transaction.transactionId),
        listPlaidTransactionSyncsForTransaction(
            input.ledgerId,
            input.transaction.transactionId,
            input.transaction.plaidTransactionSyncId,
        ),
    ]);

    return createTransactionAuditAggregate({
        ledgerPostings: children.postings,
        plaidTransactionSyncs,
        transaction: input.transaction,
        transactionLines: children.lines,
    });
}

export async function writeTransactionAuditLog(
    input: TransactionAuditLogInput,
) {
    const { entities } = getBudgetedSchema();

    await entities.transactionAuditLogs
        .put(createTransactionAuditLogRecord(input))
        .go();
}

export async function recordTransactionAuditLog(
    input: TransactionAuditLogInput & { suppress?: boolean },
) {
    if (input.suppress) {
        return;
    }

    try {
        await writeTransactionAuditLog(input);
    } catch (error) {
        console.error(error);
    }
}
