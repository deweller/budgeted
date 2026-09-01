import { ulid } from "ulid";

import {
    inferTransactionReferenceCategoryId,
    toVisibleReferenceCategoryId,
} from "@/features/transactions/models/reference-category";
import {
    chooseTransactionMergeContent,
    chooseTransactionMergeSurvivor,
    selectDefinedTransactionMergeText,
    selectTransactionMergeMemo,
    transactionMergeStateHasPlaidMetadata,
} from "@/features/transactions/models/transaction-merge-selection";
import {
    getCrossAccountTransferMatch,
    type TransactionAutoMatchAccount,
    type TransactionAutoMatchType,
} from "@/features/transactions/models/transaction-auto-match";
import type {
    TransactionInput,
    TransactionLineInput,
} from "@/features/transactions/models/transaction-form";
import { toTransactionOccurredAt } from "@/features/transactions/models/transaction-date";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import { normalizeOptionalString } from "@/lib/strings";
import {
    createOptimisticWorkspaceDelete,
    createOptimisticWorkspaceUpsert,
    type OptimisticWorkspaceChange,
} from "@/lib/workspace/optimistic-changes";
import { readWorkspaceMutationWorkspaceChanges } from "@/lib/workspace/mutation-response";
import type {
    WorkspaceLedgerPostingRecord,
    WorkspacePlaidTransactionSyncRecord,
    WorkspaceSnapshot,
    WorkspaceTransactionLineRecord,
    WorkspaceTransactionRecord,
} from "@/lib/workspace/sync-types";
import { UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID } from "@/modules/budgeting/uncategorized";
import {
    buildTransactionLinePostingInputs,
    deriveTransactionDisplayAmountCents,
    getMonthlyPeriodId,
    groupTransactionPostingInputs,
} from "@/modules/ledger";

type OptimisticTransaction = WorkspaceSnapshot["transactions"][number];
type OptimisticTransactionAccount = TransactionAutoMatchAccount;
type OptimisticTransactionCategory = {
    categoryId: string;
    ledgerAccountId: string;
};

type CreateOptimisticTransactionChangesInput = {
    accounts: OptimisticTransactionAccount[];
    categories: OptimisticTransactionCategory[];
    input: TransactionInput;
    transaction: OptimisticTransaction;
};

function requireAccount(
    accountsById: Map<string, OptimisticTransactionAccount>,
    accountId: string | undefined,
) {
    if (!accountId) {
        return undefined;
    }

    const account = accountsById.get(accountId);

    if (!account) {
        throw new Error(
            "One or more transaction lines reference a missing account.",
        );
    }

    return account;
}

function requireCategory(
    categoriesById: Map<string, OptimisticTransactionCategory>,
    categoryId: string | undefined,
) {
    if (!categoryId) {
        return undefined;
    }

    const category = categoriesById.get(categoryId);

    if (!category) {
        throw new Error(
            "One or more transaction lines reference a missing category.",
        );
    }

    return category;
}

function normalizeOptimisticTransactionLines(
    lines: TransactionLineInput[],
): TransactionLineInput[] {
    return lines.map((line, index) => ({
        ...line,
        categoryId: normalizeOptionalString(line.categoryId),
        fromAccountId: normalizeOptionalString(line.fromAccountId),
        lineId: normalizeOptionalString(line.lineId),
        memo: normalizeOptionalString(line.memo),
        payee: normalizeOptionalString(line.payee),
        sortOrder: line.sortOrder ?? index,
        toAccountId: normalizeOptionalString(line.toAccountId),
    }));
}

function createOptimisticTransactionLineRecords(input: {
    lines: TransactionLineInput[];
    now: string;
    transaction: OptimisticTransaction;
}): WorkspaceTransactionLineRecord[] {
    const existingById = new Map(
        input.transaction.lines.map((line) => [line.lineId, line]),
    );

    return input.lines.map((line, index) => {
        const existing = line.lineId ? existingById.get(line.lineId) : undefined;

        return {
            amountCents: line.amountCents,
            categoryId: line.categoryId,
            createdAt: existing?.createdAt ?? input.now,
            fromAccountId: line.fromAccountId,
            lineId: existing?.lineId ?? line.lineId ?? ulid(),
            memo: normalizeOptionalString(line.memo),
            payee: normalizeOptionalString(line.payee),
            sortOrder: line.sortOrder ?? index,
            toAccountId: line.toAccountId,
            transactionId: input.transaction.transactionId,
            updatedAt: input.now,
            ledgerId: input.transaction.ledgerId,
        };
    });
}

