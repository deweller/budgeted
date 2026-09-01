import type { PlaidTransactionSyncRecord } from "@/features/plaid/server/plaid-service";
import type { TransactionAutoMatchRejectionRecord } from "@/features/transactions/server/transaction-auto-match-rejection-service";
import type { WorkspaceTransactionImportActivityRecord } from "@/lib/workspace/sync-types";
import { toStoredTransactionLineRecord } from "@/features/transactions/server/transaction-line-service";
import type {
    TransactionDeletionState,
    TransactionWriteState,
} from "@/features/transactions/server/transaction-write-model";
import {
    commitAtomicWorkspaceMutation,
    type AtomicWorkspaceMutationResult,
} from "@/features/workspace/server/workspace-atomic-commit";
import { assertWorkspaceTransactionCommitted } from "@/features/workspace/server/workspace-transaction-conflict";
import type {
    WorkspaceMutationChangeInput,
    WorkspaceMutationOperation,
} from "@/features/workspace/server/workspace-sync-service";
import { HttpError } from "@/lib/api/errors";
import { getBudgetedSchema } from "@/lib/db/schema";

export type TransactionAtomicWorkspaceMutation = {
    changes: WorkspaceMutationChangeInput[];
    mutationId: string;
    mutationType: string;
    response: unknown;
};

export function assertTransactionWriteItemCount(itemCount: number) {
    if (itemCount > 100) {
        throw new HttpError(
            422,
            "transaction_write_too_large",
            "This transaction has too many ledger rows to save in a single write.",
        );
    }
}

export function getTransactionDeletionStateItemCount(
    state: TransactionDeletionState,
) {
    return (
        1 +
        state.children.lines.length +
        state.children.postings.length +
        state.plaidTransactionSyncRecords.length
    );
}

function getRemovedPostingRecords(state: TransactionWriteState) {
    const retainedPostingIds = new Set(
        state.postingRecords.map((posting) => posting.postingId),
    );

    return state.existingChildren.postings.filter(
        (posting) => !retainedPostingIds.has(posting.postingId),
    );
}

export function getTransactionWriteStateItemCount(
    state: TransactionWriteState,
) {
    const retainedLineIds = new Set(
        state.lineRecords.map((line) => line.lineId),
    );
    const removedLines = state.existingChildren.lines.filter(
        (line) => !retainedLineIds.has(line.lineId),
    );
    const removedPostings = getRemovedPostingRecords(state);
    const shouldDeletePreviousTransactionKey =
        state.existing &&
        state.existing.occurredAt !== state.record.occurredAt;

    return (
        1 +
        removedPostings.length +
        removedLines.length +
        state.postingRecords.length +
        state.lineRecords.length +
        (shouldDeletePreviousTransactionKey ? 1 : 0)
    );
}

