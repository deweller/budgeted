"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faCaretDown,
    faCaretRight,
    faCheck,
    faCloudArrowDown,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useTransactionReferenceLoader } from "@/components/transactions/use-transaction-reference-loader";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { TransactionReference } from "@/features/transactions/models/transaction-reference";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatUsd } from "@/lib/formatting/money";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { formatTransactionDisplayDate } from "@/features/transactions/models/transaction-date";
import {
    toAmazonPaymentRecord,
    type AmazonPaymentRecord,
} from "@/features/transaction-importers/models/amazon-transaction-importer";
import type {
    WorkspaceAmazonOrderSyncRunRecord,
    WorkspaceSnapshot,
} from "@/lib/workspace/sync-types";

type AmazonScraperManifestView = {
    lastSuccessfulSyncAt?: string | null;
    orderCount?: number;
    state?: string;
    syncId?: string;
    updatedAt?: string;
};

type AmazonPaymentFilterMode = "all" | "needsReview" | "unmatched";

const amazonPaymentFilterOptions: Array<{
    label: string;
    mode: AmazonPaymentFilterMode;
}> = [
    { label: "Needs review", mode: "needsReview" },
    { label: "All transactions", mode: "all" },
    { label: "Unmatched", mode: "unmatched" },
];

function parseCandidateTransactionIds(value: string | undefined) {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);

        return Array.isArray(parsed)
            ? parsed.filter((candidate): candidate is string =>
                  typeof candidate === "string",
              )
            : [];
    } catch {
        return [];
    }
}

