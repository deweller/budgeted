"use client";

import { useState } from "react";
import Link from "next/link";

import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { MoneyAmount } from "@/components/shared/money-amount";
import {
    PaneList,
    PaneListShortcutLabel,
} from "@/components/shared/pane-list";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { groupAccountsByType } from "@/features/accounts/models/account-groups";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatShortDisplayDate } from "@/lib/dates/local-date";
import { controlClassNames } from "@/lib/theme/theme-recipes";
import { getTransactionsAccountHref } from "@/lib/navigation/transaction-account-routes";

import { AccountMark } from "./account-mark";
import { AccountDialog } from "./account-dialog";

type AccountsTableProps = {
    accounts: AccountWithBalance[];
};

const accountPaneActionSizeClassName =
    "inline-flex min-h-9 min-w-16 items-center justify-center";

type AccountConnectionDisplay = {
    detail: string;
    label: string;
    toneClassName: string;
};

function isPlaidConnectedAccount(account: AccountWithBalance) {
    return Boolean(
        account.plaidAccountLinkId ||
            account.plaidLinkStatus ||
            account.plaidInstitutionName,
    );
}

function getAccountConnectionDisplay(
    account: AccountWithBalance,
): AccountConnectionDisplay {
    if (!isPlaidConnectedAccount(account)) {
        return {
            detail: "Not linked",
            label: "Manual",
            toneClassName: "text-[var(--color-muted)]",
        };
    }

    if (
        account.plaidLinkStatus === "error" ||
        account.plaidLastSyncStatus === "failed"
    ) {
        return {
            detail: account.plaidInstitutionName
                ? `Failed - ${account.plaidInstitutionName}`
                : "Failed",
            label: "Plaid",
            toneClassName: "text-[var(--tone-error-ink)]",
        };
    }

    if (account.plaidLinkStatus === "disabled") {
        return {
            detail: account.plaidInstitutionName
                ? `Disabled - ${account.plaidInstitutionName}`
                : "Disabled",
            label: "Plaid",
            toneClassName: "text-[var(--color-muted)]",
        };
    }

    if (account.plaidLastSyncStatus === "succeeded" || account.plaidLastSyncedAt) {
        return {
            detail: account.plaidLastSyncedAt
                ? `Synced ${formatShortDisplayDate(account.plaidLastSyncedAt)}`
                : "Synced",
            label: "Plaid",
            toneClassName: "text-[var(--tone-success-ink)]",
        };
    }

    return {
        detail: account.plaidInstitutionName ?? "Not synced yet",
        label: "Plaid",
        toneClassName: "text-[var(--color-ink)]",
    };
}

function AccountConnectionCell({ account }: { account: AccountWithBalance }) {
    const display = getAccountConnectionDisplay(account);

    return (
        <div className="grid gap-0.5">
            <span className={`font-medium ${display.toneClassName}`}>
                {display.label}
            </span>
            <span className="text-xs text-[var(--color-muted)]">
                {display.detail}
            </span>
        </div>
    );
}

