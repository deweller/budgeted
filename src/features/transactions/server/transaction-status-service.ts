import { listPlaidTransactionSyncsForTransaction } from "@/features/plaid/server/plaid-transaction-sync-record-service";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { normalizeTransactionIds } from "@/features/transactions/models/transaction-ids";
import {
    createTransactionAuditLogRecord,
    createTransactionAuditAggregate,
    type TransactionAuditAction,
} from "@/features/transactions/server/transaction-audit-service";
import { listTransactionChildren } from "@/features/transactions/server/transaction-child-service";
import { getStoredTransaction } from "@/features/transactions/server/transaction-query-service";
import {
    attachTransactionAggregateMetadata,
    type TransactionRecord,
    type TransactionWithPostings,
} from "@/features/transactions/server/transaction-write-model";
import { commitAtomicWorkspaceMutation } from "@/features/workspace/server/workspace-atomic-commit";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import {
    findWorkspaceMutationBatch,
    type WorkspaceMutationChangeInput,
    type WorkspaceMutationOperation,
} from "@/features/workspace/server/workspace-sync-service";
import { HttpError } from "@/lib/api/errors";

export type MutableTransactionStatus = "cleared" | "reconciled";

type TransactionStatusAudit = {
    action?: TransactionAuditAction;
    actorUserId?: string;
    summary?: Record<string, unknown>;
};

export const TRANSACTION_STATUS_BATCH_SIZE = 40;

export type TransactionStatusBatchMutation = {
    mutationId: string;
    mutationType: string;
    transactionIds: string[];
};

function createTransactionIdSignature(transactionIds: readonly string[]) {
    return bytesToHex(sha256(utf8ToBytes(transactionIds.join("\u001f")))).slice(
        0,
        16,
    );
}

export function getTransactionStatusBatchMutations(input: {
    mutationId: string;
    status: MutableTransactionStatus;
    transactionIds: Iterable<string>;
}): TransactionStatusBatchMutation[] {
    const transactionIds = normalizeTransactionIds(input.transactionIds);

    return Array.from(
        { length: Math.ceil(transactionIds.length / TRANSACTION_STATUS_BATCH_SIZE) },
        (_, batchIndex) => {
            const batchTransactionIds = transactionIds.slice(
                batchIndex * TRANSACTION_STATUS_BATCH_SIZE,
                (batchIndex + 1) * TRANSACTION_STATUS_BATCH_SIZE,
            );
            const signature = createTransactionIdSignature(batchTransactionIds);

            return {
                mutationId: `${input.mutationId}:${input.status}:batch:${signature}`,
                mutationType: `transaction.status:${input.status}:batch`,
                transactionIds: batchTransactionIds,
            };
        },
    );
}

async function createTransactionStatusWrite(input: {
    audit?: TransactionStatusAudit;
    knownTransaction?: TransactionWithPostings;
    ledgerId: string;
    status: MutableTransactionStatus;
    transactionId: string;
}) {
    const transaction =
        input.knownTransaction ??
        (await getStoredTransaction(input.ledgerId, input.transactionId));

    if (transaction.status === "voided") {
        throw new HttpError(
            409,
            "transaction_voided",
            "Voided transactions cannot be locked or unlocked.",
        );
    }

    const shouldChange =
        input.status === "reconciled"
            ? transaction.status !== "reconciled"
            : transaction.status === "reconciled";

    if (!shouldChange) {
        return null;
    }

    const [children, plaidTransactionSyncs] = await Promise.all([
        input.knownTransaction
            ? Promise.resolve({
                  lines: input.knownTransaction.lines,
                  postings: input.knownTransaction.postings,
              })
            : listTransactionChildren(input.ledgerId, input.transactionId),
        listPlaidTransactionSyncsForTransaction(
            input.ledgerId,
            input.transactionId,
            transaction.plaidTransactionSyncId,
        ),
    ]);
    const record = {
        ...transaction,
        status: input.status,
        updatedAt: new Date().toISOString(),
    } satisfies TransactionRecord;

    attachTransactionAggregateMetadata({
        ledgerPostings: children.postings,
        plaidTransactionSyncs,
        record,
        transactionLines: children.lines,
    });

    const workspaceChange = createWorkspaceUpsertChange({
        entityId: record.transactionId,
        entityType: "transaction",
        previousRecord: transaction,
        record,
    });
    const auditRecord = createTransactionAuditLogRecord({
        action:
            input.audit?.action ??
            (input.status === "reconciled" ? "lock" : "unlock"),
        actorUserId: input.audit?.actorUserId,
        after: createTransactionAuditAggregate({
            ledgerPostings: children.postings,
            plaidTransactionSyncs,
            transaction: record,
            transactionLines: children.lines,
        }),
        before: createTransactionAuditAggregate({
            ledgerPostings: children.postings,
            plaidTransactionSyncs,
            transaction,
            transactionLines: children.lines,
        }),
        ledgerId: input.ledgerId,
        source: "manual",
        summary: {
            ...input.audit?.summary,
            status: input.status,
            transactionId: input.transactionId,
        },
        transactionId: input.transactionId,
    });
    return {
        auditRecord,
        previousRecord: transaction,
        record,
        workspaceChange,
    };
}

