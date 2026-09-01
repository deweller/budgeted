"use client";

import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faDownload,
    faFileImport,
    faTriangleExclamation,
    faUpload,
} from "@fortawesome/free-solid-svg-icons";

import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { BudgetPlanWorkbookPanel } from "@/components/utilities/budget-plan-workbook-panel";
import { YnabImportPanel } from "@/components/utilities/ynab-import-panel";
import {
    LEDGER_TRANSFER_RECORD_FAMILIES,
    countLedgerTransferRecords,
    ledgerExportFileSchema,
    type LedgerExportFile,
    type LedgerImportMode,
} from "@/features/utilities/models/ledger-transfer";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type ImportState = {
    confirmationName: string;
    exportFile: LedgerExportFile | null;
    fileName: string;
    mode: LedgerImportMode;
    targetLedgerName: string;
};

const initialImportState: ImportState = {
    confirmationName: "",
    exportFile: null,
    fileName: "",
    mode: "create",
    targetLedgerName: "",
};

const ledgerTransferActionClassName = `${controlClassNames.primaryActionCompact} inline-flex h-11 w-full max-w-2xl items-center justify-center cursor-pointer`;
const ledgerTransferActionStyle = {
    font: "inherit",
    letterSpacing: "inherit",
} as const;

function startDownload(url: string) {
    const link = document.createElement("a");

    link.href = url;
    link.click();
}

function getLocalTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

