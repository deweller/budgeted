import { ulid } from "ulid";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { PlaidTransactionSyncRecord } from "@/features/plaid/server/plaid-service";
import {
    createRelinkedTransactionImportActivities,
    createReopenedTransactionImportActivities,
    listTransactionImportActivities,
} from "@/features/transaction-importers/server/transaction-import-activity-service";
import { TRANSACTION_IMPORTER_IDS } from "@/features/transaction-importers/models/transaction-importer-contract";
import {
    getPlaidTransactionSyncRecordsByIds,
    listPlaidTransactionSyncsForTransaction,
} from "@/features/plaid/server/plaid-transaction-sync-record-service";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import { createDeletionImpactSummary } from "@/features/shared/server/deletion-impact-service";
import { assertDeletionPreviewRevision } from "@/features/shared/server/deletion-policy-service";
import {
    countRecordGroups,
    createLedgerPostingRevision,
    createPlaidTransactionSyncRevision,
    createRecordGroupRevisions,
    createTransactionLineRevision,
    createTransactionRevision,
} from "@/features/shared/server/deletion-revision-service";
import type { TransactionInput } from "@/features/transactions/models/transaction-form";
import {
    toTransactionDateInputValue,
    toTransactionOccurredAt,
} from "@/features/transactions/models/transaction-date";
import { normalizeTransactionIds } from "@/features/transactions/models/transaction-ids";
import { financialMovementsMatch } from "@/features/transactions/models/transaction-lock";
import { getTransactionCategorizationEligibility } from "@/features/transactions/models/transaction-categorization";
import {
    findTransactionAutoMatches,
    type TransactionAutoMatchPair,
    type TransactionAutoMatchType,
} from "@/features/transactions/models/transaction-auto-match";
import {
    chooseTransactionMergeContent,
    chooseTransactionMergeSurvivor,
    selectDefinedTransactionMergeText,
    selectTransactionMergeMemo,
    transactionMergeStateHasMultipleLines,
    transactionMergeStateHasPlaidMetadata,
} from "@/features/transactions/models/transaction-merge-selection";
import { createTransactionAggregateRevision } from "@/features/transactions/models/transaction-aggregate-revision";
import {
    listTransactionAutoMatchRejections,
    type TransactionAutoMatchRejectionRecord,
} from "@/features/transactions/server/transaction-auto-match-rejection-service";
import type { PersistedPosting } from "@/features/transactions/server/posting-service";
import { createLedgerPostingRecords } from "@/features/transactions/server/posting-service";
import {
    listTransactionChildren,
    listTransactionChildrenByTransactionId,
    type TransactionChildRecords,
} from "@/features/transactions/server/transaction-child-service";
import {
    createTransactionAuditAggregate,
    recordTransactionAuditLog,
    type TransactionAuditContext,
    type TransactionAuditAggregate,
} from "@/features/transactions/server/transaction-audit-service";
import {
    createTransactionLineRecords,
    toTransactionLineInputs,
    type PersistedTransactionLine,
} from "@/features/transactions/server/transaction-line-service";
import {
    findStoredTransaction,
    getStoredTransaction,
    listStoredTransactionsByIds,
} from "@/features/transactions/server/transaction-query-service";
import { loadTransactionReferenceRecords } from "@/features/transactions/server/transaction-reference-service";
import {
    attachTransactionAggregateMetadata,
    resolveTransactionWriteModel as resolveLineTransaction,
    toPublicTransactionRecord,
    type TransactionDeletionState,
    type TransactionRecord,
    type TransactionWriteState,
} from "@/features/transactions/server/transaction-write-model";
import {
    createMergeWorkspaceChanges,
    createMovedPlaidTransactionSyncRecords,
    createTransactionDeleteWorkspaceChanges,
    createTransactionUpsertWorkspaceChanges,
    createTransactionWorkspaceUpsertChange as createWorkspaceUpsertChange,
} from "@/features/transactions/server/transaction-workspace-changes";
import {
    assertTransactionWriteItemCount,
    getTransactionDeletionStateItemCount,
    getTransactionWriteStateItemCount,
    persistTransactionDeletionStates as writeTransactionDeletionStates,
    persistTransactionWriteState as writeTransactionState,
} from "@/features/transactions/server/transaction-persistence";
import {
    deleteTransactionClassificationCachesSafely,
    getTransactionAuditAction,
    resolveTransactionAuditSource,
    syncTransactionClassificationCaches as trySyncTransactionClassificationCaches,
} from "@/features/transactions/server/transaction-side-effects";
import { HttpError } from "@/lib/api/errors";
import {
    createWorkspaceMutationOperation,
    findWorkspaceMutationBatch,
    findWorkspaceMutationOperation,
    persistWorkspaceMutationOperation,
    type WorkspaceMutationChangeInput,
    type WorkspaceMutationOperation,
} from "@/features/workspace/server/workspace-sync-service";
import type { AtomicWorkspaceMutationResult } from "@/features/workspace/server/workspace-atomic-commit";
import { normalizeOptionalString } from "@/lib/strings";
import {
    calculateWorkspaceRecordDigest,
    stableStringify,
} from "@/lib/workspace/revision";
import { getMonthlyPeriodId } from "@/modules/ledger";

export type TransactionWorkspaceMutation = {
    mutationId: string;
    mutationType: string;
};

async function createReopenedImportActivities(
    ledgerId: string,
    states: TransactionDeletionState[],
) {
    const transactionIds = new Set(
        states.map((state) => state.transaction.transactionId),
    );
    const activities = (await listTransactionImportActivities(ledgerId)).filter(
        (activity) =>
            activity.linkedTransactionId &&
            transactionIds.has(activity.linkedTransactionId),
    );

    return createReopenedTransactionImportActivities({
        activities,
        now: new Date().toISOString(),
    });
}

function assertTransactionIsNotLocked(
    transaction: Pick<TransactionRecord, "status">,
    operation: string,
) {
    if (transaction.status === "reconciled") {
        throw new HttpError(
            409,
            "transaction_locked",
            `Reconciled transactions must be unlocked before they can be ${operation}.`,
        );
    }
}

function assertTransactionsAreNotLocked(
    states: readonly TransactionDeletionState[],
    operation: string,
) {
    for (const state of states) {
        assertTransactionIsNotLocked(state.transaction, operation);
    }
}

function createAggregateFromTransactionState(input: {
    children: TransactionChildRecords;
    plaidTransactionSyncRecords?: PlaidTransactionSyncRecord[];
    transaction: TransactionRecord;
}): TransactionAuditAggregate {
    return createTransactionAuditAggregate({
        ledgerPostings: input.children.postings,
        plaidTransactionSyncs: input.plaidTransactionSyncRecords ?? [],
        transaction: input.transaction,
        transactionLines: input.children.lines,
    });
}

function buildTransactionDeletionImpact(input: {
    plaidTransactionSyncRecords?: PlaidTransactionSyncRecord[];
    postings: PersistedPosting[];
    lines: PersistedTransactionLine[];
    transaction: Awaited<ReturnType<typeof getStoredTransaction>>;
}): DeletionImpactSummary {
    const targetName = input.transaction.payee?.trim()
        ? input.transaction.payee
        : `${input.transaction.kind === "adjustment" ? "Adjustment" : "Standard"} transaction`;

    return createDeletionImpactSummary({
        target: {
            targetType: "transaction",
            targetId: input.transaction.transactionId,
            displayName: targetName,
            sectionId: "transactions",
        },
        targetUpdatedAt: input.transaction.updatedAt,
        dependentCounts: [
            { label: "Ledger postings", count: input.postings.length },
            { label: "Transaction lines", count: input.lines.length },
            {
                label: "Plaid transaction sync records",
                count: input.plaidTransactionSyncRecords?.length ?? 0,
            },
        ],
        dependentRevisions: [
            ...input.postings.map(createLedgerPostingRevision),
            ...input.lines.map(createTransactionLineRevision),
            ...(input.plaidTransactionSyncRecords ?? []).map(
                createPlaidTransactionSyncRevision,
            ),
        ],
        affectedPeriods: [input.transaction.periodId],
        crossAreaEffects: [
            "Account balances will update from the remaining saved transactions.",
            "Budget availability and reporting will be recalculated for the affected period.",
        ],
    });
}

function buildBulkTransactionDeletionImpact(
    states: TransactionDeletionState[],
): DeletionImpactSummary {
    const transactionIds = states
        .map((state) => state.transaction.transactionId)
        .sort((left, right) => left.localeCompare(right));
    const postingGroups = states.map((state) => state.children.postings);
    const lineGroups = states.map((state) => state.children.lines);
    const plaidTransactionSyncGroups = states.map(
        (state) => state.plaidTransactionSyncRecords,
    );
    const transactionLabel =
        states.length === 1 ? "1 transaction" : `${states.length} transactions`;

    return createDeletionImpactSummary({
        target: {
            targetType: "transaction",
            targetId: `bulk:${transactionIds.join("|")}`,
            displayName: transactionLabel,
            sectionId: "transactions",
        },
        dependentCounts: [
            { label: "Transactions", count: states.length },
            {
                label: "Ledger postings",
                count: countRecordGroups(postingGroups),
            },
            {
                label: "Transaction lines",
                count: countRecordGroups(lineGroups),
            },
            {
                label: "Plaid transaction sync records",
                count: countRecordGroups(plaidTransactionSyncGroups),
            },
        ],
        dependentRevisions: [
            ...states.map((state) => createTransactionRevision(state.transaction)),
            ...createRecordGroupRevisions(postingGroups, createLedgerPostingRevision),
            ...createRecordGroupRevisions(lineGroups, createTransactionLineRevision),
            ...createRecordGroupRevisions(
                plaidTransactionSyncGroups,
                createPlaidTransactionSyncRevision,
            ),
        ],
        affectedPeriods: states.map((state) => state.transaction.periodId),
        crossAreaEffects: [
            "Account balances will update from the remaining saved transactions.",
            "Budget availability and reporting will be recalculated for the affected periods.",
        ],
    });
}

async function getTransactionDeletionStates(
    ledgerId: string,
    transactionIds: string[],
) {
    const uniqueTransactionIds = normalizeTransactionIds(transactionIds);

    if (uniqueTransactionIds.length === 0) {
        throw new HttpError(
            422,
            "transaction_delete_required",
            "Select at least one transaction to delete.",
        );
    }

    return Promise.all(
        uniqueTransactionIds.map((transactionId) =>
            getTransactionDeletionState(ledgerId, transactionId),
        ),
    );
}

async function getTransactionDeletionState(
    ledgerId: string,
    transactionId: string,
): Promise<TransactionDeletionState> {
    const transaction = await getStoredTransaction(ledgerId, transactionId);
    const [children, plaidTransactionSyncRecords] = await Promise.all([
        listTransactionChildren(ledgerId, transactionId),
        listPlaidTransactionSyncsForTransaction(
            ledgerId,
            transactionId,
            transaction.plaidTransactionSyncId,
        ),
    ]);

    return { children, plaidTransactionSyncRecords, transaction };
}

type TransactionDeletionWriteChunk = {
    autoMatchRejections: TransactionAutoMatchRejectionRecord[];
    states: TransactionDeletionState[];
};