async function updateTransactionStatusBatch(input: {
    audit?: TransactionStatusAudit;
    candidateTransactionIds: ReadonlySet<string>;
    knownTransactionsById: ReadonlyMap<string, TransactionWithPostings>;
    ledgerId: string;
    skipExistingBatchLookup?: boolean;
    status: MutableTransactionStatus;
    workspaceMutation: TransactionStatusBatchMutation;
    workspaceMutationOperation?: WorkspaceMutationOperation;
}) {
    const existingBatch = input.skipExistingBatchLookup
        ? null
        : await findWorkspaceMutationBatch({
              ledgerId: input.ledgerId,
              mutationId: input.workspaceMutation.mutationId,
              mutationType: input.workspaceMutation.mutationType,
          });

    if (existingBatch) {
        return {
            updatedCount: Number(
                (existingBatch.response as { updatedCount?: unknown }).updatedCount ?? 0,
            ),
            workspaceChanges: existingBatch.changes,
        };
    }

    const writes = (
        await Promise.all(
            input.workspaceMutation.transactionIds
                .filter((transactionId) =>
                    input.candidateTransactionIds.has(transactionId),
                )
                .map((transactionId) =>
                    createTransactionStatusWrite({
                        audit: input.audit,
                        ledgerId: input.ledgerId,
                        knownTransaction: input.knownTransactionsById.get(
                            transactionId,
                        ),
                        status: input.status,
                        transactionId,
                    }),
                ),
        )
    ).filter((write) => write !== null);

    if (writes.length === 0) {
        return { updatedCount: 0, workspaceChanges: [] };
    }

    const result = await commitAtomicWorkspaceMutation({
        buildDomainItems: (entities) => [
            ...writes.flatMap((write) => [
                entities.transactions
                    .put(write.record)
                    .where((attributes, operations) =>
                        operations.eq(
                            attributes.updatedAt,
                            write.previousRecord.updatedAt,
                        ),
                    )
                    .commit(),
                entities.transactionAuditLogs.put(write.auditRecord).commit(),
            ]),
        ],
        changes: writes.map((write) => write.workspaceChange),
        domainItemCount: writes.length * 2,
        ledgerId: input.ledgerId,
        mutationId: input.workspaceMutation.mutationId,
        mutationType: input.workspaceMutation.mutationType,
        operation: input.workspaceMutationOperation,
        response: { updatedCount: writes.length },
    });

    return {
        updatedCount: Number(
            (result.response as { updatedCount?: unknown }).updatedCount ?? 0,
        ),
        workspaceChanges: result.workspaceChanges,
    };
}

export async function updateTransactionsStatusWithWorkspaceChanges(input: {
    actorUserId?: string;
    auditAction?: TransactionAuditAction;
    auditSummary?: Record<string, unknown>;
    ledgerId: string;
    mutationId: string;
    knownTransactions?: Iterable<TransactionWithPostings>;
    skipExistingBatchLookup?: boolean;
    status: MutableTransactionStatus;
    transactionIds: Iterable<string>;
    workspaceMutationTransactionIds?: Iterable<string>;
    workspaceMutationOperation?: WorkspaceMutationOperation;
}) {
    const transactionIds = normalizeTransactionIds(input.transactionIds);
    const workspaceMutationTransactionIds = normalizeTransactionIds(
        input.workspaceMutationTransactionIds ?? transactionIds,
    );
    const candidateTransactionIds = new Set(transactionIds);
    const knownTransactionsById = new Map(
        [...(input.knownTransactions ?? [])].map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );

    if (workspaceMutationTransactionIds.length === 0) {
        throw new HttpError(
            422,
            "transaction_status_required",
            "Select at least one transaction to lock or unlock.",
        );
    }

    const batches = getTransactionStatusBatchMutations({
        mutationId: input.mutationId,
        status: input.status,
        transactionIds: workspaceMutationTransactionIds,
    });

    if (input.workspaceMutationOperation && batches.length !== 1) {
        throw new Error(
            "A checkpointed transaction status update must fit in one batch.",
        );
    }
    const workspaceChanges: WorkspaceMutationChangeInput[] = [];
    let updatedCount = 0;

    for (const workspaceMutation of batches) {
        const result = await updateTransactionStatusBatch({
            audit: {
                action: input.auditAction,
                actorUserId: input.actorUserId,
                summary: input.auditSummary,
            },
            candidateTransactionIds,
            knownTransactionsById,
            ledgerId: input.ledgerId,
            skipExistingBatchLookup: input.skipExistingBatchLookup,
            status: input.status,
            workspaceMutation,
            workspaceMutationOperation: input.workspaceMutationOperation,
        });

        updatedCount += result.updatedCount;
        workspaceChanges.push(...result.workspaceChanges);
    }

    return { updatedCount, workspaceChanges };
}
