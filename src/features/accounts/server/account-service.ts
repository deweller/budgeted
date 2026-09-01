import { ulid } from "ulid";

import { syncAffectedBudgetPeriodActivity } from "@/features/budget/server/activity-sync-service";
import type {
    AccountInput,
    AccountUpdateInput,
} from "@/features/accounts/models/account-form";
import {
    type AccountWithBalance,
    hydrateAccountsWithBalances,
} from "@/features/accounts/server/account-balance-service";
import type {
    PlaidAccountLinkRecord,
    PlaidTransactionSyncRecord,
} from "@/features/plaid/server/plaid-service";
import {
    deletePlaidTransactionSyncRecords,
    putPlaidTransactionSyncRecords,
} from "@/features/plaid/server/plaid-transaction-sync-record-service";
import { createTransactionRewriteInput } from "@/features/transactions/models/transaction-rewrite";
import { toTransactionDateInputValue } from "@/features/transactions/models/transaction-date";
import { createDeletionImpactSummary } from "@/features/shared/server/deletion-impact-service";
import { assertDeletionPreviewRevision } from "@/features/shared/server/deletion-policy-service";
import {
    countRecordGroups,
    createLedgerPostingRevision,
    createPlaidAccountLinkRevision,
    createPlaidItemSyncStateRevision,
    createPlaidTransactionSyncRevision,
    createRecordGroupRevisions,
    createTransactionLineRevision,
    createTransactionRevision,
} from "@/features/shared/server/deletion-revision-service";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import { type PersistedPosting } from "@/features/transactions/server/posting-service";
import {
    listTransactionChildrenByTransactionId,
    removeTransactionChildren,
    restoreTransactionChildren,
} from "@/features/transactions/server/transaction-child-service";
import {
    toTransactionLineInputs,
    type PersistedTransactionLine,
} from "@/features/transactions/server/transaction-line-service";
import { listStoredTransactionsByIds } from "@/features/transactions/server/transaction-query-service";
import { upsertTransactionWithinWorkspaceMutation } from "@/features/transactions/server/transaction-save-service";
import { recordTransactionAuditLog } from "@/features/transactions/server/transaction-audit-service";
import { HttpError } from "@/lib/api/errors";
import {
    accountTypeSupportsOpeningBalance,
    accountTypeSupportsPlaid,
} from "@/modules/accounts/account-types";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import {
    createWorkspaceDeleteChange,
    createWorkspaceUpsertChange,
} from "@/features/workspace/server/workspace-change-builder";

function compareAccounts(left: { name: string }, right: { name: string }) {
    return left.name.localeCompare(right.name);
}

async function listAccountRecords(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const accounts = await queryAllPages(
        entities.accounts.query.byAccount({ ledgerId }),
        { consistent: true },
    );

    return accounts.sort(compareAccounts);
}

async function listAccountDependentTransactions(
    ledgerId: string,
    account: Awaited<ReturnType<typeof getAccountRecord>>,
) {
    const { entities } = getBudgetedSchema();
    const postings = await queryAllPages(
        entities.ledgerPostings.query.byLedgerAccount({
            ledgerId,
            ledgerAccountId: account.ledgerAccountId,
        }),
    );
    const transactionIds = new Set(
        postings.map((posting) => posting.transactionId),
    );

    const transactions = await listStoredTransactionsByIds(
        ledgerId,
        transactionIds,
    );

    return transactions.sort(compareTransactionsByDate);
}

type AccountRecord = Awaited<ReturnType<typeof listAccountRecords>>[number];
type AccountDependencyTransaction = Awaited<
    ReturnType<typeof listAccountDependentTransactions>
