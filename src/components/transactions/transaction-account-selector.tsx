"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";

import { AccountMark } from "@/components/accounts/account-mark";
import { PaneList } from "@/components/shared/pane-list";
import { groupAccountsByType } from "@/features/accounts/models/account-groups";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { formatShortDisplayDate } from "@/lib/dates/local-date";
import { getTransactionsAccountHref } from "@/lib/navigation/transaction-account-routes";
import { formatAccountTypeLabel } from "@/modules/accounts/account-types";

type TransactionAccountSelectorProps = {
    accounts: AccountWithBalance[];
    ledgerId: string;
    summaries: {
        allAccounts: TransactionAccountSelectorSummary;
        byAccountId: Record<string, TransactionAccountSelectorSummary>;
    };
};

type TransactionAccountSelectorSummary = {
    latestTransactionDate?: string;
    transactionCount: number;
    uncategorizedCount?: number;
    unlockedTransactionCount?: number;
};

function formatInstitutionLinkStatus(account: AccountWithBalance) {
    if (!account.plaidInstitutionName && !account.plaidLinkStatus) {
        return "Manually managed account";
    }

    const institutionName = account.plaidInstitutionName ?? "Plaid";

    if (
        account.plaidLinkStatus === "error" ||
        account.plaidLastSyncStatus === "failed"
    ) {
        return `${institutionName} - Sync failed`;
    }

    if (account.plaidLinkStatus === "disabled") {
        return `${institutionName} - Disabled`;
    }

    if (account.plaidLastSyncedAt) {
        return `${institutionName} - Synced ${formatShortDisplayDate(
            account.plaidLastSyncedAt,
        )}`;
    }

    return `${institutionName} - Linked`;
}

const collapsedAccountGroupsStorageKeyPrefix =
    "budgeted:transactions:account-selector:collapsed-groups:v1";

function getCollapsedAccountGroupsStorageKey(ledgerId: string) {
    return `${collapsedAccountGroupsStorageKeyPrefix}:${ledgerId}`;
}

function parseStoredCollapsedGroupKeys(value: string | null) {
    if (!value) {
        return {};
    }

    try {
        const parsed = JSON.parse(value);

        if (!Array.isArray(parsed)) {
            return {};
        }

        return Object.fromEntries(
            parsed.filter((entry): entry is string => typeof entry === "string")
                .map((groupKey) => [groupKey, true]),
        ) satisfies Record<string, boolean>;
    } catch {
        return {};
    }
}

function pruneCollapsedGroupKeys(
    collapsedKeys: Record<string, boolean>,
    groupKeys: string[],
) {
    const knownGroupKeys = new Set(groupKeys);

    return Object.fromEntries(
        Object.entries(collapsedKeys).filter(
            ([groupKey, isCollapsed]) =>
                isCollapsed === true && knownGroupKeys.has(groupKey),
        ),
    ) satisfies Record<string, boolean>;
}

function readCollapsedAccountGroupsStorageValue(storageKey: string) {
    if (typeof window === "undefined") {
        return "";
    }

    try {
        return window.localStorage.getItem(storageKey) ?? "";
    } catch {
        return "";
    }
}

