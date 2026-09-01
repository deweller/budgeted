"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";

import { TransactionManagedMetadataReadonly } from "@/components/transactions/transaction-memo-display";
import { useKeyboardShortcuts } from "@/components/shared/use-keyboard-shortcuts";

import type {
    TransactionClassificationPendingPublic,
    TransactionClassificationSuggestion,
} from "@/features/transaction-classification/models/transaction-classification";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { keyboardShortcuts } from "@/lib/keyboard-shortcuts";

type CategoryOption = {
    categoryId: string;
    name: string;
};

const legacyDeterministicReasons = new Set([
    "Matched recent payee/Plaid history and exact amount locally.",
    "Matched the most common category in recent payee/Plaid history locally.",
]);

export type PendingClassificationFieldSelection = {
    applySuggestedMemo: boolean;
    applySuggestedPayee: boolean;
};

type TransactionPendingClassificationRowProps = {
    categories: CategoryOption[];
    columnCount: number;
    fieldSelection: PendingClassificationFieldSelection;
    isApplying: boolean;
    isRejecting: boolean;
    onApply?: () => void;
    onEdit: () => void;
    onReject: () => void;
    onFieldSelectionChange: (
        fieldSelection: PendingClassificationFieldSelection,
    ) => void;
    pending: TransactionClassificationPendingPublic;
    transaction: TransactionWithPostings;
};

function isBlankTransactionText(value: string | null | undefined) {
    return !value?.trim();
}

function formatTransactionTextValue(value: string | null | undefined) {
    return value?.trim() || "(blank)";
}

export function getDefaultPendingClassificationFieldSelection(input: {
    suggestion: TransactionClassificationSuggestion;
    transaction: TransactionWithPostings;
}): PendingClassificationFieldSelection {
    return {
        applySuggestedMemo: Boolean(
            input.suggestion.suggestedMemo &&
                isBlankTransactionText(input.transaction.memo),
        ),
        applySuggestedPayee: Boolean(
            input.suggestion.suggestedPayee &&
                isBlankTransactionText(input.transaction.payee),
        ),
    };
}

function getTransactionLabel(transaction: TransactionWithPostings) {
    return (
        transaction.payee?.trim() || transaction.memo?.trim() || "transaction"
    );
}

export function shouldShowTransactionClassificationConfidence(
    suggestion: TransactionClassificationSuggestion,
) {
    return !(
        suggestion.matchingMethod === "deterministic" ||
        legacyDeterministicReasons.has(suggestion.reason)
    );
}

