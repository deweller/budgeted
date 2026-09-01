"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCircleCheck,
    faCircleNotch,
    faRotate,
    faScaleBalanced,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import { AccountReconciliationDialog } from "@/components/accounts/account-reconciliation-dialog";
import { HeaderStatusDisclosure } from "@/components/shared/header-status-disclosure";
import { MoneyAmount } from "@/components/shared/money-amount";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import {
    findActivePlaidAccountLink,
    getLocalBalanceCents,
    getPlaidBalanceSummary,
} from "@/features/plaid/models/plaid-balance-summary";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { controlClassNames } from "@/lib/theme/theme-recipes";
import { transactionHasAccountActivity } from "@/modules/ledger";

type AccountTransactionStatusBarProps = {
    account: AccountWithBalance;
};

type PlaidSyncResponse = {
    addedCount?: number;
};

function formatCompactDateTime(timestamp: string) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return timestamp;
    }

    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
    }).format(date);
}

function formatPlaidSyncStatus(status?: "failed" | "never" | "succeeded") {
    switch (status) {
        case "failed":
            return "Failed";
        case "succeeded":
            return "Succeeded";
        case "never":
        default:
            return "Never";
    }
}

function formatPlaidSyncSummary(account: AccountWithBalance) {
    const status = formatPlaidSyncStatus(account.plaidLastSyncStatus);

    return account.plaidLastSyncedAt
        ? `${status} ${formatCompactDateTime(account.plaidLastSyncedAt)}`
        : status;
}

function isSyncablePlaidAccount(
    account: AccountWithBalance | undefined,
    activePlaidLink: ReturnType<typeof findActivePlaidAccountLink> | undefined,
) {
    return Boolean(
        account &&
            (account.plaidAccountLinkId || activePlaidLink) &&
            account.plaidLinkStatus !== "disabled" &&
            activePlaidLink?.status !== "disabled",
    );
}

function isPlaidBalanceCurrentForReconciliation(
    account: AccountWithBalance,
    activePlaidLink: ReturnType<typeof findActivePlaidAccountLink> | undefined,
) {
    const transactionSyncStatus =
        activePlaidLink?.lastSyncStatus ?? account.plaidLastSyncStatus;
    const transactionSyncedAt =
        activePlaidLink?.lastSyncedAt ?? account.plaidLastSyncedAt;
    const balanceSyncStatus =
        activePlaidLink?.plaidBalanceSyncStatus ??
        account.plaidBalanceSyncStatus;
    const balanceSyncedAt =
        activePlaidLink?.plaidBalanceLastSyncedAt ??
        account.plaidBalanceLastSyncedAt;

    return Boolean(
        transactionSyncStatus === "succeeded" &&
            balanceSyncStatus === "succeeded" &&
            transactionSyncedAt &&
            balanceSyncedAt &&
            transactionSyncedAt.slice(0, 10) === balanceSyncedAt.slice(0, 10),
    );
}