function formatDateTime(value: string | null | undefined) {
    if (!value) {
        return "Never";
    }

    return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

async function fetchAmazonScraperManifestView() {
    const response = await fetch("/api/extras/amazon-orders/manifest");

    if (!response.ok) {
        return null;
    }

    return (await response.json()) as AmazonScraperManifestView;
}

function getIntegration(snapshot: WorkspaceSnapshot) {
    return (snapshot.amazonOrderIntegrations ?? []).find(
        (integration) => integration.integrationId === "amazon-orders",
    );
}

function getTransactionLabel(
    transaction: TransactionReference | undefined,
    referencesLoaded: boolean,
) {
    if (!transaction) {
        return referencesLoaded ? "Missing transaction" : "Loading transaction...";
    }

    const payee = transaction.payee?.trim() || "Transaction";

    return `${formatTransactionDisplayDate(transaction.occurredAt)} - ${payee} - ${formatUsd(transaction.displayAmountCents)}`;
}

function getPaymentStatusLabel(payment: AmazonPaymentRecord) {
    if (payment.matchStatus === "autoMatched") {
        return "Auto matched";
    }

    if (payment.matchStatus === "manualMatched") {
        return "Matched";
    }

    if (payment.matchStatus === "conflict") {
        return "Needs review";
    }

    return "Unmatched";
}

function getPaymentStatusClassName(payment: AmazonPaymentRecord) {
    if (
        payment.matchStatus === "autoMatched" ||
        payment.matchStatus === "manualMatched"
    ) {
        return "text-[var(--tone-success-ink)]";
    }

    if (payment.matchStatus === "conflict") {
        return "text-[var(--tone-warning-ink)]";
    }

    return "text-[var(--color-muted)]";
}

function paymentMatchesFilter(
    payment: AmazonPaymentRecord,
    filterMode: AmazonPaymentFilterMode,
) {
    if (filterMode === "all") {
        return true;
    }

    if (filterMode === "unmatched") {
        return payment.matchStatus === "unmatched";
    }

    return payment.matchStatus === "conflict";
}

function getEmptyPaymentsMessage(filterMode: AmazonPaymentFilterMode) {
    if (filterMode === "needsReview") {
        return "No Amazon payments need review.";
    }

    if (filterMode === "unmatched") {
        return "No unmatched Amazon payments.";
    }

    return "No Amazon payments have been imported yet.";
}

function AmazonPaymentFilterToggleGroup({
    filterMode,
    onChange,
}: {
    filterMode: AmazonPaymentFilterMode;
    onChange: (filterMode: AmazonPaymentFilterMode) => void;
}) {
    return (
        <div
            aria-label="Amazon payment filter"
            className="inline-flex flex-wrap border border-[var(--color-border)] bg-[var(--color-panel)]"
            role="group"
        >
            {amazonPaymentFilterOptions.map((option) => {
                const isSelected = filterMode === option.mode;

                return (
                    <button
                        key={option.mode}
                        aria-pressed={isSelected}
                        className={`cursor-pointer border-r border-[var(--color-border)] px-3 py-2 text-sm font-medium transition last:border-r-0 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] ${
                            isSelected
                                ? "bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                                : "text-[var(--color-muted)] hover:bg-[var(--color-panel-elevated)] hover:text-[var(--color-ink)]"
                        }`}
                        type="button"
                        onClick={() => onChange(option.mode)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

function AmazonPaymentMatchControl({
    payment,
    referencesLoaded,
    transactionById,
}: {
    payment: AmazonPaymentRecord;
    referencesLoaded: boolean;
    transactionById: Map<string, TransactionReference>;
}) {
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const { applyWorkspaceMutationResponse } = useWorkspaceStore();
    const candidates = parseCandidateTransactionIds(
        payment.candidateTransactionIdsJson,
    );
    const [selectedTransactionId, setSelectedTransactionId] = useState(
        payment.matchedTransactionId ?? candidates[0] ?? "",
    );
    const [isSaving, setIsSaving] = useState(false);

    if (payment.matchStatus !== "conflict") {
        return (
            <span className={typographyClassNames.mutedBody}>
                {payment.matchedTransactionId
                    ? getTransactionLabel(
                          transactionById.get(payment.matchedTransactionId),
                          referencesLoaded,
                      )
                    : "No local match"}
            </span>
        );
    }

    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <select
                aria-label={`Choose match for Amazon order ${payment.orderNumber}`}
                className={`${controlClassNames.fieldCompact} min-w-64`}
                value={selectedTransactionId}
                onChange={(event) => setSelectedTransactionId(event.target.value)}
            >
                {candidates.map((transactionId) => (
                    <option key={transactionId} value={transactionId}>
                        {getTransactionLabel(
                            transactionById.get(transactionId),
                            referencesLoaded,
                        )}
                    </option>
                ))}
            </select>
            <button
                className={controlClassNames.primaryActionCompact}
                disabled={!selectedTransactionId || isSaving}
                type="button"
                onClick={() => {
                    setIsSaving(true);
                    const activity = startActivity({
                        completedLabel: "Amazon payment matched.",
                        pendingLabel: "Matching Amazon payment…",
                    });
                    void (async () => {
                        try {
                            const response = await fetch(
                                `/api/extras/amazon-orders/payments/${encodeURIComponent(payment.amazonPaymentId)}/match`,
                                {
                                    body: JSON.stringify({
                                        transactionId: selectedTransactionId,
                                    }),
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    method: "PUT",
                                },
                            );

                            if (!response.ok) {
                                throw new Error(
                                    await parseApiErrorMessage(
                                        response,
                                        "Unable to match Amazon payment.",
                                    ),
                                );
                            }

                            await applyWorkspaceMutationResponse(response);
                            activity.complete();
                        } catch (error) {
                            activity.fail();
                            notifyError({
                                title: "Match failed.",
                                message:
                                    error instanceof Error
                                        ? error.message
                                        : "Unable to match Amazon payment.",
                            });
                        } finally {
                            setIsSaving(false);
                        }
                    })();
                }}
            >
                <FontAwesomeIcon aria-hidden="true" icon={faCheck} /> Apply
            </button>
        </div>
    );
}

function AmazonPaymentsTable({
    emptyMessage,
    payments,
}: {
    emptyMessage: string;
    payments: AmazonPaymentRecord[];
}) {
    const { loadTransactionReferences } = useTransactionReferenceLoader();
    const transactionIds = useMemo(
        () =>
            [
                ...new Set(
                    payments.flatMap((payment) => [
                        ...(payment.matchedTransactionId
                            ? [payment.matchedTransactionId]
                            : []),
                        ...parseCandidateTransactionIds(
                            payment.candidateTransactionIdsJson,
                        ),
                    ]),
                ),
            ],
        [payments],
    );
    const transactionIdsKey = transactionIds.join("\n");
    const [referenceState, setReferenceState] = useState<{
        key: string;
        references: Map<string, TransactionReference>;
    } | null>(null);
    const referencesLoaded = referenceState?.key === transactionIdsKey;
    const transactionById = referencesLoaded
        ? referenceState.references
        : new Map<string, TransactionReference>();

    useEffect(() => {
        if (!transactionIdsKey) {
            return;
        }

        let cancelled = false;

        void loadTransactionReferences(transactionIds).then((references) => {
            if (!cancelled) {
                setReferenceState({
                    key: transactionIdsKey,
                    references,
                });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [
        loadTransactionReferences,
        transactionIds,
        transactionIdsKey,
    ]);

    if (payments.length === 0) {
        return (
            <div className="border border-[var(--color-border)] bg-[var(--color-panel)] p-5 text-sm text-[var(--color-muted)]">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                    <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Amount</th>
                        <th className="px-3 py-2 font-medium">Order</th>
                        <th className="px-3 py-2 font-medium">Products</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">
                            Local transaction
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {payments.map((payment) => (
                        <tr key={payment.amazonPaymentId}>
                            <td className="whitespace-nowrap px-3 py-2">
                                {payment.completedDate}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                                {payment.isRefund ? "Refund" : "Charge"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-[family:var(--font-mono)]">
                                {formatUsd(payment.amountCents)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-[family:var(--font-mono)] text-xs">
                                {payment.orderNumber}
                            </td>
                            <td className="max-w-md px-3 py-2">
                                {payment.itemSummary}
                            </td>
                            <td
                                className={`whitespace-nowrap px-3 py-2 font-medium ${getPaymentStatusClassName(payment)}`}
                            >
                                {payment.matchStatus === "conflict" ? (
                                    <FontAwesomeIcon
                                        aria-hidden="true"
                                        className="mr-2"
                                        icon={faTriangleExclamation}
                                    />
                                ) : null}
                                {getPaymentStatusLabel(payment)}
                            </td>
                            <td className="px-3 py-2 text-right">
                                <AmazonPaymentMatchControl
                                    payment={payment}
                                    referencesLoaded={referencesLoaded}
                                    transactionById={transactionById}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function AmazonOrdersPanel() {
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const { applyWorkspaceMutationResponse, snapshot } = useWorkspaceStore();
    const integration = getIntegration(snapshot);
    const creditCardAccounts = snapshot.accounts.filter(
        (account) => account.accountType === "creditCard",
    );
    const [selectedAccountId, setSelectedAccountId] = useState(
        integration?.accountId ?? creditCardAccounts[0]?.accountId ?? "",
    );
    const [isConfigurationOpen, setIsConfigurationOpen] = useState(
        !integration?.accountId,
    );
    const [manifest, setManifest] =
        useState<AmazonScraperManifestView | null>(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [activeSyncRunId, setActiveSyncRunId] = useState(
        integration?.latestSyncRunId ?? "",
    );
    const [paymentFilterMode, setPaymentFilterMode] =
        useState<AmazonPaymentFilterMode>("needsReview");
    const sortedPayments = useMemo(
        () =>
            (snapshot.transactionImportActivities ?? [])
                .filter((activity) => activity.provider === "amazon")
                .map(toAmazonPaymentRecord)
                .sort(
                (left, right) =>
                    right.completedDate.localeCompare(left.completedDate) ||
                    right.amazonPaymentId.localeCompare(left.amazonPaymentId),
        ),
        [snapshot.transactionImportActivities],
    );
    const filteredPayments = useMemo(
        () =>
            sortedPayments.filter((payment) =>
                paymentMatchesFilter(payment, paymentFilterMode),
            ),
        [paymentFilterMode, sortedPayments],
    );
    const latestRun = activeSyncRunId
        ? (snapshot.amazonOrderSyncRuns ?? []).find(
              (run) => run.syncRunId === activeSyncRunId,
          )
        : undefined;
    const isPolling =
        latestRun?.status === "waitingForScraper" ||
        latestRun?.status === "running";

    useEffect(() => {
        void (async () => {
            try {
                setManifest(await fetchAmazonScraperManifestView());
            } catch {
                setManifest(null);
            }
        })();
    }, []);

    useEffect(() => {
        if (!isPolling || !activeSyncRunId) {
            return;
        }

        const timerId = window.setInterval(() => {
            void (async () => {
                try {
                    const [manifestResponse, syncRunResponse] =
                        await Promise.all([
                            fetchAmazonScraperManifestView(),
                            fetch(
                                `/api/extras/amazon-orders/sync-runs/${encodeURIComponent(activeSyncRunId)}`,
                            ),
                        ]);

                    setManifest(manifestResponse);

                    if (syncRunResponse.ok) {
                        await applyWorkspaceMutationResponse(syncRunResponse);
                    }
                } catch {
                    // Keep the run visible; the user can retry with the sync buttons.
                }
            })();
        }, 3_000);

        return () => window.clearInterval(timerId);
    }, [activeSyncRunId, applyWorkspaceMutationResponse, isPolling]);

    async function saveSettings() {
        setIsSavingSettings(true);
        const activity = startActivity({
            completedLabel: "Amazon account saved.",
            pendingLabel: "Saving Amazon account…",
        });

        try {
            const response = await fetch("/api/extras/amazon-orders/settings", {
                body: JSON.stringify({ accountId: selectedAccountId }),
                headers: { "Content-Type": "application/json" },
                method: "PUT",
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to save Amazon settings.",
                    ),
                );
            }

            await applyWorkspaceMutationResponse(response);
            activity.complete();
            setIsConfigurationOpen(false);
        } catch (error) {
            activity.fail();
            notifyError({
                title: "Save failed.",
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to save Amazon settings.",
            });
        } finally {
            setIsSavingSettings(false);
        }
    }

    async function startSync(mode: "latest" | "launch") {
        setIsSyncing(true);
        const activity = startActivity({
            completedLabel:
                mode === "launch"
                    ? "Amazon scraper sync started."
                    : "Amazon orders imported.",
            pendingLabel: "Syncing Amazon orders…",
        });

        try {
            const response = await fetch("/api/extras/amazon-orders/sync", {
                body: JSON.stringify({ mode }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to sync Amazon orders.",
                    ),
                );
            }

            const body = await applyWorkspaceMutationResponse<
                | WorkspaceAmazonOrderSyncRunRecord
                | { syncRun: WorkspaceAmazonOrderSyncRunRecord }
            >(response);
            const syncRun = "syncRun" in body ? body.syncRun : body;

            setActiveSyncRunId(syncRun.syncRunId);
            if (mode === "launch") {
                setManifest(await fetchAmazonScraperManifestView());
            }
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                title: "Sync failed.",
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to sync Amazon orders.",
            });
        } finally {
            setIsSyncing(false);
        }
    }

    return (
        <div className="grid gap-5">
            <div className="flex flex-wrap gap-2">
                <button
                    className={controlClassNames.secondaryActionCompact}
                    disabled={!integration?.accountId || isSyncing}
                    type="button"
                    onClick={() => void startSync("latest")}
                >
                    <FontAwesomeIcon
                        aria-hidden="true"
                        className="mr-2"
                        icon={faCloudArrowDown}
                    />
                    Import latest
                </button>
                <button
                    className={controlClassNames.primaryActionCompact}
                    disabled={!integration?.accountId || isSyncing || isPolling}
                    type="button"
                    onClick={() => void startSync("launch")}
                >
                    <FontAwesomeIcon
                        aria-hidden="true"
                        className="mr-2"
                        icon={faArrowsRotate}
                    />
                    Run scraper sync
                </button>
                {isPolling ? (
                    <span className="self-center text-sm text-[var(--color-muted)]">
                        Waiting for scraper to finish...
                    </span>
                ) : null}
            </div>

            <section className="grid gap-3 border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                <div className="grid gap-2 text-sm text-[var(--color-muted)] md:grid-cols-4">
                    <div>
                        Scraper latest sync:{" "}
                        <span className="text-[var(--color-ink)]">
                            {formatDateTime(
                                manifest?.lastSuccessfulSyncAt ??
                                    integration?.latestScraperSyncedAt,
                            )}
                        </span>
                    </div>
                    <div>
                        Scraper updated:{" "}
                        <span className="text-[var(--color-ink)]">
                            {formatDateTime(
                                manifest?.updatedAt ?? latestRun?.updatedAt,
                            )}
                        </span>
                    </div>
                    <div>
                        Budgeted import:{" "}
                        <span className="text-[var(--color-ink)]">
                            {formatDateTime(integration?.latestBudgetedImportAt)}
                        </span>
                    </div>
                    <div>
                        Scraper status:{" "}
                        <span className="text-[var(--color-ink)]">
                            {manifest?.state ??
                                latestRun?.scraperState ??
                                integration?.latestScraperState ??
                                "Unknown"}
                        </span>
                    </div>
                </div>

                <div className="grid gap-3">
                    <button
                        aria-expanded={isConfigurationOpen}
                        className={`justify-self-start ${controlClassNames.secondaryActionCompact}`}
                        type="button"
                        onClick={() =>
                            setIsConfigurationOpen((current) => !current)
                        }
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            className="mr-2"
                            icon={
                                isConfigurationOpen
                                    ? faCaretDown
                                    : faCaretRight
                            }
                        />
                        Configure Amazon Scraper
                    </button>

                    {isConfigurationOpen ? (
                        <div className="grid gap-2 md:grid-cols-[minmax(16rem,24rem)_auto] md:items-end">
                            <label className="grid gap-1 text-sm">
                                <span className={typographyClassNames.mutedBody}>
                                    Amazon credit card account
                                </span>
                                <select
                                    className={controlClassNames.fieldCompact}
                                    disabled={creditCardAccounts.length === 0}
                                    value={selectedAccountId}
                                    onChange={(event) =>
                                        setSelectedAccountId(event.target.value)
                                    }
                                >
                                    {creditCardAccounts.length === 0 ? (
                                        <option value="">
                                            Add a credit card account first
                                        </option>
                                    ) : null}
                                    {creditCardAccounts.map((account) => (
                                        <option
                                            key={account.accountId}
                                            value={account.accountId}
                                        >
                                            {account.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                className={controlClassNames.primaryActionCompact}
                                disabled={
                                    !selectedAccountId ||
                                    isSavingSettings ||
                                    selectedAccountId === integration?.accountId
                                }
                                type="button"
                                onClick={() => void saveSettings()}
                            >
                                Save account
                            </button>
                        </div>
                    ) : null}
                </div>
            </section>

            <div className="grid gap-3">
                <AmazonPaymentFilterToggleGroup
                    filterMode={paymentFilterMode}
                    onChange={setPaymentFilterMode}
                />
                <AmazonPaymentsTable
                    emptyMessage={getEmptyPaymentsMessage(paymentFilterMode)}
                    payments={filteredPayments}
                />
            </div>
        </div>
    );
}
