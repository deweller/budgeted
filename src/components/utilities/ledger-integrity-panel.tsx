"use client";

import { type MouseEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCircleCheck,
    faClipboard,
    faMagnifyingGlassChart,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { MoneyAmount } from "@/components/shared/money-amount";
import { useTransactionReferenceLoader } from "@/components/transactions/use-transaction-reference-loader";
import { formatTransactionDisplayDate } from "@/features/transactions/models/transaction-date";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatUsd } from "@/lib/formatting/money";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type {
    LedgerIntegrityCheckResult,
    LedgerIntegrityFinding,
} from "@/features/ledgers/server/ledger-integrity-service";
import {
    getTransactionFallbackHref,
    navigateToTransactionOnClick,
} from "@/lib/navigation/transaction-navigation";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

function formatDateTime(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function formatStatusLabel(status: LedgerIntegrityCheckResult["status"]) {
    switch (status) {
        case "failed":
            return "Failed";
        case "warning":
            return "Warnings";
        case "passed":
            return "Passed";
    }
}

function getStatusClassName(status: LedgerIntegrityCheckResult["status"]) {
    switch (status) {
        case "failed":
            return "border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] text-[var(--tone-error-ink)]";
        case "warning":
            return "border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] text-[var(--tone-warning-ink)]";
        case "passed":
            return "border-[var(--tone-success-border)] bg-[var(--tone-success-surface)] text-[var(--tone-success-ink)]";
    }
}

function getFindingSeverityClassName(severity: LedgerIntegrityFinding["severity"]) {
    return severity === "error"
        ? "text-[var(--tone-error-ink)]"
        : "text-[var(--tone-warning-ink)]";
}

function formatRecordCounts(result: LedgerIntegrityCheckResult) {
    return Object.entries(result.recordCounts).map(([entityType, count]) => ({
        count,
        entityType,
    }));
}

function formatAccountTypeLabel(accountType: string) {
    switch (accountType) {
        case "cash":
            return "Cash";
        case "checking":
            return "Checking";
        case "savings":
            return "Savings";
        case "creditCard":
            return "Credit card";
        case "transfers":
            return "Transfers";
        case "tracking":
            return "Tracking";
        default:
            return accountType;
    }
}

function ReconciliationMetric({
    label,
    value,
}: {
    label: string;
    value: number | string;
}) {
    return (
        <div className="border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
            <p
                className={`font-[family:var(--font-mono)] text-xs ${typographyClassNames.mutedBody}`}
            >
                {label}
            </p>
            <p className="mt-1 text-lg font-semibold">
                {typeof value === "number" ? (
                    <MoneyAmount cents={value} />
                ) : (
                    value
                )}
            </p>
        </div>
    );
}

function FindingAmount({
    label,
    value,
}: {
    label: string;
    value?: number;
}) {
    if (value === undefined) {
        return null;
    }

    return (
        <span className="inline-flex items-center gap-1">
            <span className={typographyClassNames.mutedBody}>{label}</span>
            <MoneyAmount cents={value} />
        </span>
    );
}

function getFindingTransactionId(finding: LedgerIntegrityFinding) {
    if (finding.entityType === "transaction" && finding.entityId) {
        return finding.entityId;
    }

    return finding.transactionId;
}

function getFindingTransactionHref(finding: LedgerIntegrityFinding) {
    const transactionId = getFindingTransactionId(finding);

    if (!transactionId) {
        return null;
    }

    return getTransactionFallbackHref(transactionId);
}

function formatTransactionSummary(
    transaction: WorkspaceSnapshot["transactions"][number] | undefined,
    finding?: LedgerIntegrityFinding,
) {
    if (finding?.transactionSummary) {
        return finding.transactionSummary;
    }

    if (!transaction) {
        return "View transaction";
    }

    const payee = transaction.payee?.trim() || "Transaction";

    return `${formatTransactionDisplayDate(
        transaction.occurredAt,
    )} - ${payee} - ${formatUsd(transaction.displayAmountCents)}`;
}

function formatFindingMessage(input: {
    finding: LedgerIntegrityFinding;
    transaction: WorkspaceSnapshot["transactions"][number] | undefined;
}) {
    const transactionId = getFindingTransactionId(input.finding);

    if (!transactionId) {
        return input.finding.message;
    }

    const transactionSummary =
        input.finding.transactionSummary ??
        (input.transaction ? formatTransactionSummary(input.transaction) : null);

    if (!transactionSummary) {
        return input.finding.message;
    }

    return input.finding.message.replaceAll(
        transactionId,
        transactionSummary,
    );
}

function FindingRecordCell({
    finding,
    transaction,
    transactionHref,
    onTransactionLinkClick,
}: {
    finding: LedgerIntegrityFinding;
    onTransactionLinkClick: (event: MouseEvent<HTMLAnchorElement>) => void;
    transaction: WorkspaceSnapshot["transactions"][number] | undefined;
    transactionHref: string | null;
}) {
    const isTransactionRecord = finding.entityType === "transaction";

    return (
        <div className="grid gap-1">
            <span>{finding.entityType ?? "ledger"}</span>
            {finding.entityId && !isTransactionRecord ? (
                <span
                    className={`font-[family:var(--font-mono)] text-xs ${typographyClassNames.mutedBody}`}
                >
                    {finding.entityId}
                </span>
            ) : null}
            {transactionHref ? (
                <Link
                    href={transactionHref}
                    onClick={onTransactionLinkClick}
                    className="w-fit cursor-pointer text-xs font-medium text-[var(--color-accent-contrast)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                >
                    {formatTransactionSummary(transaction, finding)}
                </Link>
            ) : null}
        </div>
    );
}

function ReconciliationSummary({
    result,
}: {
    result: LedgerIntegrityCheckResult;
}) {
    const { reconciliation } = result;

    return (
        <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <ReconciliationMetric
                    label="Opening"
                    value={reconciliation.totals.openingBalanceCents}
                />
                <ReconciliationMetric
                    label="Posting delta"
                    value={reconciliation.totals.postingDeltaCents}
                />
                <ReconciliationMetric
                    label="Current net"
                    value={reconciliation.totals.currentBalanceCents}
                />
                <ReconciliationMetric
                    label="Assets"
                    value={reconciliation.totals.assetBalanceCents}
                />
                <ReconciliationMetric
                    label="Liabilities"
                    value={reconciliation.totals.liabilityBalanceCents}
                />
                <ReconciliationMetric
                    label="Period snapshots"
                    value={reconciliation.periods.length.toString()}
                />
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                            <th className="px-4 py-3 font-medium">Account</th>
                            <th className="px-4 py-3 font-medium">Type</th>
                            <th className="px-4 py-3 text-right font-medium">
                                Opening
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Posting delta
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Current
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {reconciliation.accounts.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={5}
                                    className={`px-4 py-8 text-center text-sm ${typographyClassNames.mutedBody}`}
                                >
                                    No account balances.
                                </td>
                            </tr>
                        ) : (
                            reconciliation.accounts.map((account) => (
                                <tr
                                    key={account.accountId}
                                    className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                >
                                    <td className="px-4 py-3 align-top">
                                        <div className="grid gap-1">
                                            <span>{account.accountName}</span>
                                            <span
                                                className={`font-[family:var(--font-mono)] text-xs ${typographyClassNames.mutedBody}`}
                                            >
                                                {account.accountId}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        {formatAccountTypeLabel(
                                            account.accountType,
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right align-top">
                                        <MoneyAmount
                                            cents={account.openingBalanceCents}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-right align-top">
                                        <MoneyAmount
                                            cents={account.postingDeltaCents}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-right align-top font-semibold">
                                        <MoneyAmount
                                            cents={account.currentBalanceCents}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function FindingsTable({
    findings,
    onTransactionLinkClick,
    transactionById,
}: {
    findings: LedgerIntegrityFinding[];
    onTransactionLinkClick: (
        event: MouseEvent<HTMLAnchorElement>,
        transactionId: string,
    ) => void;
    transactionById: Map<string, WorkspaceSnapshot["transactions"][number]>;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                        <th className="px-4 py-3 font-medium">Severity</th>
                        <th className="px-4 py-3 font-medium">Code</th>
                        <th className="px-4 py-3 font-medium">Record</th>
                        <th className="px-4 py-3 font-medium">Details</th>
                        <th className="px-4 py-3 text-right font-medium">
                            Amounts
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {findings.length === 0 ? (
                        <tr>
                            <td
                                colSpan={5}
                                className={`px-4 py-8 text-center text-sm ${typographyClassNames.mutedBody}`}
                            >
                                No integrity findings.
                            </td>
                        </tr>
                    ) : (
                        findings.map((finding, index) => {
                            const transactionId =
                                getFindingTransactionId(finding);
                            const transactionHref =
                                getFindingTransactionHref(finding);
                            const transaction = transactionId
                                ? transactionById.get(transactionId)
                                : undefined;

                            return (
                                <tr
                                    key={`${finding.code}:${finding.entityId ?? "ledger"}:${index}`}
                                    className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                >
                                    <td
                                        className={`px-4 py-3 align-top font-medium ${getFindingSeverityClassName(
                                            finding.severity,
                                        )}`}
                                    >
                                        {finding.severity}
                                    </td>
                                    <td className="px-4 py-3 align-top font-[family:var(--font-mono)] text-xs text-[var(--color-ink)]">
                                        {finding.code}
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <FindingRecordCell
                                            finding={finding}
                                            onTransactionLinkClick={(event) => {
                                                if (transactionId) {
                                                    onTransactionLinkClick(
                                                        event,
                                                        transactionId,
                                                    );
                                                }
                                            }}
                                            transaction={transaction}
                                            transactionHref={transactionHref}
                                        />
                                    </td>
                                    <td className="max-w-2xl px-4 py-3 align-top">
                                        {formatFindingMessage({
                                            finding,
                                            transaction,
                                        })}
                                    </td>
                                    <td className="px-4 py-3 text-right align-top">
                                        <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                                            <FindingAmount
                                                label="Expected"
                                                value={finding.expectedCents}
                                            />
                                            <FindingAmount
                                                label="Actual"
                                                value={finding.actualCents}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}

export function LedgerIntegrityPanel() {
    const { notifyError, notifySuccessToast, notifyWarning } = useFeedbackToasts();
    const { snapshot } = useWorkspaceStore();
    const router = useRouter();
    const { loadTransactionReference } = useTransactionReferenceLoader();
    const [result, setResult] = useState<LedgerIntegrityCheckResult | null>(
        null,
    );
    const [isRunning, setIsRunning] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const recordCounts = useMemo(
        () => (result ? formatRecordCounts(result) : []),
        [result],
    );
    const transactionById = useMemo(
        () =>
            new Map(
                snapshot.transactions.map((transaction) => [
                    transaction.transactionId,
                    transaction,
                ]),
            ),
        [snapshot.transactions],
    );

    async function runCheck() {
        setIsRunning(true);
        setErrorMessage("");

        try {
            const response = await fetch(
                "/api/utilities/ledger-integrity/check",
                {
                    method: "POST",
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Ledger integrity check failed.",
                    ),
                );
            }

            const nextResult =
                (await response.json()) as LedgerIntegrityCheckResult;
            setResult(nextResult);

            if (nextResult.status === "passed") {
                notifySuccessToast("Ledger integrity check passed.");
            } else if (nextResult.status === "warning") {
                notifyWarning({
                    message: `${nextResult.warningCount} warnings found.`,
                    title: "Ledger integrity check finished with warnings.",
                });
            } else {
                notifyError({
                    message: `${nextResult.errorCount} errors and ${nextResult.warningCount} warnings found.`,
                    title: "Ledger integrity check failed.",
                });
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Ledger integrity check failed.";

            setErrorMessage(message);
            notifyError({
                message,
                title: "Ledger integrity check failed.",
            });
        } finally {
            setIsRunning(false);
        }
    }

    async function copyJson() {
        if (!result) {
            return;
        }

        if (!navigator.clipboard) {
            notifyError({
                message: "Clipboard access is not available in this browser.",
                title: "Copy failed.",
            });
            return;
        }

        try {
            await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
            notifySuccessToast("Ledger integrity JSON copied.");
        } catch {
            notifyError({
                message: "The JSON result could not be copied.",
                title: "Copy failed.",
            });
        }
    }

    return (
        <section className={`grid gap-6 p-5 ${surfaceClassNames.panelStrong}`}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                    <p className={typographyClassNames.eyebrow}>
                        Diagnostics
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Ledger integrity
                    </h1>
                    <p className={`mt-3 max-w-3xl text-sm ${typographyClassNames.mutedBody}`}>
                        Run a read-only check of transactions, postings,
                        references, and budget allocation state.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => void runCheck()}
                    disabled={isRunning}
                    className={`${controlClassNames.primaryAction} inline-flex cursor-pointer items-center justify-center gap-2`}
                >
                    <FontAwesomeIcon
                        aria-hidden="true"
                        icon={faMagnifyingGlassChart}
                    />
                    {isRunning ? "Running..." : "Run integrity check"}
                </button>
            </div>

            {errorMessage ? (
                <div className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] p-4 text-sm text-[var(--tone-error-ink)]">
                    {errorMessage}
                </div>
            ) : null}

            {result ? (
                <div className="grid gap-4">
                    <div
                        className={`grid gap-4 border p-4 ${getStatusClassName(
                            result.status,
                        )}`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <FontAwesomeIcon
                                    aria-hidden="true"
                                    icon={
                                        result.status === "passed"
                                            ? faCircleCheck
                                            : faTriangleExclamation
                                    }
                                />
                                <div>
                                    <p className="text-sm font-semibold">
                                        {formatStatusLabel(result.status)}
                                    </p>
                                    <p className="text-xs opacity-85">
                                        Checked {formatDateTime(result.checkedAt)}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void copyJson()}
                                className={`${controlClassNames.secondaryActionSmall} inline-flex cursor-pointer items-center gap-2`}
                            >
                                <FontAwesomeIcon
                                    aria-hidden="true"
                                    icon={faClipboard}
                                />
                                Copy JSON
                            </button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                                <p className="text-xs opacity-80">Errors</p>
                                <p className="text-2xl font-semibold">
                                    {result.errorCount}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs opacity-80">Warnings</p>
                                <p className="text-2xl font-semibold">
                                    {result.warningCount}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs opacity-80">Ledger</p>
                                <p className="text-sm font-semibold">
                                    {result.ledger.name}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <h2 className="text-sm font-semibold">Record counts</h2>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {recordCounts.map((recordCount) => (
                                <div
                                    key={recordCount.entityType}
                                    className="border border-[var(--color-border)] bg-[var(--color-panel)] p-3"
                                >
                                    <p
                                        className={`font-[family:var(--font-mono)] text-xs ${typographyClassNames.mutedBody}`}
                                    >
                                        {recordCount.entityType}
                                    </p>
                                    <p className="text-lg font-semibold">
                                        {recordCount.count}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <h2 className="text-sm font-semibold">
                            Reconciliation
                        </h2>
                        <ReconciliationSummary result={result} />
                    </div>

                    <div className="grid gap-2">
                        <h2 className="text-sm font-semibold">Findings</h2>
                        <FindingsTable
                            findings={result.findings}
                            onTransactionLinkClick={(event, transactionId) => {
                                void navigateToTransactionOnClick({
                                    event,
                                    loadTransactionReference,
                                    router,
                                    snapshot,
                                    transactionId,
                                });
                            }}
                            transactionById={transactionById}
                        />
                    </div>
                </div>
            ) : (
                <div className="border border-[var(--color-border)] bg-[var(--color-panel)] p-6 text-sm text-[var(--color-muted)]">
                    No check has been run for this page session.
                </div>
            )}
        </section>
    );
}