export function TransactionPendingClassificationRow({
    categories,
    columnCount,
    fieldSelection,
    isApplying,
    isRejecting,
    onApply,
    onEdit,
    onReject,
    onFieldSelectionChange,
    pending,
    transaction,
}: TransactionPendingClassificationRowProps) {
    const suggestion = pending.suggestion;
    const categoryNameById = useMemo(
        () =>
            new Map(
                categories.map((category) => [
                    category.categoryId,
                    category.name,
                ]),
            ),
        [categories],
    );
    const transactionLabel = getTransactionLabel(transaction);
    const showConfidence =
        shouldShowTransactionClassificationConfidence(suggestion);
    const isBusy = isApplying || isRejecting;

    useKeyboardShortcuts({
        capture: true,
        enabled: suggestion.type !== "noSuggestion" && !isBusy,
        shortcuts: [
            ...(onApply
                ? [
                      {
                          ...keyboardShortcuts.transactions.applyAiClassification,
                          handler: onApply,
                      },
                  ]
                : []),
            {
                ...keyboardShortcuts.transactions.rejectAiClassification,
                handler: onReject,
            },
            {
                ...keyboardShortcuts.transactions.editAiClassification,
                handler: onEdit,
            },
        ],
    });

    function getSuggestionLabel() {
        if (suggestion.type === "category") {
            return Array.from(
                new Set(
                    suggestion.lineAssignments.map(
                        (assignment) =>
                            categoryNameById.get(assignment.categoryId) ??
                            assignment.categoryId,
                    ),
                ),
            ).join(", ");
        }

        return "";
    }

    if (suggestion.type === "noSuggestion") {
        return null;
    }

    return (
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-strong)]/70">
            <td colSpan={columnCount} className="px-4 py-3">
                <div className="grid gap-3 border border-[var(--color-accent-ring)] bg-[var(--color-panel)] p-3">
                    <div className="grid gap-2">
                        <div className="grid gap-1">
                            <p
                                className={`${typographyClassNames.eyebrow} inline-flex items-center gap-2`}
                            >
                                <FontAwesomeIcon aria-hidden icon={faRobot} />
                                Suggested Classification
                            </p>
                            <div className="flex flex-wrap items-center gap-3">
                                <p className="min-w-0 flex-1 text-2xl font-semibold leading-tight text-[var(--color-ink)] sm:text-3xl">
                                    {getSuggestionLabel()}
                                </p>
                                {onApply ? (
                                    <button
                                        type="button"
                                        disabled={isApplying || isRejecting}
                                        onClick={onApply}
                                        className={`inline-flex items-center ${controlClassNames.primaryActionCompact}`}
                                    >
                                        {isApplying ? (
                                            "Applying..."
                                        ) : (
                                            <>
                                                <span className="font-bold underline">
                                                    A
                                                </span>
                                                pply
                                            </>
                                        )}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    disabled={isApplying || isRejecting}
                                    onClick={onReject}
                                    className={`inline-flex items-center ${controlClassNames.secondaryActionCompact}`}
                                >
                                    {isRejecting ? (
                                        "Rejecting..."
                                    ) : (
                                        <>
                                            <span className="font-bold underline">R</span>
                                            eject
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    disabled={isApplying || isRejecting}
                                    onClick={onEdit}
                                    className={`inline-flex items-center ${controlClassNames.secondaryActionCompact}`}
                                >
                                    <>
                                        <span className="font-bold underline">E</span>dit
                                    </>
                                </button>
                            </div>
                            <div className="grid gap-1">
                                <p className="text-xs text-[var(--color-muted)]">
                                    {showConfidence ? (
                                        <>
                                            {Math.round(
                                                suggestion.confidence * 100,
                                            )}
                                            % confidence -{" "}
                                        </>
                                    ) : null}
                                    {suggestion.reason ||
                                        "No reason was provided."}
                                </p>
                            </div>
                        </div>
                    </div>

                    {suggestion.suggestedPayee || suggestion.suggestedMemo ? (
                        <div className="grid gap-2 text-sm sm:grid-cols-2">
                            {suggestion.suggestedPayee ? (
                                <label className="flex items-start gap-2">
                                    <input
                                        aria-label={`Apply suggested payee for ${transactionLabel}`}
                                        checked={
                                            fieldSelection.applySuggestedPayee
                                        }
                                        disabled={isApplying || isRejecting}
                                        onChange={(event) =>
                                            onFieldSelectionChange({
                                                ...fieldSelection,
                                                applySuggestedPayee:
                                                    event.target.checked,
                                            })
                                        }
                                        type="checkbox"
                                        className="mt-0.5 size-4 cursor-pointer"
                                    />
                                    <span className="grid gap-1">
                                        <span className="font-medium text-[var(--color-ink)]">
                                            Payee
                                        </span>
                                        <span className="text-xs text-[var(--color-muted)]">
                                            {formatTransactionTextValue(
                                                transaction.payee,
                                            )}{" "}
                                            -&gt; {suggestion.suggestedPayee}
                                        </span>
                                    </span>
                                </label>
                            ) : null}
                            {suggestion.suggestedMemo ? (
                                <label className="flex items-start gap-2">
                                    <input
                                        aria-label={`Apply suggested memo for ${transactionLabel}`}
                                        checked={
                                            fieldSelection.applySuggestedMemo
                                        }
                                        disabled={isApplying || isRejecting}
                                        onChange={(event) =>
                                            onFieldSelectionChange({
                                                ...fieldSelection,
                                                applySuggestedMemo:
                                                    event.target.checked,
                                            })
                                        }
                                        type="checkbox"
                                        className="mt-0.5 size-4 cursor-pointer"
                                    />
                                    <span className="grid gap-1">
                                        <span className="font-medium text-[var(--color-ink)]">
                                            Memo
                                        </span>
                                        <span className="text-xs text-[var(--color-muted)]">
                                            {formatTransactionTextValue(
                                                transaction.memo,
                                            )}{" "}
                                            -&gt; {suggestion.suggestedMemo}
                                        </span>
                                    </span>
                                </label>
                            ) : null}
                            <TransactionManagedMetadataReadonly
                                transaction={transaction}
                            />
                        </div>
                    ) : null}
                </div>
            </td>
        </tr>
    );
}