export function AccountsTable({ accounts }: AccountsTableProps) {
    const { applyWorkspaceMutationResponse } = useWorkspaceStore();
    const { startActivity } = useBackgroundMutationActivity();
    const accountGroups = groupAccountsByType(accounts);
    const [dialogAccount, setDialogAccount] =
        useState<AccountWithBalance | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createDialogVersion, setCreateDialogVersion] = useState(0);
    const [deleteDialogAccount, setDeleteDialogAccount] =
        useState<AccountWithBalance | null>(null);
    const [deleteImpact, setDeleteImpact] =
        useState<DeletionImpactSummary | null>(null);
    const [deletePreviewError, setDeletePreviewError] = useState<string | null>(
        null,
    );
    const [isLoadingDeletePreview, setIsLoadingDeletePreview] = useState(false);
    const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<
        string | null
    >(null);

    async function loadDeletePreview(account: AccountWithBalance) {
        setDeleteDialogAccount(account);
        setDeleteImpact(null);
        setDeletePreviewError(null);
        setIsLoadingDeletePreview(true);

        try {
            const response = await fetch(`/api/accounts/${account.accountId}`);

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to load delete preview.",
                    ),
                );
            }

            const impact = (await response.json()) as DeletionImpactSummary;
            setDeleteImpact(impact);
        } catch (previewError) {
            setDeletePreviewError(
                previewError instanceof Error
                    ? previewError.message
                    : "Unable to load delete preview.",
            );
        } finally {
            setIsLoadingDeletePreview(false);
        }
    }

    async function confirmDeleteAccount() {
        if (!deleteDialogAccount || !deleteImpact) {
            return;
        }

        setPendingDeleteAccountId(deleteDialogAccount.accountId);
        setDeletePreviewError(null);
        const activity = startActivity({
            completedLabel: "Account deleted.",
            pendingLabel: "Deleting account…",
        });

        try {
            const response = await fetch(
                `/api/accounts/${deleteDialogAccount.accountId}`,
                {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        previewRevision: deleteImpact.previewRevision,
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to delete account.",
                    ),
                );
            }

            setDeleteDialogAccount(null);
            setDeleteImpact(null);
            await applyWorkspaceMutationResponse(response);
            activity.complete();
        } catch (deleteError) {
            activity.fail();
            setDeletePreviewError(
                deleteError instanceof Error
                    ? deleteError.message
                    : "Unable to delete account.",
            );
        } finally {
            setPendingDeleteAccountId(null);
        }
    }

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-end justify-end gap-4">
                <button
                    type="button"
                    onClick={() => {
                        setDialogAccount(null);
                        setCreateDialogVersion((version) => version + 1);
                        setIsCreating(true);
                    }}
                    className={controlClassNames.primaryActionCompact}
                >
                    Add account
                </button>
            </div>

            {accounts.length === 0 ? (
                <div className="border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                    No accounts yet. Add one to start reconciling transactions.
                </div>
            ) : (
                <PaneList aria-label="Accounts">
                    {accountGroups.map((group) => (
                        <PaneList.Group key={group.type} label={group.label}>
                            {group.accounts.map((account) => {
                                const isDeleteDisabled =
                                    isLoadingDeletePreview ||
                                    pendingDeleteAccountId ===
                                        account.accountId;
                                const viewLinkId = `account-${account.accountId}-view`;
                                const editAccount = () => {
                                    setDialogAccount(account);
                                    setIsCreating(false);
                                };
                                const deleteAccount = () => {
                                    void loadDeletePreview(account);
                                };

                                return (
                                    <PaneList.Item
                                        key={account.accountId}
                                        itemId={account.accountId}
                                        aria-label={account.name}
                                        className="sm:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.75fr)_minmax(8rem,0.5fr)_auto] sm:items-center"
                                        shortcuts={[
                                            {
                                                key: "v",
                                                onAction: () => {
                                                    document
                                                        .getElementById(
                                                            viewLinkId,
                                                        )
                                                        ?.click();
                                                },
                                            },
                                            {
                                                key: "e",
                                                onAction: editAccount,
                                            },
                                            {
                                                disabled: isDeleteDisabled,
                                                key: "d",
                                                onAction: deleteAccount,
                                            },
                                        ]}
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <AccountMark
                                                account={account}
                                                className="size-7 text-sm"
                                            />
                                            <span className="grid min-w-0 gap-0.5">
                                                <span className="truncate text-sm font-semibold text-[var(--color-ink)]">
                                                    {account.name}
                                                </span>
                                                <span className="text-xs text-[var(--color-muted)]">
                                                    Opened {account.openedOn}
                                                </span>
                                            </span>
                                        </div>
                                        <AccountConnectionCell
                                            account={account}
                                        />
                                        <span className="text-right text-sm font-semibold text-[var(--color-ink)]">
                                            <MoneyAmount
                                                cents={account.balanceCents}
                                            />
                                        </span>
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <Link
                                                id={viewLinkId}
                                                href={getTransactionsAccountHref(
                                                    account,
                                                    accounts,
                                                )}
                                                aria-label={`View transactions for ${account.name}`}
                                                className={`${accountPaneActionSizeClassName} ${controlClassNames.secondaryActionSmall}`}
                                                style={{ font: "inherit" }}
                                            >
                                                <PaneListShortcutLabel label="View" />
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={editAccount}
                                                className={`${accountPaneActionSizeClassName} ${controlClassNames.secondaryActionSmall}`}
                                            >
                                                <PaneListShortcutLabel label="Edit" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={deleteAccount}
                                                disabled={isDeleteDisabled}
                                                className={`${accountPaneActionSizeClassName} border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] px-3 py-2 text-xs font-medium text-[var(--tone-error-ink)] transition hover:bg-[var(--tone-error-surface-strong)] disabled:cursor-not-allowed disabled:opacity-60`}
                                            >
                                                <PaneListShortcutLabel
                                                    label={
                                                        pendingDeleteAccountId ===
                                                        account.accountId
                                                            ? "Deleting..."
                                                            : "Delete"
                                                    }
                                                />
                                            </button>
                                        </div>
                                    </PaneList.Item>
                                );
                            })}
                        </PaneList.Group>
                    ))}
                </PaneList>
            )}

            <AccountDialog
                key={
                    isCreating
                        ? `new-account-${createDialogVersion}`
                        : (dialogAccount?.accountId ?? "closed-account")
                }
                account={isCreating ? undefined : (dialogAccount ?? undefined)}
                open={isCreating || dialogAccount !== null}
                onSaved={() => undefined}
                onClose={() => {
                    setDialogAccount(null);
                    setIsCreating(false);
                }}
            />

            <DeleteConfirmationDialog
                open={deleteDialogAccount !== null}
                impact={deleteImpact}
                errorMessage={deletePreviewError}
                isLoading={isLoadingDeletePreview}
                isSubmitting={
                    deleteDialogAccount !== null &&
                    pendingDeleteAccountId === deleteDialogAccount.accountId
                }
                onRefresh={
                    deleteDialogAccount
                        ? () => {
                              void loadDeletePreview(deleteDialogAccount);
                          }
                        : undefined
                }
                onConfirm={() => {
                    void confirmDeleteAccount();
                }}
                onClose={() => {
                    if (pendingDeleteAccountId) {
                        return;
                    }

                    setDeleteDialogAccount(null);
                    setDeleteImpact(null);
                    setDeletePreviewError(null);
                }}
            />
        </div>
    );
}
