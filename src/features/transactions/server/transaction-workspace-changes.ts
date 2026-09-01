import type { PlaidTransactionSyncRecord } from "@/features/plaid/server/plaid-service";
import {
    toPublicTransactionLineCategoryId,
    toPublicTransactionLineFromAccountId,
    toPublicTransactionLineToAccountId,
} from "@/features/transactions/models/transaction-line-normalization";
import type { PersistedPosting } from "@/features/transactions/server/posting-service";
import {
    toPublicTransactionLineRecord,
    type PersistedTransactionLine,
} from "@/features/transactions/server/transaction-line-service";
import {
    toPublicTransactionRecord,
    type TransactionDeletionState,
    type TransactionRecord,
} from "@/features/transactions/server/transaction-write-model";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";

export function createTransactionWorkspaceUpsertChange(
    entityType: WorkspaceMutationChangeInput["entityType"],
    entityId: string,
    record: unknown,
    previousRecord: unknown | null,
): WorkspaceMutationChangeInput {
    const canonicalPreviousRecord =
        entityType === "transaction" && previousRecord
            ? toPublicTransactionRecord(previousRecord as TransactionRecord)
            : entityType === "transactionLine" && previousRecord
              ? toPublicWorkspaceTransactionLineRecord(
                    previousRecord as PersistedTransactionLine,
                )
              : previousRecord;

    return {
        entityId,
        entityType,
        operation: "upsert",
        previousRecordDigest: canonicalPreviousRecord
            ? calculateWorkspaceRecordDigest({
                  entityType,
                  record: canonicalPreviousRecord,
              })
            : null,
        record,
    };
}

export function createTransactionWorkspaceDeleteChange(
    entityType: WorkspaceMutationChangeInput["entityType"],
    entityId: string,
    previousRecord?: unknown,
): WorkspaceMutationChangeInput {
    const canonicalPreviousRecord =
        entityType === "transaction" && previousRecord
            ? toPublicTransactionRecord(previousRecord as TransactionRecord)
            : entityType === "transactionLine" && previousRecord
              ? toPublicWorkspaceTransactionLineRecord(
                    previousRecord as PersistedTransactionLine,
                )
              : previousRecord;

    return {
        entityId,
        entityType,
        operation: "delete",
        previousRecordDigest: canonicalPreviousRecord
            ? calculateWorkspaceRecordDigest({
                  entityType,
                  record: canonicalPreviousRecord,
              })
            : null,
        record: null,
    };
}

export function toPublicWorkspaceTransactionLineRecord(
    line: PersistedTransactionLine,
) {
    const record = { ...line };
    const categoryId = toPublicTransactionLineCategoryId(line.categoryId);
    const fromAccountId = toPublicTransactionLineFromAccountId(
        line.fromAccountId,
    );
    const toAccountId = toPublicTransactionLineToAccountId(line.toAccountId);

    if (categoryId) record.categoryId = categoryId;
    else delete record.categoryId;
    if (fromAccountId) record.fromAccountId = fromAccountId;
    else delete record.fromAccountId;
    if (toAccountId) record.toAccountId = toAccountId;
    else delete record.toAccountId;

    return record;
}

export function createTransactionUpsertWorkspaceChanges(input: {
    existing?: TransactionRecord;
    existingChildren: {
        lines: PersistedTransactionLine[];
        postings: PersistedPosting[];
    };
    lineRecords: PersistedTransactionLine[];
    postingRecords: PersistedPosting[];
    record: TransactionRecord;
}) {
    const retainedLineIds = new Set(
        input.lineRecords.map((line) => line.lineId),
    );

    return [
        ...input.existingChildren.lines
            .filter((line) => !retainedLineIds.has(line.lineId))
            .map((line) =>
                createTransactionWorkspaceDeleteChange(
                    "transactionLine",
                    line.lineId,
                    line,
                ),
            ),
        ...input.existingChildren.postings.map((posting) =>
            createTransactionWorkspaceDeleteChange(
                "ledgerPosting",
                posting.postingId,
                posting,
            ),
        ),
        createTransactionWorkspaceUpsertChange(
            "transaction",
            input.record.transactionId,
            toPublicTransactionRecord(input.record),
            input.existing ?? null,
        ),
        ...input.lineRecords.map((line) =>
            createTransactionWorkspaceUpsertChange(
                "transactionLine",
                line.lineId,
                toPublicTransactionLineRecord(line),
                input.existingChildren.lines.find(
                    (existingLine) => existingLine.lineId === line.lineId,
                ) ?? null,
            ),
        ),
        ...input.postingRecords.map((posting) =>
            createTransactionWorkspaceUpsertChange(
                "ledgerPosting",
                posting.postingId,
                posting,
                input.existingChildren.postings.find(
                    (existingPosting) =>
                        existingPosting.postingId === posting.postingId,
                ) ?? null,
            ),
        ),
    ];
}