>[number];
type AccountDependencyPlaidItemSyncState = {
    createdAt: string;
    lastSyncError?: string;
    lastSyncedAt?: string;
    plaidItemId: string;
    status: "active" | "error";
    syncCursor?: string;
    updatedAt: string;
    ledgerId: string;
};
type AccountDependencyState = {
    account: AccountRecord;
    accountByLedgerAccountId: Map<string, AccountRecord>;
    allPlaidTransactionSyncs: PlaidTransactionSyncRecord[];
    plaidAccountLinks: PlaidAccountLinkRecord[];
    plaidItemSyncStates: AccountDependencyPlaidItemSyncState[];
    plaidTransactionSyncs: PlaidTransactionSyncRecord[];
    postingsByTransactionId: Map<string, PersistedPosting[]>;
    linesByTransactionId: Map<string, PersistedTransactionLine[]>;
    transactions: AccountDependencyTransaction[];
};

function compareTransactionsByDate(
    left: { occurredAt: string; transactionId: string },
    right: { occurredAt: string; transactionId: string },
) {
    const occurredComparison = toTransactionDateInputValue(
        left.occurredAt,
    ).localeCompare(toTransactionDateInputValue(right.occurredAt));

    if (occurredComparison !== 0) {
        return occurredComparison;
    }

    return left.transactionId.localeCompare(right.transactionId);
}

function assertAccountHasNoReconciledTransactions(
    transactions: readonly AccountDependencyTransaction[],
    operation: string,
) {
    if (transactions.some((transaction) => transaction.status === "reconciled")) {
        throw new HttpError(
            409,
            "account_has_locked_transactions",
            `Unlock this account's reconciled transactions before ${operation}.`,
        );
    }
}

async function getAccountDependentPostings(
    ledgerId: string,
    accountId: string,
): Promise<AccountDependencyState> {
    const { entities } = getBudgetedSchema();
    const account = await getAccountRecord(ledgerId, accountId);
    const accounts = await listAccountRecords(ledgerId);
    const accountByLedgerAccountId = new Map(
        accounts.map((candidate) => [candidate.ledgerAccountId, candidate]),
    );
    const transactions = await listAccountDependentTransactions(
        ledgerId,
        account,
    );
    const { linesByTransactionId, postingsByTransactionId } =
        await listTransactionChildrenByTransactionId(
            ledgerId,
            transactions.map((transaction) => transaction.transactionId),
        );
    const plaidAccountLinks = (await queryAllPages(
        entities.plaidAccountLinks.query.byAccount({ ledgerId, accountId }),
    )) as PlaidAccountLinkRecord[];
    const allPlaidTransactionSyncs = (await queryAllPages(
        entities.plaidTransactionSyncs.query.bySync({ ledgerId }),
        { consistent: true },
    )) as PlaidTransactionSyncRecord[];
    const keptTransactionIds = new Set(
        transactions
            .filter((transaction) => {
                const lines = linesByTransactionId.get(transaction.transactionId) ?? [];

                return (
                    createLinesForDeletedAccount({
                        accountId,
                        lines,
                    }).length > 0
                );
            })
            .map((transaction) => transaction.transactionId),
    );
    const deletedTransactionIds = new Set(
        transactions
            .filter(
                (transaction) => !keptTransactionIds.has(transaction.transactionId),
            )
            .map((transaction) => transaction.transactionId),
    );
    const plaidTransactionSyncs = allPlaidTransactionSyncs.filter(
        (record) =>
            record.accountId === accountId ||
            deletedTransactionIds.has(record.transactionId),
    );
    const plaidItemIdsToDeleteSyncStateFor = (
        await Promise.all(
            Array.from(
                new Set(plaidAccountLinks.map((link) => link.plaidItemId)),
            ).map(async (plaidItemId) => {
                const linksForItem = (await queryAllPages(
                    entities.plaidAccountLinks.query.byPlaidAccount({
                        ledgerId,
                        plaidItemId,
                    }),
                )) as PlaidAccountLinkRecord[];
                const hasRemainingLinkedAccount = linksForItem.some(
                    (link) =>
                        link.accountId !== accountId &&
                        (link.status === "linked" || link.status === "error"),
                );

                return hasRemainingLinkedAccount ? null : plaidItemId;
            }),
        )
    ).filter((plaidItemId): plaidItemId is string => Boolean(plaidItemId));
    const plaidItemSyncStates = (
        await Promise.all(
            plaidItemIdsToDeleteSyncStateFor.map((plaidItemId) =>
                entities.plaidItemSyncStates.get({ ledgerId, plaidItemId }).go(),
            ),
        )
    )
        .map((result) => result.data)
        .filter((item): item is AccountDependencyPlaidItemSyncState =>
            Boolean(item),
        );

    return {
        account,
        accountByLedgerAccountId,
        allPlaidTransactionSyncs,
        plaidAccountLinks,
        plaidItemSyncStates,
        plaidTransactionSyncs,
        transactions,
        postingsByTransactionId,
        linesByTransactionId,
    };
}

