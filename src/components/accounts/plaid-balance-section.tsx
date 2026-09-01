"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCircleCheck,
    faRotate,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import { WorkspaceStatusPanel } from "@/components/dashboard/workspace-status-panel";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { MoneyAmount } from "@/components/shared/money-amount";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import {
    findActivePlaidAccountLink,
    getLocalBalanceCents,
    getPlaidBalanceSummary,
} from "@/features/plaid/models/plaid-balance-summary";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { accountTypeSupportsPlaid } from "@/modules/accounts/account-types";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type PlaidBalanceSectionProps = {
    account: AccountWithBalance;
};

export function PlaidBalanceSection({ account }: PlaidBalanceSectionProps) {
    const { applyWorkspaceMutationResponse, snapshot } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [isSyncingBalance, setIsSyncingBalance] = useState(false);
    const currentAccount =
        snapshot.accounts.find(
            (snapshotAccount) => snapshotAccount.accountId === account.accountId,
        ) ?? account;
    const activePlaidLink = useMemo(
        () =>
            findActivePlaidAccountLink(
                currentAccount,
                snapshot.plaidAccountLinks,
            ),
        [currentAccount, snapshot.plaidAccountLinks],
    );
    const isLinked = Boolean(activePlaidLink ?? account.plaidAccountLinkId);
    const localBalanceCents = getLocalBalanceCents({
        account: {
            ...currentAccount,
            balanceCents: currentAccount.balanceCents ?? account.balanceCents,
        },
        ledgerPostings: snapshot.ledgerPostings,
        transactions: snapshot.transactions,
    });
    const plaidBalanceSummary = getPlaidBalanceSummary({
        account: {
            ...currentAccount,
            balanceCents: localBalanceCents,
        },
        link: activePlaidLink,
        localBalanceCents,
    });

    if (!accountTypeSupportsPlaid(account.accountType) || !isLinked) {
        return null;
    }

    async function syncPlaidBalance() {
        setIsSyncingBalance(true);
        const activity = startActivity({
            completedLabel: "Plaid balance synced.",
            pendingLabel: "Syncing Plaid balance…",
        });

        try {
            const response = await fetch(
                `/api/accounts/${account.accountId}/plaid/balance`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to sync Plaid balance.",
                    ),
                );
            }

            await applyWorkspaceMutationResponse(response);
            activity.complete();
        } catch (syncError) {
            activity.fail();
            notifyError({
                message:
                    syncError instanceof Error
                        ? syncError.message
                        : "Unable to sync Plaid balance.",
                title: "Plaid balance sync failed.",
            });
        } finally {
            setIsSyncingBalance(false);
        }
    }

    return (
        <section className={`grid gap-4 p-4 ${surfaceClassNames.panelStrong}`}>
            <div className="grid gap-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className={typographyClassNames.eyebrow}>
                        Institution balance
                    </p>
                    <div className="ml-auto flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                void syncPlaidBalance();
                            }}
                            disabled={isSyncingBalance}
                            className={controlClassNames.secondaryActionSmall}
                        >
                            <FontAwesomeIcon icon={faRotate} className="mr-2" />
                            {isSyncingBalance ? "Syncing..." : "Sync balance"}
                        </button>
                    </div>
                </div>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Local balance
                    </dt>
                    <dd className="mt-1 text-[var(--color-ink)]">
                        <MoneyAmount cents={localBalanceCents} />
                    </dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Institution balance
                    </dt>
                    <dd className="mt-1 grid gap-1 text-[var(--color-ink)]">
                        {typeof plaidBalanceSummary.institutionBalanceCents ===
                        "number" ? (
                            <MoneyAmount
                                cents={
                                    plaidBalanceSummary.institutionBalanceCents
                                }
                            />
                        ) : (
                            <span className={typographyClassNames.mutedBody}>
                                Not synced
                            </span>
                        )}
                        {plaidBalanceSummary.lastSyncedAt ? (
                            <span className="text-xs text-[var(--color-muted)]">
                                {new Date(
                                    plaidBalanceSummary.lastSyncedAt,
                                ).toLocaleString()}
                            </span>
                        ) : null}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Difference
                    </dt>
                    <dd className="mt-1 flex items-center gap-2 text-[var(--color-ink)]">
                        {typeof plaidBalanceSummary.differenceCents ===
                        "number" ? (
                            <>
                                <FontAwesomeIcon
                                    aria-label={
                                        plaidBalanceSummary.differenceCents ===
                                        0
                                            ? "Balances match"
                                            : "Balances differ"
                                    }
                                    icon={
                                        plaidBalanceSummary.differenceCents ===
                                        0
                                            ? faCircleCheck
                                            : faTriangleExclamation
                                    }
                                    className={
                                        plaidBalanceSummary.differenceCents ===
                                        0
                                            ? "text-[var(--tone-success-ink)]"
                                            : "text-[var(--tone-warning-ink)]"
                                    }
                                />
                                <MoneyAmount
                                    cents={plaidBalanceSummary.differenceCents}
                                />
                            </>
                        ) : (
                            <span className={typographyClassNames.mutedBody}>
                                Not available
                            </span>
                        )}
                    </dd>
                </div>
            </dl>

            {plaidBalanceSummary.syncError ? (
                <WorkspaceStatusPanel
                    compact
                    message={plaidBalanceSummary.syncError}
                    title="Last Plaid balance sync failed."
                    tone="error"
                />
            ) : null}

            {isSyncingBalance ? (
                <WorkspaceStatusPanel
                    compact
                    isLoading
                    message=""
                    title="Syncing Plaid balance."
                    tone="info"
                />
            ) : null}
        </section>
    );
}
