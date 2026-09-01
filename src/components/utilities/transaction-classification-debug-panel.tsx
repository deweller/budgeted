"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCopy,
    faMagnifyingGlassChart,
    faRotateRight,
} from "@fortawesome/free-solid-svg-icons";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { TransactionClassificationEmbeddingIndexPanel } from "@/components/utilities/transaction-classification-embedding-index-panel";
import { TransactionMemoDisplay } from "@/components/transactions/transaction-memo-display";
import type { TransactionImportActivityRecord } from "@/features/transaction-importers/models/transaction-importer-contract";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type DebugAccount = {
    accountId: string;
    accountType: string;
    name: string;
};

type DebugTransaction = {
    amountCents: number;
    embedding: {
        dimensions?: number;
        embeddingTextHash?: string;
        modelId?: string;
        recordUpdatedAt?: string;
        sourceText?: string;
        sourceUpdatedAt?: string;
        status: "current" | "missing" | "notEmbeddable" | "stale";
    };
    isClassificationEligible: boolean;
    kind: "adjustment" | "standard";
    memo: string | null;
    importActivities?: TransactionImportActivityRecord[];
    occurredAt: string;
    payee: string | null;
    status: string;
    targetLineCount: number;
    transactionId: string;
    updatedAt: string;
};

type DebugPageResponse = {
    accounts: DebugAccount[];
    selectedAccountId: string | null;
    transactions: DebugTransaction[];
};

type DebugTrialResponse = {
    eligibleCount: number;
    llmInteraction: {
        errorMessage?: string;
        requestText: string;
        responseText: string;
        sent: boolean;
    } | null;
    modelId: string;
    promptVersion: string;
    results: Array<{
        candidateCategories: Array<{ categoryId: string; name: string }>;
        chosenCategories?: Array<{
            categoryId: string;
            lineId: string;
            name: string;
        }>;
        explanations: string[];
        matches?: Array<{
            amountCents: number;
            amountSign: "inflow" | "outflow";
            categories: Array<{
                amountCents: number;
                categoryId: string;
                name: string;
            }>;
            embeddingSimilarity?: number;
            exampleId: string;
            matchingEvidence?: string[];
            memo: string | null;
            occurredAt: string;
            payee: string | null;
            transactionId: string;
        }>;
        matchingPath?: string[];
        outcome: "llm" | "local" | "noSuggestion" | "notEligible";
        rawSuggestion?: unknown;
        suggestion?: {
            confidence: number;
            lineAssignments?: Array<{ categoryId: string; lineId: string }>;
            reason: string;
            type: "category" | "template" | "noSuggestion";
        };
        transactionId: string;
    }>;
};

function formatMoney(cents: number) {
    return new Intl.NumberFormat("en-US", {
        currency: "USD",
        style: "currency",
    }).format(cents / 100);
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString();
}

function formatStatus(value: string) {
    return value
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (letter) => letter.toLocaleUpperCase());
}

