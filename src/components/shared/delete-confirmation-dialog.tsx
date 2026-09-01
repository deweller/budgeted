"use client";

import { WorkspaceStatusPanel } from "@/components/dashboard/workspace-status-panel";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

import { useEscapeToClose } from "./use-escape-to-close";

type DeleteConfirmationDialogProps = {
    canConfirm?: boolean;
    confirmLabel?: string;
    errorMessage?: string | null;
    impact?: DeletionImpactSummary | null;
    isLoading?: boolean;
    isSubmitting?: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onRefresh?: () => void;
    open: boolean;
    pendingLabel?: string;
    title?: string;
    warningMessage?: string;
};

function formatDeletionHeading(
    summary: DeletionImpactSummary | null | undefined,
    fallbackTitle?: string,
) {
    if (fallbackTitle) {
        return fallbackTitle;
    }

    if (!summary) {
        return "Review deletion impact";
    }

    return `Delete ${summary.target.displayName}?`;
}

const genericDeleteWarning =
    "This deletion is permanent. All related data will be deleted.";

export function DeleteConfirmationDialog({
    canConfirm,
    confirmLabel = "Delete permanently",
    errorMessage,
    impact,
    isLoading = false,
    isSubmitting = false,
    onClose,
    onConfirm,
    onRefresh,
    open,
    pendingLabel = "Deleting...",
    title,
    warningMessage = genericDeleteWarning,
}: DeleteConfirmationDialogProps) {
    useEscapeToClose({ enabled: open && !isSubmitting, onClose });

    if (!open) {
        return null;
    }

    const hasLoadedImpact = Boolean(impact);
    const canSubmit =
        (canConfirm ?? hasLoadedImpact) && !isLoading && !isSubmitting;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-confirmation-title"
                className={`max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className={typographyClassNames.eyebrow}>
                            Permanent deletion
                        </p>
                        <h2
                            id="delete-confirmation-title"
                            className="mt-2 text-2xl font-semibold tracking-tight"
                        >
                            {formatDeletionHeading(impact, title)}
                        </h2>
                    </div>
                    <DialogCloseButton
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close deletion dialog"
                    />
                </div>

                <div className="mt-6 grid gap-4">
                    {isLoading ? (
                        <p
                            className={`text-sm ${typographyClassNames.mutedBody}`}
                        >
                            Loading the latest deletion impact from saved
                            data...
                        </p>
                    ) : null}

                    {!isLoading ? (
                        <div className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] p-4 text-sm text-[var(--tone-error-ink)]">
                            {warningMessage}
                        </div>
                    ) : null}

                    {errorMessage ? (
                        <WorkspaceStatusPanel
                            compact
                            actionLabel={
                                onRefresh ? "Refresh preview" : undefined
                            }
                            message={errorMessage}
                            onAction={onRefresh}
                            title="Delete preview could not be completed."
                            tone="error"
                        />
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-3">
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
                            onClick={onConfirm}
                            disabled={!canSubmit}
                            className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] px-4 py-3 text-sm font-semibold text-[var(--tone-error-ink)] transition hover:bg-[var(--tone-error-surface-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting ? pendingLabel : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
