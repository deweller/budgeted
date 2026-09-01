import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

import type { AccountReconciliationCommitInput } from "@/features/accounts/models/account-reconciliation";
import {
    findAccountReconciliationMismatchSuggestions,
    getAccountReconciliationMismatchHydrationTransactionIds,
} from "@/features/accounts/models/account-reconciliation-mismatch";
import { getAccountRecord } from "@/features/accounts/server/account-service";
import {
    getBudgetCategoryRecord,
    isUserVisibleBudgetCategory,
} from "@/features/budget/server/category-service";
import { getComparablePlaidBalanceCents } from "@/features/plaid/models/plaid-balance";
import type { PlaidAccountLinkRecord } from "@/features/plaid/server/plaid-service";
import { toTransactionDateInputValue } from "@/features/transactions/models/transaction-date";
import { listTransactionChildrenByTransactionId } from "@/features/transactions/server/transaction-child-service";
import {
    listLedgerPostingsForLedgerAccount,
    type PersistedPosting,
} from "@/features/transactions/server/posting-service";
import {
    listStoredTransactionsByPrimaryKeys,
    type TransactionPrimaryKey,
} from "@/features/transactions/server/transaction-query-service";
import { upsertTransactionWithWorkspaceChanges } from "@/features/transactions/server/transaction-save-service";
import {
    getTransactionStatusBatchMutations,
    TRANSACTION_STATUS_BATCH_SIZE,
    updateTransactionsStatusWithWorkspaceChanges,
} from "@/features/transactions/server/transaction-status-mutation-service";
import type {
    TransactionRecord,
    TransactionWithPostings,
} from "@/features/transactions/server/transaction-write-model";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { stableStringify } from "@/lib/workspace/revision";
import {
    createWorkspaceMutationOperation,
    findWorkspaceMutationBatch,
    findWorkspaceMutationOperation,
    persistWorkspaceMutationOperation,
    type WorkspaceMutationChangeInput,
    type WorkspaceMutationOperation,
} from "@/features/workspace/server/workspace-sync-service";
import { calculateAccountBalanceCents } from "@/modules/ledger/account-balance";

function createPreviewRevision(input: object) {
    return bytesToHex(sha256(stableStringify(input)));
}

function toUtcDate(timestamp: string) {
    return timestamp.slice(0, 10);
}

