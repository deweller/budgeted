"use client";

import { useEffect, useRef, useState } from "react";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import { useEscapeToClose } from "@/components/shared/use-escape-to-close";
import {
    controlClassNames,
    surfaceClassNames,
} from "@/lib/theme/theme-recipes";

type BulkCategorizeTransactionsDialogProps = {
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (categoryId: string) => void;
    open: boolean;
    options: ComboboxSelectOption[];
    transactionCount: number;
};

export function BulkCategorizeTransactionsDialog({
    isSubmitting,
    onClose,
    onSubmit,
    open,
    options,
    transactionCount,
}: BulkCategorizeTransactionsDialogProps) {
    const [categoryId, setCategoryId] = useState("");
    const categoryInputRef = useRef<HTMLInputElement>(null);

    useEscapeToClose({
        enabled: open && !isSubmitting,
        onClose,
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        const focusTimeout = window.setTimeout(() => {
            categoryInputRef.current?.focus();
        }, 0);

        return () => {
            window.clearTimeout(focusTimeout);
        };
    }, [open]);

    if (!open) {
        return null;
    }

    const title = `Categorize ${transactionCount} transaction${
        transactionCount === 1 ? "" : "s"
    }`;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
            <div
                aria-labelledby="bulk-categorize-transactions-title"
                aria-modal="true"
                className={`w-full max-w-lg p-6 ${surfaceClassNames.panel}`}
                role="dialog"
            >
                <div className="flex items-start justify-between gap-4">
                    <h2
                        id="bulk-categorize-transactions-title"
                        className="text-xl font-semibold"
                    >
                        {title}
                    </h2>
                    <DialogCloseButton
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close bulk categorize dialog"
                    />
                </div>

                <form
                    className="mt-5 grid gap-5"
                    onSubmit={(event) => {
                        event.preventDefault();

                        if (categoryId) {
                            onSubmit(categoryId);
                        }
                    }}
                >
                    <ComboboxSelect
                        optionVariant="category"
                        inputRef={categoryInputRef}
                        inputClassName={controlClassNames.fieldCompact}
                        label="Category"
                        noResultsLabel="No categories found"
                        onChange={setCategoryId}
                        options={options}
                        required
                        value={categoryId}
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className={controlClassNames.secondaryActionCompact}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!categoryId || isSubmitting}
                            className={controlClassNames.primaryActionCompact}
                        >
                            {isSubmitting ? "Categorizing..." : "Categorize"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