function createOptimisticPostingRecords(input: {
    now: string;
    occurredAt: string;
    periodId: string;
    postings: ReturnType<typeof groupTransactionPostingInputs>;
    transaction: OptimisticTransaction;
}): WorkspaceLedgerPostingRecord[] {
    return input.postings.map((posting) => ({
        ...posting,
        createdAt: input.now,
        occurredAt: input.occurredAt,
        periodId: input.periodId,
        postingId: ulid(),
        transactionId: input.transaction.transactionId,
        ledgerId: input.transaction.ledgerId,
    }));
}

export function createOptimisticTransactionChanges(
    input: CreateOptimisticTransactionChangesInput,
): OptimisticWorkspaceChange[] {
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const batchId = `optimistic:transaction:${input.transaction.transactionId}:${ulid()}`;
    const accountsById = new Map(
        input.accounts.map((account) => [account.accountId, account]),
    );
    const categoriesById = new Map(
        input.categories.map((category) => [category.categoryId, category]),
    );
    const normalizedLines = normalizeOptimisticTransactionLines(
        input.input.lines,
    );
    const referenceAccountId =
        normalizeOptionalString(input.input.accountId) ??
        normalizedLines.find((line) => line.fromAccountId)?.fromAccountId ??
        normalizedLines.find((line) => line.toAccountId)?.toAccountId;
    const referenceAccount = requireAccount(accountsById, referenceAccountId);

    if (!referenceAccount) {
        throw new Error("Select a primary account for this transaction.");
    }

    const postingInputs = groupTransactionPostingInputs(
        normalizedLines.flatMap((line) => {
            const fromAccount = requireAccount(accountsById, line.fromAccountId);
            const toAccount = requireAccount(accountsById, line.toAccountId);
            const category = requireCategory(categoriesById, line.categoryId);

            return buildTransactionLinePostingInputs({
                amountCents: line.amountCents,
                categoryLedgerAccountId: category?.ledgerAccountId,
                fromLedgerAccountId: fromAccount?.ledgerAccountId,
                toLedgerAccountId: toAccount?.ledgerAccountId,
                uncategorizedEquityLedgerAccountId:
                    UNCATEGORIZED_EQUITY_LEDGER_ACCOUNT_ID,
            });
        }),
    );
    const occurredAt = toTransactionOccurredAt(input.input.occurredAt);
    const displayAmountCents = deriveTransactionDisplayAmountCents({
        ledgerAccountId: referenceAccount.ledgerAccountId,
        postings: postingInputs,
    });
    const periodId = getMonthlyPeriodId(occurredAt);
    const memo = normalizeOptionalString(input.input.memo);
    const payee = normalizeOptionalString(input.input.payee);
    const referenceCategoryId = toVisibleReferenceCategoryId(
        inferTransactionReferenceCategoryId({
            displayAmountCents,
            kind: input.input.kind,
            lines: normalizedLines,
        }),
    );
    const transactionRecord = {
        displayAmountCents,
        enteredAt: input.transaction.enteredAt,
        kind: input.input.kind,
        occurredAt,
        periodId,
        referenceAccountId: referenceAccount.accountId,
        status: input.transaction.status,
        transactionId: input.transaction.transactionId,
        updatedAt: now,
        ledgerId: input.transaction.ledgerId,
        ...(memo ? { memo } : {}),
        ...(payee ? { payee } : {}),
        ...(input.transaction.plaidTransactionSyncId
            ? { plaidTransactionSyncId: input.transaction.plaidTransactionSyncId }
            : {}),
        ...(referenceCategoryId ? { referenceCategoryId } : {}),
        ...(input.transaction.source ? { source: input.transaction.source } : {}),
    } satisfies WorkspaceTransactionRecord;
    const lineRecords = createOptimisticTransactionLineRecords({
        lines: normalizedLines,
        now,
        transaction: input.transaction,
    });
    const retainedLineIds = new Set(lineRecords.map((line) => line.lineId));
    const postingRecords = createOptimisticPostingRecords({
        now,
        occurredAt,
        periodId,
        postings: postingInputs,
        transaction: input.transaction,
    });

    return [
        ...input.transaction.lines
            .filter((line) => !retainedLineIds.has(line.lineId))
            .map((line) =>
                createOptimisticWorkspaceDelete({
                    batchId,
                    changedAt: nowDate,
                    entityId: line.lineId,
                    entityType: "transactionLine",
                }),
            ),
        ...input.transaction.postings.map((posting) =>
            createOptimisticWorkspaceDelete({
                batchId,
                changedAt: nowDate,
                entityId: posting.postingId,
                entityType: "ledgerPosting",
            }),
        ),
        createOptimisticWorkspaceUpsert({
            batchId,
            changedAt: nowDate,
            entityId: transactionRecord.transactionId,
            entityType: "transaction",
            record: transactionRecord,
        }),
        ...lineRecords.map((line) =>
            createOptimisticWorkspaceUpsert({
                batchId,
                changedAt: nowDate,
                entityId: line.lineId,
                entityType: "transactionLine",
                record: line,
            }),
        ),
        ...postingRecords.map((posting) =>
            createOptimisticWorkspaceUpsert({
                batchId,
                changedAt: nowDate,
                entityId: posting.postingId,
                entityType: "ledgerPosting",
                record: posting,
            }),
        ),
    ];
}