async function getActivePlaidLink(ledgerId: string, accountId: string) {
    const { entities } = getBudgetedSchema();
    const links = (await queryAllPages(
        entities.plaidAccountLinks.query.byAccount({ ledgerId, accountId }),
    )) as PlaidAccountLinkRecord[];

    return links
        .filter((link) => link.status === "linked" || link.status === "error")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function transactionMovesAccount(input: {
    ledgerAccountId: string;
    postings: readonly {
        ledgerAccountId: string;
        ledgerAccountKind: "category" | "equity" | "financial";
    }[];
}) {
    return input.postings.some(
        (posting) =>
            posting.ledgerAccountKind === "financial" &&
            posting.ledgerAccountId === input.ledgerAccountId,
    );
}

function compareReconciliationTransactions(
    left: { occurredAt: string; transactionId: string },
    right: { occurredAt: string; transactionId: string },
) {
    return (
        toTransactionDateInputValue(right.occurredAt).localeCompare(
            toTransactionDateInputValue(left.occurredAt),
        ) || right.transactionId.localeCompare(left.transactionId)
    );
}

function groupAccountPostingsByTransactionId(postings: PersistedPosting[]) {
    const postingsByTransactionId = new Map<string, PersistedPosting[]>();

    for (const posting of postings) {
        const transactionPostings =
            postingsByTransactionId.get(posting.transactionId) ?? [];
        transactionPostings.push(posting);
        postingsByTransactionId.set(posting.transactionId, transactionPostings);
    }

    return postingsByTransactionId;
}

async function loadIndexedAccountReconciliationTransactions(input: {
    ledgerAccountId: string;
    ledgerId: string;
    transactionCutoffDate?: string;
}) {
    const accountPostings = await listLedgerPostingsForLedgerAccount(
        input.ledgerId,
        input.ledgerAccountId,
    );
    const { transactionCutoffDate } = input;
    const transactionPostings = transactionCutoffDate
        ? accountPostings.filter(
              (posting) =>
                  toTransactionDateInputValue(posting.occurredAt) <=
                  transactionCutoffDate,
          )
        : accountPostings;
    const transactionKeysById = new Map<string, TransactionPrimaryKey>();

    for (const posting of transactionPostings) {
        transactionKeysById.set(posting.transactionId, {
            ledgerId: input.ledgerId,
            occurredAt: posting.occurredAt,
            transactionId: posting.transactionId,
        });
    }

    const transactionKeys = [...transactionKeysById.values()];
    const batchRead = await listStoredTransactionsByPrimaryKeys(transactionKeys);

    if (batchRead.unprocessedKeys.length > 0) {
        throw new HttpError(
            503,
            "account_reconciliation_read_incomplete",
            "The reconciliation transactions could not be read completely. Try again.",
        );
    }

    const transactionsById = new Map(
        batchRead.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );

    if (transactionKeys.some((key) => !transactionsById.has(key.transactionId))) {
        throw createReconciliationStaleError(
            "One or more reconciliation transactions changed or could not be found. Refresh and try again.",
        );
    }

    return {
        accountPostings,
        accountPostingsByTransactionId:
            groupAccountPostingsByTransactionId(transactionPostings),
        transactions: batchRead.transactions,
    };
}

async function loadAccountReconciliationContext(
    ledgerId: string,
    accountId: string,
    input?: { manualBalanceCents?: number },
) {
    const [account, plaidLink] = await Promise.all([
        getAccountRecord(ledgerId, accountId),
        getActivePlaidLink(ledgerId, accountId),
    ]);

    if (account.accountType === "transfers") {
        throw new HttpError(
            422,
            "account_reconciliation_unsupported",
            "Transfers accounts cannot be reconciled.",
        );
    }

    let cutoffDate = new Date().toISOString().slice(0, 10);
    let institutionBalanceCents: number | undefined;
    let manualBalanceCents: number | undefined;
    let mode: "manual" | "plaid" = "manual";

    if (plaidLink) {
        mode = "plaid";

        if (
            plaidLink.lastSyncStatus !== "succeeded" ||
            plaidLink.plaidBalanceSyncStatus !== "succeeded" ||
            !plaidLink.lastSyncedAt ||
            !plaidLink.plaidBalanceLastSyncedAt
        ) {
            throw new HttpError(
                409,
                "account_reconciliation_sync_required",
                "Sync Plaid transactions and the institution balance before reconciling.",
            );
        }

        const transactionSyncDate = toUtcDate(plaidLink.lastSyncedAt);
        const balanceSyncDate = toUtcDate(plaidLink.plaidBalanceLastSyncedAt);

        if (transactionSyncDate !== balanceSyncDate) {
            throw new HttpError(
                409,
                "account_reconciliation_sync_dates",
                "Plaid transactions and the institution balance must be synced on the same day before reconciling.",
            );
        }

        cutoffDate = transactionSyncDate;
        institutionBalanceCents = getComparablePlaidBalanceCents({
            accountType: account.accountType,
            plaidAccountSubtype: plaidLink.plaidAccountSubtype,
            plaidAccountType: plaidLink.plaidAccountType,
            plaidBalanceCurrentCents: plaidLink.plaidBalanceCurrentCents,
        });

        if (institutionBalanceCents === undefined) {
            throw new HttpError(
                409,
                "account_reconciliation_balance_required",
                "The latest Plaid sync did not include an institution balance.",
            );
        }
    } else if (input?.manualBalanceCents !== undefined) {
        manualBalanceCents = input.manualBalanceCents;
    }

    return {
        account,
        cutoffDate,
        institutionBalanceCents,
        manualBalanceCents,
        mode,
        plaidLink,
    };
}

function createAccountReconciliationPreviewRevision(input: {
    accountId: string;
    accountUpdatedAt: string;
    cutoffDate: string;
    differenceCents: number;
    institutionBalanceCents?: number;
    ledgerBalanceCents: number;
    manualBalanceCents?: number;
    plaidBalanceLastSyncedAt?: string;
    plaidLastSyncedAt?: string;
    transactions: Array<{
        aggregateRevision?: string;
        status: TransactionRecord["status"];
        transactionId: string;
        updatedAt: string;
    }>;
}) {
    return createPreviewRevision(input);
}

async function loadAccountReconciliationState(
    ledgerId: string,
    accountId: string,
    input?: { manualBalanceCents?: number },
) {
    const context = await loadAccountReconciliationContext(
        ledgerId,
        accountId,
        input,
    );
    const {
        account,
        cutoffDate,
        institutionBalanceCents,
        manualBalanceCents,
        mode,
        plaidLink,
    } = context;
    const indexedTransactions =
        await loadIndexedAccountReconciliationTransactions({
            ledgerAccountId: account.ledgerAccountId,
            ledgerId,
        });
    const transactions: TransactionWithPostings[] =
        indexedTransactions.transactions.map((transaction) => ({
            ...transaction,
            lines: [],
            postings:
                indexedTransactions.accountPostingsByTransactionId.get(
                    transaction.transactionId,
                ) ?? [],
        }));

    const eligibleTransactions = transactions
        .filter(
            (transaction) =>
                transaction.status !== "voided" &&
                toTransactionDateInputValue(transaction.occurredAt) <=
                    cutoffDate &&
                transactionMovesAccount({
                    ledgerAccountId: account.ledgerAccountId,
                    postings: transaction.postings,
                }),
        )
        .sort(compareReconciliationTransactions);
    const ledgerBalanceCents = calculateAccountBalanceCents(
        account,
        indexedTransactions.accountPostings,
        cutoffDate,
    );
    const comparableManualBalanceCents = manualBalanceCents;
    const differenceCents =
        mode === "plaid"
            ? institutionBalanceCents! - ledgerBalanceCents
            : comparableManualBalanceCents === undefined
              ? 0
              : comparableManualBalanceCents - ledgerBalanceCents;
    let mismatchTransactions = transactions;

    if (differenceCents !== 0) {
        const hydrationTransactionIds =
            getAccountReconciliationMismatchHydrationTransactionIds({
                account,
                cutoffDate,
                transactions,
            });

        if (hydrationTransactionIds.length > 0) {
            const hydrationTransactionIdSet = new Set(
                hydrationTransactionIds,
            );
            const children = await listTransactionChildrenByTransactionId(
                ledgerId,
                hydrationTransactionIds,
            );
            mismatchTransactions = transactions.map((transaction) =>
                hydrationTransactionIdSet.has(transaction.transactionId)
                    ? {
                          ...transaction,
                          lines:
                              children.linesByTransactionId.get(
                                  transaction.transactionId,
                              ) ?? [],
                          postings:
                              children.postingsByTransactionId.get(
                                  transaction.transactionId,
                              ) ?? [],
                      }
                    : transaction,
            );
        }
    }
    const mismatchSuggestions = findAccountReconciliationMismatchSuggestions({
        account,
        cutoffDate,
        differenceCents,
        transactions: mismatchTransactions,
    });
    const previewRevision = createAccountReconciliationPreviewRevision({
        accountId,
        accountUpdatedAt: account.updatedAt,
        cutoffDate,
        differenceCents,
        institutionBalanceCents,
        ledgerBalanceCents,
        manualBalanceCents,
        plaidBalanceLastSyncedAt: plaidLink?.plaidBalanceLastSyncedAt,
        plaidLastSyncedAt: plaidLink?.lastSyncedAt,
        transactions: eligibleTransactions.map((transaction) => ({
            aggregateRevision: transaction.aggregateRevision,
            status: transaction.status,
            transactionId: transaction.transactionId,
            updatedAt: transaction.updatedAt,
        })),
    });

    return {
        accountId,
        accountName: account.name,
        alreadyReconciledCount: eligibleTransactions.filter(
            (transaction) => transaction.status === "reconciled",
        ).length,
        cutoffDate,
        differenceCents,
        eligibleTransactionCount: eligibleTransactions.length,
        institutionBalanceCents,
        ledgerBalanceCents,
        manualBalanceCents,
        mismatchSuggestions,
        mode,
        previewRevision,
        transactionIds: eligibleTransactions.map(
            (transaction) => transaction.transactionId,
        ),
        unreconciledTransactionIds: eligibleTransactions
            .filter((transaction) => transaction.status !== "reconciled")
            .map((transaction) => transaction.transactionId),
    };
}

export async function getAccountReconciliationPreview(
    ledgerId: string,
    accountId: string,
    input?: { manualBalanceCents?: number },
) {
    return loadAccountReconciliationState(ledgerId, accountId, input);
}

type ReconciliationOperationAdjustment = {
    categoryId?: string;
    confirmedDifferenceCents: number;
    kind?: "adjustment" | "standard";
};

type ReconciliationOperationTarget = {
    aggregateRevision?: string;
    occurredAt: string;
    transactionId: string;
    updatedAt: string;
};

type DurableAccountReconciliationOperation = {
    accountId: string;
    adjustment?: ReconciliationOperationAdjustment;
    adjustmentTransactionId?: string;
    cutoffDate: string;
    differenceCents: number;
    institutionBalanceCents?: number;
    ledgerBalanceCents: number;
    manualBalanceCents?: number;
    operationVersion: 1;
    previewRevision: string;
    targets: ReconciliationOperationTarget[];
};

const ACCOUNT_RECONCILIATION_OPERATION_TYPE = "account.reconcile";

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReconciliationOperationTarget(
    value: unknown,
): value is ReconciliationOperationTarget {
    return (
        isRecord(value) &&
        typeof value.occurredAt === "string" &&
        typeof value.transactionId === "string" &&
        typeof value.updatedAt === "string" &&
        (value.aggregateRevision === undefined ||
            typeof value.aggregateRevision === "string")
    );
}

function isDurableAccountReconciliationOperation(
    value: unknown,
): value is DurableAccountReconciliationOperation {
    return (
        isRecord(value) &&
        value.operationVersion === 1 &&
        typeof value.accountId === "string" &&
        typeof value.cutoffDate === "string" &&
        typeof value.differenceCents === "number" &&
        typeof value.ledgerBalanceCents === "number" &&
        (value.manualBalanceCents === undefined ||
            typeof value.manualBalanceCents === "number") &&
        typeof value.previewRevision === "string" &&
        Array.isArray(value.targets) &&
        value.targets.every(isReconciliationOperationTarget) &&
        (value.institutionBalanceCents === undefined ||
            typeof value.institutionBalanceCents === "number") &&
        (value.adjustmentTransactionId === undefined ||
            typeof value.adjustmentTransactionId === "string") &&
        (value.adjustment === undefined ||
            (isRecord(value.adjustment) &&
                (value.adjustment.categoryId === undefined ||
                    typeof value.adjustment.categoryId === "string") &&
                typeof value.adjustment.confirmedDifferenceCents === "number" &&
                (value.adjustment.kind === undefined ||
                    value.adjustment.kind === "adjustment" ||
                    value.adjustment.kind === "standard")))
    );
}

function createReconciliationStaleError(message?: string) {
    return new HttpError(
        409,
        "account_reconciliation_stale",
        message ??
            "The account changed after reconciliation was reviewed. Refresh the reconciliation details and try again.",
    );
}

function toReconciliationTarget(
    transaction: Pick<
        TransactionRecord,
        "aggregateRevision" | "occurredAt" | "transactionId" | "updatedAt"
    >,
): ReconciliationOperationTarget {
    return {
        aggregateRevision: transaction.aggregateRevision,
        occurredAt: transaction.occurredAt,
        transactionId: transaction.transactionId,
        updatedAt: transaction.updatedAt,
    };
}

async function loadAccountReconciliationCommitState(
    ledgerId: string,
    accountId: string,
    input?: { manualBalanceCents?: number },
) {
    const context = await loadAccountReconciliationContext(
        ledgerId,
        accountId,
        input,
    );
    const indexedTransactions =
        await loadIndexedAccountReconciliationTransactions({
            ledgerAccountId: context.account.ledgerAccountId,
            ledgerId,
            transactionCutoffDate: context.cutoffDate,
        });
    const eligibleTransactions = indexedTransactions.transactions
        .filter(
            (transaction) =>
                transaction.status !== "voided" &&
                toTransactionDateInputValue(transaction.occurredAt) <=
                    context.cutoffDate,
        )
        .sort(compareReconciliationTransactions);
    const ledgerBalanceCents = calculateAccountBalanceCents(
        context.account,
        indexedTransactions.accountPostings,
        context.cutoffDate,
    );
    const comparableManualBalanceCents = context.manualBalanceCents;
    const differenceCents =
        context.mode === "plaid"
            ? context.institutionBalanceCents! - ledgerBalanceCents
            : comparableManualBalanceCents === undefined
              ? 0
              : comparableManualBalanceCents - ledgerBalanceCents;
    const previewRevision = createAccountReconciliationPreviewRevision({
        accountId,
        accountUpdatedAt: context.account.updatedAt,
        cutoffDate: context.cutoffDate,
        differenceCents,
        institutionBalanceCents: context.institutionBalanceCents,
        ledgerBalanceCents,
        manualBalanceCents: context.manualBalanceCents,
        plaidBalanceLastSyncedAt:
            context.plaidLink?.plaidBalanceLastSyncedAt,
        plaidLastSyncedAt: context.plaidLink?.lastSyncedAt,
        transactions: eligibleTransactions.map((transaction) => ({
            aggregateRevision: transaction.aggregateRevision,
            status: transaction.status,
            transactionId: transaction.transactionId,
            updatedAt: transaction.updatedAt,
        })),
    });

    return {
        cutoffDate: context.cutoffDate,
        differenceCents,
        institutionBalanceCents: context.institutionBalanceCents,
        ledgerBalanceCents,
        manualBalanceCents: context.manualBalanceCents,
        previewRevision,
        targets: eligibleTransactions
            .filter((transaction) => transaction.status !== "reconciled")
            .map(toReconciliationTarget),
    };
}

async function validateReconciliationAdjustment(input: {
    commit: AccountReconciliationCommitInput;
    differenceCents: number;
    ledgerId: string;
}) {
    if (input.differenceCents === 0) {
        if (input.commit.adjustment) {
            throw new HttpError(
                422,
                "account_reconciliation_adjustment_confirmation",
                "A reconciliation adjustment is not needed when the balances match.",
            );
        }

        return undefined;
    }

    const adjustment = input.commit.adjustment;

    if (
        !adjustment ||
        adjustment.confirmedDifferenceCents !== input.differenceCents
    ) {
        throw new HttpError(
            422,
            "account_reconciliation_adjustment_confirmation",
            "Confirm the exact reconciliation adjustment and select a category.",
        );
    }

    const kind = adjustment.kind ?? "standard";

    if (kind === "adjustment") {
        if (adjustment.categoryId) {
            throw new HttpError(
                422,
                "account_reconciliation_adjustment_category",
                "Adjustment transactions cannot include a category.",
            );
        }

        return {
            confirmedDifferenceCents: adjustment.confirmedDifferenceCents,
            kind,
        } satisfies ReconciliationOperationAdjustment;
    }

    if (!adjustment.categoryId) {
        throw new HttpError(
            422,
            "account_reconciliation_category_required",
            "Select an active category or an adjustment type for the reconciliation adjustment.",
        );
    }

    const adjustmentCategory = await getBudgetCategoryRecord(
        input.ledgerId,
        adjustment.categoryId,
    );

    if (
        adjustmentCategory.status !== "active" ||
        !isUserVisibleBudgetCategory(adjustmentCategory)
    ) {
        throw new HttpError(
            422,
            "account_reconciliation_category_required",
            "Select an active category for the reconciliation adjustment.",
        );
    }

    return {
        categoryId: adjustment.categoryId,
        confirmedDifferenceCents: adjustment.confirmedDifferenceCents,
        kind,
    } satisfies ReconciliationOperationAdjustment;
}

function assertReconciliationOperationMatches(input: {
    accountId: string;
    commit: AccountReconciliationCommitInput;
    operation: DurableAccountReconciliationOperation;
}) {
    const adjustment = input.operation.adjustment;
    const commitAdjustment = input.commit.adjustment;
    const adjustmentDiffers =
        (adjustment === undefined) !== (commitAdjustment === undefined) ||
        (adjustment !== undefined &&
            commitAdjustment !== undefined &&
            ((commitAdjustment.kind ?? "standard") !==
                (adjustment.kind ?? "standard") ||
                commitAdjustment.categoryId !== adjustment.categoryId ||
                commitAdjustment.confirmedDifferenceCents !==
                    adjustment.confirmedDifferenceCents));
    const manualBalanceDiffers =
        input.operation.manualBalanceCents !== input.commit.manualBalanceCents;

    if (
        input.operation.accountId !== input.accountId ||
        input.operation.previewRevision !== input.commit.previewRevision ||
        adjustmentDiffers ||
        manualBalanceDiffers
    ) {
        throw new HttpError(
            409,
            "account_reconciliation_mutation_conflict",
            "This reconciliation request was already used with different details.",
        );
    }
}

function createReconciliationOperationCheckpoint(input: {
    completedStepCount: number;
    createdAt?: string;
    ledgerId: string;
    mutationId: string;
    operation: DurableAccountReconciliationOperation;
    status: WorkspaceMutationOperation["status"];
}) {
    return createWorkspaceMutationOperation({
        completedStepCount: input.completedStepCount,
        createdAt: input.createdAt,
        ledgerId: input.ledgerId,
        mutationId: input.mutationId,
        mutationType: ACCOUNT_RECONCILIATION_OPERATION_TYPE,
        operation: input.operation,
        status: input.status,
    });
}

function getReconciliationTargetChunks(
    targets: ReconciliationOperationTarget[],
) {
    const chunks: Array<{
        startIndex: number;
        targets: ReconciliationOperationTarget[];
    }> = [];

    for (
        let startIndex = 0;
        startIndex < targets.length;
        startIndex += TRANSACTION_STATUS_BATCH_SIZE
    ) {
        chunks.push({
            startIndex,
            targets: targets.slice(
                startIndex,
                startIndex + TRANSACTION_STATUS_BATCH_SIZE,
            ),
        });
    }

    return chunks;
}

function getReconciliationStatusMutation(input: {
    mutationId: string;
    startIndex: number;
    targets: ReconciliationOperationTarget[];
}) {
    const [mutation] = getTransactionStatusBatchMutations({
        mutationId: `${input.mutationId}:status:chunk:${input.startIndex}`,
        status: "reconciled",
        transactionIds: input.targets.map((target) => target.transactionId),
    });

    if (!mutation) {
        throw new Error("Reconciliation status chunk is empty.");
    }

    return mutation;
}

async function loadReconciliationTargetTransactions(input: {
    ledgerId: string;
    targets: ReconciliationOperationTarget[];
}): Promise<TransactionWithPostings[]> {
    const batchRead = await listStoredTransactionsByPrimaryKeys(
        input.targets.map((target) => ({
            ledgerId: input.ledgerId,
            occurredAt: target.occurredAt,
            transactionId: target.transactionId,
        })),
    );

    if (batchRead.unprocessedKeys.length > 0) {
        throw new HttpError(
            503,
            "account_reconciliation_read_incomplete",
            "The pending reconciliation transactions could not be read completely. Try again.",
        );
    }

    const transactionById = new Map(
        batchRead.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );

    for (const target of input.targets) {
        const transaction = transactionById.get(target.transactionId);

        if (
            !transaction ||
            transaction.status === "voided" ||
            transaction.status === "reconciled" ||
            transaction.updatedAt !== target.updatedAt ||
            transaction.aggregateRevision !== target.aggregateRevision
        ) {
            throw createReconciliationStaleError(
                "A pending reconciliation transaction changed. Refresh and review the account before trying again.",
            );
        }
    }

    const children = await listTransactionChildrenByTransactionId(
        input.ledgerId,
        input.targets.map((target) => target.transactionId),
    );

    return input.targets.map((target) => {
        const transaction = transactionById.get(target.transactionId)!;

        return {
            ...transaction,
            lines: children.linesByTransactionId.get(target.transactionId) ?? [],
            postings:
                children.postingsByTransactionId.get(target.transactionId) ?? [],
        };
    });
}

async function collectCompletedReconciliationChanges(input: {
    completedStepCount: number;
    ledgerId: string;
    mutationId: string;
    targets: ReconciliationOperationTarget[];
}) {
    const completedChunks = getReconciliationTargetChunks(input.targets).filter(
        (chunk) =>
            chunk.startIndex + chunk.targets.length <= input.completedStepCount,
    );
    const batches = await Promise.all(
        completedChunks.map((chunk) => {
            const mutation = getReconciliationStatusMutation({
                mutationId: input.mutationId,
                startIndex: chunk.startIndex,
                targets: chunk.targets,
            });

            return findWorkspaceMutationBatch({
                ledgerId: input.ledgerId,
                mutationId: mutation.mutationId,
                mutationType: mutation.mutationType,
            });
        }),
    );

    if (batches.some((batch) => !batch)) {
        throw new Error(
            "A completed reconciliation checkpoint is missing its workspace mutation batch.",
        );
    }

    return batches.flatMap((batch) => batch!.changes);
}

export async function commitAccountReconciliationWithWorkspaceChanges(input: {
    accountId: string;
    actorUserId: string;
    commit: AccountReconciliationCommitInput;
    ledgerId: string;
    mutationId: string;
}) {
    const workspaceChanges: WorkspaceMutationChangeInput[] = [];
    let persistedOperation = await findWorkspaceMutationOperation({
        ledgerId: input.ledgerId,
        mutationId: input.mutationId,
        mutationType: ACCOUNT_RECONCILIATION_OPERATION_TYPE,
    });
    let operation: DurableAccountReconciliationOperation;

    if (persistedOperation) {
        if (
            !isDurableAccountReconciliationOperation(
                persistedOperation.operation,
            )
        ) {
            throw new HttpError(
                409,
                "account_reconciliation_operation_version",
                "This saved reconciliation uses an older format. Refresh and start it again.",
            );
        }

        if (persistedOperation.status === "failed") {
            throw createReconciliationStaleError();
        }

        operation = persistedOperation.operation;
        assertReconciliationOperationMatches({
            accountId: input.accountId,
            commit: input.commit,
            operation,
        });
    } else {
        const commitState = await loadAccountReconciliationCommitState(
            input.ledgerId,
            input.accountId,
            { manualBalanceCents: input.commit.manualBalanceCents },
        );

        if (commitState.previewRevision !== input.commit.previewRevision) {
            throw createReconciliationStaleError();
        }

        const adjustment = await validateReconciliationAdjustment({
            commit: input.commit,
            differenceCents: commitState.differenceCents,
            ledgerId: input.ledgerId,
        });
        operation = {
            accountId: input.accountId,
            adjustment,
            cutoffDate: commitState.cutoffDate,
            differenceCents: commitState.differenceCents,
            institutionBalanceCents: commitState.institutionBalanceCents,
            ledgerBalanceCents: commitState.ledgerBalanceCents,
            manualBalanceCents: commitState.manualBalanceCents,
            operationVersion: 1,
            previewRevision: commitState.previewRevision,
            targets: commitState.targets,
        };
        persistedOperation = createReconciliationOperationCheckpoint({
            completedStepCount: 0,
            ledgerId: input.ledgerId,
            mutationId: input.mutationId,
            operation,
            status: "running",
        });
        await persistWorkspaceMutationOperation(persistedOperation);
    }

    if (
        persistedOperation.completedStepCount > operation.targets.length ||
        (persistedOperation.completedStepCount < operation.targets.length &&
            persistedOperation.completedStepCount %
                TRANSACTION_STATUS_BATCH_SIZE !==
                0)
    ) {
        throw new Error("Reconciliation operation has invalid progress.");
    }

    let adjustmentTransactionId = operation.adjustmentTransactionId;

    if (operation.adjustment) {
        const adjustmentResult = await upsertTransactionWithWorkspaceChanges(
            input.ledgerId,
            {
                accountId: input.accountId,
                audit: {
                    actorUserId: input.actorUserId,
                    source: "manual",
                },
                kind: operation.adjustment.kind ?? "standard",
                lines: [
                    {
                        amountCents: Math.abs(operation.differenceCents),
                        ...(operation.adjustment.kind === "adjustment"
                            ? {}
                            : { categoryId: operation.adjustment.categoryId! }),
                        ...(operation.differenceCents > 0
                            ? { toAccountId: input.accountId }
                            : { fromAccountId: input.accountId }),
                    },
                ],
                memo: undefined,
                occurredAt: operation.cutoffDate,
                payee: "Reconciliation adjustment",
                source: "manual",
                workspaceMutation: {
                    mutationId: `${input.mutationId}:adjustment`,
                    mutationType: `account.reconcile.adjustment:${input.accountId}`,
                },
            },
        );
        const adjustmentTarget = toReconciliationTarget(
            adjustmentResult.transaction,
        );

        if (
            adjustmentTransactionId &&
            adjustmentTransactionId !== adjustmentTarget.transactionId
        ) {
            throw new HttpError(
                409,
                "account_reconciliation_mutation_conflict",
                "This reconciliation request resolved to a different adjustment transaction.",
            );
        }

        workspaceChanges.push(...adjustmentResult.workspaceChanges);
        adjustmentTransactionId = adjustmentTarget.transactionId;

        if (!operation.adjustmentTransactionId) {
            if (persistedOperation.completedStepCount !== 0) {
                throw new Error(
                    "A reconciliation adjustment is missing from an in-progress operation.",
                );
            }

            operation = {
                ...operation,
                adjustmentTransactionId,
                targets: [...operation.targets, adjustmentTarget],
            };
            persistedOperation = createReconciliationOperationCheckpoint({
                completedStepCount: 0,
                createdAt: persistedOperation.createdAt,
                ledgerId: input.ledgerId,
                mutationId: input.mutationId,
                operation,
                status: "running",
            });
            await persistWorkspaceMutationOperation(persistedOperation);
        }
    }

    workspaceChanges.push(
        ...(await collectCompletedReconciliationChanges({
            completedStepCount: persistedOperation.completedStepCount,
            ledgerId: input.ledgerId,
            mutationId: input.mutationId,
            targets: operation.targets,
        })),
    );

    for (const chunk of getReconciliationTargetChunks(operation.targets)) {
        if (chunk.startIndex < persistedOperation.completedStepCount) {
            continue;
        }

        const knownTransactions = await loadReconciliationTargetTransactions({
            ledgerId: input.ledgerId,
            targets: chunk.targets,
        });
        const nextCompletedStepCount =
            chunk.startIndex + chunk.targets.length;
        const isFinalChunk =
            nextCompletedStepCount === operation.targets.length;
        const checkpoint = createReconciliationOperationCheckpoint({
            completedStepCount: nextCompletedStepCount,
            createdAt: persistedOperation.createdAt,
            ledgerId: input.ledgerId,
            mutationId: input.mutationId,
            operation,
            status: isFinalChunk ? "completed" : "running",
        });
        const statusResult = await updateTransactionsStatusWithWorkspaceChanges({
            actorUserId: input.actorUserId,
            auditAction: "reconcile",
            auditSummary: {
                accountId: input.accountId,
                cutoffDate: operation.cutoffDate,
                differenceCents: operation.differenceCents,
                institutionBalanceCents: operation.institutionBalanceCents,
                ledgerBalanceCents: operation.ledgerBalanceCents,
            },
            knownTransactions,
            ledgerId: input.ledgerId,
            mutationId: `${input.mutationId}:status:chunk:${chunk.startIndex}`,
            skipExistingBatchLookup: true,
            status: "reconciled",
            transactionIds: chunk.targets.map(
                (target) => target.transactionId,
            ),
            workspaceMutationOperation: checkpoint,
        });

        if (statusResult.updatedCount !== chunk.targets.length) {
            throw createReconciliationStaleError();
        }

        workspaceChanges.push(...statusResult.workspaceChanges);
        persistedOperation = checkpoint;
    }

    if (operation.targets.length === 0 && persistedOperation.status !== "completed") {
        persistedOperation = createReconciliationOperationCheckpoint({
            completedStepCount: 0,
            createdAt: persistedOperation.createdAt,
            ledgerId: input.ledgerId,
            mutationId: input.mutationId,
            operation,
            status: "completed",
        });
        await persistWorkspaceMutationOperation(persistedOperation);
    }

    const response = {
        adjustmentTransactionId,
        reconciledCount: operation.targets.length,
        workspaceChanges,
    };
    return response;
}