export function AccountTransactionStatusBar({
    account,
}: AccountTransactionStatusBarProps) {
    const { applyWorkspaceMutationResponse, snapshot } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [isCheckingPlaidBalance, setIsCheckingPlaidBalance] = useState(false);
    const [isSyncingPlaidAccount, setIsSyncingPlaidAccount] = useState(false);
    const [isPreparingReconciliation, setIsPreparingReconciliation] =
        useState(false);
    const [isReconciliationOpen, setIsReconciliationOpen] = useState(false);
    const currentAccount =
        snapshot.accounts.find(
            (snapshotAccount) => snapshotAccount.accountId === account.accountId,
        ) ?? account;
    const activePlaidLink = findActivePlaidAccountLink(
        currentAccount,
        snapshot.plaidAccountLinks,
    );
    const syncablePlaidAccount = isSyncablePlaidAccount(
        currentAccount,
        activePlaidLink,
    )
        ? currentAccount
        : undefined;
    const localBalanceCents = getLocalBalanceCents({
        account: currentAccount,
        ledgerPostings: snapshot.ledgerPostings,
        transactions: snapshot.transactions,
    });
    const unlockedTransactionCount = snapshot.transactions.filter(
        (transaction) =>
            transaction.status !== "reconciled" &&
            transaction.status !== "voided" &&
            transactionHasAccountActivity(transaction, currentAccount),
    ).length;
    const plaidBalanceSummary = syncablePlaidAccount
        ? getPlaidBalanceSummary({
                account: {
                    ...syncablePlaidAccount,
                    balanceCents: localBalanceCents,
                },
                link: activePlaidLink,
                localBalanceCents,
            })
        : undefined;
    const isReconciliationComplete =
        unlockedTransactionCount === 0 &&
        plaidBalanceSummary?.differenceCents === 0;

    async function checkPlaidBalance(options?: {
        errorSuffix?: string;
        errorTitle?: string;
    }) {
        if (!syncablePlaidAccount || isCheckingPlaidBalance) {
            return false;
        }

        setIsCheckingPlaidBalance(true);
        const activity = startActivity({
            completedLabel: "Plaid balance synced.",
            pendingLabel: "Syncing Plaid balance…",
        });

        try {
            const response = await fetch(
                `/api/accounts/${syncablePlaidAccount.accountId}/plaid/balance`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(response, "Unable to sync Plaid balance."),
                );
            }

            await applyWorkspaceMutationResponse<PlaidSyncResponse>(response);
            activity.complete();

            return true;
        } catch (syncError) {
            activity.fail();
            const message =
                syncError instanceof Error
                    ? syncError.message
                    : "Unable to sync Plaid balance.";
            notifyError({
                message: `${message}${options?.errorSuffix ?? ""}`,
                title: options?.errorTitle ?? "Plaid balance sync failed.",
            });
            return false;
        } finally {
            setIsCheckingPlaidBalance(false);
        }
    }

    async function startReconciliation() {
        if (isPreparingReconciliation || isCheckingPlaidBalance) {
            return;
        }

        if (
            syncablePlaidAccount &&
            !isPlaidBalanceCurrentForReconciliation(
                syncablePlaidAccount,
                activePlaidLink,
            )
        ) {
            setIsPreparingReconciliation(true);

            try {
                const didSyncBalance = await checkPlaidBalance({
                    errorSuffix: " Reconciliation was not started.",
                    errorTitle: "Reconciliation could not start.",
                });

                if (!didSyncBalance) {
                    return;
                }
            } finally {
                setIsPreparingReconciliation(false);
            }
        }

        setIsReconciliationOpen(true);
    }

    async function syncPlaidTransactions() {
        if (!syncablePlaidAccount || isSyncingPlaidAccount) {
            return;
        }

        setIsSyncingPlaidAccount(true);
        const activity = startActivity({
            completedLabel: "Plaid sync complete.",
            pendingLabel: "Syncing Plaid account…",
        });

        try {
            const response = await fetch(
                `/api/accounts/${syncablePlaidAccount.accountId}/plaid/sync`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        syncStartDate: syncablePlaidAccount.plaidSyncStartDate,
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(response, "Unable to sync Plaid account."),
                );
            }

            await applyWorkspaceMutationResponse<PlaidSyncResponse>(response);
            activity.complete();
        } catch (syncError) {
            activity.fail();
            notifyError({
                message:
                    syncError instanceof Error
                        ? syncError.message
                        : "Unable to sync Plaid account.",
                title: "Plaid sync failed.",
            });
        } finally {
            setIsSyncingPlaidAccount(false);
        }
    }

    return (
        <>
            <div className="flex flex-wrap justify-end gap-2">
                {currentAccount.accountType !== "transfers" ? (
                    <HeaderStatusDisclosure
                        label={
                            <>
                                Reconcile
                                {isReconciliationComplete ? (
                                    <FontAwesomeIcon
                                        aria-label="No unlocked transactions"
                                        icon={faCircleCheck}
                                        className="text-[var(--tone-success-ink)]"
                                    />
                                ) : null}
                            </>
                        }
                    >
                        <div className="grid gap-1">
                            <div className="flex items-center justify-between gap-3">
                                <span>Ledger</span>
                                <MoneyAmount cents={localBalanceCents} />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>Unlocked</span>
                                <span>
                                    {unlockedTransactionCount} transaction
                                    {unlockedTransactionCount === 1 ? "" : "s"}
                                </span>
                            </div>
                            {plaidBalanceSummary ? (
                                <>
                                    <div className="flex items-center justify-between gap-3">
                                        <span>Institution</span>
                                        {typeof plaidBalanceSummary.institutionBalanceCents ===
                                        "number" ? (
                                            <MoneyAmount
                                                cents={plaidBalanceSummary.institutionBalanceCents}
                                            />
                                        ) : (
                                            <span>Not synced</span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="inline-flex items-center gap-1">
                                            {typeof plaidBalanceSummary.differenceCents ===
                                            "number" ? (
                                                <FontAwesomeIcon
                                                    aria-label={
                                                        plaidBalanceSummary.differenceCents === 0
                                                            ? "Balances match"
                                                            : "Balances differ"
                                                    }
                                                    icon={
                                                        plaidBalanceSummary.differenceCents === 0
                                                            ? faCircleCheck
                                                            : faTriangleExclamation
                                                    }
                                                    className={
                                                        plaidBalanceSummary.differenceCents === 0
                                                            ? "text-[var(--tone-success-ink)]"
                                                            : "text-[var(--tone-warning-ink)]"
                                                    }
                                                />
                                            ) : null}
                                            Difference
                                        </span>
                                        {typeof plaidBalanceSummary.differenceCents === "number" ? (
                                            <MoneyAmount
                                                cents={plaidBalanceSummary.differenceCents}
                                            />
                                        ) : (
                                            <span>Not available</span>
                                        )}
                                    </div>
                                    {plaidBalanceSummary.lastSyncedAt ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <span>Last sync</span>
                                            <span>
                                                {formatCompactDateTime(
                                                    plaidBalanceSummary.lastSyncedAt,
                                                )}
                                            </span>
                                        </div>
                                    ) : null}
                                </>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                            {plaidBalanceSummary ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        void checkPlaidBalance();
                                    }}
                                    disabled={
                                        isCheckingPlaidBalance ||
                                        isPreparingReconciliation
                                    }
                                    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap ${controlClassNames.secondaryActionSmall}`}
                                >
                                    <FontAwesomeIcon
                                        aria-hidden="true"
                                        icon={isCheckingPlaidBalance ? faCircleNotch : faRotate}
                                        className={
                                            isCheckingPlaidBalance
                                                ? "h-3 w-3 animate-spin"
                                                : "h-3 w-3"
                                        }
                                    />
                                    {isCheckingPlaidBalance
                                        ? "Checking..."
                                        : "Check balance"}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => {
                                    void startReconciliation();
                                }}
                                disabled={
                                    isCheckingPlaidBalance ||
                                    isPreparingReconciliation
                                }
                                className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap ${controlClassNames.secondaryActionSmall}`}
                            >
                                <FontAwesomeIcon
                                    aria-hidden="true"
                                    icon={faScaleBalanced}
                                    className="h-3 w-3"
                                />
                                {isPreparingReconciliation
                                    ? "Refreshing balance..."
                                    : "Reconcile"}
                            </button>
                        </div>
                    </HeaderStatusDisclosure>
                ) : (
                    <div
                        className={`whitespace-nowrap ${controlClassNames.secondaryActionSmall}`}
                    >
                        Balance <MoneyAmount cents={localBalanceCents} />
                    </div>
                )}

                {syncablePlaidAccount ? (
                    <HeaderStatusDisclosure
                        label={
                            <>
                                Sync
                                <span>{formatPlaidSyncSummary(syncablePlaidAccount)}</span>
                            </>
                        }
                    >
                        <div className="grid gap-1">
                            <div className="flex items-center justify-between gap-3">
                                <span>Status</span>
                                <span>
                                    {formatPlaidSyncStatus(
                                        syncablePlaidAccount.plaidLastSyncStatus,
                                    )}
                                </span>
                            </div>
                            {syncablePlaidAccount.plaidLastSyncedAt ? (
                                <div className="flex items-center justify-between gap-3">
                                    <span>Last sync</span>
                                    <span>
                                        {formatCompactDateTime(
                                            syncablePlaidAccount.plaidLastSyncedAt,
                                        )}
                                    </span>
                                </div>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                void syncPlaidTransactions();
                            }}
                            disabled={isSyncingPlaidAccount}
                            className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap ${controlClassNames.secondaryActionSmall}`}
                        >
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={isSyncingPlaidAccount ? faCircleNotch : faRotate}
                                className={
                                    isSyncingPlaidAccount ? "h-3 w-3 animate-spin" : "h-3 w-3"
                                }
                            />
                            {isSyncingPlaidAccount ? "Syncing..." : "Sync now"}
                        </button>
                    </HeaderStatusDisclosure>
                ) : null}
            </div>
            <AccountReconciliationDialog
                account={currentAccount}
                onClose={() => setIsReconciliationOpen(false)}
                open={isReconciliationOpen}
                requiresManualBalance={!syncablePlaidAccount}
            />
        </>
    );
}
