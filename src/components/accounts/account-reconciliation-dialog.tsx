"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    faCircleNotch,
    faScaleBalanced,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import { MoneyAmount } from "@/components/shared/money-amount";
import { useEscapeToClose } from "@/components/shared/use-escape-to-close";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import {
    buildAdjustmentAssignmentValue,
    buildFromAccountAssignmentValue,
    buildToAccountAssignmentValue,
    getAdjustmentAssignmentValue,
} from "@/components/transactions/transaction-line-editor-helpers";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import type {
    AccountReconciliationMismatchSuggestion,
    AccountReconciliationPreview,
} from "@/features/accounts/models/account-reconciliation";
import { buildGroupedCategoryComboboxOptions } from "@/features/budget/models/category-combobox-options";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { tryParseUsdToCents } from "@/lib/formatting/money";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";

type AccountReconciliationDialogProps = {
    account: AccountWithBalance;
    onClose: () => void;
    open: boolean;
    requiresManualBalance: boolean;
};

const mismatchReasonCopy: Record<
    AccountReconciliationMismatchSuggestion["reason"],
    { description: string; title: string }
> = {
    cutoffActivity: {
        description: "Including this cutoff-adjacent activity would close the gap.",
        title: "Possible cutoff timing",
    },
    includedActivity: {
        description: "This saved ledger activity equals the gap in the direction needed.",
        title: "Possible extra ledger activity",
    },
    possibleDuplicateGroup: {
        description: "",
        title: "Possible duplicate transactions",
    },
    similarAmount: {
        description: "This recent transaction matches the gap amount, but not its direction.",
        title: "Similar recent amount",
    },
};