export async function persistTransactionDeletionStates(input: {
    autoMatchRejections: TransactionAutoMatchRejectionRecord[];
    ledgerId: string;
    states: TransactionDeletionState[];
    workspaceMutation?: TransactionAtomicWorkspaceMutation;
    workspaceMutationOperation?: WorkspaceMutationOperation;
    transactionImportActivitiesToPut?: WorkspaceTransactionImportActivityRecord[];
}): Promise<AtomicWorkspaceMutationResult<unknown> | null> {
    const { service } = getBudgetedSchema();
    const domainItemCount =
        input.states.reduce(
            (total, state) =>
                total + getTransactionDeletionStateItemCount(state),
            0,
        ) + input.autoMatchRejections.length + (input.transactionImportActivitiesToPut?.length ?? 0);
    const buildDomainItems: Parameters<
        typeof commitAtomicWorkspaceMutation
    >[0]["buildDomainItems"] = (entities) => [
        ...input.states.flatMap((state) => [
            entities.transactions
                .delete({
                    ledgerId: input.ledgerId,
                    occurredAt: state.transaction.occurredAt,
                    transactionId: state.transaction.transactionId,
                })
                .commit(),
            ...state.children.lines.map((line) =>
                entities.transactionLines
                    .delete({
                        ledgerId: input.ledgerId,
                        lineId: line.lineId,
                        transactionId: line.transactionId,
                    })
                    .commit(),
            ),
            ...state.children.postings.map((posting) =>
                entities.ledgerPostings
                    .delete({
                        ledgerId: input.ledgerId,
                        postingId: posting.postingId,
                        transactionId: posting.transactionId,
                    })
                    .commit(),
            ),
            ...state.plaidTransactionSyncRecords.map((syncRecord) =>
                entities.plaidTransactionSyncs
                    .delete({
                        ledgerId: input.ledgerId,
                        plaidTransactionSyncId:
                            syncRecord.plaidTransactionSyncId,
                    })
                    .commit(),
            ),
        ]),
        ...input.autoMatchRejections.map((rejection) =>
            entities.transactionAutoMatchRejections
                .delete({
                    ledgerId: input.ledgerId,
                    matchDecisionId: rejection.matchDecisionId,
                })
                .commit(),
        ),
        ...(input.transactionImportActivitiesToPut?.map((activity) =>
            entities.transactionImportActivities.put(activity).commit(),
        ) ?? []),
    ];

    if (input.workspaceMutation) {
        return commitAtomicWorkspaceMutation({
            buildDomainItems,
            changes: input.workspaceMutation.changes,
            domainItemCount,
            ledgerId: input.ledgerId,
            mutationId: input.workspaceMutation.mutationId,
            mutationType: input.workspaceMutation.mutationType,
            operation: input.workspaceMutationOperation,
            response: input.workspaceMutation.response,
        });
    }

    assertTransactionWriteItemCount(domainItemCount);
    const transactionResult = await service.transaction
        .write(buildDomainItems)
        .go();
    assertWorkspaceTransactionCommitted(transactionResult, {
        hasRevisionFence: false,
    });

    return null;
}