function chunkTransactionDeletionStates(input: {
    autoMatchRejections: TransactionAutoMatchRejectionRecord[];
    reservedItemCount: number;
    states: TransactionDeletionState[];
}) {
    const capacity = 100 - input.reservedItemCount;

    if (capacity <= 0) {
        throw new Error("Transaction write chunks require available capacity.");
    }

    const chunks: TransactionDeletionWriteChunk[] = [];
    let currentChunk: TransactionDeletionWriteChunk = {
        autoMatchRejections: [],
        states: [],
    };
    let currentItemCount = 0;

    const pushCurrentChunk = () => {
        if (
            currentChunk.states.length > 0 ||
            currentChunk.autoMatchRejections.length > 0
        ) {
            chunks.push(currentChunk);
        }

        currentChunk = { autoMatchRejections: [], states: [] };
        currentItemCount = 0;
    };

    for (const state of input.states) {
        const stateItemCount =
            getTransactionDeletionStateItemCount(state) +
            TRANSACTION_IMPORTER_IDS.length;
        assertTransactionWriteItemCount(stateItemCount + input.reservedItemCount);

        if (currentItemCount > 0 && currentItemCount + stateItemCount > capacity) {
            pushCurrentChunk();
        }

        currentChunk.states.push(state);
        currentItemCount += stateItemCount;
    }

    for (const rejection of input.autoMatchRejections) {
        if (currentItemCount + 1 > capacity) {
            pushCurrentChunk();
        }

        currentChunk.autoMatchRejections.push(rejection);
        currentItemCount += 1;
    }

    pushCurrentChunk();

    return chunks;
}

