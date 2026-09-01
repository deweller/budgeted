"use client";

import { useRef, type KeyboardEvent, type Ref } from "react";

import { MoneyAmount } from "@/components/shared/money-amount";
import {
    MoneyExpressionInput,
    type MoneyExpressionSign,
} from "@/components/shared/money-expression-input";
import type { ResolvedTransactionTemplateLine } from "@/features/transaction-templates/models/formula";
import { controlClassNames } from "@/lib/theme/theme-recipes";

type TransactionTemplatePreviewPaneProps = {
    categoryNameById: ReadonlyMap<string, string>;
    className?: string;
    errorMessage?: string | null;
    emptySignPreference?: MoneyExpressionSign;
    inputRef?: Ref<HTMLInputElement>;
    isApplyDisabled?: boolean;
    onApply: () => void;
    onCancel: () => void;
    onTotalChange: (value: string) => void;
    previewLines: ResolvedTransactionTemplateLine[] | null;
    required?: boolean;
    signPreferenceKey?: string;
    size?: "default" | "compact";
    templateName: string;
    total: string;
};

export function TransactionTemplatePreviewPane({
    categoryNameById,
    className,
    errorMessage,
    emptySignPreference,
    inputRef,
    isApplyDisabled = false,
    onApply,
    onCancel,
    onTotalChange,
    previewLines,
    required = false,
    signPreferenceKey,
    size = "default",
    templateName,
    total,
}: TransactionTemplatePreviewPaneProps) {
    const applyButtonRef = useRef<HTMLButtonElement>(null);
    const fieldClassName =
        size === "compact"
            ? `${controlClassNames.fieldCompact} h-10 px-3 py-2 text-base font-semibold tabular-nums`
            : `${controlClassNames.field} h-14 min-w-0 w-full px-4 py-3 text-xl font-semibold tabular-nums`;
    const paneClassName = [
        "grid gap-3 border-2 border-[var(--tone-info-border)] bg-[var(--tone-info-surface)] p-3 text-[var(--color-ink)] shadow-[0_0_0_1px_var(--color-accent-ring)]",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    function handleTotalKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            applyButtonRef.current?.focus();
            return;
        }

        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (!isApplyDisabled) {
            onApply();
        }
    }

    return (
        <div
            role="region"
            aria-label={`Template preview for ${templateName}`}
            className={paneClassName}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[var(--tone-info-ink)]">
                        Create Transaction from Template
                    </h3>
                    <p className="mt-1 truncate text-sm text-[var(--color-muted)]">
                        {templateName}
                    </p>
                </div>
                <div className="grid min-w-52 gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                    Total
                    <MoneyExpressionInput
                        aria-label="Total"
                        emptySignPreference={emptySignPreference}
                        ref={inputRef}
                        required={required}
                        signPreferenceKey={signPreferenceKey}
                        value={total}
                        onChange={(event) => onTotalChange(event.target.value)}
                        onKeyDown={handleTotalKeyDown}
                        placeholder="-100.00"
                        className={fieldClassName}
                    />
                </div>
            </div>

            <div
                aria-live="polite"
                className="border border-[var(--color-border)] bg-[var(--color-panel)]"
            >
                <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    Preview
                </div>
                {errorMessage ? (
                    <p
                        role="alert"
                        className="px-3 py-3 text-sm text-[var(--tone-error-ink)]"
                    >
                        {errorMessage}
                    </p>
                ) : previewLines?.length ? (
                    <table className="w-full text-sm">
                        <thead className="sr-only">
                            <tr>
                                <th scope="col">Category</th>
                                <th scope="col">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previewLines.map((line) => (
                                <tr
                                    key={line.lineId}
                                    className="border-t border-[var(--color-border)] first:border-t-0"
                                >
                                    <td className="px-3 py-2 text-[var(--color-ink)]">
                                        {categoryNameById.get(line.categoryId) ??
                                            "Unknown category"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                                        <MoneyAmount cents={line.amountCents} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="px-3 py-3 text-sm text-[var(--color-muted)]">
                        Enter a template total to preview the split lines.
                    </p>
                )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className={controlClassNames.secondaryActionSmall}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    ref={applyButtonRef}
                    onClick={onApply}
                    disabled={isApplyDisabled}
                    className={controlClassNames.primaryActionCompact}
                >
                    Apply template
                </button>
            </div>
        </div>
    );
}