async function readLedgerExportFile(file: File) {
    const isGzipFile =
        file.name.toLowerCase().endsWith(".gz") ||
        file.type === "application/gzip";

    if (!isGzipFile) {
        return file.text();
    }

    if (typeof DecompressionStream === "undefined") {
        throw new Error("This browser cannot read gzip-compressed ledger exports.");
    }

    return new Response(
        file.stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
}

function formatDateTime(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function buildRecordCounts(exportFile: LedgerExportFile | null) {
    if (!exportFile) {
        return [];
    }
    const counts = countLedgerTransferRecords(exportFile.records);

    return LEDGER_TRANSFER_RECORD_FAMILIES.map(
        (family) => [family.previewLabel, counts[family.key]] as const,
    );
}

function getModeDescription(mode: LedgerImportMode) {
    switch (mode) {
        case "create":
            return "Create a separate ledger and switch to it after import.";
        case "replace":
            return "Delete the current ledger records and replace them with the file.";
        case "merge":
            return "Add new ids and replace matching ids in the current ledger.";
    }
}

function getAvailableImportModes() {
    return ["create", "replace", "merge"] as const;
}

export function LedgerTransferPanel() {
    const { notifyError, notifySuccessToast } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const { snapshot, reconcileFullWorkspaceMutation } = useWorkspaceStore();
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isDraggingImportFile, setIsDraggingImportFile] = useState(false);
    const [activeTab, setActiveTab] = useState<"entireLedger" | "budgetPlan" | "ynab">(
        "entireLedger",
    );
    const [importState, setImportState] =
        useState<ImportState>(initialImportState);
    const recordCounts = useMemo(
        () => buildRecordCounts(importState.exportFile),
        [importState.exportFile],
    );
    const hasPlaidReferences = Boolean(
        importState.exportFile &&
            (importState.exportFile.records.plaidAccountLinks.length > 0 ||
                importState.exportFile.records.plaidTransactionSyncs.length > 0),
    );
    const availableImportModes = getAvailableImportModes();
    const activeLedgerName = snapshot.activeLedgerName || "Ledger";
    const canImport =
        Boolean(importState.exportFile) &&
        !isImporting &&
        (importState.mode !== "create" ||
            importState.targetLedgerName.trim().length > 0) &&
        (importState.mode !== "replace" ||
            importState.confirmationName.trim() === activeLedgerName);

    async function exportLedger() {
        setIsExporting(true);

        try {
            const searchParams = new URLSearchParams({
                timeZone: getLocalTimeZone(),
            });
            const response = await fetch(
                `/api/utilities/ledger-export?${searchParams}`,
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to export ledger.",
                    ),
                );
            }

            const payload = (await response.json()) as { downloadUrl?: unknown };

            if (typeof payload.downloadUrl !== "string") {
                throw new Error("The ledger export download link was invalid.");
            }

            startDownload(payload.downloadUrl);
            notifySuccessToast("Ledger export downloaded.");
        } catch (error) {
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to export ledger.",
                title: "Ledger export failed.",
            });
        } finally {
            setIsExporting(false);
        }
    }

    async function selectImportFile(file: File) {
        try {
            const parsedJson = JSON.parse(await readLedgerExportFile(file)) as unknown;
            const result = ledgerExportFileSchema.safeParse(parsedJson);

            if (!result.success) {
                throw new Error("Choose a valid Budgeted ledger export file.");
            }

            setImportState({
                confirmationName: "",
                exportFile: result.data as LedgerExportFile,
                fileName: file.name,
                mode: "create",
                targetLedgerName: `${result.data.sourceLedger.name} copy`,
            });
        } catch (error) {
            setImportState(initialImportState);
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Choose a valid Budgeted ledger export file.",
                title: "Ledger import file could not be read.",
            });
        }
    }

    async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        event.target.value = "";
        if (file) {
            await selectImportFile(file);
        }
    }

    function handleImportFileDragLeave(event: DragEvent<HTMLLabelElement>) {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDraggingImportFile(false);
        }
    }

    function handleImportFileDrop(event: DragEvent<HTMLLabelElement>) {
        event.preventDefault();
        setIsDraggingImportFile(false);

        const file = event.dataTransfer.files.item(0);
        if (file) {
            void selectImportFile(file);
        }
    }

    async function importLedger() {
        if (!importState.exportFile) {
            return;
        }

        setIsImporting(true);
        const activity = startActivity({
            completedLabel: "Ledger imported.",
            pendingLabel: "Importing ledger…",
        });

        try {
            const body =
                importState.mode === "create"
                    ? {
                          exportFile: importState.exportFile,
                          importScope: "full",
                          mode: importState.mode,
                          targetLedgerName: importState.targetLedgerName,
                      }
                    : importState.mode === "replace"
                      ? {
                            confirmationName: importState.confirmationName,
                            exportFile: importState.exportFile,
                            importScope: "full",
                            mode: importState.mode,
                            targetLedgerName:
                                importState.targetLedgerName.trim() ||
                                undefined,
                        }
                      : {
                            exportFile: importState.exportFile,
                            importScope: "full",
                            mode: importState.mode,
                        };
            const response = await fetch("/api/utilities/ledger-import", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to import ledger.",
                    ),
                );
            }

            await reconcileFullWorkspaceMutation(response);
            setImportState(initialImportState);
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to import ledger.",
                title: "Ledger import failed.",
            });
        } finally {
            setIsImporting(false);
        }
    }

    return (
        <section className="grid gap-5">
            <h2 className="text-xl font-semibold tracking-tight">
                Import and Export
            </h2>

            <div
                aria-label="Import and Export sections"
                className="flex w-fit border border-[var(--color-border)]"
                role="tablist"
            >
                <button
                    aria-selected={activeTab === "entireLedger"}
                    className={`cursor-pointer px-4 py-2 text-sm font-medium transition ${
                        activeTab === "entireLedger"
                            ? "bg-[var(--color-accent-ink)] text-white"
                            : "bg-[var(--color-panel-strong)] text-[var(--color-ink)] hover:bg-[var(--color-panel-elevated)]"
                    }`}
                    onClick={() => setActiveTab("entireLedger")}
                    role="tab"
                    type="button"
                >
                    Entire Ledger
                </button>
                <button
                    aria-selected={activeTab === "budgetPlan"}
                    className={`cursor-pointer border-l border-[var(--color-border)] px-4 py-2 text-sm font-medium transition ${
                        activeTab === "budgetPlan"
                            ? "bg-[var(--color-accent-ink)] text-white"
                            : "bg-[var(--color-panel-strong)] text-[var(--color-ink)] hover:bg-[var(--color-panel-elevated)]"
                    }`}
                    onClick={() => setActiveTab("budgetPlan")}
                    role="tab"
                    type="button"
                >
                    Budget Plan
                </button>
                <button
                    aria-selected={activeTab === "ynab"}
                    className={`cursor-pointer border-l border-[var(--color-border)] px-4 py-2 text-sm font-medium transition ${
                        activeTab === "ynab"
                            ? "bg-[var(--color-accent-ink)] text-white"
                            : "bg-[var(--color-panel-strong)] text-[var(--color-ink)] hover:bg-[var(--color-panel-elevated)]"
                    }`}
                    onClick={() => setActiveTab("ynab")}
                    role="tab"
                    type="button"
                >
                    YNAB
                </button>
            </div>

            {activeTab === "budgetPlan" ? <BudgetPlanWorkbookPanel /> : null}
            {activeTab === "ynab" ? <YnabImportPanel /> : null}

            {activeTab === "entireLedger" ? (
            <div className="mt-4 grid items-start gap-9">
                <section className="grid gap-4">
                    <div>
                        <h3 className="text-base font-semibold text-[var(--color-ink)]">
                            Export ledger
                        </h3>
                        <p
                            className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}
                        >
                            Download a gzip-compressed snapshot of this ledger.
                        </p>
                    </div>
                    <div>
                        <button
                            type="button"
                            className={ledgerTransferActionClassName}
                            style={ledgerTransferActionStyle}
                            disabled={isExporting}
                            onClick={() => {
                                void exportLedger();
                            }}
                        >
                            <FontAwesomeIcon icon={faDownload} className="mr-2" />
                            {isExporting ? "Exporting..." : "Export ledger"}
                        </button>
                    </div>
                </section>

                <section className="grid gap-4 border-t border-[var(--color-border)] pt-5">
                    <div>
                        <h3 className="text-base font-semibold text-[var(--color-ink)]">
                            Import ledger
                        </h3>
                        <p
                            className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}
                        >
                            Import a Budgeted ledger JSON or gzip export.
                        </p>
                    </div>
                    <div>
                        <label
                            className={`flex min-h-20 w-full max-w-2xl cursor-pointer items-center justify-center gap-3 border border-dashed p-4 text-center transition ${
                                isDraggingImportFile
                                    ? "border-[var(--color-accent-ink)] bg-[var(--color-accent-soft)]"
                                    : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)]"
                            }`}
                            onDragEnter={() => {
                                setIsDraggingImportFile(true);
                            }}
                            onDragLeave={handleImportFileDragLeave}
                            onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "copy";
                            }}
                            onDrop={handleImportFileDrop}
                        >
                            <span className="flex size-10 shrink-0 items-center justify-center bg-[var(--color-accent-soft)] text-[var(--color-accent-contrast)]">
                                <FontAwesomeIcon icon={faUpload} />
                            </span>
                            <span className="text-sm font-medium text-[var(--color-ink)]">
                                Drop a JSON or gzip ledger export here, or click to
                                choose a file.
                            </span>
                            <input
                                type="file"
                                accept="application/json,application/gzip,.json,.gz"
                                className="sr-only"
                                onChange={(event) => {
                                    void handleFileChange(event);
                                }}
                            />
                        </label>
                    </div>

                {importState.exportFile ? (
                    <div className="grid gap-4">
                        <div className="grid gap-3 border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-[var(--color-ink)]">
                                        {importState.exportFile.sourceLedger.name}
                                    </p>
                                    <p
                                        className={`mt-1 text-xs ${typographyClassNames.mutedBody}`}
                                    >
                                        {importState.fileName} - exported{" "}
                                        {formatDateTime(
                                            importState.exportFile.exportedAt,
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className={`${controlClassNames.secondaryActionSmall} cursor-pointer`}
                                    onClick={() => {
                                        setImportState(initialImportState);
                                    }}
                                >
                                    Clear file
                                </button>
                            </div>
                            <dl className="grid gap-2 text-sm sm:grid-cols-3">
                                {recordCounts.map(([label, count]) => (
                                    <div
                                        key={label}
                                        className="flex items-center justify-between gap-3 border border-[var(--color-border)] bg-[var(--color-panel-strong)] px-3 py-2"
                                    >
                                        <dt className={typographyClassNames.mutedBody}>
                                            {label}
                                        </dt>
                                        <dd className="font-[family:var(--font-mono)] text-[var(--color-ink)]">
                                            {count}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>

                        {hasPlaidReferences ? (
                            <div className="flex gap-3 border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] p-3 text-sm text-[var(--tone-warning-ink)]">
                                <FontAwesomeIcon
                                    icon={faTriangleExclamation}
                                    className="mt-0.5"
                                />
                                <p>
                                    Plaid references will be kept for history,
                                    but imported live Plaid links are disabled.
                                    Re-link accounts before syncing.
                                </p>
                            </div>
                        ) : null}

                        <fieldset className="grid gap-3">
                            <legend className={typographyClassNames.eyebrow}>
                                Import mode
                            </legend>
                            <div className="grid gap-2 md:grid-cols-3">
                                {availableImportModes.map(
                                    (mode) => (
                                        <label
                                            key={mode}
                                            className={`cursor-pointer border p-3 text-sm transition ${
                                                importState.mode === mode
                                                    ? "border-[var(--color-accent-ink)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                                                    : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-accent-ink)]"
                                            }`}
                                        >
                                            <span className="flex items-center gap-2 font-medium capitalize">
                                                <input
                                                    type="radio"
                                                    name="ledgerImportMode"
                                                    value={mode}
                                                    checked={
                                                        importState.mode === mode
                                                    }
                                                    onChange={() => {
                                                        setImportState(
                                                            (current) => ({
                                                                ...current,
                                                                mode,
                                                            }),
                                                        );
                                                    }}
                                                />
                                                {mode}
                                            </span>
                                            <span
                                                className={`mt-2 block text-xs leading-5 ${typographyClassNames.mutedBody}`}
                                            >
                                                {getModeDescription(mode)}
                                            </span>
                                        </label>
                                    ),
                                )}
                            </div>
                        </fieldset>

                        {importState.mode === "create" ||
                        importState.mode === "replace" ? (
                            <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                                {importState.mode === "create"
                                    ? "New ledger name"
                                    : "Replacement ledger name"}
                                <input
                                    type="text"
                                    value={importState.targetLedgerName}
                                    onChange={(event) => {
                                        setImportState((current) => ({
                                            ...current,
                                            targetLedgerName:
                                                event.target.value,
                                        }));
                                    }}
                                    className={controlClassNames.fieldCompact}
                                />
                            </label>
                        ) : null}

                        {importState.mode === "replace" ? (
                            <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                                Type {activeLedgerName} to confirm replacement
                                <input
                                    type="text"
                                    value={importState.confirmationName}
                                    onChange={(event) => {
                                        setImportState((current) => ({
                                            ...current,
                                            confirmationName:
                                                event.target.value,
                                        }));
                                    }}
                                    className={controlClassNames.fieldCompact}
                                />
                            </label>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <button
                                type="button"
                                className={`${controlClassNames.primaryActionCompact} cursor-pointer`}
                                disabled={!canImport}
                                onClick={() => {
                                    void importLedger();
                                }}
                            >
                                <FontAwesomeIcon
                                    icon={faFileImport}
                                    className="mr-2"
                                />
                                {isImporting ? "Importing..." : "Import ledger"}
                            </button>
                        </div>
                    </div>
                ) : null}
                </section>
            </div>
            ) : null}
        </section>
    );
}