function subscribeToCollapsedAccountGroupsStorage(
    storageKey: string,
    onStoreChange: () => void,
) {
    if (typeof window === "undefined") {
        return () => {};
    }

    function handleStorage(event: StorageEvent) {
        if (event.key === storageKey) {
            onStoreChange();
        }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
}

function formatTransactionCount(count: number) {
    return count === 1 ? "1 transaction" : `${count} transactions`;
}

function formatUncategorizedCount(count: number) {
    return count === 1 ? "1 uncategorized" : `${count} uncategorized`;
}

function formatLatestTransactionDate(value: string | undefined) {
    if (!value) {
        return "No activity";
    }

    return formatShortDisplayDate(value);
}

function TransactionSummary({
    summary,
}: {
    summary: TransactionAccountSelectorSummary;
}) {
    const uncategorizedCount = summary.uncategorizedCount ?? 0;
    const hasNoUnlockedTransactions = summary.unlockedTransactionCount === 0;

    return (
        <span className="grid gap-0.5 text-xs sm:min-w-36 sm:text-right">
            <span className="inline-flex flex-wrap items-center gap-x-1 font-medium text-[var(--color-ink)] sm:justify-end">
                <span>{formatTransactionCount(summary.transactionCount)}</span>
                {hasNoUnlockedTransactions ? (
                    <FontAwesomeIcon
                        aria-label="No unlocked transactions"
                        icon={faCircleCheck}
                        className="text-[var(--tone-success-ink)]"
                    />
                ) : null}
                {uncategorizedCount > 0 ? (
                    <>
                        <span className="text-[var(--color-muted)]"> / </span>
                        <span className="text-[var(--tone-warning-ink)]">
                            {formatUncategorizedCount(uncategorizedCount)}
                        </span>
                    </>
                ) : null}
            </span>
            <span className="text-[var(--color-muted)]">
                Latest:{" "}
                {formatLatestTransactionDate(summary.latestTransactionDate)}
            </span>
        </span>
    );
}

export function TransactionAccountSelector({
    accounts,
    ledgerId,
    summaries,
}: TransactionAccountSelectorProps) {
    const accountGroups = groupAccountsByType(accounts);
    const [collapsedGroupOverride, setCollapsedGroupOverride] = useState<{
        keys: Record<string, boolean>;
        storageKey: string;
    } | null>(null);
    const accountGroupKeys = useMemo(
        () => accountGroups.map((group) => group.type),
        [accountGroups],
    );
    const collapsedGroupsStorageKey =
        getCollapsedAccountGroupsStorageKey(ledgerId);
    const storedCollapsedGroupsValue = useSyncExternalStore(
        (onStoreChange) =>
            subscribeToCollapsedAccountGroupsStorage(
                collapsedGroupsStorageKey,
                onStoreChange,
            ),
        () => readCollapsedAccountGroupsStorageValue(collapsedGroupsStorageKey),
        () => null,
    );
    const storedCollapsedGroupKeys = useMemo(
        () =>
            storedCollapsedGroupsValue === null
                ? {}
                : pruneCollapsedGroupKeys(
                      parseStoredCollapsedGroupKeys(storedCollapsedGroupsValue),
                      accountGroupKeys,
                  ),
        [accountGroupKeys, storedCollapsedGroupsValue],
    );
    const collapsedGroupKeys = useMemo(
        () =>
            pruneCollapsedGroupKeys(
                collapsedGroupOverride?.storageKey ===
                    collapsedGroupsStorageKey
                    ? collapsedGroupOverride.keys
                    : storedCollapsedGroupKeys,
                accountGroupKeys,
            ),
        [
            accountGroupKeys,
            collapsedGroupOverride,
            collapsedGroupsStorageKey,
            storedCollapsedGroupKeys,
        ],
    );
    const areCollapsedGroupPreferencesResolved =
        storedCollapsedGroupsValue !== null;

    useEffect(() => {
        if (
            !areCollapsedGroupPreferencesResolved ||
            typeof window === "undefined"
        ) {
            return;
        }

        const prunedKeys = pruneCollapsedGroupKeys(
            collapsedGroupKeys,
            accountGroupKeys,
        );

        try {
            window.localStorage.setItem(
                collapsedGroupsStorageKey,
                JSON.stringify(Object.keys(prunedKeys)),
            );
        } catch {
            // Browser storage is a preference cache only; the chooser still works.
        }
    }, [
        accountGroupKeys,
        areCollapsedGroupPreferencesResolved,
        collapsedGroupKeys,
        collapsedGroupsStorageKey,
    ]);

    function toggleGroupVisibility(groupKey: string) {
        const shouldCollapse = !collapsedGroupKeys[groupKey];

        setCollapsedGroupOverride({
            storageKey: collapsedGroupsStorageKey,
            keys: {
                ...Object.fromEntries(
                    Object.entries(collapsedGroupKeys).filter(
                        ([key]) => key !== groupKey,
                    ),
                ),
                ...(shouldCollapse ? { [groupKey]: true } : {}),
            },
        });
    }

    return (
        <PaneList aria-label="Transaction accounts">
            <PaneList.Item
                itemId="all-accounts"
                href={getTransactionsAccountHref(null, accounts)}
                aria-label="All accounts, All account types"
                className="sm:grid-cols-[auto_1fr_auto] sm:items-center"
            >
                <AccountMark className="size-7 text-xl" />
                <span className="grid gap-0.5">
                    <span className="text-sm font-semibold text-[var(--color-ink)]">
                        All accounts
                    </span>
                    <span className="text-xs text-[var(--color-muted)]">
                        Tracking accounts are excluded
                    </span>
                </span>
                <TransactionSummary summary={summaries.allAccounts} />
            </PaneList.Item>
            {areCollapsedGroupPreferencesResolved
                ? accountGroups.map((group) => {
                      const isCollapsed =
                          collapsedGroupKeys[group.type] === true;

                      return (
                          <PaneList.Group
                              key={group.type}
                              collapsed={isCollapsed}
                              label={group.label}
                              onToggle={() =>
                                  toggleGroupVisibility(group.type)
                              }
                              toggleAriaLabel={
                                  isCollapsed
                                      ? `Show accounts in ${group.label}`
                                      : `Hide accounts in ${group.label}`
                              }
                              className={
                                  group.type === "tracking" ? "mt-5" : ""
                              }
                          >
                              {group.accounts.map((account) => (
                                  <PaneList.Item
                                      key={account.accountId}
                                      itemId={account.accountId}
                                      href={getTransactionsAccountHref(
                                          account,
                                          accounts,
                                      )}
                                      aria-label={`${account.name}, ${formatAccountTypeLabel(
                                          account.accountType,
                                      )}`}
                                      className="sm:grid-cols-[auto_1fr_auto] sm:items-center"
                                  >
                                      <AccountMark
                                          account={account}
                                          className="size-7 text-xl"
                                      />
                                      <span className="grid gap-0.5">
                                          <span className="text-sm font-semibold text-[var(--color-ink)]">
                                              {account.name}
                                          </span>
                                          <span className="text-xs text-[var(--color-muted)]">
                                              {formatInstitutionLinkStatus(
                                                  account,
                                              )}
                                          </span>
                                      </span>
                                      <TransactionSummary
                                          summary={
                                              summaries.byAccountId[
                                                  account.accountId
                                              ] ?? {
                                                  transactionCount: 0,
                                              }
                                          }
                                      />
                                  </PaneList.Item>
                              ))}
                          </PaneList.Group>
                      );
                  })
                : null}
        </PaneList>
    );
}