function createLinesForDeletedAccount(input: {
    accountId: string;
    lines: PersistedTransactionLine[];
}) {
    return input.lines
        .flatMap((line) => {
            const fromDeleted = line.fromAccountId === input.accountId;
            const toDeleted = line.toAccountId === input.accountId;

            if (!fromDeleted && !toDeleted) {
                return [line];
            }

            if (fromDeleted && line.toAccountId && !toDeleted) {
                return [
                    {
                        ...line,
                        categoryId: undefined,
                        fromAccountId: undefined,
                    },
                ];
            }

            if (toDeleted && line.fromAccountId && !fromDeleted) {
                return [
                    {
                        ...line,
                        categoryId: undefined,
                        toAccountId: undefined,
                    },
                ];
            }

            return [];
        })
        .map((line, sortOrder) => ({ ...line, sortOrder }));
}

function getSurvivingPlaidSyncId(input: {
    accountId: string;
    allPlaidTransactionSyncs: PlaidTransactionSyncRecord[];
    transaction: AccountDependencyTransaction;
}) {
    const currentPrimarySync = input.transaction.plaidTransactionSyncId
        ? input.allPlaidTransactionSyncs.find(
                (syncRecord) =>
                    syncRecord.plaidTransactionSyncId ===
                    input.transaction.plaidTransactionSyncId,
            )
        : undefined;

    if (currentPrimarySync && currentPrimarySync.accountId !== input.accountId) {
        return currentPrimarySync.plaidTransactionSyncId;
    }

    return input.allPlaidTransactionSyncs.find(
        (syncRecord) =>
            syncRecord.transactionId === input.transaction.transactionId &&
            syncRecord.accountId !== input.accountId,
    )?.plaidTransactionSyncId;
}

function buildAccountDeletionImpact(input: {
    account: Awaited<ReturnType<typeof getAccountRecord>>;
    plaidAccountLinks: Awaited<
        ReturnType<typeof getAccountDependentPostings>
    >["plaidAccountLinks"];
    plaidItemSyncStates: Awaited<
        ReturnType<typeof getAccountDependentPostings>
    >["plaidItemSyncStates"];
    plaidTransactionSyncs: Awaited<
        ReturnType<typeof getAccountDependentPostings>
    >["plaidTransactionSyncs"];
    postingsByTransactionId: Map<string, PersistedPosting[]>;
    linesByTransactionId: Map<string, PersistedTransactionLine[]>;
    transactions: Awaited<ReturnType<typeof listAccountDependentTransactions>>;
}): DeletionImpactSummary {
    const postingCount = countRecordGroups(
        input.postingsByTransactionId.values(),
    );
    const dependentRevisions = [
        ...input.transactions.map(createTransactionRevision),
        ...createRecordGroupRevisions(
            input.postingsByTransactionId.values(),
            createLedgerPostingRevision,
        ),
        ...createRecordGroupRevisions(
            input.linesByTransactionId.values(),
            createTransactionLineRevision,
        ),
        ...input.plaidAccountLinks.map(createPlaidAccountLinkRevision),
        ...input.plaidTransactionSyncs.map(createPlaidTransactionSyncRevision),
        ...input.plaidItemSyncStates.map(createPlaidItemSyncStateRevision),
    ];

    return createDeletionImpactSummary({
        target: {
            targetType: "account",
            targetId: input.account.accountId,
            displayName: input.account.name,
            sectionId: "accounts",
        },
        targetUpdatedAt: input.account.updatedAt,
        dependentCounts: [
            { label: "Transactions", count: input.transactions.length },
            { label: "Ledger postings", count: postingCount },
            {
                label: "Plaid account links",
                count: input.plaidAccountLinks.length,
            },
            {
                label: "Plaid transaction sync records",
                count: input.plaidTransactionSyncs.length,
            },
        ],
        affectedPeriods: input.transactions.map(
            (transaction) => transaction.periodId,
        ),
        dependentRevisions,
        crossAreaEffects: [
            "Account balances will update from the remaining saved transactions.",
            "Budget availability and readiness will be recalculated for affected periods.",
            "Plaid links and saved Plaid references for this account will be removed.",
            "Reporting summaries will refresh from the remaining saved activity.",
        ],
    });
}