export function createTransactionDeleteWorkspaceChanges(input: {
    states: TransactionDeletionState[];
}) {
    return input.states.flatMap((state) => [
        createTransactionWorkspaceDeleteChange(
            "transaction",
            state.transaction.transactionId,
            state.transaction,
        ),
        ...state.children.lines.map((line) =>
            createTransactionWorkspaceDeleteChange(
                "transactionLine",
                line.lineId,
                line,
            ),
        ),
        ...state.children.postings.map((posting) =>
            createTransactionWorkspaceDeleteChange(
                "ledgerPosting",
                posting.postingId,
                posting,
            ),
        ),
        ...state.plaidTransactionSyncRecords.map((record) =>
            createTransactionWorkspaceDeleteChange(
                "plaidTransactionSync",
                record.plaidTransactionSyncId,
                record,
            ),
        ),
    ]);
}

export function createMovedPlaidTransactionSyncRecords(input: {
    now: string;
    records: PlaidTransactionSyncRecord[];
    transactionId: string;
}) {
    return input.records.map((record) =>
        record.transactionId === input.transactionId
            ? record
            : {
                  ...record,
                  transactionId: input.transactionId,
                  updatedAt: input.now,
              },
    );
}

export function createMergeWorkspaceChanges(input: {
    duplicate: TransactionDeletionState;
    merged: TransactionRecord;
    movedPlaidTransactionSyncRecords: PlaidTransactionSyncRecord[];
    survivor: TransactionDeletionState;
    survivorChildrenAfterMerge: {
        lines: PersistedTransactionLine[];
        postings: PersistedPosting[];
    };
}) {
    const finalLineIds = new Set(
        input.survivorChildrenAfterMerge.lines.map((line) => line.lineId),
    );
    const finalPostingIds = new Set(
        input.survivorChildrenAfterMerge.postings.map(
            (posting) => posting.postingId,
        ),
    );
    const previousLines = [
        ...input.survivor.children.lines,
        ...input.duplicate.children.lines,
    ];
    const previousLineById = new Map(
        previousLines.map((line) => [line.lineId, line]),
    );
    const movedLineIds = new Set(
        input.survivorChildrenAfterMerge.lines.flatMap((line) => {
            const previousLine = previousLineById.get(line.lineId);
            return previousLine && previousLine.transactionId !== line.transactionId
                ? [line.lineId]
                : [];
        }),
    );
    const previousPostings = [
        ...input.survivor.children.postings,
        ...input.duplicate.children.postings,
    ];
    const previousPlaidTransactionSyncRecordById = new Map(
        [
            ...input.survivor.plaidTransactionSyncRecords,
            ...input.duplicate.plaidTransactionSyncRecords,
        ].map((record) => [record.plaidTransactionSyncId, record]),
    );

    return [
        createTransactionWorkspaceUpsertChange(
            "transaction",
            input.merged.transactionId,
            toPublicTransactionRecord(input.merged),
            input.survivor.transaction,
        ),
        createTransactionWorkspaceDeleteChange(
            "transaction",
            input.duplicate.transaction.transactionId,
            input.duplicate.transaction,
        ),
        ...previousLines
            .filter(
                (line) =>
                    !finalLineIds.has(line.lineId) ||
                    movedLineIds.has(line.lineId),
            )
            .map((line) =>
                createTransactionWorkspaceDeleteChange(
                    "transactionLine",
                    line.lineId,
                    line,
                ),
            ),
        ...previousPostings
            .filter((posting) => !finalPostingIds.has(posting.postingId))
            .map((posting) =>
                createTransactionWorkspaceDeleteChange(
                    "ledgerPosting",
                    posting.postingId,
                    posting,
                ),
            ),
        ...input.survivorChildrenAfterMerge.lines.map((line) =>
            createTransactionWorkspaceUpsertChange(
                "transactionLine",
                line.lineId,
                toPublicTransactionLineRecord(line),
                movedLineIds.has(line.lineId)
                    ? null
                    : (previousLineById.get(line.lineId) ?? null),
            ),
        ),
        ...input.survivorChildrenAfterMerge.postings.map((posting) =>
            createTransactionWorkspaceUpsertChange(
                "ledgerPosting",
                posting.postingId,
                posting,
                previousPostings.find(
                    (previousPosting) =>
                        previousPosting.postingId === posting.postingId,
                ) ?? null,
            ),
        ),
        ...input.movedPlaidTransactionSyncRecords.map((record) =>
            createTransactionWorkspaceUpsertChange(
                "plaidTransactionSync",
                record.plaidTransactionSyncId,
                record,
                previousPlaidTransactionSyncRecordById.get(
                    record.plaidTransactionSyncId,
                ) ?? null,
            ),
        ),
    ];
}