export async function persistTransactionWriteState(
    input: TransactionWriteState & {
        additionalTransactionStates?: TransactionWriteState[];
        transactionImportActivitiesToPut?: WorkspaceTransactionImportActivityRecord[];
        autoMatchRejectionsToDelete?: TransactionAutoMatchRejectionRecord[];
        deletedTransactionState?: TransactionDeletionState;
        plaidTransactionSyncRecordsToPut?: PlaidTransactionSyncRecord[];
        preserveDeletedPostingKeys?: Set<string>;
        preserveDeletedLineKeys?: Set<string>;
        workspaceMutation?: TransactionAtomicWorkspaceMutation;
        workspaceMutationOperation?: WorkspaceMutationOperation;
    },
): Promise<AtomicWorkspaceMutationResult<unknown> | null> {
    const { service } = getBudgetedSchema();
    const transactionStates: TransactionWriteState[] = [
        {
            existing: input.existing,
            existingChildren: input.existingChildren,
            expectedTransactionUpdatedAt: input.expectedTransactionUpdatedAt,
            lineRecords: input.lineRecords,
            postingRecords: input.postingRecords,
            record: input.record,
        },
        ...(input.additionalTransactionStates ?? []),
    ];
    const domainItemCount =
        transactionStates.reduce(
            (total, state) =>
                total + getTransactionWriteStateItemCount(state),
            0,
        ) +
        (input.deletedTransactionState
            ? 1 +
              input.deletedTransactionState.children.lines.filter(
                  (line) =>
                      !input.preserveDeletedLineKeys?.has(
                          `${line.transactionId}:${line.lineId}`,
                      ),
              ).length +
              input.deletedTransactionState.children.postings.filter(
                  (posting) =>
                      !input.preserveDeletedPostingKeys?.has(
                          `${posting.transactionId}:${posting.postingId}`,
                      ),
              ).length
            : 0) +
        (input.plaidTransactionSyncRecordsToPut?.length ?? 0) +
        (input.transactionImportActivitiesToPut?.length ?? 0) +
        (input.autoMatchRejectionsToDelete?.length ?? 0);
    const buildDomainItems: Parameters<
        typeof commitAtomicWorkspaceMutation
    >[0]["buildDomainItems"] = (entities) => [
        ...transactionStates.flatMap((state) => {
            const retainedLineIds = new Set(
                state.lineRecords.map((line) => line.lineId),
            );
            const removedLines = state.existingChildren.lines.filter(
                (line) => !retainedLineIds.has(line.lineId),
            );
            const removedPostings = getRemovedPostingRecords(state);
            const shouldDeletePreviousTransactionKey =
                state.existing &&
                state.existing.occurredAt !== state.record.occurredAt;

            return [
                ...(state.expectedTransactionUpdatedAt
                    ? [
                          entities.transactions
                              .put(state.record)
                              .where((attributes, operations) =>
                                  operations.eq(
                                      attributes.updatedAt,
                                      state.expectedTransactionUpdatedAt!,
                                  ),
                              )
                              .commit(),
                      ]
                    : [entities.transactions.put(state.record).commit()]),
                ...(shouldDeletePreviousTransactionKey
                    ? [
                          entities.transactions
                              .delete({
                                  ledgerId: state.record.ledgerId,
                                  occurredAt: state.existing!.occurredAt,
                                  transactionId: state.record.transactionId,
                              })
                              .commit(),
                      ]
                    : []),
                ...removedPostings.map((posting) =>
                    entities.ledgerPostings
                        .delete({
                            ledgerId: posting.ledgerId,
                            postingId: posting.postingId,
                            transactionId: posting.transactionId,
                        })
                        .commit(),
                ),
                ...removedLines.map((line) =>
                    entities.transactionLines
                        .delete({
                            ledgerId: line.ledgerId,
                            lineId: line.lineId,
                            transactionId: line.transactionId,
                        })
                        .commit(),
                ),
                ...state.postingRecords.map((posting) =>
                    entities.ledgerPostings.put(posting).commit(),
                ),
                ...state.lineRecords.map((line) =>
                    entities.transactionLines
                        .put(toStoredTransactionLineRecord(line))
                        .commit(),
                ),
            ];
        }),
        ...(input.deletedTransactionState
            ? [
                  entities.transactions
                      .delete({
                          ledgerId: input.record.ledgerId,
                          occurredAt:
                              input.deletedTransactionState.transaction
                                  .occurredAt,
                          transactionId:
                              input.deletedTransactionState.transaction
                                  .transactionId,
                      })
                      .commit(),
                  ...input.deletedTransactionState.children.lines
                      .filter(
                          (line) =>
                              !input.preserveDeletedLineKeys?.has(
                                  `${line.transactionId}:${line.lineId}`,
                              ),
                      )
                      .map((line) =>
                          entities.transactionLines
                              .delete({
                                  ledgerId: line.ledgerId,
                                  lineId: line.lineId,
                                  transactionId: line.transactionId,
                              })
                              .commit(),
                      ),
                  ...input.deletedTransactionState.children.postings
                      .filter(
                          (posting) =>
                              !input.preserveDeletedPostingKeys?.has(
                                  `${posting.transactionId}:${posting.postingId}`,
                              ),
                      )
                      .map((posting) =>
                          entities.ledgerPostings
                              .delete({
                                  ledgerId: posting.ledgerId,
                                  postingId: posting.postingId,
                                  transactionId: posting.transactionId,
                              })
                              .commit(),
                      ),
              ]
            : []),
        ...(input.plaidTransactionSyncRecordsToPut?.map((syncRecord) =>
            entities.plaidTransactionSyncs.put(syncRecord).commit(),
        ) ?? []),
        ...(input.transactionImportActivitiesToPut?.map((activity) =>
            entities.transactionImportActivities.put(activity).commit(),
        ) ?? []),
        ...(input.autoMatchRejectionsToDelete?.map((rejection) =>
            entities.transactionAutoMatchRejections
                .delete({
                    ledgerId: input.record.ledgerId,
                    matchDecisionId: rejection.matchDecisionId,
                })
                .commit(),
        ) ?? []),
    ];

    if (input.workspaceMutation) {
        return commitAtomicWorkspaceMutation({
            buildDomainItems,
            changes: input.workspaceMutation.changes,
            domainItemCount,
            ledgerId: input.record.ledgerId,
            mutationId: input.workspaceMutation.mutationId,
            mutationType: input.workspaceMutation.mutationType,
            operation: input.workspaceMutationOperation,
            response: input.workspaceMutation.response,
        });
    }

    assertTransactionWriteItemCount(domainItemCount);
    const transactionResult = await service.transaction
        .write(buildDomainItems)
        .go();
    assertWorkspaceTransactionCommitted(transactionResult, {
        hasRevisionFence: false,
    });

    return null;
}