function PreviewBlock({
    label,
    text,
}: {
    label: string;
    text: string;
}) {
    const { notifyError, notifySuccessToast } = useFeedbackToasts();

    async function copyText() {
        try {
            await navigator.clipboard.writeText(text);
            notifySuccessToast(`${label} copied.`);
        } catch {
            notifyError({
                message: "Clipboard access was not available.",
                title: "Copy failed.",
            });
        }
    }

    return (
        <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {label}
                </p>
                <button
                    type="button"
                    onClick={() => void copyText()}
                    className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionSmall}`}
                >
                    <FontAwesomeIcon aria-hidden icon={faCopy} />
                    Copy
                </button>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-[var(--color-panel-strong)] p-3 text-xs leading-5 text-[var(--color-ink)]">
                {text}
            </pre>
        </div>
    );
}

function TrialResultPane({ trial }: { trial: DebugTrialResponse }) {
    return (
        <div className="grid gap-4 border border-[var(--color-border)] p-4">
            <div className="grid gap-1">
                <p className={typographyClassNames.eyebrow}>Trial result</p>
                <h2 className="text-xl font-semibold">
                    {trial.modelId} · {trial.eligibleCount} eligible
                </h2>
                <p className="text-xs text-[var(--color-muted)]">
                    Prompt version {trial.promptVersion}
                </p>
            </div>

            {trial.llmInteraction ? (
                <details className="grid gap-3 border border-[var(--color-border)] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                        LLM input and output
                        {trial.llmInteraction.errorMessage
                            ? ` · ${trial.llmInteraction.errorMessage}`
                            : ""}
                    </summary>
                    <div className="mt-3 grid gap-4">
                        <PreviewBlock
                            label="Input"
                            text={trial.llmInteraction.requestText}
                        />
                        <PreviewBlock
                            label="Output"
                            text={trial.llmInteraction.responseText}
                        />
                    </div>
                </details>
            ) : (
                <p className="text-sm text-[var(--color-muted)]">
                    No LLM interaction was needed for this trial.
                </p>
            )}

            <div className="grid gap-3">
                {trial.results.map((result) => {
                    const chosenCategories = result.chosenCategories ?? [];
                    const matchingPath = result.matchingPath ?? [];
                    const matches = result.matches ?? [];

                    return (
                        <details
                            key={result.transactionId}
                            open
                            className="border border-[var(--color-border)] p-3"
                        >
                            <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                                {result.transactionId} ·{" "}
                                {formatStatus(result.outcome)}
                                {result.suggestion
                                    ? ` · ${result.suggestion.type} ${Math.round(
                                          result.suggestion.confidence * 100,
                                      )}%`
                                    : ""}
                                {chosenCategories.length > 0
                                    ? ` · ${chosenCategories.map((category) => category.name).join(", ")}`
                                    : ""}
                            </summary>
                            <div className="mt-3 grid gap-3 text-sm">
                                {chosenCategories.length > 0 ? (
                                    <div className="border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3">
                                        <p className={typographyClassNames.eyebrow}>
                                            Chosen category
                                        </p>
                                        <div className="mt-1 grid gap-1">
                                            {chosenCategories.map((category) => (
                                                <div
                                                    key={`${category.lineId}-${category.categoryId}`}
                                                    className="flex flex-wrap items-baseline justify-between gap-2"
                                                >
                                                    <span className="text-lg font-semibold text-[var(--color-ink)]">
                                                        {category.name}
                                                    </span>
                                                    <span className="font-mono text-xs text-[var(--color-muted)]">
                                                        {category.categoryId} ·{" "}
                                                        {category.lineId}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : result.suggestion ? (
                                    <div className="border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3">
                                        <p className={typographyClassNames.eyebrow}>
                                            Chosen category
                                        </p>
                                        <p className="mt-1 text-sm text-[var(--color-muted)]">
                                            No category was chosen for this
                                            result.
                                        </p>
                                    </div>
                                ) : null}

                                {matchingPath.length > 0 ? (
                                    <div className="grid gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                            Matching path
                                        </p>
                                        <ol className="grid gap-1 text-[var(--color-muted)]">
                                            {matchingPath.map((step, index) => (
                                                <li
                                                    key={`${result.transactionId}-path-${index}`}
                                                    className="flex gap-2"
                                                >
                                                    <span className="font-mono text-[11px] text-[var(--color-ink)]">
                                                        {index + 1}.
                                                    </span>
                                                    <span>{step}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                ) : null}

                                {matches.length > 0 ? (
                                    <div className="overflow-x-auto border border-[var(--color-border)]">
                                        <table className="min-w-full text-xs">
                                            <thead className="bg-[var(--color-panel-strong)] text-left uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                                <tr>
                                                    <th className="px-3 py-2">
                                                        Match
                                                    </th>
                                                    <th className="px-3 py-2">
                                                        Amount
                                                    </th>
                                                    <th className="px-3 py-2">
                                                        Categories
                                                    </th>
                                                    <th className="px-3 py-2">
                                                        Evidence
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {matches.map((match) => (
                                                    <tr
                                                        key={match.exampleId}
                                                        className="border-t border-[var(--color-border)]"
                                                    >
                                                        <td className="min-w-64 px-3 py-2 align-top">
                                                            <div className="grid gap-1">
                                                                <span className="font-medium text-[var(--color-ink)]">
                                                                    {match.payee ||
                                                                        "No payee"}
                                                                </span>
                                                                <span className="text-[var(--color-muted)]">
                                                                    {formatDate(
                                                                        match.occurredAt,
                                                                    )}{" "}
                                                                    ·{" "}
                                                                    {match.memo ||
                                                                        "No memo"}
                                                                </span>
                                                                <span className="font-mono text-[11px] text-[var(--color-muted)]">
                                                                    {
                                                                        match.exampleId
                                                                    }
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 align-top text-[var(--color-ink)]">
                                                            {formatMoney(
                                                                match.amountCents,
                                                            )}
                                                        </td>
                                                        <td className="min-w-48 px-3 py-2 align-top text-[var(--color-muted)]">
                                                            {match.categories
                                                                .map(
                                                                    (category) =>
                                                                        `${category.name} (${category.categoryId})`,
                                                                )
                                                                .join(", ") ||
                                                                "None"}
                                                        </td>
                                                        <td className="min-w-72 px-3 py-2 align-top text-[var(--color-muted)]">
                                                            <div className="grid gap-1">
                                                                {match.embeddingSimilarity !==
                                                                undefined ? (
                                                                    <span>
                                                                        Embedding{" "}
                                                                        {match.embeddingSimilarity.toFixed(
                                                                            3,
                                                                        )}
                                                                    </span>
                                                                ) : null}
                                                                {(
                                                                    match.matchingEvidence ??
                                                                    []
                                                                ).map(
                                                                    (
                                                                        evidence,
                                                                    ) => (
                                                                        <span
                                                                            key={
                                                                                evidence
                                                                            }
                                                                        >
                                                                            {
                                                                                evidence
                                                                            }
                                                                        </span>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : null}

                                <ul className="grid gap-1 text-[var(--color-muted)]">
                                    {result.explanations.map(
                                        (explanation, index) => (
                                            <li
                                                key={`${result.transactionId}-${index}`}
                                            >
                                                {explanation}
                                            </li>
                                        ),
                                    )}
                                </ul>
                                {result.candidateCategories.length > 0 ? (
                                    <div className="text-xs text-[var(--color-muted)]">
                                        Candidate categories:{" "}
                                        {result.candidateCategories
                                            .map(
                                                (category) =>
                                                    `${category.name} (${category.categoryId})`,
                                            )
                                            .join(", ")}
                                    </div>
                                ) : null}
                                {result.suggestion ? (
                                    <pre className="overflow-auto whitespace-pre-wrap break-words bg-[var(--color-panel-strong)] p-3 text-xs leading-5 text-[var(--color-ink)]">
                                        {JSON.stringify(
                                            result.suggestion,
                                            null,
                                            2,
                                        )}
                                    </pre>
                                ) : null}
                                {result.rawSuggestion ? (
                                    <details>
                                        <summary className="cursor-pointer text-xs font-semibold text-[var(--color-muted)]">
                                            Raw model suggestion
                                        </summary>
                                        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words bg-[var(--color-panel-strong)] p-3 text-xs leading-5 text-[var(--color-ink)]">
                                            {JSON.stringify(
                                                result.rawSuggestion,
                                                null,
                                                2,
                                            )}
                                        </pre>
                                    </details>
                                ) : null}
                            </div>
                        </details>
                    );
                })}
            </div>
        </div>
    );
}

export function TransactionClassificationDebugPanel() {
    const { notifyError } = useFeedbackToasts();
    const [accounts, setAccounts] = useState<DebugAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<
        Set<string>
    >(new Set());
    const [transactions, setTransactions] = useState<DebugTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRunningTrial, setIsRunningTrial] = useState(false);
    const [trial, setTrial] = useState<DebugTrialResponse | null>(null);

    const accountOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            accounts.map((account) => ({
                description: account.accountType,
                label: account.name,
                value: account.accountId,
            })),
        [accounts],
    );
    const selectedIds = useMemo(
        () => Array.from(selectedTransactionIds),
        [selectedTransactionIds],
    );

    async function loadDebugPage(
        accountId = selectedAccountId,
        options: { showLoading?: boolean } = { showLoading: true },
    ) {
        if (options.showLoading) {
            setIsLoading(true);
        }

        try {
            const params = new URLSearchParams();

            if (accountId) {
                params.set("accountId", accountId);
            }

            const response = await fetch(
                `/api/utilities/transaction-classification-debug?${params.toString()}`,
            );

            if (!response.ok) {
                throw response;
            }

            const payload = (await response.json()) as DebugPageResponse;

            setAccounts(payload.accounts ?? []);
            setSelectedAccountId(payload.selectedAccountId ?? "");
            setTransactions(payload.transactions ?? []);
            setSelectedTransactionIds(new Set());
        } catch (error) {
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to load classification debug data.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to load classification debug data.",
                title: "Debug data could not be loaded.",
            });
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        let isMounted = true;

        async function loadInitialDebugPage() {
            try {
                const response = await fetch(
                    "/api/utilities/transaction-classification-debug",
                );

                if (!response.ok) {
                    throw response;
                }

                const payload = (await response.json()) as DebugPageResponse;

                if (isMounted) {
                    setAccounts(payload.accounts ?? []);
                    setSelectedAccountId(payload.selectedAccountId ?? "");
                    setTransactions(payload.transactions ?? []);
                    setSelectedTransactionIds(new Set());
                }
            } catch (error) {
                if (isMounted) {
                    notifyError({
                        message:
                            error instanceof Response
                                ? await parseApiErrorMessage(
                                      error,
                                      "Unable to load classification debug data.",
                                  )
                                : error instanceof Error
                                  ? error.message
                                  : "Unable to load classification debug data.",
                        title: "Debug data could not be loaded.",
                    });
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadInitialDebugPage();

        return () => {
            isMounted = false;
        };
    }, [notifyError]);

    function toggleTransaction(transactionId: string, checked: boolean) {
        if (
            checked &&
            !selectedTransactionIds.has(transactionId) &&
            selectedTransactionIds.size >= 25
        ) {
            notifyError({
                message: "Run debug actions in batches of 25 or fewer.",
                title: "Selection limit reached.",
            });

            return;
        }

        setSelectedTransactionIds((current) => {
            const next = new Set(current);

            if (checked) {
                next.add(transactionId);
            } else {
                next.delete(transactionId);
            }

            return next;
        });
    }

    function toggleAll(checked: boolean) {
        setSelectedTransactionIds(
            checked
                ? new Set(
                      transactions
                          .slice(0, 25)
                          .map((transaction) => transaction.transactionId),
                  )
                : new Set(),
        );
    }

    async function runTrial() {
        setIsRunningTrial(true);

        try {
            const response = await fetch(
                "/api/utilities/transaction-classification-debug/classify",
                {
                    body: JSON.stringify({ transactionIds: selectedIds }),
                    headers: { "content-type": "application/json" },
                    method: "POST",
                },
            );

            if (!response.ok) {
                throw response;
            }

            setTrial((await response.json()) as DebugTrialResponse);
        } catch (error) {
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to run trial classification.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to run trial classification.",
                title: "Trial classification failed.",
            });
        } finally {
            setIsRunningTrial(false);
        }
    }

    return (
        <div className="grid gap-5">
            <section className={`grid gap-4 p-5 ${surfaceClassNames.panel}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                        <p className={typographyClassNames.eyebrow}>
                            Transaction classification
                        </p>
                        <h1 className="text-2xl font-semibold">
                            Embedding and matching debug
                        </h1>
                    </div>
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => void loadDebugPage(selectedAccountId)}
                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionCompact}`}
                    >
                        <FontAwesomeIcon aria-hidden icon={faRotateRight} />
                        Refresh
                    </button>
                </div>

                <ComboboxSelect
                    className="sm:max-w-md"
                    disabled={isLoading || accounts.length === 0}
                    label="Account"
                    noResultsLabel="No accounts found"
                    onChange={(accountId) => {
                        setSelectedAccountId(accountId);
                        setTrial(null);
                        void loadDebugPage(accountId);
                    }}
                    options={accountOptions}
                    placeholder="Select account"
                    value={selectedAccountId}
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[var(--color-muted)]">
                        {selectedIds.length.toLocaleString()} selected. Batch
                        actions are capped at 25 transactions.
                    </p>
                    <button
                        type="button"
                        disabled={selectedIds.length === 0 || isRunningTrial}
                        onClick={() => void runTrial()}
                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.primaryActionCompact}`}
                    >
                        <FontAwesomeIcon
                            aria-hidden
                            icon={faMagnifyingGlassChart}
                        />
                        Trial classify
                    </button>
                </div>

                {trial ? <TrialResultPane trial={trial} /> : null}

                {selectedAccountId ? (
                    <div className="overflow-x-auto border border-[var(--color-border)]">
                        <table className="min-w-full text-sm">
                            <thead className="bg-[var(--color-panel-strong)] text-left text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                <tr>
                                    <th className="w-10 px-3 py-2">
                                        <input
                                            type="checkbox"
                                            aria-label="Select visible transactions"
                                            checked={
                                                transactions.length > 0 &&
                                                transactions
                                                    .slice(0, 25)
                                                    .every((transaction) =>
                                                        selectedTransactionIds.has(
                                                            transaction.transactionId,
                                                        ),
                                                    )
                                            }
                                            onChange={(event) =>
                                                toggleAll(event.target.checked)
                                            }
                                            className="size-4 cursor-pointer"
                                        />
                                    </th>
                                    <th className="px-3 py-2">Transaction</th>
                                    <th className="px-3 py-2">Amount</th>
                                    <th className="px-3 py-2">Classifier</th>
                                    <th className="px-3 py-2">Embedding</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((transaction) => (
                                    <tr
                                        key={transaction.transactionId}
                                        className="border-t border-[var(--color-border)]"
                                    >
                                        <td className="px-3 py-2 align-top">
                                            <input
                                                type="checkbox"
                                                checked={selectedTransactionIds.has(
                                                    transaction.transactionId,
                                                )}
                                                onChange={(event) =>
                                                    toggleTransaction(
                                                        transaction.transactionId,
                                                        event.target.checked,
                                                    )
                                                }
                                                className="size-4 cursor-pointer"
                                            />
                                        </td>
                                        <td className="min-w-72 px-3 py-2 align-top">
                                            <div className="grid gap-1">
                                                <span className="font-medium text-[var(--color-ink)]">
                                                    {transaction.payee ||
                                                        "No payee"}
                                                </span>
                                                <span className="grid gap-0.5 text-xs text-[var(--color-muted)]">
                                                    <span>
                                                        {formatDate(
                                                            transaction.occurredAt,
                                                        )}
                                                    </span>
                                                    <TransactionMemoDisplay
                                                        emptyPlaceholder="No memo"
                                                        managedMetadata={transaction}
                                                        memo={
                                                            transaction.memo ??
                                                            undefined
                                                        }
                                                    />
                                                </span>
                                                <span className="font-mono text-[11px] text-[var(--color-muted)]">
                                                    {transaction.transactionId}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            {formatMoney(
                                                transaction.amountCents,
                                            )}
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <div className="grid gap-1 text-xs">
                                                <span
                                                    className={
                                                        transaction.isClassificationEligible
                                                            ? "text-[var(--tone-success-ink)]"
                                                            : "text-[var(--color-muted)]"
                                                    }
                                                >
                                                    {transaction.isClassificationEligible
                                                        ? "Eligible"
                                                        : "Not eligible"}
                                                </span>
                                                <span className="text-[var(--color-muted)]">
                                                    {transaction.targetLineCount.toLocaleString()}{" "}
                                                    target line
                                                    {transaction.targetLineCount ===
                                                    1
                                                        ? ""
                                                        : "s"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="min-w-72 px-3 py-2 align-top">
                                            <div className="grid gap-1 text-xs">
                                                <span className="font-medium text-[var(--color-ink)]">
                                                    {formatStatus(
                                                        transaction.embedding
                                                            .status,
                                                    )}
                                                </span>
                                                {transaction.embedding
                                                    .embeddingTextHash ? (
                                                    <span className="font-mono text-[11px] text-[var(--color-muted)]">
                                                        {
                                                            transaction.embedding
                                                                .embeddingTextHash
                                                        }
                                                    </span>
                                                ) : null}
                                                {transaction.embedding.modelId ? (
                                                    <span className="text-[var(--color-muted)]">
                                                        {
                                                            transaction.embedding
                                                                .modelId
                                                        }
                                                        ,{" "}
                                                        {
                                                            transaction.embedding
                                                                .dimensions
                                                        }
                                                        d
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}

                {transactions.length === 0 ? (
                    <p className="text-sm text-[var(--color-muted)]">
                        {isLoading
                            ? "Loading transactions..."
                            : selectedAccountId
                              ? "No transactions were found for this account."
                              : "Select an account to show transactions."}
                    </p>
                ) : null}
            </section>

            <TransactionClassificationEmbeddingIndexPanel />
        </div>
    );
}