export async function getAccountRecord(ledgerId: string, accountId: string) {
    const { entities } = getBudgetedSchema();
    const result = await entities.accounts.get({ ledgerId, accountId }).go();

    if (!result.data) {
        throw new HttpError(
            404,
            "account_missing",
            "The account could not be found.",
        );
    }

    return result.data;
}

export async function getAccountDeletionImpact(
    ledgerId: string,
    accountId: string,
) {
    await assertAccountHasNoVenmoDependencies(ledgerId, accountId);
    const dependencyState = await getAccountDependentPostings(
        ledgerId,
        accountId,
    );
    assertAccountHasNoReconciledTransactions(
        dependencyState.transactions,
        "deleting the account",
    );

    return buildAccountDeletionImpact({
        ...dependencyState,
    });
}

export async function listAccounts(
    ledgerId: string,
    asOf?: Date | string,
): Promise<AccountWithBalance[]> {
    const accounts = await listAccountRecords(ledgerId);
    return hydrateAccountsWithBalances(ledgerId, accounts, asOf);
}

export async function hasAnyAccounts(ledgerId: string) {
    const accounts = await listAccountRecords(ledgerId);
    return accounts.length > 0;
}

async function accountHasActivePlaidLink(ledgerId: string, accountId: string) {
    const { entities } = getBudgetedSchema();
    const links = (await queryAllPages(
        entities.plaidAccountLinks.query.byAccount({ ledgerId, accountId }),
    )) as PlaidAccountLinkRecord[];

    return links.some(
        (link) => link.status === "linked" || link.status === "error",
    );
}

async function accountHasPlaidTransactionSyncs(
    ledgerId: string,
    accountId: string,
) {
    const { entities } = getBudgetedSchema();
    const syncRecords = (await queryAllPages(
        entities.plaidTransactionSyncs.query.byPlaidTransaction({
            ledgerId,
            accountId,
        }),
    )) as PlaidTransactionSyncRecord[];

    return syncRecords.length > 0;
}