export function createOptimisticTransactionStatusChanges(input: {
    status: "cleared" | "reconciled";
    transactions: TransactionWithPostings[];
}) {
    const changedAt = new Date();
    const updatedAt = changedAt.toISOString();
    const batchId = `optimistic:transaction-status:${ulid()}`;

    return input.transactions
        .filter((transaction) =>
            input.status === "reconciled"
                ? transaction.status !== "reconciled" && transaction.status !== "voided"
                : transaction.status === "reconciled",
        )
        .map((transaction) => {
            const { lines: _lines, postings: _postings, ...record } = transaction;
            void _lines;
            void _postings;

            return createOptimisticWorkspaceUpsert({
                batchId,
                changedAt,
                entityId: transaction.transactionId,
                entityType: "transaction",
                record: {
                    ...record,
                    status: input.status,
                    updatedAt,
                } satisfies WorkspaceTransactionRecord,
            });
        });
}

export function createOptimisticTransactionDeleteChanges(input: {
    transactions: OptimisticTransaction[];
}): OptimisticWorkspaceChange[] {
    const nowDate = new Date();
    const batchId = `optimistic:transaction-delete:${ulid()}`;

    return input.transactions.flatMap((transaction) => [
        createOptimisticWorkspaceDelete({
            batchId,
            changedAt: nowDate,
            entityId: transaction.transactionId,
            entityType: "transaction",
        }),
        ...transaction.lines.map((line) =>
            createOptimisticWorkspaceDelete({
                batchId,
                changedAt: nowDate,
                entityId: line.lineId,
                entityType: "transactionLine",
            }),
        ),
        ...transaction.postings.map((posting) =>
            createOptimisticWorkspaceDelete({
                batchId,
                changedAt: nowDate,
                entityId: posting.postingId,
                entityType: "ledgerPosting",
            }),
        ),
    ]);
}