function ReconciliationMismatchReport({
    suggestions,
}: {
    suggestions: AccountReconciliationMismatchSuggestion[];
}) {
    if (suggestions.length === 0) {
        return null;
    }

    return (
        <section className="grid gap-3">
            <div>
                <p className="text-sm font-medium text-[var(--color-ink)]">
                    Possible causes
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                    These are suggestions, not confirmed errors.
                </p>
            </div>

            <div className="grid gap-3">
                {suggestions.map((suggestion, suggestionIndex) => {
                        const copy = mismatchReasonCopy[suggestion.reason];
                        const apparentDuplicateCount =
                            suggestion.apparentDuplicateCount ?? 1;
                        const description =
                            suggestion.reason === "possibleDuplicateGroup"
                                ? `These ${suggestion.transactions.length} transactions look alike. Removing ${apparentDuplicateCount} apparent duplicate ${apparentDuplicateCount === 1 ? "copy" : "copies"} would close the gap.`
                                : copy.description;

                        return (
                            <div
                                className="grid gap-2 border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3"
                                key={`${suggestion.reason}-${suggestionIndex}`}
                            >
                                <div>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <p className="text-xs font-semibold text-[var(--tone-warning-ink)]">
                                            {copy.title}
                                        </p>
                                        <span className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                            {suggestion.confidence} confidence
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                                        {description}
                                    </p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[26rem] table-fixed text-left text-xs">
                                        <thead className="text-[var(--color-muted)]">
                                            <tr>
                                                <th className="w-24 pb-1 pr-3 font-medium">Date</th>
                                                <th className="pb-1 pr-3 font-medium">Transaction</th>
                                                <th className="w-16 pb-1 pr-3 font-medium">Source</th>
                                                <th className="w-24 pb-1 text-right font-medium">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {suggestion.transactions.map(
                                                (transaction, transactionIndex) => (
                                                    <tr
                                                        key={`${transaction.occurredAt}-${transaction.payee ?? "transaction"}-${transaction.amountCents}-${transactionIndex}`}
                                                    >
                                                        <td className="py-1 pr-3 text-[var(--color-muted)]">
                                                            {transaction.occurredAt}
                                                        </td>
                                                        <td className="truncate py-1 pr-3 font-medium">
                                                            {transaction.payee || "Untitled transaction"}
                                                        </td>
                                                        <td className="py-1 pr-3 capitalize text-[var(--color-muted)]">
                                                            {transaction.source}
                                                        </td>
                                                        <td className="py-1 text-right font-medium">
                                                            <MoneyAmount cents={transaction.amountCents} />
                                                        </td>
                                                    </tr>
                                                ),
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                })}
            </div>
        </section>
    );
}

export function AccountReconciliationDialog({
    account,
    onClose,
    open,
    requiresManualBalance,
}: AccountReconciliationDialogProps) {
    const { applyWorkspaceMutationResponse, snapshot } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [preview, setPreview] = useState<AccountReconciliationPreview | null>(
        null,
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [manualBalanceInput, setManualBalanceInput] = useState("");
    const [adjustmentAssignmentValue, setAdjustmentAssignmentValue] =
        useState("");
    const categoryInputRef = useRef<HTMLInputElement>(null);
    const manualBalanceInputRef = useRef<HTMLInputElement>(null);
    const categoryOptions = useMemo(
        () =>
            buildGroupedCategoryComboboxOptions({
                categories: snapshot.budgetCategories.filter(
                    (category) =>
                        category.status === "active" &&
                        isUserVisibleBudgetCategory(category),
                ),
                getValue: (category) => category.categoryId,
                groups: snapshot.budgetGroups,
            }),
        [snapshot.budgetCategories, snapshot.budgetGroups],
    );
    const adjustmentAssignmentOptions = useMemo<ComboboxSelectOption[]>(() => {
        if (!preview || preview.differenceCents === 0) {
            return categoryOptions;
        }

        const directionValue =
            preview.differenceCents > 0
                ? buildToAccountAssignmentValue(account.accountId)
                : buildFromAccountAssignmentValue(account.accountId);

        return [
            {
                group: "Adjustment",
                label: `${preview.differenceCents > 0 ? "To" : "From"}: ${account.name}`,
                value: buildAdjustmentAssignmentValue(directionValue),
            },
            ...categoryOptions,
        ];
    }, [account.accountId, account.name, categoryOptions, preview]);

    useEscapeToClose({
        enabled: open && !isSubmitting,
        onClose,
    });

    const loadPreview = useCallback(async (manualBalanceCents?: number) => {
        setIsLoading(true);
        setErrorMessage(null);
        setPreview(null);
        setAdjustmentAssignmentValue("");

        try {
            const searchParams = new URLSearchParams();

            if (manualBalanceCents !== undefined) {
                searchParams.set(
                    "manualBalanceCents",
                    String(manualBalanceCents),
                );
            }

            const response = await fetch(
                `/api/accounts/${account.accountId}/reconciliation/preview${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Reconciliation details could not be loaded.",
                    ),
                );
            }

            const nextPreview =
                (await response.json()) as AccountReconciliationPreview;
            setPreview(nextPreview);

            if (nextPreview.differenceCents !== 0) {
                window.setTimeout(() => categoryInputRef.current?.focus(), 0);
            }
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Reconciliation details could not be loaded.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [account.accountId]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setErrorMessage(null);
            setManualBalanceInput("");

            if (requiresManualBalance) {
                setPreview(null);
                manualBalanceInputRef.current?.focus();
                return;
            }

            void loadPreview();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [loadPreview, open, requiresManualBalance]);

    if (!open) {
        return null;
    }

    const isAdjustmentTypeSelected = Boolean(
        getAdjustmentAssignmentValue(adjustmentAssignmentValue),
    );

    async function submitReconciliation() {
        if (
            !preview ||
            isSubmitting ||
            (preview.differenceCents !== 0 && !adjustmentAssignmentValue)
        ) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);
        const activity = startActivity({
            completedLabel: "Account reconciled.",
            pendingLabel: "Reconciling account…",
        });

        try {
            const response = await fetch(
                `/api/accounts/${account.accountId}/reconciliation/commit`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        mutationId: createWorkspaceMutationId(),
                        ...(preview.manualBalanceCents === undefined
                            ? {}
                            : {
                                    manualBalanceCents:
                                        preview.manualBalanceCents,
                                }),
                        previewRevision: preview.previewRevision,
                        ...(preview.differenceCents !== 0
                            ? {
                                    adjustment: {
                                        confirmedDifferenceCents: preview.differenceCents,
                                        kind: isAdjustmentTypeSelected
                                            ? "adjustment"
                                            : "standard",
                                        ...(isAdjustmentTypeSelected
                                            ? {}
                                            : {
                                                    categoryId:
                                                        adjustmentAssignmentValue,
                                                }),
                                    },
                                }
                            : {}),
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "The account could not be reconciled.",
                    ),
                );
            }

            await applyWorkspaceMutationResponse(response);
            activity.complete();
            onClose();
        } catch (error) {
            activity.fail();
            const message =
                error instanceof Error
                    ? error.message
                    : "The account could not be reconciled.";
            setErrorMessage(message);
            notifyError({
                title: "Reconciliation failed.",
                message,
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function continueManualReconciliation() {
        const manualBalanceCents = tryParseUsdToCents(manualBalanceInput);

        if (manualBalanceCents === null) {
            setErrorMessage("Enter a valid current balance.");
            return;
        }

        void loadPreview(manualBalanceCents);
    }

    return (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
            <div
                aria-labelledby="account-reconciliation-title"
                aria-modal="true"
                className={`max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto p-6 ${surfaceClassNames.panel}`}
                role="dialog"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className={typographyClassNames.eyebrow}>
                            Account reconciliation
                        </p>
                        <h2
                            id="account-reconciliation-title"
                            className="mt-2 flex items-center gap-2 text-2xl font-semibold"
                        >
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={faScaleBalanced}
                                className="h-5 w-5"
                            />
                            {account.name}
                        </h2>
                    </div>
                    <DialogCloseButton
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close reconciliation dialog"
                    />
                </div>

                <div className="mt-6 grid gap-5">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={faCircleNotch}
                                className="h-4 w-4 animate-spin"
                            />
                            Loading saved reconciliation data...
                        </div>
                    ) : null}

                    {errorMessage ? (
                        <div className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] p-3 text-sm text-[var(--tone-error-ink)]">
                            {errorMessage}
                        </div>
                    ) : null}

                    {requiresManualBalance && !preview && !isLoading ? (
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <label
                                    className="text-sm font-medium text-[var(--color-ink)]"
                                    htmlFor="account-reconciliation-current-balance"
                                >
                                    Current balance
                                </label>
                                <input
                                    id="account-reconciliation-current-balance"
                                    ref={manualBalanceInputRef}
                                    aria-describedby="account-reconciliation-current-balance-help"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    step="0.01"
                                    type="number"
                                    value={manualBalanceInput}
                                    onChange={(event) =>
                                        setManualBalanceInput(event.target.value)
                                    }
                                    className={controlClassNames.field}
                                />
                                <p
                                    id="account-reconciliation-current-balance-help"
                                    className="text-xs text-[var(--color-muted)]"
                                >
                                    Enter the current balance from your statement.
                                </p>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={continueManualReconciliation}
                                    className={controlClassNames.primaryAction}
                                >
                                    Continue
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {preview ? (
                        <>
                            <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                <div>
                                    <dt className="text-[var(--color-muted)]">
                                        Reconcile through
                                    </dt>
                                    <dd className="mt-1 font-medium">{preview.cutoffDate}</dd>
                                </div>
                                <div>
                                    <dt className="text-[var(--color-muted)]">Transactions</dt>
                                    <dd className="mt-1 font-medium">
                                        {preview.eligibleTransactionCount}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-[var(--color-muted)]">Ledger balance</dt>
                                    <dd className="mt-1 font-medium">
                                        <MoneyAmount cents={preview.ledgerBalanceCents} />
                                    </dd>
                                </div>
                                {preview.mode === "manual" ? (
                                    <div>
                                        <dt className="text-[var(--color-muted)]">
                                            Current balance
                                        </dt>
                                        <dd className="mt-1 font-medium">
                                            <MoneyAmount
                                                cents={preview.manualBalanceCents ?? 0}
                                            />
                                        </dd>
                                    </div>
                                ) : null}
                                {preview.mode === "plaid" ? (
                                    <div>
                                        <dt className="text-[var(--color-muted)]">
                                            Institution balance
                                        </dt>
                                        <dd className="mt-1 font-medium">
                                            <MoneyAmount
                                                cents={preview.institutionBalanceCents ?? 0}
                                            />
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>

                            {preview.differenceCents !== 0 ? (
                                <div className="grid gap-4 border-y border-[var(--color-border)] py-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="font-medium text-[var(--tone-warning-ink)]">
                                            Adjustment required
                                        </span>
                                        <MoneyAmount cents={preview.differenceCents} />
                                    </div>
                                    <ReconciliationMismatchReport
                                        suggestions={preview.mismatchSuggestions ?? []}
                                    />
                                    <ComboboxSelect
                                        optionVariant="category"
                                        inputRef={categoryInputRef}
                                        label="Adjustment assignment"
                                        noResultsLabel="No assignments found"
                                        onChange={setAdjustmentAssignmentValue}
                                        options={adjustmentAssignmentOptions}
                                        required
                                        value={adjustmentAssignmentValue}
                                    />
                                    <p className="text-xs text-[var(--color-muted)]">
                                        Continuing creates a {isAdjustmentTypeSelected
                                            ? "reconciliation adjustment"
                                            : "categorized reconciliation transaction"} for exactly{" "}
                                        <MoneyAmount cents={preview.differenceCents} />.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-[var(--color-muted)]">
                                    The saved balances match. Continuing locks the eligible
                                    transactions.
                                </p>
                            )}

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className={controlClassNames.secondaryAction}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void submitReconciliation();
                                    }}
                                    disabled={
                                        isSubmitting ||
                                        (preview.differenceCents !== 0 &&
                                            !adjustmentAssignmentValue)
                                    }
                                    className={controlClassNames.primaryAction}
                                >
                                    {isSubmitting
                                        ? "Reconciling..."
                                        : preview.differenceCents !== 0
                                            ? "Create adjustment and reconcile"
                                            : "Reconcile"}
                                </button>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