async function upsertAccountInternal(
    ledgerId: string,
    input: (AccountInput | AccountUpdateInput) & { accountId?: string },
) {
    const { entities } = getBudgetedSchema();
    const existing = input.accountId
        ? await getAccountRecord(ledgerId, input.accountId)
        : null;
    const accounts = await listAccountRecords(ledgerId);
    const now = new Date().toISOString();
    const accountId = existing?.accountId ?? input.accountId ?? ulid();
    const name = input.name?.trim() ?? existing?.name ?? "";
    const accountType = input.accountType ?? existing?.accountType ?? "checking";
    const openingBalanceCents = accountTypeSupportsOpeningBalance(accountType)
        ? (input.openingBalanceCents ?? existing?.openingBalanceCents ?? 0)
        : 0;
    const preservesPlaidSummary = accountTypeSupportsPlaid(accountType);

    if (!name) {
        throw new HttpError(422, "validation_error", "Account name is required.");
    }

    if (existing && openingBalanceCents !== existing.openingBalanceCents) {
        const transactions = await listAccountDependentTransactions(
            ledgerId,
            existing,
        );
        assertAccountHasNoReconciledTransactions(
            transactions,
            "changing its opening balance",
        );
    }

    if (
        accounts.some(
            (account) =>
                account.accountId !== existing?.accountId &&
                account.name.trim().toLowerCase() === name.toLowerCase(),
        )
    ) {
        throw new HttpError(
            409,
            "account_conflict",
            "An account with this name already exists.",
        );
    }

    if (
        existing &&
        !accountTypeSupportsPlaid(accountType) &&
        ((await accountHasActivePlaidLink(ledgerId, existing.accountId)) ||
            (await accountHasPlaidTransactionSyncs(ledgerId, existing.accountId)))
    ) {
        throw new HttpError(
            422,
            "plaid_account_type_unsupported",
            "Transfers accounts cannot be linked to Plaid or contain Plaid-synced transactions.",
        );
    }

    const record = {
        accountId,
        ledgerId,
        name,
        accountType,
        ledgerAccountId: existing?.ledgerAccountId ?? `acct_${accountId}`,
        openingBalanceCents,
        openedOn: input.openedOn ?? existing?.openedOn ?? now.slice(0, 10),
        plaidAccountLinkId: preservesPlaidSummary
            ? existing?.plaidAccountLinkId
            : undefined,
        plaidAccountMask: preservesPlaidSummary
            ? existing?.plaidAccountMask
            : undefined,
        plaidAccountName: preservesPlaidSummary
            ? existing?.plaidAccountName
            : undefined,
        plaidAccountSubtype: preservesPlaidSummary
            ? existing?.plaidAccountSubtype
            : undefined,
        plaidInstitutionLogo: preservesPlaidSummary
            ? existing?.plaidInstitutionLogo
            : undefined,
        plaidInstitutionName: preservesPlaidSummary
            ? existing?.plaidInstitutionName
            : undefined,
        plaidInstitutionPrimaryColor: preservesPlaidSummary
            ? existing?.plaidInstitutionPrimaryColor
            : undefined,
        plaidInstitutionUrl: preservesPlaidSummary
            ? existing?.plaidInstitutionUrl
            : undefined,
        plaidLastSyncedAt: preservesPlaidSummary
            ? existing?.plaidLastSyncedAt
            : undefined,
        plaidLastSyncStatus: preservesPlaidSummary
            ? existing?.plaidLastSyncStatus
            : undefined,
        plaidLinkStatus: preservesPlaidSummary
            ? existing?.plaidLinkStatus
            : undefined,
        plaidSyncStartDate: preservesPlaidSummary
            ? existing?.plaidSyncStartDate
            : undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    await entities.accounts.upsert(record).go();

    try {
        const account = (await hydrateAccountsWithBalances(ledgerId, [record]))[0];

        return {
            account,
            workspaceChanges: [
                createWorkspaceUpsertChange({
                    entityId: account.accountId,
                    entityType: "account",
                    previousRecord: existing,
                    record: account,
                }),
            ],
        };
    } catch {
        const account = {
            ...record,
            balanceCents: record.openingBalanceCents,
        };

        return {
            account,
            workspaceChanges: [
                createWorkspaceUpsertChange({
                    entityId: account.accountId,
                    entityType: "account",
                    previousRecord: existing,
                    record: account,
                }),
            ],
        };
    }
}

export async function upsertAccount(
    ledgerId: string,
    input: (AccountInput | AccountUpdateInput) & { accountId?: string },
) {
    return (await upsertAccountInternal(ledgerId, input)).account;
}

export async function upsertAccountWithWorkspaceChanges(
    ledgerId: string,
    input: (AccountInput | AccountUpdateInput) & { accountId?: string },
) {
    return upsertAccountInternal(ledgerId, input);
}

export async function deleteAccount(
    ledgerId: string,
    accountId: string,
    previewRevision: string,
) {
    const { entities } = getBudgetedSchema();
    await assertAccountHasNoVenmoDependencies(ledgerId, accountId);
    const dependencyState = await getAccountDependentPostings(
        ledgerId,
        accountId,
    );
    assertAccountHasNoReconciledTransactions(
        dependencyState.transactions,
        "deleting the account",
    );
    const impact = buildAccountDeletionImpact({
        ...dependencyState,
    });

    assertDeletionPreviewRevision(previewRevision, impact.previewRevision);

    const convertedTransactions = dependencyState.transactions
        .map((transaction) => {
            const lines = createLinesForDeletedAccount({
                accountId,
                lines:
                    dependencyState.linesByTransactionId.get(transaction.transactionId) ??
                    [],
            });

            return {
                lines,
                plaidTransactionSyncId: getSurvivingPlaidSyncId({
                    accountId,
                    allPlaidTransactionSyncs: dependencyState.allPlaidTransactionSyncs,
                    transaction,
                }),
                transaction,
            };
        })
        .filter((conversion) => conversion.lines.length > 0);
    const convertedTransactionIds = new Set(
        convertedTransactions.map(
            (conversion) => conversion.transaction.transactionId,
        ),
    );
    const transactionsToDelete = dependencyState.transactions.filter(
        (transaction) => !convertedTransactionIds.has(transaction.transactionId),
    );

    try {
        for (const transaction of transactionsToDelete) {
            await removeTransactionChildren(ledgerId, transaction.transactionId);
            await entities.transactions
                .delete({
                    ledgerId,
                    occurredAt: transaction.occurredAt,
                    transactionId: transaction.transactionId,
                })
                .go();
        }

        if (transactionsToDelete.length > 0) {
            await recordTransactionAuditLog({
                action: "bulkDelete",
                ledgerId,
                source: "accountDeleteRewrite",
                summary: {
                    deletedCount: transactionsToDelete.length,
                    reason: "Deleted account removed dependent transactions.",
                },
                transactionIds: transactionsToDelete.map(
                    (transaction) => transaction.transactionId,
                ),
            });
        }

        for (const conversion of convertedTransactions) {
            const referenceAccountId =
                conversion.transaction.referenceAccountId !== accountId
                    ? conversion.transaction.referenceAccountId
                    : (conversion.lines[0]?.fromAccountId ??
                        conversion.lines[0]?.toAccountId);

            await upsertTransactionWithinWorkspaceMutation(ledgerId, {
                ...createTransactionRewriteInput({
                    accountId: referenceAccountId,
                    lines: toTransactionLineInputs(conversion.lines),
                    plaidTransactionSyncId: conversion.plaidTransactionSyncId ?? null,
                    source: conversion.plaidTransactionSyncId ? "plaid" : "manual",
                    transaction: conversion.transaction,
                }),
                audit: {
                    action: "rewrite",
                    source: "accountDeleteRewrite",
                },
            });
        }

        await Promise.all([
            deletePlaidTransactionSyncRecords(dependencyState.plaidTransactionSyncs),
            ...dependencyState.plaidAccountLinks.map((link) =>
                entities.plaidAccountLinks
                    .delete({
                        ledgerId,
                        plaidAccountLinkId: link.plaidAccountLinkId,
                    })
                    .go(),
            ),
            ...dependencyState.plaidItemSyncStates.map((item) =>
                entities.plaidItemSyncStates
                    .delete({
                        ledgerId,
                        plaidItemId: item.plaidItemId,
                    })
                    .go(),
            ),
        ]);
        await entities.accounts.delete({ ledgerId, accountId }).go();
        await syncAffectedBudgetPeriodActivity(
            ledgerId,
            dependencyState.transactions.map((transaction) => transaction.periodId),
        );

        return impact;
    } catch (error) {
        const rollbackTasks: Promise<unknown>[] = [
            entities.accounts.put(dependencyState.account).go(),
            ...dependencyState.transactions.map(async (transaction) => {
                await removeTransactionChildren(ledgerId, transaction.transactionId);
                await Promise.all([
                    entities.transactions.put(transaction).go(),
                    restoreTransactionChildren({
                        lines:
                            dependencyState.linesByTransactionId.get(
                                transaction.transactionId,
                            ) ?? [],
                        postings:
                            dependencyState.postingsByTransactionId.get(
                                transaction.transactionId,
                            ) ?? [],
                    }),
                ]);
            }),
            ...dependencyState.plaidAccountLinks.map((link) =>
                entities.plaidAccountLinks.put(link).go(),
            ),
            putPlaidTransactionSyncRecords(dependencyState.plaidTransactionSyncs),
            ...dependencyState.plaidItemSyncStates.map((item) =>
                entities.plaidItemSyncStates.put(item).go(),
            ),
        ];

        if (dependencyState.transactions.length > 0) {
            rollbackTasks.push(
                syncAffectedBudgetPeriodActivity(
                    ledgerId,
                    dependencyState.transactions.map(
                        (transaction) => transaction.periodId,
                    ),
                ),
            );
        }

        await Promise.allSettled(rollbackTasks);
        throw error;
    }
}

async function assertAccountHasNoVenmoDependencies(
    ledgerId: string,
    accountId: string,
) {
    const { entities } = getBudgetedSchema();
    if (!entities.venmoIntegrations || !entities.venmoAccountMappings) return;
    const [integrations, mappings] = await Promise.all([
        queryAllPages(entities.venmoIntegrations.query.byIntegration({ ledgerId }), { consistent: true }),
        queryAllPages(entities.venmoAccountMappings.query.byMapping({ ledgerId }), { consistent: true }),
    ]);
    const isBalanceAccount = integrations.some(
        (integration) =>
            integration.inboxEnabled && integration.venmoAccountId === accountId,
    );
    const mappedCount = mappings.filter((mapping) => mapping.accountId === accountId).length;

    if (isBalanceAccount || mappedCount > 0) {
        throw new HttpError(
            409,
            "account_has_venmo_dependencies",
            isBalanceAccount
                ? "Disable the Venmo inbox and select a different Venmo balance account before deleting this account."
                : `Delete or remap ${mappedCount} Venmo account ${mappedCount === 1 ? "mapping" : "mappings"} before deleting this account.`,
        );
    }
}

async function listAllocationRecordsForPeriods(
    ledgerId: string,
    periodIds: string[],
) {
    const { entities } = getBudgetedSchema();
    const uniquePeriodIds = Array.from(new Set(periodIds));

    return (
        await Promise.all(
            uniquePeriodIds.map((periodId) =>
                queryAllPages(
                    entities.categoryAllocations.query
                        .byAllocation({ ledgerId })
                        .begins({ periodId }),
                    { consistent: true },
                ),
            ),
        )
    ).flat();
}

export async function deleteAccountWithWorkspaceChanges(
    ledgerId: string,
    accountId: string,
    previewRevision: string,
) {
    const dependencyState = await getAccountDependentPostings(
        ledgerId,
        accountId,
    );
    const convertedTransactionIds = new Set(
        dependencyState.transactions
            .filter((transaction) => {
                const lines = createLinesForDeletedAccount({
                    accountId,
                    lines:
                        dependencyState.linesByTransactionId.get(
                            transaction.transactionId,
                        ) ?? [],
                });

                return lines.length > 0;
            })
            .map((transaction) => transaction.transactionId),
    );
    const transactionsToDelete = dependencyState.transactions.filter(
        (transaction) => !convertedTransactionIds.has(transaction.transactionId),
    );
    const affectedPeriodIds = dependencyState.transactions.map(
        (transaction) => transaction.periodId,
    );
    const impact = await deleteAccount(ledgerId, accountId, previewRevision);
    const convertedTransactions = await listStoredTransactionsByIds(
        ledgerId,
        convertedTransactionIds,
    );
    const { linesByTransactionId, postingsByTransactionId } =
        await listTransactionChildrenByTransactionId(
            ledgerId,
            convertedTransactions.map((transaction) => transaction.transactionId),
        );
    const changedAllocations = await listAllocationRecordsForPeriods(
        ledgerId,
        affectedPeriodIds,
    );
    const previousTransactionById = new Map(
        dependencyState.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );
    const previousLineById = new Map(
        Array.from(dependencyState.linesByTransactionId.values())
            .flat()
            .map((line) => [line.lineId, line]),
    );
    const previousPostingById = new Map(
        Array.from(dependencyState.postingsByTransactionId.values())
            .flat()
            .map((posting) => [posting.postingId, posting]),
    );

    return {
        impact,
        workspaceChanges: [
            createWorkspaceDeleteChange({
                entityId: accountId,
                entityType: "account",
                previousRecord: dependencyState.account,
            }),
            ...transactionsToDelete.flatMap((transaction) => [
                createWorkspaceDeleteChange({
                    entityId: transaction.transactionId,
                    entityType: "transaction",
                    previousRecord: transaction,
                }),
                ...(
                    dependencyState.linesByTransactionId.get(transaction.transactionId) ??
                    []
                ).map((line) =>
                    createWorkspaceDeleteChange({
                        entityId: line.lineId,
                        entityType: "transactionLine",
                        previousRecord: line,
                    }),
                ),
                ...(
                    dependencyState.postingsByTransactionId.get(
                        transaction.transactionId,
                    ) ?? []
                ).map((posting) =>
                    createWorkspaceDeleteChange({
                        entityId: posting.postingId,
                        entityType: "ledgerPosting",
                        previousRecord: posting,
                    }),
                ),
            ]),
            ...convertedTransactions.flatMap((transaction) => [
                createWorkspaceUpsertChange({
                    entityId: transaction.transactionId,
                    entityType: "transaction",
                    previousRecord:
                        previousTransactionById.get(transaction.transactionId) ?? null,
                    record: transaction,
                }),
                ...(linesByTransactionId.get(transaction.transactionId) ?? []).map(
                    (line) =>
                        createWorkspaceUpsertChange({
                            entityId: line.lineId,
                            entityType: "transactionLine",
                            previousRecord: previousLineById.get(line.lineId) ?? null,
                            record: line,
                        }),
                ),
                ...(postingsByTransactionId.get(transaction.transactionId) ?? []).map(
                    (posting) =>
                        createWorkspaceUpsertChange({
                            entityId: posting.postingId,
                            entityType: "ledgerPosting",
                            previousRecord:
                                previousPostingById.get(posting.postingId) ?? null,
                            record: posting,
                        }),
                ),
            ]),
            ...dependencyState.plaidAccountLinks.map((link) =>
                createWorkspaceDeleteChange({
                    entityId: link.plaidAccountLinkId,
                    entityType: "plaidAccountLink",
                    previousRecord: link,
                }),
            ),
            ...dependencyState.plaidTransactionSyncs.map((record) =>
                createWorkspaceDeleteChange({
                    entityId: record.plaidTransactionSyncId,
                    entityType: "plaidTransactionSync",
                    previousRecord: record,
                }),
            ),
            ...changedAllocations.map((allocation) =>
                createWorkspaceUpsertChange({
                    entityId: allocation.allocationId,
                    entityType: "categoryAllocation",
                    previousRecord: allocation,
                    record: allocation,
                }),
            ),
        ],
    };
}