export function createOptimisticTransactionMergeChanges(input: {
    accounts: OptimisticTransactionAccount[];
    categories: OptimisticTransactionCategory[];
    expectedMatchType?: TransactionAutoMatchType;
    plaidTransactionSyncRecords: WorkspacePlaidTransactionSyncRecord[];
    transactions: [OptimisticTransaction, OptimisticTransaction];
}): OptimisticWorkspaceChange[] {
    const mergeStates = input.transactions.map((transaction) => ({
        children: { lines: transaction.lines },
        plaidTransactionSyncRecords: input.plaidTransactionSyncRecords.filter(
            (record) => record.transactionId === transaction.transactionId,
        ),
        transaction,
    }));
    const transactionIds = input.transactions.map(
        (transaction) => transaction.transactionId,
    );
    const survivor = chooseTransactionMergeSurvivor(mergeStates, transactionIds);
    const duplicate = mergeStates.find(
        (state) => state.transaction.transactionId !== survivor.transaction.transactionId,
    );

    if (!duplicate) {
        return [];
    }

    const content = chooseTransactionMergeContent(mergeStates, survivor);
    const transfer =
        input.expectedMatchType === "creditCardPayment" ||
        input.expectedMatchType === "bankTransfer"
            ? getCrossAccountTransferMatch({
                  accounts: input.accounts,
                  left: input.transactions[0],
                  right: input.transactions[1],
              })
            : null;

    if (
        (input.expectedMatchType === "creditCardPayment" ||
            input.expectedMatchType === "bankTransfer") &&
        (!transfer || transfer.matchType !== input.expectedMatchType)
    ) {
        return [];
    }

    const plaidState = mergeStates.find(transactionMergeStateHasPlaidMetadata);
    const plaidTransactionSyncId =
        plaidState?.transaction.plaidTransactionSyncId ??
        plaidState?.plaidTransactionSyncRecords[0]?.plaidTransactionSyncId ??
        survivor.transaction.plaidTransactionSyncId ??
        duplicate.transaction.plaidTransactionSyncId;
    const linkedImportActivities = input.transactions.flatMap(
        (transaction) => transaction.importActivities ?? [],
    );
    const importerTransactionIds = new Set(
        linkedImportActivities.flatMap((activity) =>
            activity.linkedTransactionId ? [activity.linkedTransactionId] : [],
        ),
    );
    const nonImporterState = mergeStates.find(
        (state) => !importerTransactionIds.has(state.transaction.transactionId),
    );
    const importerMemo = linkedImportActivities.find((activity) =>
        normalizeOptionalString(activity.memo),
    )?.memo;
    const synthesizedLine =
        survivor.children.lines[0] ?? content.children.lines[0];
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
    let optimisticChanges: OptimisticWorkspaceChange[];

    try {
        optimisticChanges = createOptimisticTransactionChanges({
            accounts: input.accounts,
            categories: input.categories,
            input: {
                accountId:
                    transfer?.sourceAccount.accountId ??
                    content.transaction.referenceAccountId,
                kind: content.transaction.kind,
                lines: mergedLines,
                memo: selectDefinedTransactionMergeText(
                    nonImporterState?.transaction.memo,
                    importerMemo,
                    selectTransactionMergeMemo(
                        mergeStates,
                        content,
                        survivor,
                    ),
                ),
                occurredAt: survivor.transaction.occurredAt,
                payee: selectDefinedTransactionMergeText(
                    content.transaction.payee,
                    survivor.transaction.payee,
                    duplicate.transaction.payee,
                ),
            },
            transaction: survivor.transaction,
        });
    } catch {
        // The server remains authoritative when a partial client read lacks a
        // referenced account or category needed to project the merged postings.
        return [];
    }

    optimisticChanges = optimisticChanges.map((change) => {
        if (
            change.entityType !== "transaction" ||
            change.entityId !== survivor.transaction.transactionId ||
            change.operation !== "upsert"
        ) {
            return change;
        }

        const record = change.record as WorkspaceTransactionRecord;
        const { plaidTransactionSyncId: _existingPlaidTransactionSyncId, ...rest } =
            record;
        void _existingPlaidTransactionSyncId;

        return {
            ...change,
            record: {
                ...rest,
                ...(plaidTransactionSyncId ? { plaidTransactionSyncId } : {}),
                source: plaidState
                    ? "plaid"
                    : linkedImportActivities.some(
                            (activity) => activity.provider === "venmo",
                        )
                      ? "venmo"
                      : content.transaction.source ??
                        survivor.transaction.source ??
                        "manual",
            } satisfies WorkspaceTransactionRecord,
        };
    });
    const retainedDuplicateLineIds = new Set(
        mergedLines.map((line) => line.lineId),
    );
    const batchId = optimisticChanges[0]?.batchId;
    const changedAt = new Date();

    return [
        ...optimisticChanges,
        createOptimisticWorkspaceDelete({
            batchId,
            changedAt,
            entityId: duplicate.transaction.transactionId,
            entityType: "transaction",
        }),
        ...duplicate.children.lines
            .filter((line) => !retainedDuplicateLineIds.has(line.lineId))
            .map((line) =>
                createOptimisticWorkspaceDelete({
                    batchId,
                    changedAt,
                    entityId: line.lineId,
                    entityType: "transactionLine",
                }),
            ),
        ...duplicate.transaction.postings.map((posting) =>
            createOptimisticWorkspaceDelete({
                batchId,
                changedAt,
                entityId: posting.postingId,
                entityType: "ledgerPosting",
            }),
        ),
        ...mergeStates.flatMap((state) =>
            state.plaidTransactionSyncRecords
                .filter(
                    (record) =>
                        record.transactionId !== survivor.transaction.transactionId,
                )
                .map((record) =>
                    createOptimisticWorkspaceUpsert({
                        batchId,
                        changedAt,
                        entityId: record.plaidTransactionSyncId,
                        entityType: "plaidTransactionSync",
                        record: {
                            ...record,
                            transactionId: survivor.transaction.transactionId,
                            updatedAt: changedAt.toISOString(),
                        } satisfies WorkspacePlaidTransactionSyncRecord,
                    }),
                ),
        ),
        ...linkedImportActivities
            .filter(
                (activity) =>
                    activity.linkedTransactionId !==
                    survivor.transaction.transactionId,
            )
            .map((activity) =>
                createOptimisticWorkspaceUpsert({
                    batchId,
                    changedAt,
                    entityId: activity.activityId,
                    entityType: "transactionImportActivity",
                    record: {
                        ...activity,
                        linkedTransactionId:
                            survivor.transaction.transactionId,
                        state: "matched",
                        updatedAt: changedAt.toISOString(),
                    },
                }),
            ),
    ];
}

export const readTransactionMutationWorkspaceChanges =
    readWorkspaceMutationWorkspaceChanges;
