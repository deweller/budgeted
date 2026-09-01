"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCaretDown,
    faCaretRight,
    faRobot,
} from "@fortawesome/free-solid-svg-icons";

import {
    shouldShowTransactionClassificationConfidence,
} from "@/components/transactions/transaction-pending-classification-row";
import { TransactionManagedMetadataReadonly } from "@/components/transactions/transaction-memo-display";
import { useKeyboardShortcuts } from "@/components/shared/use-keyboard-shortcuts";
import type { TransactionClassificationPendingPublic } from "@/features/transaction-classification/models/transaction-classification";
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

type TransactionClassificationPaneProps = {
    categories: CategoryOption[];
    isApplying?: boolean;
    isRejecting?: boolean;
    onApply?: () => void;
    onEdit?: () => void;
    onReject?: () => void;
    pending: TransactionClassificationPendingPublic;
    transaction: TransactionWithPostings;
};

function formatText(value: string | null | undefined) {
    return value?.trim() || "(blank)";
}

export function TransactionClassificationPane({
    categories,
    isApplying = false,
    isRejecting = false,
    onApply,
    onEdit,
    onReject,
    pending,
    transaction,
}: TransactionClassificationPaneProps) {
    const [isRejectedDetailsOpen, setIsRejectedDetailsOpen] = useState(false);
    const categoryNameById = useMemo(
        () => new Map(categories.map((category) => [category.categoryId, category.name])),
        [categories],
    );
    const suggestion = pending.suggestion;
    const categoryLabel =
        suggestion.type === "category"
            ? Array.from(
                  new Set(
                      suggestion.lineAssignments.map(
                          (assignment) =>
                              categoryNameById.get(assignment.categoryId) ??
                              assignment.categoryId,
                      ),
                  ),
              ).join(", ")
            : "No category suggested";
    const isBusy = isApplying || isRejecting;

    useKeyboardShortcuts({
        capture: true,
        enabled: pending.status !== "rejected" && !isBusy,
        shortcuts: [
            ...(onApply
                ? [
                      {
                          ...keyboardShortcuts.transactions.applyAiClassification,
                          handler: onApply,
                      },
                  ]
                : []),
            ...(onReject
                ? [
                      {
                          ...keyboardShortcuts.transactions.rejectAiClassification,
                          handler: onReject,
                      },
                  ]
                : []),
            ...(onEdit
                ? [
                      {
                          ...keyboardShortcuts.transactions.editAiClassification,
                          handler: onEdit,
                      },
                  ]
                : []),
        ],
    });
    const details = (
        <div className="grid gap-2 text-sm">
            <div>
                <span className="font-medium text-[var(--color-ink)]">
                    Suggested category
                </span>
                <p className="text-[var(--color-muted)]">{categoryLabel}</p>
            </div>
            <div>
                <span className="font-medium text-[var(--color-ink)]">Reason</span>
                <p className="text-[var(--color-muted)]">
                    {shouldShowTransactionClassificationConfidence(suggestion)
                        ? `${Math.round(suggestion.confidence * 100)}% confidence - `
                        : ""}
                    {suggestion.reason || "No reason was provided."}
                </p>
            </div>
            {suggestion.suggestedPayee ? (
                <div>
                    <span className="font-medium text-[var(--color-ink)]">Payee</span>
                    <p className="text-[var(--color-muted)]">
                        {formatText(transaction.payee)} -&gt; {suggestion.suggestedPayee}
                    </p>
                </div>
            ) : null}
            {suggestion.suggestedMemo ? (
                <div>
                    <span className="font-medium text-[var(--color-ink)]">Memo</span>
                    <p className="text-[var(--color-muted)]">
                        {formatText(transaction.memo)} -&gt; {suggestion.suggestedMemo}
                    </p>
                </div>
            ) : null}
            <TransactionManagedMetadataReadonly transaction={transaction} />
        </div>
    );

    if (pending.status === "rejected") {
        return (
            <section className="border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3">
                <button
                    type="button"
                    aria-expanded={isRejectedDetailsOpen}
                    onClick={() => setIsRejectedDetailsOpen((current) => !current)}
                    className="flex w-full cursor-pointer items-center gap-2 text-left"
                >
                    <FontAwesomeIcon
                        aria-hidden="true"
                        icon={isRejectedDetailsOpen ? faCaretDown : faCaretRight}
                        className="text-xs text-[var(--color-muted)]"
                    />
                    <FontAwesomeIcon aria-hidden="true" icon={faRobot} />
                    <span className={typographyClassNames.eyebrow}>
                        AI Classification
                    </span>
                    <span className="text-sm text-[var(--color-muted)]">Rejected</span>
                </button>
                {isRejectedDetailsOpen ? (
                    <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                        {details}
                    </div>
                ) : null}
            </section>
        );
    }

    return (
        <section className="grid gap-3 border border-[var(--color-accent-ring)] bg-[var(--color-panel)] p-3">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className={`${typographyClassNames.eyebrow} inline-flex items-center gap-2`}>
                        <FontAwesomeIcon aria-hidden="true" icon={faRobot} />
                        Suggested Classification
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">
                        {categoryLabel}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {onApply ? (
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={onApply}
                            className={controlClassNames.primaryActionCompact}
                        >
                            {isApplying ? (
                                "Applying..."
                            ) : (
                                <>
                                    <span className="font-bold underline">A</span>pply
                                </>
                            )}
                        </button>
                    ) : null}
                    {onReject ? (
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={onReject}
                            className={controlClassNames.secondaryActionCompact}
                        >
                            {isRejecting ? (
                                "Rejecting..."
                            ) : (
                                <>
                                    <span className="font-bold underline">R</span>eject
                                </>
                            )}
                        </button>
                    ) : null}
                    {onEdit ? (
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={onEdit}
                            className={controlClassNames.secondaryActionCompact}
                        >
                            <>
                                <span className="font-bold underline">E</span>dit
                            </>
                        </button>
                    ) : null}
                </div>
            </div>
            {details}
        </section>
    );
}
