"use client";

import { useState, type ChangeEvent } from "react";
import {
    faDownload,
    faFileImport,
    faUpload,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

const workbookAccept =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx";

function getDownloadFilename(response: Response) {
    const filename = response.headers
        .get("content-disposition")
        ?.match(/filename="?([^";]+)"?/i)?.[1];

    return filename || "budgeted-budget-plan.xlsx";
}

function downloadWorkbook(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function BudgetPlanWorkbookPanel() {
    const { notifyError, notifySuccessToast } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const { reconcileFullWorkspaceMutation } = useWorkspaceStore();
    const [file, setFile] = useState<File | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    async function exportWorkbook() {
        setIsExporting(true);

        try {
            const response = await fetch("/api/utilities/budget-plan-workbook");

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to export the budget plan.",
                    ),
                );
            }

            downloadWorkbook(await response.blob(), getDownloadFilename(response));
            notifySuccessToast("Budget plan workbook downloaded.");
        } catch (error) {
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to export the budget plan.",
                title: "Budget plan export failed.",
            });
        } finally {
            setIsExporting(false);
        }
    }

    function selectWorkbook(event: ChangeEvent<HTMLInputElement>) {
        setFile(event.target.files?.[0] ?? null);
        event.target.value = "";
    }

    async function importWorkbook() {
        if (!file) {
            return;
        }

        setIsImporting(true);
        const activity = startActivity({
            completedLabel: "Budget plan imported.",
            pendingLabel: "Importing budget plan…",
        });

        try {
            const formData = new FormData();
            formData.set("file", file);
            const response = await fetch("/api/utilities/budget-plan-workbook", {
                body: formData,
                method: "POST",
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to import the budget plan.",
                    ),
                );
            }

            await reconcileFullWorkspaceMutation(response);
            setFile(null);
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to import the budget plan.",
                title: "Budget plan import failed.",
            });
        } finally {
            setIsImporting(false);
        }
    }

    return (
        <div className="mt-4 grid items-start gap-9">
            <section className="grid gap-4">
                <div>
                    <h3 className="text-base font-semibold text-[var(--color-ink)]">
                        Export budget plan
                    </h3>
                    <p className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}>
                        Download editable Excel sheets for budget groups and
                        categories.
                    </p>
                </div>
                <button
                    type="button"
                    className={`${controlClassNames.primaryActionCompact} inline-flex h-11 w-full max-w-2xl cursor-pointer items-center justify-center`}
                    disabled={isExporting}
                    onClick={() => {
                        void exportWorkbook();
                    }}
                >
                    <FontAwesomeIcon aria-hidden="true" className="mr-2" icon={faDownload} />
                    {isExporting ? "Exporting..." : "Export budget plan"}
                </button>
            </section>

            <section className="grid gap-4 border-t border-[var(--color-border)] pt-5">
                <div>
                    <h3 className="text-base font-semibold text-[var(--color-ink)]">
                        Import budget plan
                    </h3>
                    <p className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}>
                        Import a Budgeted budget-plan Excel workbook into this
                        ledger. Existing rows with matching IDs are updated;
                        other existing budget-plan entries remain unchanged.
                    </p>
                </div>
                <label className="flex min-h-20 w-full max-w-2xl cursor-pointer items-center justify-center gap-3 border border-dashed border-[var(--color-border)] bg-[var(--color-panel)] p-4 text-center transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)]">
                    <span className="flex size-10 shrink-0 items-center justify-center bg-[var(--color-accent-soft)] text-[var(--color-accent-contrast)]">
                        <FontAwesomeIcon aria-hidden="true" icon={faUpload} />
                    </span>
                    <span className="text-sm font-medium text-[var(--color-ink)]">
                        Choose a budget-plan Excel workbook.
                    </span>
                    <input
                        accept={workbookAccept}
                        className="sr-only"
                        type="file"
                        onChange={selectWorkbook}
                    />
                </label>
                {file ? (
                    <div className="grid gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3 border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                            <div>
                                <p className="text-sm font-medium text-[var(--color-ink)]">
                                    {file.name}
                                </p>
                                <p
                                    className={`mt-1 text-xs ${typographyClassNames.mutedBody}`}
                                >
                                    Ready to import into this ledger.
                                </p>
                            </div>
                            <button
                                type="button"
                                className={`${controlClassNames.secondaryActionSmall} cursor-pointer`}
                                onClick={() => {
                                    setFile(null);
                                }}
                            >
                                Clear file
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <button
                                type="button"
                                className={`${controlClassNames.primaryActionCompact} cursor-pointer`}
                                disabled={isImporting}
                                onClick={() => {
                                    void importWorkbook();
                                }}
                            >
                                <FontAwesomeIcon
                                    aria-hidden="true"
                                    className="mr-2"
                                    icon={faFileImport}
                                />
                                {isImporting
                                    ? "Importing..."
                                    : "Import budget plan"}
                            </button>
                        </div>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