function chunkTransactionWriteStates(
    states: TransactionWriteState[],
    reservedItemCount: number,
) {
    const chunks: TransactionWriteState[][] = [];
    let currentChunk: TransactionWriteState[] = [];
    let currentItemCount = reservedItemCount;

    for (const state of states) {
        const stateItemCount = getTransactionWriteStateItemCount(state);

        assertTransactionWriteItemCount(stateItemCount + reservedItemCount);

        if (currentChunk.length > 0 && currentItemCount + stateItemCount > 100) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentItemCount = reservedItemCount;
        }

        currentChunk.push(state);
        currentItemCount += stateItemCount;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

async function upsertTransactionInternal(
    ledgerId: string,
    input: TransactionInput & {
        allowCreateWithTransactionId?: boolean;
        audit?: TransactionAuditContext;
        plaidTransactionSyncId?: string | null;
        plaidTransactionSyncRecordsToPut?: PlaidTransactionSyncRecord[];
        publishWorkspaceChanges?: boolean;
        source?: "manual" | "plaid" | "venmo";
        deferWrite?: boolean;
        transactionId?: string;
        workspaceMutation?: TransactionWorkspaceMutation;
    },
) {
    const existing = input.transactionId
        ? await findStoredTransaction(ledgerId, input.transactionId)
        : null;

    if (input.transactionId && !existing && !input.allowCreateWithTransactionId) {
        throw new HttpError(
            404,
            "transaction_missing",
            "The transaction could not be found.",
        );
    }

    if (existing?.status === "voided") {
        throw new HttpError(
            409,
            "transaction_voided",
            "Voided transactions cannot be edited.",
        );
    }

    let occurredAt: string;

    try {
        occurredAt = toTransactionOccurredAt(input.occurredAt);
    } catch {
        throw new HttpError(
            422,
            "validation_error",
            "Transaction dates must be valid calendar dates.",
        );
    }

    const periodId = getMonthlyPeriodId(occurredAt);
    const transactionId =
        existing?.transactionId ?? input.transactionId ?? ulid();
    const now = new Date().toISOString();
    const kind = input.kind ?? existing?.kind ?? "standard";
    const references = await loadTransactionReferenceRecords(ledgerId);
    const resolution = await resolveLineTransaction({
        accountId: input.accountId ?? existing?.referenceAccountId,
        kind,
        lines: input.lines,
        ledgerId,
        references,
    });
    const [existingChildren, existingPlaidTransactionSyncRecords] =
        await Promise.all([
            existing
                ? listTransactionChildren(ledgerId, transactionId)
                : Promise.resolve({ postings: [], lines: [] }),
            listPlaidTransactionSyncsForTransaction(
                ledgerId,
                transactionId,
                input.plaidTransactionSyncId ?? existing?.plaidTransactionSyncId,
            ),
        ]);
    const previousPlaidTransactionSyncRecords = input
        .plaidTransactionSyncRecordsToPut?.length
        ? await getPlaidTransactionSyncRecordsByIds(
                ledgerId,
                input.plaidTransactionSyncRecordsToPut.map(
                    (record) => record.plaidTransactionSyncId,
                ),
            )
        : [];
    const previousPlaidTransactionSyncRecordById = new Map(
        [
            ...existingPlaidTransactionSyncRecords,
            ...previousPlaidTransactionSyncRecords,
        ].map((record) => [record.plaidTransactionSyncId, record]),
    );
    const finalPlaidTransactionSyncRecordById = new Map(
        existingPlaidTransactionSyncRecords.map((record) => [
            record.plaidTransactionSyncId,
            record,
        ]),
    );

    for (const syncRecord of input.plaidTransactionSyncRecordsToPut ?? []) {
        const previousRecord = previousPlaidTransactionSyncRecordById.get(
            syncRecord.plaidTransactionSyncId,
        );

        if (
            previousRecord &&
            previousRecord.transactionId !== syncRecord.transactionId
        ) {
            throw new Error(
                "Plaid transaction sync records must be moved with both transaction aggregates.",
            );
        }

        finalPlaidTransactionSyncRecordById.set(
            syncRecord.plaidTransactionSyncId,
            syncRecord,
        );
    }
    const finalPlaidTransactionSyncRecords = Array.from(
        finalPlaidTransactionSyncRecordById.values(),
    );
    const record = {
        transactionId,
        ledgerId,
        occurredAt,
        enteredAt: existing?.enteredAt ?? now,
        kind,
        payee: normalizeOptionalString(input.payee),
        memo: normalizeOptionalString(input.memo),
        referenceAccountId: resolution.referenceAccountId,
        referenceCategoryId: resolution.referenceCategoryId,
        displayAmountCents: resolution.displayAmountCents,
        plaidTransactionSyncId:
            input.plaidTransactionSyncId === null
                ? undefined
                : (input.plaidTransactionSyncId ?? existing?.plaidTransactionSyncId),
        source: input.source ?? existing?.source ?? "manual",
        status: existing?.status ?? "entered",
        periodId,
        updatedAt: now,
    } satisfies TransactionRecord;
    const postingRecords = createLedgerPostingRecords({
        ledgerId,
        transactionId,
        postings: resolution.postings,
        occurredAt,
        periodId,
        createdAt: now,
    });

    if (
        existing?.status === "reconciled" &&
        !financialMovementsMatch(existingChildren.postings, postingRecords)
    ) {
        throw new HttpError(
            409,
            "transaction_locked_movement",
            "Reconciled transactions must be unlocked before changing an account or amount.",
        );
    }

    const lineRecords = createTransactionLineRecords({
        ledgerId,
        transactionId,
        lines: resolution.lines,
        existing: existingChildren.lines,
        now,
    });

    attachTransactionAggregateMetadata({
        ledgerPostings: postingRecords,
        plaidTransactionSyncs: finalPlaidTransactionSyncRecords,
        record,
        transactionLines: lineRecords,
    });

    const unpersistedWorkspaceChanges = [
        ...createTransactionUpsertWorkspaceChanges({
            existing: existing ?? undefined,
            existingChildren,
            lineRecords,
            postingRecords,
            record,
        }),
        ...(input.plaidTransactionSyncRecordsToPut ?? []).map((syncRecord) =>
            createWorkspaceUpsertChange(
                "plaidTransactionSync",
                syncRecord.plaidTransactionSyncId,
                syncRecord,
                previousPlaidTransactionSyncRecordById.get(
                    syncRecord.plaidTransactionSyncId,
                ) ?? null,
            ),
        ),
    ];

    if (input.deferWrite) {
        return {
            existing,
            existingChildren,
            lineRecords,
            postingRecords,
            record,
            references,
            transaction: toPublicTransactionRecord(record),
            workspaceChanges: unpersistedWorkspaceChanges,
        };
    }

    const atomicWorkspaceMutation =
        input.publishWorkspaceChanges === false
            ? undefined
            : {
                    changes: unpersistedWorkspaceChanges,
                    mutationId:
                        input.workspaceMutation?.mutationId ??
                        `transaction.internal:${transactionId}:${ulid()}`,
                    mutationType:
                        input.workspaceMutation?.mutationType ?? "transaction.internal",
                    response: {
                        transaction: toPublicTransactionRecord(record),
                    },
                };

    const workspaceCommit = await writeTransactionState({
        existing,
        existingChildren,
        lineRecords,
        postingRecords,
        plaidTransactionSyncRecordsToPut: input.plaidTransactionSyncRecordsToPut,
        record,
        workspaceMutation: atomicWorkspaceMutation,
    });

    await recordTransactionAuditLog({
        action: getTransactionAuditAction({
            audit: input.audit,
            defaultAction: existing ? "update" : "create",
        }),
        actorUserId: input.audit?.actorUserId,
        after: createTransactionAuditAggregate({
            ledgerPostings: postingRecords,
            transaction: record,
            transactionLines: lineRecords,
        }),
        before: existing
            ? createAggregateFromTransactionState({
                    children: existingChildren,
                    transaction: existing,
                })
            : null,
        ledgerId,
        source: resolveTransactionAuditSource({
            audit: input.audit,
            transactionSource: record.source,
        }),
        summary: {
            displayAmountCents: record.displayAmountCents,
            kind: record.kind,
            lineCount: lineRecords.length,
            payee: record.payee,
            periodId,
            transactionId,
        },
        suppress: input.audit?.suppress,
        transactionId,
    });

    await trySyncTransactionClassificationCaches({
        ledgerId,
        lines: lineRecords,
        transaction: record,
    });

    return {
        lineRecords,
        postingRecords,
        transaction: toPublicTransactionRecord(record),
        workspaceChanges:
            workspaceCommit?.workspaceChanges ?? unpersistedWorkspaceChanges,
    };
}

type TransactionUpsertServiceInput = Omit<
    Parameters<typeof upsertTransactionInternal>[1],
    "publishWorkspaceChanges"
>;

export async function upsertTransaction(
    ledgerId: string,
    input: TransactionUpsertServiceInput,
) {
    return (await upsertTransactionInternal(ledgerId, input)).transaction;
}

/** Writes under an outer durable workspace mutation fence. */
export async function upsertTransactionWithinWorkspaceMutation(
    ledgerId: string,
    input: Omit<TransactionUpsertServiceInput, "workspaceMutation">,
) {
    return (
        await upsertTransactionInternal(ledgerId, {
            ...input,
            publishWorkspaceChanges: false,
        })
    ).transaction;
}

export async function upsertTransactionWithWorkspaceChanges(
    ledgerId: string,
    input: TransactionUpsertServiceInput,
) {
    const workspaceMutation = input.workspaceMutation ?? {
        mutationId: `transaction.internal:${input.transactionId ?? ulid()}:${ulid()}`,
        mutationType: "transaction.internal",
    };
    const mutationInput = { ...input, workspaceMutation };
    const existingMutation = await findWorkspaceMutationBatch({
        ledgerId,
        mutationId: workspaceMutation.mutationId,
        mutationType: workspaceMutation.mutationType,
    });

    if (existingMutation) {
        return {
            lineRecords: [],
            postingRecords: [],
            transaction: (
                existingMutation.response as {
                    transaction: ReturnType<typeof toPublicTransactionRecord>;
                }
            ).transaction,
            workspaceChanges: existingMutation.changes,
        };
    }

    return upsertTransactionInternal(ledgerId, mutationInput);
}

async function updateTransactionMemoWithWorkspaceChangesOnce(input: {
    audit?: TransactionAuditContext;
    ledgerId: string;
    memo: string;
    transactionId: string;
    workspaceMutation?: TransactionWorkspaceMutation;
}) {
    if (input.workspaceMutation) {
        const existingMutation = await findWorkspaceMutationBatch({
            ledgerId: input.ledgerId,
            mutationId: input.workspaceMutation.mutationId,
            mutationType: input.workspaceMutation.mutationType,
        });

        if (existingMutation) {
            return {
                transaction: (
                    existingMutation.response as {
                        transaction: ReturnType<typeof toPublicTransactionRecord>;
                    }
                ).transaction,
                workspaceChanges: existingMutation.changes,
            };
        }
    }

    const transaction = await getStoredTransaction(
        input.ledgerId,
        input.transactionId,
    );

    if (transaction.status === "voided") {
        throw new HttpError(
            409,
            "transaction_voided",
            "Voided transactions cannot be edited.",
        );
    }

    if ((transaction.memo ?? "") === input.memo) {
        return {
            transaction: toPublicTransactionRecord(transaction),
            workspaceChanges: [],
        };
    }

    const [existingChildren, plaidTransactionSyncRecords] = await Promise.all([
        listTransactionChildren(input.ledgerId, input.transactionId),
        listPlaidTransactionSyncsForTransaction(
            input.ledgerId,
            input.transactionId,
            transaction.plaidTransactionSyncId,
        ),
    ]);
    const now = new Date().toISOString();
    const record = {
        ...transaction,
        memo: normalizeOptionalString(input.memo),
        updatedAt: now,
    };
    const lineRecords = existingChildren.lines.map((line) =>
        existingChildren.lines.length === 1
            ? { ...line, memo: normalizeOptionalString(input.memo), updatedAt: now }
            : line,
    );
    attachTransactionAggregateMetadata({
        ledgerPostings: existingChildren.postings,
        plaidTransactionSyncs: plaidTransactionSyncRecords,
        record,
        transactionLines: lineRecords,
    });
    const workspaceChanges = [
        createWorkspaceUpsertChange(
            "transaction",
            record.transactionId,
            record,
            transaction,
        ),
        ...(existingChildren.lines.length === 1
            ? [
                    createWorkspaceUpsertChange(
                        "transactionLine",
                        lineRecords[0]!.lineId,
                        lineRecords[0],
                        existingChildren.lines[0]!,
                    ),
                ]
            : []),
    ];
    const mutation = input.workspaceMutation ?? {
        mutationId: `transaction.memo:${input.transactionId}:${ulid()}`,
        mutationType: "transaction.memo",
    };
    const workspaceCommit = await writeTransactionState({
        existing: transaction,
        existingChildren,
        lineRecords,
        postingRecords: existingChildren.postings,
        record,
        workspaceMutation: {
            changes: workspaceChanges,
            mutationId: mutation.mutationId,
            mutationType: mutation.mutationType,
            response: { transaction: toPublicTransactionRecord(record) },
        },
    });
    await recordTransactionAuditLog({
        action: getTransactionAuditAction({
            audit: input.audit,
            defaultAction: "memoUpdate",
        }),
        actorUserId: input.audit?.actorUserId,
        after: createTransactionAuditAggregate({
            ledgerPostings: existingChildren.postings,
            transaction: record,
            transactionLines: lineRecords,
        }),
        before: createAggregateFromTransactionState({
            children: existingChildren,
            transaction,
        }),
        ledgerId: input.ledgerId,
        source: resolveTransactionAuditSource({
            audit: input.audit,
            transactionSource: transaction.source,
        }),
        summary: {
            transactionId: input.transactionId,
        },
        suppress: input.audit?.suppress,
        transactionId: input.transactionId,
    });
    await trySyncTransactionClassificationCaches({
        ledgerId: input.ledgerId,
        lines: lineRecords,
        transaction: record,
    });

    return {
        transaction: toPublicTransactionRecord(record),
        workspaceChanges: workspaceCommit!.workspaceChanges,
    };
}

export async function updateTransactionMemoWithWorkspaceChanges(input: {
    audit?: TransactionAuditContext;
    ledgerId: string;
    memo: string;
    transactionId: string;
    workspaceMutation?: TransactionWorkspaceMutation;
}) {
    const workspaceMutation = input.workspaceMutation ?? {
        mutationId: `transaction.memo:${input.transactionId}:${ulid()}`,
        mutationType: "transaction.memo",
    };
    const mutationInput = { ...input, workspaceMutation };

    return updateTransactionMemoWithWorkspaceChangesOnce(mutationInput);
}

type DurableCategorizeOperation = {
    categoryId: string;
    conflictedTransactionIds?: string[];
    expectedAggregateRevisionByTransactionId: Record<string, string>;
    operationVersion: 3;
    transactionIds: string[];
    updatedCount: number;
};

function isDurableCategorizeOperation(
    operation: unknown,
): operation is DurableCategorizeOperation {
    return (
        typeof operation === "object" &&
        operation !== null &&
        (operation as DurableCategorizeOperation).operationVersion === 3 &&
        Array.isArray((operation as DurableCategorizeOperation).transactionIds) &&
        typeof (operation as DurableCategorizeOperation)
            .expectedAggregateRevisionByTransactionId === "object" &&
        (operation as DurableCategorizeOperation)
            .expectedAggregateRevisionByTransactionId !== null &&
        typeof (operation as DurableCategorizeOperation).updatedCount === "number"
    );
}

function assertDurableCategorizeOperationMatches(input: {
    categoryId: string;
    operation: DurableCategorizeOperation;
    transactionIds: string[];
}) {
    if (
        input.operation.categoryId !== input.categoryId ||
        input.operation.transactionIds.length !== input.transactionIds.length ||
        input.operation.transactionIds.some(
            (transactionId, index) => transactionId !== input.transactionIds[index],
        ) ||
        input.operation.transactionIds.some(
            (transactionId) =>
                !input.operation.expectedAggregateRevisionByTransactionId[
                    transactionId
                ],
        )
    ) {
        throw new HttpError(
            409,
            "workspace_mutation_mismatch",
            "This bulk categorization request does not match its saved operation.",
        );
    }
}

type PreparedCategorizeTransactionState = TransactionWriteState & {
    aggregateRevision: string;
    existing: TransactionRecord;
    plaidTransactionSyncRecords: PlaidTransactionSyncRecord[];
    workspaceChanges: WorkspaceMutationChangeInput[];
};

async function prepareCategorizeTransactionStates(input: {
    actorUserId: string;
    categoryId: string;
    expectedAggregateRevisionByTransactionId?: Record<string, string>;
    ledgerId: string;
    transactionIds: string[];
}): Promise<{
    conflictedTransactionIds: string[];
    states: PreparedCategorizeTransactionState[];
}> {
    const transactions = await listStoredTransactionsByIds(
        input.ledgerId,
        input.transactionIds,
    );

    if (transactions.length !== input.transactionIds.length) {
        throw new HttpError(
            409,
            "transaction_categorization_stale",
            "One or more transactions changed before they could be categorized. Refresh and try again.",
        );
    }

    const children = await listTransactionChildrenByTransactionId(
        input.ledgerId,
        input.transactionIds,
    );
    const transactionById = new Map(
        transactions.map((transaction) => [transaction.transactionId, transaction]),
    );
    const plaidTransactionSyncsByTransactionId = new Map(
        await Promise.all(
            input.transactionIds.map(async (transactionId) => {
                const transaction = transactionById.get(transactionId);

                return [
                    transactionId,
                    await listPlaidTransactionSyncsForTransaction(
                        input.ledgerId,
                        transactionId,
                        transaction?.plaidTransactionSyncId,
                    ),
                ] as const;
            }),
        ),
    );
    const categorizationTargets = input.transactionIds.map((transactionId) => {
        const transaction = transactionById.get(transactionId);

        if (!transaction) {
            throw new HttpError(
                409,
                "transaction_categorization_stale",
                "One or more transactions changed before they could be categorized. Refresh and try again.",
            );
        }

        return {
            ...transaction,
            lines: children.linesByTransactionId.get(transaction.transactionId) ?? [],
            postings:
                children.postingsByTransactionId.get(transaction.transactionId) ?? [],
            plaidTransactionSyncs:
                plaidTransactionSyncsByTransactionId.get(transaction.transactionId) ??
                [],
        };
    });

    const conflictedTransactionIds = categorizationTargets
        .filter((transaction) => {
            const expectedRevision =
                input.expectedAggregateRevisionByTransactionId?.[
                    transaction.transactionId
                ];

            return (
                expectedRevision !== undefined &&
                expectedRevision !==
                    createTransactionAggregateRevision({
                        ledgerPostings: transaction.postings,
                        plaidTransactionSyncs: transaction.plaidTransactionSyncs,
                        transaction,
                        transactionLines: transaction.lines,
                    })
            );
        })
        .map((transaction) => transaction.transactionId);

    if (conflictedTransactionIds.length > 0) {
        return { conflictedTransactionIds, states: [] };
    }
    const eligibility = getTransactionCategorizationEligibility(
        categorizationTargets,
    );

    if (!eligibility.canCategorize) {
        throw new HttpError(
            409,
            "transaction_categorization_stale",
            eligibility.reason ??
                "One or more transactions changed before they could be categorized.",
        );
    }

    const states = await Promise.all(
        categorizationTargets.map(async (transaction) => {
            const [line] =
                children.linesByTransactionId.get(transaction.transactionId) ?? [];

            if (!line) {
                throw new HttpError(
                    409,
                    "transaction_categorization_stale",
                    "One or more transactions changed before they could be categorized. Refresh and try again.",
                );
            }

            const prepared = await upsertTransactionInternal(input.ledgerId, {
                accountId: transaction.referenceAccountId,
                audit: {
                    actorUserId: input.actorUserId,
                    source: "manual",
                },
                kind: transaction.kind,
                lines: toTransactionLineInputs([line]).map((lineInput) => ({
                    ...lineInput,
                    categoryId: input.categoryId,
                })),
                memo: transaction.memo,
                occurredAt: toTransactionDateInputValue(transaction.occurredAt),
                payee: transaction.payee,
                transactionId: transaction.transactionId,
                deferWrite: true,
            });

            if (
                !prepared ||
                !("record" in prepared) ||
                !prepared.record ||
                !prepared.existingChildren ||
                !prepared.existing
            ) {
                throw new Error("Unable to prepare the categorized transaction.");
            }

            const existing = prepared.existing;
            const existingChildren = prepared.existingChildren;
            const record = prepared.record;

            return {
                ...prepared,
                aggregateRevision: createTransactionAggregateRevision({
                    ledgerPostings: transaction.postings,
                    plaidTransactionSyncs: transaction.plaidTransactionSyncs,
                    transaction,
                    transactionLines: transaction.lines,
                }),
                existing,
                existingChildren,
                expectedTransactionUpdatedAt: transaction.updatedAt,
                plaidTransactionSyncRecords: transaction.plaidTransactionSyncs,
                record,
            };
        }),
    );

    return { conflictedTransactionIds: [], states };
}

function createCategorizeConflictError(input: {
    completedCount: number;
    conflictedTransactionIds: string[];
    totalCount: number;
}) {
    return new HttpError(
        409,
        "transaction_categorization_conflict",
        "Some selected transactions changed after categorization was confirmed. Refresh and review the remaining transactions before trying again.",
        {
            completedCount: input.completedCount,
            conflictedTransactionIds: input.conflictedTransactionIds,
            remainingCount:
                input.totalCount -
                input.completedCount -
                input.conflictedTransactionIds.length,
        },
    );
}

async function commitCategorizeOperation(input: {
    actorUserId: string;
    ledgerId: string;
    operation: DurableCategorizeOperation;
    persistedOperation?: WorkspaceMutationOperation;
    workspaceMutation: TransactionWorkspaceMutation;
}) {
    const completedStepCount = input.persistedOperation?.completedStepCount ?? 0;

    if (completedStepCount > input.operation.transactionIds.length) {
        throw new Error("Workspace mutation operation has invalid progress.");
    }

    let lastCompletedStepCount = completedStepCount;
    let operationCreatedAt = input.persistedOperation?.createdAt;
    let operation = input.operation;

    try {
        for (
            let completedCount = completedStepCount;
            completedCount < input.operation.transactionIds.length;

        ) {
            const pendingTransactionIds =
                input.operation.transactionIds.slice(completedCount);
            const pending = await prepareCategorizeTransactionStates({
                actorUserId: input.actorUserId,
                categoryId: operation.categoryId,
                expectedAggregateRevisionByTransactionId:
                    operation.expectedAggregateRevisionByTransactionId,
                ledgerId: input.ledgerId,
                transactionIds: pendingTransactionIds,
            });

            if (pending.conflictedTransactionIds.length > 0) {
                operation = {
                    ...operation,
                    conflictedTransactionIds: pending.conflictedTransactionIds,
                };
                await persistWorkspaceMutationOperation(
                    createWorkspaceMutationOperation({
                        completedStepCount: lastCompletedStepCount,
                        createdAt: operationCreatedAt,
                        ledgerId: input.ledgerId,
                        mutationId: input.workspaceMutation.mutationId,
                        mutationType: input.workspaceMutation.mutationType,
                        operation,
                        status: "failed",
                    }),
                );
                throw createCategorizeConflictError({
                    completedCount: lastCompletedStepCount,
                    conflictedTransactionIds: pending.conflictedTransactionIds,
                    totalCount: operation.transactionIds.length,
                });
            }

            const [states] = chunkTransactionWriteStates(pending.states, 5);

            if (!states?.length) {
                throw new Error("Workspace mutation operation has no pending states.");
            }

            const [firstState, ...additionalStates] = states;

            if (!firstState) {
                continue;
            }

            const nextCompletedCount = completedCount + states.length;
            const isFinalChunk =
                nextCompletedCount === operation.transactionIds.length;
            const atomicWorkspaceMutation = {
                changes: states.flatMap((state) =>
                    createTransactionUpsertWorkspaceChanges({
                        existing: state.existing ?? undefined,
                        existingChildren: state.existingChildren,
                        lineRecords: state.lineRecords,
                        postingRecords: state.postingRecords,
                        record: state.record,
                    }),
                ),
                mutationId: isFinalChunk
                    ? input.workspaceMutation.mutationId
                    : `${input.workspaceMutation.mutationId}:chunk:${completedCount}`,
                mutationType: isFinalChunk
                    ? input.workspaceMutation.mutationType
                    : `${input.workspaceMutation.mutationType}.chunk`,
                response: { updatedCount: operation.updatedCount },
            };
            const workspaceMutationOperation = createWorkspaceMutationOperation({
                completedStepCount: nextCompletedCount,
                createdAt: operationCreatedAt,
                ledgerId: input.ledgerId,
                mutationId: input.workspaceMutation.mutationId,
                mutationType: input.workspaceMutation.mutationType,
                operation,
                status: isFinalChunk ? "completed" : "running",
            });
            operationCreatedAt = workspaceMutationOperation.createdAt;

            const workspaceCommit = await writeTransactionState({
                additionalTransactionStates: additionalStates,
                existing: firstState.existing,
                existingChildren: firstState.existingChildren,
                expectedTransactionUpdatedAt: firstState.expectedTransactionUpdatedAt,
                lineRecords: firstState.lineRecords,
                postingRecords: firstState.postingRecords,
                record: firstState.record,
                workspaceMutation: atomicWorkspaceMutation,
                workspaceMutationOperation,
            });
            lastCompletedStepCount = nextCompletedCount;
            completedCount = nextCompletedCount;
            await Promise.all(
                states.flatMap((state) => [
                    recordTransactionAuditLog({
                        action: "update",
                        actorUserId: input.actorUserId,
                        after: createTransactionAuditAggregate({
                            ledgerPostings: state.postingRecords,
                            transaction: state.record,
                            transactionLines: state.lineRecords,
                        }),
                        before: createAggregateFromTransactionState({
                            children: state.existingChildren,
                            transaction: state.existing!,
                        }),
                        ledgerId: input.ledgerId,
                        source: "manual",
                        summary: {
                            categoryId: operation.categoryId,
                            transactionId: state.record.transactionId,
                        },
                        transactionId: state.record.transactionId,
                    }),
                    trySyncTransactionClassificationCaches({
                        ledgerId: input.ledgerId,
                        lines: state.lineRecords,
                        transaction: state.record,
                    }),
                ]),
            );

            if (isFinalChunk) {
                return {
                    updatedCount: operation.updatedCount,
                    workspaceChanges: workspaceCommit!.workspaceChanges,
                };
            }
        }
    } catch (error) {
        if (
            !(error instanceof HttpError) ||
            error.code !== "transaction_categorization_conflict"
        ) {
            try {
                const pending = await prepareCategorizeTransactionStates({
                    actorUserId: input.actorUserId,
                    categoryId: operation.categoryId,
                    expectedAggregateRevisionByTransactionId:
                        operation.expectedAggregateRevisionByTransactionId,
                    ledgerId: input.ledgerId,
                    transactionIds: operation.transactionIds.slice(
                        lastCompletedStepCount,
                    ),
                });

                if (pending.conflictedTransactionIds.length > 0) {
                    operation = {
                        ...operation,
                        conflictedTransactionIds: pending.conflictedTransactionIds,
                    };
                    await persistWorkspaceMutationOperation(
                        createWorkspaceMutationOperation({
                            completedStepCount: lastCompletedStepCount,
                            createdAt: operationCreatedAt,
                            ledgerId: input.ledgerId,
                            mutationId: input.workspaceMutation.mutationId,
                            mutationType: input.workspaceMutation.mutationType,
                            operation,
                            status: "failed",
                        }),
                    );
                    throw createCategorizeConflictError({
                        completedCount: lastCompletedStepCount,
                        conflictedTransactionIds: pending.conflictedTransactionIds,
                        totalCount: operation.transactionIds.length,
                    });
                }
            } catch (conflictError) {
                if (conflictError instanceof HttpError) {
                    throw conflictError;
                }
            }
        }

        if (lastCompletedStepCount > 0) {
            await persistWorkspaceMutationOperation(
                createWorkspaceMutationOperation({
                    completedStepCount: lastCompletedStepCount,
                    createdAt: operationCreatedAt,
                    ledgerId: input.ledgerId,
                    mutationId: input.workspaceMutation.mutationId,
                    mutationType: input.workspaceMutation.mutationType,
                    operation,
                    status: "failed",
                }),
            ).catch(() => undefined);
        }

        throw error;
    }

    throw new Error("Workspace mutation operation did not complete.");
}

export async function categorizeTransactionsWithWorkspaceChanges(input: {
    actorUserId: string;
    categoryId: string;
    ledgerId: string;
    transactionIds: Iterable<string>;
    workspaceMutation?: TransactionWorkspaceMutation;
}) {
    const workspaceMutation = input.workspaceMutation ?? {
        mutationId: `transaction.categorize:${ulid()}`,
        mutationType: "transaction.categorize",
    };
    const persistedOperation = await findWorkspaceMutationOperation({
        ledgerId: input.ledgerId,
        mutationId: workspaceMutation.mutationId,
        mutationType: workspaceMutation.mutationType,
    });

    if (persistedOperation) {
        if (!isDurableCategorizeOperation(persistedOperation.operation)) {
            throw new HttpError(
                409,
                "workspace_mutation_stale",
                "This saved bulk categorization operation uses an older format. Refresh and start it again.",
            );
        }

        const transactionIds = normalizeTransactionIds(input.transactionIds);
        assertDurableCategorizeOperationMatches({
            categoryId: input.categoryId,
            operation: persistedOperation.operation,
            transactionIds,
        });

        if (
            persistedOperation.status === "failed" &&
            persistedOperation.operation.conflictedTransactionIds?.length
        ) {
            throw createCategorizeConflictError({
                completedCount: persistedOperation.completedStepCount,
                conflictedTransactionIds:
                    persistedOperation.operation.conflictedTransactionIds,
                totalCount: persistedOperation.operation.transactionIds.length,
            });
        }

        const completedBatch = await findWorkspaceMutationBatch({
            ledgerId: input.ledgerId,
            mutationId: workspaceMutation.mutationId,
            mutationType: workspaceMutation.mutationType,
        });

        if (completedBatch) {
            return {
                updatedCount: (completedBatch.response as { updatedCount: number })
                    .updatedCount,
                workspaceChanges: completedBatch.changes,
            };
        }

        return commitCategorizeOperation({
            actorUserId: input.actorUserId,
            ledgerId: input.ledgerId,
            operation: persistedOperation.operation,
            persistedOperation,
            workspaceMutation,
        });
    }

    const transactionIds = normalizeTransactionIds(input.transactionIds);
    const prepared = await prepareCategorizeTransactionStates({
        actorUserId: input.actorUserId,
        categoryId: input.categoryId,
        ledgerId: input.ledgerId,
        transactionIds,
    });
    const states = prepared.states.map((result) => ({
        existing: result.existing,
        existingChildren: result.existingChildren,
        expectedTransactionUpdatedAt: result.expectedTransactionUpdatedAt,
        lineRecords: result.lineRecords,
        postingRecords: result.postingRecords,
        record: result.record,
    }));
    const workspaceChanges = prepared.states.flatMap(
        (result) => result.workspaceChanges,
    );
    const operation = {
        categoryId: input.categoryId,
        expectedAggregateRevisionByTransactionId: Object.fromEntries(
            prepared.states.map((state) => [
                state.record.transactionId,
                state.aggregateRevision,
            ]),
        ),
        operationVersion: 3,
        transactionIds,
        updatedCount: prepared.states.length,
    } satisfies DurableCategorizeOperation;
    const chunks = chunkTransactionWriteStates(states, 4);

    if (chunks.length > 1) {
        return commitCategorizeOperation({
            actorUserId: input.actorUserId,
            ledgerId: input.ledgerId,
            operation,
            workspaceMutation,
        });
    }

    const [firstPrepared, ...additionalPrepared] = prepared.states;

    if (!firstPrepared) {
        throw new Error("No transactions were available to categorize.");
    }

    let workspaceCommit: AtomicWorkspaceMutationResult<unknown> | null = null;

    try {
        workspaceCommit = await writeTransactionState({
            additionalTransactionStates: additionalPrepared.map((result) => ({
                existing: result.existing,
                existingChildren: result.existingChildren,
                expectedTransactionUpdatedAt: result.expectedTransactionUpdatedAt,
                lineRecords: result.lineRecords,
                postingRecords: result.postingRecords,
                record: result.record,
            })),
            existing: firstPrepared.existing,
            existingChildren: firstPrepared.existingChildren,
            expectedTransactionUpdatedAt: firstPrepared.expectedTransactionUpdatedAt,
            lineRecords: firstPrepared.lineRecords,
            postingRecords: firstPrepared.postingRecords,
            record: firstPrepared.record,
            workspaceMutation: {
                changes: workspaceChanges,
                mutationId: workspaceMutation.mutationId,
                mutationType: workspaceMutation.mutationType,
                response: { updatedCount: prepared.states.length },
            },
        });
    } catch (error) {
        try {
            const pending = await prepareCategorizeTransactionStates({
                actorUserId: input.actorUserId,
                categoryId: operation.categoryId,
                expectedAggregateRevisionByTransactionId:
                    operation.expectedAggregateRevisionByTransactionId,
                ledgerId: input.ledgerId,
                transactionIds: operation.transactionIds,
            });

            if (pending.conflictedTransactionIds.length > 0) {
                const failedOperation = {
                    ...operation,
                    conflictedTransactionIds: pending.conflictedTransactionIds,
                };
                await persistWorkspaceMutationOperation(
                    createWorkspaceMutationOperation({
                        completedStepCount: 0,
                        ledgerId: input.ledgerId,
                        mutationId: workspaceMutation.mutationId,
                        mutationType: workspaceMutation.mutationType,
                        operation: failedOperation,
                        status: "failed",
                    }),
                );
                throw createCategorizeConflictError({
                    completedCount: 0,
                    conflictedTransactionIds: pending.conflictedTransactionIds,
                    totalCount: operation.transactionIds.length,
                });
            }
        } catch (conflictError) {
            if (conflictError instanceof HttpError) {
                throw conflictError;
            }
        }

        throw error;
    }
    await Promise.all(
        prepared.states.flatMap((result) => [
            recordTransactionAuditLog({
                action: "update",
                actorUserId: input.actorUserId,
                after: createTransactionAuditAggregate({
                    ledgerPostings: result.postingRecords,
                    transaction: result.record,
                    transactionLines: result.lineRecords,
                }),
                before: createAggregateFromTransactionState({
                    children: result.existingChildren,
                    transaction: result.existing,
                }),
                ledgerId: input.ledgerId,
                source: "manual",
                summary: {
                    categoryId: input.categoryId,
                    transactionId: result.record.transactionId,
                },
                transactionId: result.record.transactionId,
            }),
            trySyncTransactionClassificationCaches({
                ledgerId: input.ledgerId,
                lines: result.lineRecords,
                transaction: result.record,
            }),
        ]),
    );

    return {
        updatedCount: prepared.states.length,
        workspaceChanges: workspaceCommit!.workspaceChanges,
    };
}

export async function validateCategorizeWorkspaceMutation(input: {
    categoryId: string;
    ledgerId: string;
    transactionIds: Iterable<string>;
    workspaceMutation: TransactionWorkspaceMutation;
}) {
    const persistedOperation = await findWorkspaceMutationOperation({
        ledgerId: input.ledgerId,
        mutationId: input.workspaceMutation.mutationId,
        mutationType: input.workspaceMutation.mutationType,
    });

    if (!persistedOperation) {
        return;
    }

    if (!isDurableCategorizeOperation(persistedOperation.operation)) {
        throw new HttpError(
            409,
            "workspace_mutation_stale",
            "This saved bulk categorization operation uses an older format. Refresh and start it again.",
        );
    }

    assertDurableCategorizeOperationMatches({
        categoryId: input.categoryId,
        operation: persistedOperation.operation,
        transactionIds: normalizeTransactionIds(input.transactionIds),
    });
}

async function voidTransactionInternal(
    ledgerId: string,
    transactionId: string,
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
    plaidTransactionSyncRecordsToPut?: PlaidTransactionSyncRecord[],
) {
    const transaction = await getStoredTransaction(ledgerId, transactionId);
    const [existingChildren, existingPlaidTransactionSyncRecords] =
        await Promise.all([
            listTransactionChildren(ledgerId, transactionId),
            listPlaidTransactionSyncsForTransaction(
                ledgerId,
                transactionId,
                transaction.plaidTransactionSyncId,
            ),
        ]);

    if (transaction.status === "voided") {
        return {
            transaction: toPublicTransactionRecord(transaction),
            workspaceChanges: [],
        };
    }

    assertTransactionIsNotLocked(transaction, "voided");

    const voided = {
        ...transaction,
        status: "voided" as const,
        updatedAt: new Date().toISOString(),
    };
    const previousPlaidTransactionSyncRecordById = new Map(
        existingPlaidTransactionSyncRecords.map((record) => [
            record.plaidTransactionSyncId,
            record,
        ]),
    );
    const finalPlaidTransactionSyncRecordById = new Map(
        previousPlaidTransactionSyncRecordById,
    );

    for (const syncRecord of plaidTransactionSyncRecordsToPut ?? []) {
        finalPlaidTransactionSyncRecordById.set(
            syncRecord.plaidTransactionSyncId,
            syncRecord,
        );
    }

    attachTransactionAggregateMetadata({
        ledgerPostings: [],
        plaidTransactionSyncs: Array.from(
            finalPlaidTransactionSyncRecordById.values(),
        ),
        record: voided,
        transactionLines: [],
    });
    const workspaceChanges = [
        ...createTransactionUpsertWorkspaceChanges({
            existing: transaction,
            existingChildren,
            lineRecords: [],
            postingRecords: [],
            record: voided,
        }),
        ...(plaidTransactionSyncRecordsToPut ?? []).map((syncRecord) =>
            createWorkspaceUpsertChange(
                "plaidTransactionSync",
                syncRecord.plaidTransactionSyncId,
                syncRecord,
                previousPlaidTransactionSyncRecordById.get(
                    syncRecord.plaidTransactionSyncId,
                ) ?? null,
            ),
        ),
    ];
    const mutation = workspaceMutation ?? {
        mutationId: `transaction.void:${transactionId}:${ulid()}`,
        mutationType: "transaction.void",
    };
    const workspaceCommit = await writeTransactionState({
        existing: transaction,
        existingChildren,
        lineRecords: [],
        plaidTransactionSyncRecordsToPut,
        postingRecords: [],
        record: voided,
        workspaceMutation: {
            changes: workspaceChanges,
            mutationId: mutation.mutationId,
            mutationType: mutation.mutationType,
            response: { transaction: toPublicTransactionRecord(voided) },
        },
    });
    await deleteTransactionClassificationCachesSafely({
        ledgerId,
        transactionId,
    });
    await recordTransactionAuditLog({
        action: getTransactionAuditAction({
            audit,
            defaultAction: "void",
        }),
        actorUserId: audit?.actorUserId,
        after: createTransactionAuditAggregate({
            transaction: voided,
        }),
        before: createAggregateFromTransactionState({
            children: existingChildren,
            transaction,
        }),
        ledgerId,
        source: resolveTransactionAuditSource({
            audit,
            transactionSource: transaction.source,
        }),
        summary: {
            periodId: transaction.periodId,
            transactionId,
        },
        suppress: audit?.suppress,
        transactionId,
    });

    return {
        transaction: toPublicTransactionRecord(voided),
        workspaceChanges: workspaceCommit!.workspaceChanges,
    };
}

export async function voidTransaction(
    ledgerId: string,
    transactionId: string,
    audit?: TransactionAuditContext,
) {
    return (await voidTransactionInternal(ledgerId, transactionId, audit))
        .transaction;
}

export async function voidTransactionWithWorkspaceChanges(
    ledgerId: string,
    transactionId: string,
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
    plaidTransactionSyncRecordsToPut?: PlaidTransactionSyncRecord[],
) {
    const mutation = workspaceMutation ?? {
        mutationId: `transaction.void:${transactionId}:${ulid()}`,
        mutationType: "transaction.void",
    };

    return voidTransactionInternal(
        ledgerId,
        transactionId,
        audit,
        mutation,
        plaidTransactionSyncRecordsToPut,
    );
}

export async function getTransactionDeletionImpact(
    ledgerId: string,
    transactionId: string,
) {
    const transaction = await getStoredTransaction(ledgerId, transactionId);
    assertTransactionIsNotLocked(transaction, "deleted");
    const [{ postings, lines }, plaidTransactionSyncRecords] = await Promise.all([
        listTransactionChildren(ledgerId, transactionId),
        listPlaidTransactionSyncsForTransaction(
            ledgerId,
            transactionId,
            transaction.plaidTransactionSyncId,
        ),
    ]);

    return buildTransactionDeletionImpact({
        plaidTransactionSyncRecords,
        transaction,
        postings,
        lines,
    });
}

export async function getTransactionsDeletionImpact(
    ledgerId: string,
    transactionIds: string[],
) {
    const deletionStates = await getTransactionDeletionStates(
        ledgerId,
        transactionIds,
    );
    assertTransactionsAreNotLocked(deletionStates, "deleted");

    return buildBulkTransactionDeletionImpact(deletionStates);
}

async function deleteTransactionInternal(
    ledgerId: string,
    transactionId: string,
    previewRevision: string,
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
) {
    const deletionState = await getTransactionDeletionState(
        ledgerId,
        transactionId,
    );
    assertTransactionIsNotLocked(deletionState.transaction, "deleted");
    const impact = buildTransactionDeletionImpact({
        plaidTransactionSyncRecords: deletionState.plaidTransactionSyncRecords,
        transaction: deletionState.transaction,
        postings: deletionState.children.postings,
        lines: deletionState.children.lines,
    });

    assertDeletionPreviewRevision(previewRevision, impact.previewRevision);
    const autoMatchRejections = (
        await listTransactionAutoMatchRejections(ledgerId)
    ).filter(
        (rejection) =>
            rejection.leftTransactionId === transactionId ||
            rejection.rightTransactionId === transactionId,
    );
    const reopenedImportActivities = await createReopenedImportActivities(
        ledgerId,
        [deletionState],
    );
    const unpersistedWorkspaceChanges = [
        ...createTransactionDeleteWorkspaceChanges({
            states: [deletionState],
        }),
        ...autoMatchRejections.map((rejection) => ({
            entityId: rejection.matchDecisionId,
            entityType: "transactionAutoMatchRejection" as const,
            operation: "delete" as const,
            previousRecordDigest: calculateWorkspaceRecordDigest({
                entityType: "transactionAutoMatchRejection",
                record: rejection,
            }),
            record: null,
        })),
        ...reopenedImportActivities.map(({ previous, record }) =>
            createWorkspaceUpsertChange(
                "transactionImportActivity",
                record.activityId,
                record,
                previous,
            ),
        ),
    ];
    const mutation = workspaceMutation ?? {
        mutationId: `transaction.delete:${transactionId}:${ulid()}`,
        mutationType: "transaction.delete",
    };
    const workspaceCommit = await writeTransactionDeletionStates({
        autoMatchRejections,
        ledgerId,
        states: [deletionState],
        transactionImportActivitiesToPut: reopenedImportActivities.map(
            ({ record }) => record,
        ),
        workspaceMutation: {
            changes: unpersistedWorkspaceChanges,
            mutationId: mutation.mutationId,
            mutationType: mutation.mutationType,
            response: {},
        },
    });
    await deleteTransactionClassificationCachesSafely({
        ledgerId,
        transactionId,
    });
    await recordTransactionAuditLog({
        action: getTransactionAuditAction({
            audit,
            defaultAction: "delete",
        }),
        actorUserId: audit?.actorUserId,
        before: createAggregateFromTransactionState({
            children: deletionState.children,
            plaidTransactionSyncRecords: deletionState.plaidTransactionSyncRecords,
            transaction: deletionState.transaction,
        }),
        ledgerId,
        source: resolveTransactionAuditSource({
            audit,
            transactionSource: deletionState.transaction.source,
        }),
        summary: {
            lineCount: deletionState.children.lines.length,
            periodId: deletionState.transaction.periodId,
            postingCount: deletionState.children.postings.length,
            transactionId,
        },
        suppress: audit?.suppress,
        transactionId,
    });

    return {
        impact,
        workspaceChanges: workspaceCommit!.workspaceChanges,
    };
}

export async function deleteTransaction(
    ledgerId: string,
    transactionId: string,
    previewRevision: string,
    audit?: TransactionAuditContext,
) {
    return (
        await deleteTransactionInternal(
            ledgerId,
            transactionId,
            previewRevision,
            audit,
        )
    ).impact;
}

export async function deleteTransactionWithWorkspaceChanges(
    ledgerId: string,
    transactionId: string,
    previewRevision: string,
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
) {
    return deleteTransactionInternal(
        ledgerId,
        transactionId,
        previewRevision,
        audit,
        workspaceMutation,
    );
}

type DurableDeleteOperation = {
    affectedPeriodIds: string[];
    audit?: TransactionAuditContext;
    bulkPreviewRevision: string;
    deletedCount: number;
    expectedPreviewRevisions: Record<string, string>;
    operationVersion: 3;
    requestDigest: string;
    transactionIds: string[];
};

export function createBulkTransactionDeleteRequestDigest(input: {
    ledgerId: string;
    mutationType: string;
    previewRevision: string;
    transactionIds: Iterable<string>;
}) {
    return bytesToHex(
        sha256(
            utf8ToBytes(
                stableStringify({
                    ledgerId: input.ledgerId,
                    mutationType: input.mutationType,
                    previewRevision: input.previewRevision,
                    transactionIds: normalizeTransactionIds(
                        input.transactionIds,
                    ),
                }),
            ),
        ),
    );
}

function isDurableDeleteOperation(
    operation: unknown,
): operation is DurableDeleteOperation {
    return (
        typeof operation === "object" &&
        operation !== null &&
        (operation as DurableDeleteOperation).operationVersion === 3 &&
        Array.isArray((operation as DurableDeleteOperation).transactionIds) &&
        typeof (operation as DurableDeleteOperation).expectedPreviewRevisions ===
            "object" &&
        (operation as DurableDeleteOperation).expectedPreviewRevisions !== null &&
        Array.isArray((operation as DurableDeleteOperation).affectedPeriodIds) &&
        typeof (operation as DurableDeleteOperation).bulkPreviewRevision ===
            "string" &&
        typeof (operation as DurableDeleteOperation).deletedCount === "number" &&
        typeof (operation as DurableDeleteOperation).requestDigest === "string"
    );
}

function assertDurableDeleteOperationMatches(input: {
    operation: DurableDeleteOperation;
    previewRevision: string;
    requestDigest: string;
    transactionIds: string[];
}) {
    if (input.operation.requestDigest !== input.requestDigest) {
        throw new HttpError(
            409,
            "workspace_mutation_mismatch",
            "This bulk deletion request does not match its saved operation.",
        );
    }

    if (!input.previewRevision || !input.operation.bulkPreviewRevision) {
        throw new HttpError(
            409,
            "deletion_preview_missing",
            "The deletion preview is missing. Refresh and review the warning before confirming.",
        );
    }
}

function getTransactionDeletionPreviewRevision(
    state: TransactionDeletionState,
) {
    return buildTransactionDeletionImpact({
        plaidTransactionSyncRecords: state.plaidTransactionSyncRecords,
        postings: state.children.postings,
        lines: state.children.lines,
        transaction: state.transaction,
    }).previewRevision;
}

async function prepareDeleteTransactionStates(input: {
    expectedPreviewRevisions: Record<string, string>;
    ledgerId: string;
    transactionIds: string[];
}) {
    const states = await getTransactionDeletionStates(
        input.ledgerId,
        input.transactionIds,
    );
    assertTransactionsAreNotLocked(states, "deleted");

    for (const state of states) {
        const expectedPreviewRevision =
            input.expectedPreviewRevisions[state.transaction.transactionId];

        if (!expectedPreviewRevision) {
            throw new HttpError(
                409,
                "deletion_preview_stale",
                "The deletion preview is stale. Refresh and review the warning before confirming.",
            );
        }

        assertDeletionPreviewRevision(
            expectedPreviewRevision,
            getTransactionDeletionPreviewRevision(state),
        );
    }

    const transactionIdSet = new Set(input.transactionIds);
    const autoMatchRejections = (
        await listTransactionAutoMatchRejections(input.ledgerId)
    ).filter(
        (rejection) =>
            transactionIdSet.has(rejection.leftTransactionId) ||
            transactionIdSet.has(rejection.rightTransactionId),
    );

    return { autoMatchRejections, states };
}

function getDeleteOperationChunk(input: {
    autoMatchRejections: TransactionAutoMatchRejectionRecord[];
    states: TransactionDeletionState[];
}) {
    const capacity = 95;
    const rejectionsByTransactionId = new Map<
        string,
        TransactionAutoMatchRejectionRecord[]
    >();

    for (const rejection of input.autoMatchRejections) {
        for (const transactionId of [
            rejection.leftTransactionId,
            rejection.rightTransactionId,
        ]) {
            const rejections = rejectionsByTransactionId.get(transactionId) ?? [];
            rejections.push(rejection);
            rejectionsByTransactionId.set(transactionId, rejections);
        }
    }

    const states: TransactionDeletionState[] = [];
    const rejectionIds = new Set<string>();
    let itemCount = 0;

    for (const state of input.states) {
        const relatedRejections =
            rejectionsByTransactionId.get(state.transaction.transactionId) ?? [];
        const newRejections = relatedRejections.filter(
            (rejection) => !rejectionIds.has(rejection.matchDecisionId),
        );
        const stateItemCount =
            getTransactionDeletionStateItemCount(state) +
            newRejections.length +
            TRANSACTION_IMPORTER_IDS.length;

        assertTransactionWriteItemCount(stateItemCount + 5);

        if (states.length > 0 && itemCount + stateItemCount > capacity) {
            break;
        }

        states.push(state);
        itemCount += stateItemCount;

        for (const rejection of newRejections) {
            rejectionIds.add(rejection.matchDecisionId);
        }
    }

    if (states.length === 0) {
        throw new Error("Workspace mutation operation has no pending states.");
    }

    return {
        autoMatchRejections: input.autoMatchRejections.filter((rejection) =>
            rejectionIds.has(rejection.matchDecisionId),
        ),
        states,
    };
}

async function commitDeleteOperation(input: {
    ledgerId: string;
    operation: DurableDeleteOperation;
    persistedOperation?: WorkspaceMutationOperation;
    workspaceMutation: TransactionWorkspaceMutation;
}) {
    const completedStepCount = input.persistedOperation?.completedStepCount ?? 0;

    if (completedStepCount > input.operation.transactionIds.length) {
        throw new Error("Workspace mutation operation has invalid progress.");
    }

    let lastCompletedStepCount = completedStepCount;
    let operationCreatedAt = input.persistedOperation?.createdAt;

    try {
        for (
            let completedCount = completedStepCount;
            completedCount < input.operation.transactionIds.length;

        ) {
            const pendingTransactionIds =
                input.operation.transactionIds.slice(completedCount);
            const pending = await prepareDeleteTransactionStates({
                expectedPreviewRevisions: input.operation.expectedPreviewRevisions,
                ledgerId: input.ledgerId,
                transactionIds: pendingTransactionIds,
            });
            const chunk = getDeleteOperationChunk(pending);
            const reopenedImportActivities = await createReopenedImportActivities(
                input.ledgerId,
                chunk.states,
            );
            const nextCompletedCount = completedCount + chunk.states.length;
            const isFinalChunk =
                nextCompletedCount === input.operation.transactionIds.length;
            const atomicWorkspaceMutation = {
                changes: [
                    ...createTransactionDeleteWorkspaceChanges({
                        states: chunk.states,
                    }),
                    ...chunk.autoMatchRejections.map((rejection) => ({
                        entityId: rejection.matchDecisionId,
                        entityType: "transactionAutoMatchRejection" as const,
                        operation: "delete" as const,
                        previousRecordDigest: calculateWorkspaceRecordDigest({
                            entityType: "transactionAutoMatchRejection",
                            record: rejection,
                        }),
                        record: null,
                    })),
                    ...reopenedImportActivities.map(({ previous, record }) =>
                        createWorkspaceUpsertChange(
                            "transactionImportActivity",
                            record.activityId,
                            record,
                            previous,
                        ),
                    ),
                ],
                mutationId: isFinalChunk
                    ? input.workspaceMutation.mutationId
                    : `${input.workspaceMutation.mutationId}:chunk:${completedCount}`,
                mutationType: isFinalChunk
                    ? input.workspaceMutation.mutationType
                    : `${input.workspaceMutation.mutationType}.chunk`,
                response: {
                    deletedCount: input.operation.deletedCount,
                    requestDigest: input.operation.requestDigest,
                },
            };
            const workspaceMutationOperation = createWorkspaceMutationOperation({
                completedStepCount: nextCompletedCount,
                createdAt: operationCreatedAt,
                ledgerId: input.ledgerId,
                mutationId: input.workspaceMutation.mutationId,
                mutationType: input.workspaceMutation.mutationType,
                operation: input.operation,
                status: isFinalChunk ? "completed" : "running",
            });
            operationCreatedAt = workspaceMutationOperation.createdAt;

            const workspaceCommit = await writeTransactionDeletionStates({
                autoMatchRejections: chunk.autoMatchRejections,
                ledgerId: input.ledgerId,
                states: chunk.states,
                transactionImportActivitiesToPut:
                    reopenedImportActivities.map(({ record }) => record),
                workspaceMutation: atomicWorkspaceMutation,
                workspaceMutationOperation,
            });
            lastCompletedStepCount = nextCompletedCount;
            completedCount = nextCompletedCount;
            await Promise.all(
                chunk.states.map((state) =>
                    deleteTransactionClassificationCachesSafely({
                        ledgerId: input.ledgerId,
                        transactionId: state.transaction.transactionId,
                    }),
                ),
            );

            if (isFinalChunk) {
                await recordTransactionAuditLog({
                    action: getTransactionAuditAction({
                        audit: input.operation.audit,
                        defaultAction: "bulkDelete",
                    }),
                    actorUserId: input.operation.audit?.actorUserId,
                    ledgerId: input.ledgerId,
                    source: resolveTransactionAuditSource({
                        audit: input.operation.audit,
                    }),
                    summary: {
                        deletedCount: input.operation.deletedCount,
                        periodIds: input.operation.affectedPeriodIds,
                    },
                    suppress: input.operation.audit?.suppress,
                    transactionIds: input.operation.transactionIds,
                });

                return {
                    deletedCount: input.operation.deletedCount,
                    workspaceChanges: workspaceCommit!.workspaceChanges,
                };
            }
        }
    } catch (error) {
        if (lastCompletedStepCount > 0) {
            await persistWorkspaceMutationOperation(
                createWorkspaceMutationOperation({
                    completedStepCount: lastCompletedStepCount,
                    createdAt: operationCreatedAt,
                    ledgerId: input.ledgerId,
                    mutationId: input.workspaceMutation.mutationId,
                    mutationType: input.workspaceMutation.mutationType,
                    operation: input.operation,
                    status: "failed",
                }),
            ).catch(() => undefined);
        }

        throw error;
    }

    throw new Error("Workspace mutation operation did not complete.");
}

async function deleteTransactionsInternal(
    ledgerId: string,
    transactionIds: string[],
    previewRevision: string,
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
) {
    const mutation = workspaceMutation ?? {
        mutationId: `transaction.bulkDelete:${ulid()}`,
        mutationType: "transaction.bulkDelete",
    };
    const normalizedTransactionIds = normalizeTransactionIds(transactionIds);
    const requestDigest = createBulkTransactionDeleteRequestDigest({
        ledgerId,
        mutationType: mutation.mutationType,
        previewRevision,
        transactionIds: normalizedTransactionIds,
    });
    const persistedOperation = await findWorkspaceMutationOperation({
        ledgerId,
        mutationId: mutation.mutationId,
        mutationType: mutation.mutationType,
    });

    if (persistedOperation) {
        if (!isDurableDeleteOperation(persistedOperation.operation)) {
            throw new HttpError(
                409,
                "workspace_mutation_stale",
                "This saved bulk deletion operation uses an older format. Refresh and start it again.",
            );
        }

        assertDurableDeleteOperationMatches({
            operation: persistedOperation.operation,
            previewRevision,
            requestDigest,
            transactionIds: normalizedTransactionIds,
        });

        const completedBatch = await findWorkspaceMutationBatch({
            ledgerId,
            mutationId: mutation.mutationId,
            mutationType: mutation.mutationType,
        });

        if (completedBatch) {
            return {
                deletedCount: (completedBatch.response as { deletedCount: number })
                    .deletedCount,
                workspaceChanges: completedBatch.changes,
            };
        }

        return commitDeleteOperation({
            ledgerId,
            operation: persistedOperation.operation,
            persistedOperation,
            workspaceMutation: mutation,
        });
    }

    const deletionStates = await getTransactionDeletionStates(
        ledgerId,
        normalizedTransactionIds,
    );
    assertTransactionsAreNotLocked(deletionStates, "deleted");
    const impact = buildBulkTransactionDeletionImpact(deletionStates);
    const affectedPeriodIds = deletionStates.map(
        (state) => state.transaction.periodId,
    );

    assertDeletionPreviewRevision(previewRevision, impact.previewRevision);
    const transactionIdSet = new Set(
        deletionStates.map((state) => state.transaction.transactionId),
    );
    const autoMatchRejections = (
        await listTransactionAutoMatchRejections(ledgerId)
    ).filter(
        (rejection) =>
            transactionIdSet.has(rejection.leftTransactionId) ||
            transactionIdSet.has(rejection.rightTransactionId),
    );
    const reopenedImportActivities = await createReopenedImportActivities(
        ledgerId,
        deletionStates,
    );
    const unpersistedWorkspaceChanges = [
        ...createTransactionDeleteWorkspaceChanges({
            states: deletionStates,
        }),
        ...autoMatchRejections.map((rejection) => ({
            entityId: rejection.matchDecisionId,
            entityType: "transactionAutoMatchRejection" as const,
            operation: "delete" as const,
            previousRecordDigest: calculateWorkspaceRecordDigest({
                entityType: "transactionAutoMatchRejection",
                record: rejection,
            }),
            record: null,
        })),
        ...reopenedImportActivities.map(({ previous, record }) =>
            createWorkspaceUpsertChange(
                "transactionImportActivity",
                record.activityId,
                record,
                previous,
            ),
        ),
    ];
    const operation = {
        affectedPeriodIds: Array.from(new Set(affectedPeriodIds)).sort(),
        audit,
        bulkPreviewRevision: previewRevision,
        deletedCount: deletionStates.length,
        expectedPreviewRevisions: Object.fromEntries(
            deletionStates.map((state) => [
                state.transaction.transactionId,
                getTransactionDeletionPreviewRevision(state),
            ]),
        ),
        operationVersion: 3,
        requestDigest,
        transactionIds: normalizedTransactionIds,
    } satisfies DurableDeleteOperation;
    const chunks = chunkTransactionDeletionStates({
        autoMatchRejections,
        reservedItemCount: 4,
        states: deletionStates,
    });

    if (chunks.length > 1) {
        return commitDeleteOperation({
            ledgerId,
            operation,
            workspaceMutation: mutation,
        });
    }

    const workspaceCommit = await writeTransactionDeletionStates({
        autoMatchRejections,
        ledgerId,
        states: deletionStates,
        transactionImportActivitiesToPut: reopenedImportActivities.map(
            ({ record }) => record,
        ),
        workspaceMutation: {
            changes: unpersistedWorkspaceChanges,
            mutationId: mutation.mutationId,
            mutationType: mutation.mutationType,
            response: {
                deletedCount: deletionStates.length,
                requestDigest,
            },
        },
    });
    await Promise.all(
        deletionStates.map((state) =>
            deleteTransactionClassificationCachesSafely({
                ledgerId,
                transactionId: state.transaction.transactionId,
            }),
        ),
    );
    await recordTransactionAuditLog({
        action: getTransactionAuditAction({
            audit,
            defaultAction: "bulkDelete",
        }),
        actorUserId: audit?.actorUserId,
        ledgerId,
        source: resolveTransactionAuditSource({
            audit,
        }),
        summary: {
            deletedCount: deletionStates.length,
            periodIds: Array.from(new Set(affectedPeriodIds)).sort(),
        },
        suppress: audit?.suppress,
        transactionIds: deletionStates.map(
            (state) => state.transaction.transactionId,
        ),
    });

    return {
        deletedCount: deletionStates.length,
        workspaceChanges: workspaceCommit!.workspaceChanges,
    };
}

export async function deleteTransactions(
    ledgerId: string,
    transactionIds: string[],
    previewRevision: string,
    audit?: TransactionAuditContext,
) {
    const result = await deleteTransactionsInternal(
        ledgerId,
        transactionIds,
        previewRevision,
        audit,
    );

    return { deletedCount: result.deletedCount };
}

export async function deleteTransactionsWithWorkspaceChanges(
    ledgerId: string,
    transactionIds: string[],
    previewRevision: string,
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
) {
    return deleteTransactionsInternal(
        ledgerId,
        transactionIds,
        previewRevision,
        audit,
        workspaceMutation,
    );
}

export async function validateDeleteWorkspaceMutation(input: {
    ledgerId: string;
    previewRevision: string;
    transactionIds: Iterable<string>;
    workspaceMutation: TransactionWorkspaceMutation;
}) {
    const transactionIds = normalizeTransactionIds(input.transactionIds);
    const requestDigest = createBulkTransactionDeleteRequestDigest({
        ledgerId: input.ledgerId,
        mutationType: input.workspaceMutation.mutationType,
        previewRevision: input.previewRevision,
        transactionIds,
    });
    const persistedOperation = await findWorkspaceMutationOperation({
        ledgerId: input.ledgerId,
        mutationId: input.workspaceMutation.mutationId,
        mutationType: input.workspaceMutation.mutationType,
    });

    if (persistedOperation) {
        if (!isDurableDeleteOperation(persistedOperation.operation)) {
            throw new HttpError(
                409,
                "workspace_mutation_stale",
                "This saved bulk deletion operation uses an older format. Refresh and start it again.",
            );
        }

        assertDurableDeleteOperationMatches({
            operation: persistedOperation.operation,
            previewRevision: input.previewRevision,
            requestDigest,
            transactionIds,
        });
    }

    const completedBatch = await findWorkspaceMutationBatch({
        ledgerId: input.ledgerId,
        mutationId: input.workspaceMutation.mutationId,
        mutationType: input.workspaceMutation.mutationType,
    });

    if (!completedBatch) {
        return;
    }

    if (
        (completedBatch.response as { requestDigest?: unknown }).requestDigest !==
        requestDigest
    ) {
        throw new HttpError(
            409,
            "workspace_mutation_mismatch",
            "This bulk deletion request does not match its saved operation.",
        );
    }
}

async function mergeTransactionsInternal(
    ledgerId: string,
    transactionIds: string[],
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
    expectedMatchType?: TransactionAutoMatchType,
): Promise<{
    transaction: TransactionRecord;
    workspaceChanges: WorkspaceMutationChangeInput[];
}> {
    const uniqueTransactionIds = normalizeTransactionIds(transactionIds);

    if (uniqueTransactionIds.length !== 2) {
        throw new HttpError(
            422,
            "transaction_merge_count",
            "Select exactly two transactions to merge.",
        );
    }

    const states = await Promise.all(
        uniqueTransactionIds.map((transactionId) =>
            getTransactionDeletionState(ledgerId, transactionId),
        ),
    );
    const [left, right] = states;

    if (!left || !right) {
        throw new HttpError(
            422,
            "transaction_merge_count",
            "Select exactly two transactions to merge.",
        );
    }

    if (
        left.transaction.status === "voided" ||
        right.transaction.status === "voided"
    ) {
        throw new HttpError(
            409,
            "transaction_merge_voided",
            "Voided transactions cannot be merged.",
        );
    }

    assertTransactionsAreNotLocked(states, "merged");

    const linkedImportActivities = (
        await listTransactionImportActivities(ledgerId)
    ).filter(
        (activity) =>
            activity.linkedTransactionId &&
            uniqueTransactionIds.includes(activity.linkedTransactionId),
    );
    const activityIdsByProvider = new Map<string, Set<string>>();
    for (const activity of linkedImportActivities) {
        const activityIds =
            activityIdsByProvider.get(activity.provider) ?? new Set<string>();
        activityIds.add(activity.activityId);
        activityIdsByProvider.set(activity.provider, activityIds);
    }
    const conflictingProvider = Array.from(activityIdsByProvider.entries()).find(
        ([, activityIds]) => activityIds.size > 1,
    )?.[0];

    if (conflictingProvider) {
        throw new HttpError(
            422,
            "transaction_merge_import_activity_conflict",
            `Transactions from different ${conflictingProvider} importer activities cannot be merged.`,
        );
    }

    if (
        Math.abs(left.transaction.displayAmountCents) !==
        Math.abs(right.transaction.displayAmountCents)
    ) {
        throw new HttpError(
            422,
            "transaction_merge_amount",
            "Selected transactions must have matching amounts.",
        );
    }

    if (
        transactionMergeStateHasMultipleLines(left) &&
        transactionMergeStateHasMultipleLines(right)
    ) {
        throw new HttpError(
            422,
            "transaction_merge_line_conflict",
            "Transactions with multiple lines cannot both be merged.",
        );
    }

    let expectedPair: TransactionAutoMatchPair | undefined;

    if (expectedMatchType) {
        const references = await loadTransactionReferenceRecords(ledgerId);
        const matches = findTransactionAutoMatches({
            accounts: references.accounts,
            transactions: states.map((state) => ({
                ...state.transaction,
                lines: state.children.lines,
                postings: state.children.postings,
            })),
        });

        expectedPair = [...matches.readyPairs, ...matches.ambiguousPairs].find(
            (pair) => pair.matchType === expectedMatchType,
        );
    }

    if (expectedMatchType && !expectedPair) {
        throw new HttpError(
            409,
            "transaction_auto_match_stale",
            "These transactions are no longer an eligible auto match.",
        );
    }

    const survivor = chooseTransactionMergeSurvivor(states, uniqueTransactionIds);
    const duplicate = states.find(
        (state) =>
            state.transaction.transactionId !== survivor.transaction.transactionId,
    )!;
    const content = chooseTransactionMergeContent(states, survivor);
    const plaidState = states.find(transactionMergeStateHasPlaidMetadata);
    const now = new Date().toISOString();
    const relinkedImportActivities = createRelinkedTransactionImportActivities({
        activities: linkedImportActivities,
        now,
        transactionId: survivor.transaction.transactionId,
    }).filter(
        ({ previous, record }) =>
            previous.linkedTransactionId !== record.linkedTransactionId ||
            previous.state !== record.state,
    );
    const linkedImporterTransactionIds = new Set(
        linkedImportActivities.flatMap((activity) =>
            activity.linkedTransactionId ? [activity.linkedTransactionId] : [],
        ),
    );
    const nonImporterState = states.find(
        (state) =>
            !linkedImporterTransactionIds.has(state.transaction.transactionId),
    );
    const importerMemo = linkedImportActivities.find((activity) =>
        normalizeOptionalString(activity.memo),
    )?.memo;
    const syncRecords = states.flatMap(
        (state) => state.plaidTransactionSyncRecords,
    );
    const transfer =
        expectedPair?.matchType === "creditCardPayment" ||
        expectedPair?.matchType === "bankTransfer"
            ? expectedPair.transfer
            : undefined;
    const synthesizedLine = survivor.children.lines[0] ?? content.children.lines[0];
    const mergedLines =
        transfer?.requiresTransferSynthesis && synthesizedLine
            ? [
                  {
                      amountCents: transfer.amountCents,
                      fromAccountId: transfer.sourceAccount.accountId,
                      lineId: synthesizedLine.lineId,
                      memo: synthesizedLine.memo,
                      payee: synthesizedLine.payee,
                      sortOrder: 0,
                      toAccountId: transfer.destinationAccount.accountId,
                  },
              ]
            : content.children.lines.map((line, index) => ({
                  amountCents: line.amountCents,
                  categoryId: line.categoryId,
                  fromAccountId: line.fromAccountId,
                  lineId: line.lineId,
                  memo: line.memo,
                  payee: line.payee,
                  sortOrder: index,
                  toAccountId: line.toAccountId,
              }));

    const mergedResult = await upsertTransactionInternal(ledgerId, {
        accountId:
            transfer?.sourceAccount.accountId ??
            content.transaction.referenceAccountId,
        kind: content.transaction.kind,
        lines: mergedLines,
        memo: selectDefinedTransactionMergeText(
            nonImporterState?.transaction.memo,
            importerMemo,
            selectTransactionMergeMemo(states, content, survivor),
        ),
        occurredAt: survivor.transaction.occurredAt,
        payee: selectDefinedTransactionMergeText(
            content.transaction.payee,
            survivor.transaction.payee,
            duplicate.transaction.payee,
        ),
        plaidTransactionSyncId:
            plaidState?.transaction.plaidTransactionSyncId ??
            plaidState?.plaidTransactionSyncRecords[0]?.plaidTransactionSyncId ??
            survivor.transaction.plaidTransactionSyncId ??
            duplicate.transaction.plaidTransactionSyncId,
        source: plaidState
            ? "plaid"
            : linkedImportActivities.some((activity) => activity.provider === "venmo")
              ? "venmo"
              : content.transaction.source ?? survivor.transaction.source ?? "manual",
        transactionId: survivor.transaction.transactionId,
        audit: { suppress: true },
        deferWrite: true,
    });

    if (
        !("record" in mergedResult) ||
        !mergedResult.record ||
        !mergedResult.existingChildren
    ) {
        throw new Error("Unable to prepare the merged transaction.");
    }

    const merged = mergedResult.record;
    const movedPlaidTransactionSyncRecords =
        createMovedPlaidTransactionSyncRecords({
            now,
            records: syncRecords,
            transactionId: survivor.transaction.transactionId,
        });
    attachTransactionAggregateMetadata({
        ledgerPostings: mergedResult.postingRecords,
        plaidTransactionSyncs: movedPlaidTransactionSyncRecords,
        record: merged,
        transactionLines: mergedResult.lineRecords,
    });
    const autoMatchRejections = (
        await listTransactionAutoMatchRejections(ledgerId)
    ).filter(
        (rejection) =>
            uniqueTransactionIds.includes(rejection.leftTransactionId) ||
            uniqueTransactionIds.includes(rejection.rightTransactionId),
    );
    const survivorChildrenAfterMerge = {
        lines: mergedResult.lineRecords,
        postings: mergedResult.postingRecords,
    };
    const unpersistedWorkspaceChanges = [
        ...createMergeWorkspaceChanges({
            duplicate,
            merged,
            movedPlaidTransactionSyncRecords,
            survivor,
            survivorChildrenAfterMerge,
        }),
        ...autoMatchRejections.map((rejection) => ({
            entityId: rejection.matchDecisionId,
            entityType: "transactionAutoMatchRejection" as const,
            operation: "delete" as const,
            previousRecordDigest: calculateWorkspaceRecordDigest({
                entityType: "transactionAutoMatchRejection",
                record: rejection,
            }),
            record: null,
        })),
        ...relinkedImportActivities.map(({ previous, record }) =>
            createWorkspaceUpsertChange(
                "transactionImportActivity",
                record.activityId,
                record,
                previous,
            ),
        ),
    ];
    const mutation = workspaceMutation ?? {
        mutationId: `transaction.merge:${uniqueTransactionIds.join(":")}:${ulid()}`,
        mutationType: "transaction.merge",
    };
    const workspaceCommit = await writeTransactionState({
        autoMatchRejectionsToDelete: autoMatchRejections,
        transactionImportActivitiesToPut: relinkedImportActivities.map(
            ({ record }) => record,
        ),
        deletedTransactionState: duplicate,
        existing: mergedResult.existing,
        existingChildren: mergedResult.existingChildren,
        lineRecords: mergedResult.lineRecords,
        plaidTransactionSyncRecordsToPut: movedPlaidTransactionSyncRecords,
        postingRecords: mergedResult.postingRecords,
        preserveDeletedLineKeys: new Set(
            mergedResult.lineRecords.map(
                (line) => `${line.transactionId}:${line.lineId}`,
            ),
        ),
        preserveDeletedPostingKeys: new Set(
            mergedResult.postingRecords.map(
                (posting) => `${posting.transactionId}:${posting.postingId}`,
            ),
        ),
        record: merged,
        workspaceMutation: {
            changes: unpersistedWorkspaceChanges,
            mutationId: mutation.mutationId,
            mutationType: mutation.mutationType,
            response: {},
        },
    });
    await Promise.all([
        deleteTransactionClassificationCachesSafely({
            ledgerId,
            transactionId: duplicate.transaction.transactionId,
        }),
        trySyncTransactionClassificationCaches({
            ledgerId,
            lines: mergedResult.lineRecords,
            transaction: merged,
        }),
    ]);
    await recordTransactionAuditLog({
        action: getTransactionAuditAction({
            audit,
            defaultAction: "merge",
        }),
        actorUserId: audit?.actorUserId,
        after: createTransactionAuditAggregate({
            transaction: merged,
            transactionLines: mergedLines,
        }),
        before: createTransactionAuditAggregate({
            transaction: {
                mergedTransactions: states.map((state) =>
                    createAggregateFromTransactionState({
                        children: state.children,
                        plaidTransactionSyncRecords: state.plaidTransactionSyncRecords,
                        transaction: state.transaction,
                    }),
                ),
            },
        }),
        ledgerId,
        source: resolveTransactionAuditSource({
            audit: {
                source: "merge",
                ...audit,
            },
        }),
        summary: {
            duplicateTransactionId: duplicate.transaction.transactionId,
            survivorTransactionId: survivor.transaction.transactionId,
        },
        suppress: audit?.suppress,
        transactionId: survivor.transaction.transactionId,
        transactionIds: uniqueTransactionIds,
    });

    return {
        transaction: toPublicTransactionRecord(merged),
        workspaceChanges: workspaceCommit!.workspaceChanges,
    };
}

export async function mergeTransactions(
    ledgerId: string,
    transactionIds: string[],
    audit?: TransactionAuditContext,
) {
    return (await mergeTransactionsInternal(ledgerId, transactionIds, audit))
        .transaction;
}

export async function mergeTransactionsWithWorkspaceChanges(
    ledgerId: string,
    transactionIds: string[],
    audit?: TransactionAuditContext,
    workspaceMutation?: TransactionWorkspaceMutation,
    expectedMatchType?: TransactionAutoMatchType,
) {
    return mergeTransactionsInternal(
        ledgerId,
        transactionIds,
        audit,
        workspaceMutation,
        expectedMatchType,
    );
}
