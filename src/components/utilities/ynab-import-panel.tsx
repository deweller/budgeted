"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { faCheck, faFileImport, faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import type { YnabImportJobPublic } from "@/features/import/ynab/models/ynab-import-job";
import type { YnabAccountMapping } from "@/features/import/ynab/planner";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import {
    accountTypeValues,
    formatAccountTypeLabel,
} from "@/modules/accounts/account-types";

type SelectedSource = {
    files: Array<{ file: File; kind: "plan" | "register" | "zip" }>;
    suggestedLedgerName: string;
};

function basename(path: string) {
    return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}

function ledgerNameFromPlanFile(name: string) {
    return basename(name).replace(/\s*-\s*Plan\.csv$/iu, "").trim();
}

function selectYnabSource(files: File[]): SelectedSource {
    const zipFiles = files.filter((file) => file.name.toLowerCase().endsWith(".zip"));
    const planFiles = files.filter((file) => /Plan\.csv$/iu.test(basename(file.name)));
    const registerFiles = files.filter((file) =>
        /Register\.csv$/iu.test(basename(file.name)),
    );

    if (files.length === 1 && zipFiles.length === 1) {
        return {
            files: [{ file: zipFiles[0]!, kind: "zip" }],
            suggestedLedgerName:
                zipFiles[0]!.name.replace(/\.zip$/iu, "").trim() || "YNAB Import",
        };
    }

    if (
        files.length === 2 &&
        planFiles.length === 1 &&
        registerFiles.length === 1
    ) {
        return {
            files: [
                { file: planFiles[0]!, kind: "plan" },
                { file: registerFiles[0]!, kind: "register" },
            ],
            suggestedLedgerName:
                ledgerNameFromPlanFile(planFiles[0]!.name) || "YNAB Import",
        };
    }

    throw new Error("Choose one YNAB ZIP or one Plan and one Register CSV.");
}

function statusLabel(status: YnabImportJobPublic["status"]) {
    switch (status) {
        case "uploading":
            return "Uploading files…";
        case "analyzing":
            return "Analyzing YNAB export…";
        case "ready":
            return "Ready to import";
        case "importing":
            return "Importing ledger…";
        case "completed":
            return "Import completed";
        case "failed":
            return "Import failed";
    }
}

function roleLabel(role: YnabAccountMapping["importRole"]) {
    switch (role) {
        case "budget":
            return "Budget";
        case "tracking":
            return "Tracking";
        case "exclude":
            return "Exclude";
    }
}

export function YnabImportPanel() {
    const { notifyError, notifySuccessToast } = useFeedbackToasts();
    const [job, setJob] = useState<YnabImportJobPublic | null>(null);
    const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
    const [ledgerName, setLedgerName] = useState("");
    const [endMonth, setEndMonth] = useState("");
    const [accountMappings, setAccountMappings] = useState<YnabAccountMapping[]>([]);
    const [previewDirty, setPreviewDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [discarding, setDiscarding] = useState(false);
    const completedToastJobIdRef = useRef<string | null>(null);

    const receiveJob = useCallback(
        (nextJob: YnabImportJobPublic | null) => {
            setJob(nextJob);

            if (nextJob?.status === "ready") {
                setLedgerName(nextJob.ledgerName ?? "");
                setEndMonth(nextJob.endMonth ?? "");
                setAccountMappings(nextJob.accountMappings);
                setPreviewDirty(false);
            }

            if (
                nextJob?.status === "completed" &&
                completedToastJobIdRef.current !== nextJob.jobId
            ) {
                completedToastJobIdRef.current = nextJob.jobId;
                notifySuccessToast("YNAB ledger imported.");
            }
        },
        [notifySuccessToast],
    );

    const loadJob = useCallback(async (jobId: string) => {
        const response = await fetch(`/api/utilities/ynab-imports/${jobId}`);

        if (response.status === 404) {
            setJob(null);
            setDiscarding(false);
            return;
        }
        if (!response.ok) {
            throw new Error(
                await parseApiErrorMessage(response, "Unable to refresh the YNAB import."),
            );
        }

        const payload = (await response.json()) as { job: YnabImportJobPublic };
        receiveJob(payload.job);
        if (
            discarding &&
            payload.job.status === "failed" &&
            payload.job.error !== "Discarding YNAB import…"
        ) {
            setDiscarding(false);
        }
    }, [discarding, receiveJob]);

    useEffect(() => {
        let isMounted = true;

        async function loadInitialJob() {
            try {
                const response = await fetch("/api/utilities/ynab-imports");

                if (!response.ok) {
                    throw new Error(
                        await parseApiErrorMessage(
                            response,
                            "Unable to load YNAB imports.",
                        ),
                    );
                }

                const payload = (await response.json()) as {
                    job: YnabImportJobPublic | null;
                };
                if (isMounted) {
                    receiveJob(payload.job);
                }
            } catch (error) {
                if (isMounted) {
                    notifyError({
                        message:
                            error instanceof Error
                                ? error.message
                                : "Unable to load YNAB imports.",
                        title: "YNAB import could not be loaded.",
                    });
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        void loadInitialJob();
        return () => {
            isMounted = false;
        };
    }, [notifyError, receiveJob]);

    useEffect(() => {
        if (!job || (!discarding && job.status !== "analyzing" && job.status !== "importing")) {
            return;
        }

        const interval = window.setInterval(() => {
            void loadJob(job.jobId).catch((error) =>
                notifyError({
                    message: error instanceof Error ? error.message : "Unable to refresh the YNAB import.",
                    title: "YNAB import status could not be refreshed.",
                }),
            );
        }, 1500);

        return () => window.clearInterval(interval);
    }, [discarding, job, loadJob, notifyError]);

    const summaryRows = job?.summary
        ? ([
            ["Months", `${job.summary.firstMonth ?? "n/a"} to ${job.summary.lastMonth ?? "n/a"}`],
            ["Budget groups", job.summary.budgetGroupCount],
            ["Budget categories", job.summary.budgetCategoryCount],
            ["Transactions", job.summary.transactionCount],
            ["Transaction lines", job.summary.transactionLineCount],
        ] as const)
        : [];

    function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";

        try {
            const source = selectYnabSource(files);
            setSelectedSource(source);
            setLedgerName(source.suggestedLedgerName);
            setEndMonth("");
            setJob(null);
            setAccountMappings([]);
            setPreviewDirty(false);
        } catch (error) {
            notifyError({
                message: error instanceof Error ? error.message : "Choose a valid YNAB export.",
                title: "YNAB files could not be selected.",
            });
        }
    }

    async function requestPreview(input: {
        accountMappings?: YnabAccountMapping[];
        jobId: string;
    }) {
        const response = await fetch(
            `/api/utilities/ynab-imports/${input.jobId}/preview`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    accountMappings: input.accountMappings,
                    endMonth: endMonth || undefined,
                    ledgerName,
                }),
            },
        );

        if (!response.ok) {
            throw new Error(
                await parseApiErrorMessage(response, "Unable to preview the YNAB import."),
            );
        }

        const payload = (await response.json()) as { job: YnabImportJobPublic };
        setJob(payload.job);
    }

    async function uploadAndPreview() {
        if (!selectedSource || !ledgerName.trim()) {
            return;
        }

        setBusy(true);
        try {
            const createResponse = await fetch("/api/utilities/ynab-imports", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    files: selectedSource.files.map(({ file, kind }) => ({
                        contentType: file.type || (kind === "zip" ? "application/zip" : "text/csv"),
                        kind,
                        name: file.name,
                        size: file.size,
                    })),
                }),
            });

            if (!createResponse.ok) {
                throw new Error(
                    await parseApiErrorMessage(createResponse, "Unable to start the YNAB import."),
                );
            }

            const created = (await createResponse.json()) as {
                job: YnabImportJobPublic;
                uploads: Array<{ kind: "plan" | "register" | "zip"; url: string }>;
            };
            setJob(created.job);

            await Promise.all(
                created.uploads.map(async (upload) => {
                    const selected = selectedSource.files.find((file) => file.kind === upload.kind)!;
                    const uploadResponse = await fetch(upload.url, {
                        method: "PUT",
                        headers: {
                            "content-type":
                                selected.file.type ||
                                (upload.kind === "zip" ? "application/zip" : "text/csv"),
                        },
                        body: selected.file,
                    });

                    if (!uploadResponse.ok) {
                        throw new Error(`Unable to upload ${selected.file.name}.`);
                    }
                }),
            );

            await requestPreview({ jobId: created.job.jobId });
            setSelectedSource(null);
        } catch (error) {
            notifyError({
                message: error instanceof Error ? error.message : "Unable to start the YNAB import.",
                title: "YNAB import could not be started.",
            });
        } finally {
            setBusy(false);
        }
    }

    async function refreshPreview() {
        if (!job) return;
        setBusy(true);
        try {
            await requestPreview({ accountMappings, jobId: job.jobId });
        } catch (error) {
            notifyError({
                message: error instanceof Error ? error.message : "Unable to update the preview.",
                title: "YNAB preview could not be updated.",
            });
        } finally {
            setBusy(false);
        }
    }

    async function startImport() {
        if (!job) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/utilities/ynab-imports/${job.jobId}/start`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ previewRevision: job.previewRevision }),
            });
            if (!response.ok) {
                throw new Error(await parseApiErrorMessage(response, "Unable to import the YNAB ledger."));
            }
            const payload = (await response.json()) as { job: YnabImportJobPublic };
            setJob(payload.job);
            setDiscarding(payload.job.error === "Discarding YNAB import…");
        } catch (error) {
            notifyError({
                message: error instanceof Error ? error.message : "Unable to import the YNAB ledger.",
                title: "YNAB import could not be started.",
            });
        } finally {
            setBusy(false);
        }
    }

    async function retryImport() {
        if (!job) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/utilities/ynab-imports/${job.jobId}/retry`, { method: "POST" });
            if (!response.ok) throw new Error(await parseApiErrorMessage(response, "Unable to retry the YNAB import."));
            const payload = (await response.json()) as { job: YnabImportJobPublic };
            setJob(payload.job);
            setDiscarding(payload.job.error === "Discarding YNAB import…");
        } catch (error) {
            notifyError({ message: error instanceof Error ? error.message : "Unable to retry the YNAB import.", title: "YNAB import could not be retried." });
        } finally {
            setBusy(false);
        }
    }

    async function discardImport() {
        if (!job) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/utilities/ynab-imports/${job.jobId}`, { method: "DELETE" });
            if (!response.ok) throw new Error(await parseApiErrorMessage(response, "Unable to discard the YNAB import."));
            setDiscarding(true);
            setJob({ ...job, error: "Discarding YNAB import…", status: "failed" });
        } catch (error) {
            notifyError({ message: error instanceof Error ? error.message : "Unable to discard the YNAB import.", title: "YNAB import could not be discarded." });
        } finally {
            setBusy(false);
        }
    }

    function updateMapping(index: number, update: Partial<YnabAccountMapping>) {
        setAccountMappings((current) =>
            current.map((mapping, mappingIndex) =>
                mappingIndex === index ? { ...mapping, ...update, reason: "Reviewed in Budgeted." } : mapping,
            ),
        );
        setPreviewDirty(true);
    }

    if (loading) {
        return <p className={typographyClassNames.mutedBody}>Loading YNAB imports…</p>;
    }

    return (
        <section className="grid gap-5">
            {!job ? (
                <div className="grid gap-4">
                    <div>
                        <h3 className="text-base font-semibold">Import a YNAB budget</h3>
                        <p className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}>
                            Choose a YNAB export ZIP or the extracted Plan and Register CSV files. A new ledger will be created and your current ledger will remain active.
                        </p>
                    </div>
                    <label className="flex min-h-20 w-full max-w-2xl cursor-pointer items-center justify-center gap-3 border border-dashed border-[var(--color-border)] bg-[var(--color-panel)] p-4 text-center hover:border-[var(--color-accent-ink)]">
                        <FontAwesomeIcon aria-hidden="true" icon={faUpload} />
                        <span>Choose a YNAB ZIP or Plan and Register CSV files.</span>
                        <input accept=".zip,.csv,application/zip,text/csv" className="sr-only" multiple onChange={chooseFiles} type="file" />
                    </label>
                    {selectedSource ? (
                        <div className="grid max-w-2xl gap-4 border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                            <p className="text-sm font-medium">{selectedSource.files.map(({ file }) => file.name).join(", ")}</p>
                            <label className="grid gap-1 text-sm">
                                <span>New ledger name</span>
                                <input className={controlClassNames.field} maxLength={120} onChange={(event) => setLedgerName(event.target.value)} value={ledgerName} />
                            </label>
                            <label className="grid gap-1 text-sm">
                                <span>Import through month (optional)</span>
                                <input className={controlClassNames.field} onChange={(event) => setEndMonth(event.target.value)} type="month" value={endMonth} />
                            </label>
                            <div className="flex justify-end gap-2">
                                <button className={controlClassNames.secondaryAction} onClick={() => setSelectedSource(null)} type="button">Clear</button>
                                <button className={controlClassNames.primaryAction} disabled={busy || !ledgerName.trim()} onClick={() => void uploadAndPreview()} type="button">
                                    <FontAwesomeIcon aria-hidden="true" icon={faFileImport} /> {busy ? "Uploading…" : "Upload and preview"}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="grid gap-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                        <div>
                            <p className="font-medium">{job.ledgerName || "YNAB import"}</p>
                            <p className={`mt-1 text-sm ${typographyClassNames.mutedBody}`}>{statusLabel(job.status)}</p>
                        </div>
                        {job.status === "completed" ? <FontAwesomeIcon className="text-[var(--tone-success-ink)]" icon={faCheck} /> : null}
                    </div>

                    {job.status === "analyzing" || job.status === "importing" || discarding ? (
                        <p className={typographyClassNames.mutedBody}>This work continues in the background. You can leave this page and return later.</p>
                    ) : null}

                    {job.status === "uploading" ? (
                        <div className="flex justify-end">
                            <button className={controlClassNames.secondaryAction} disabled={busy} onClick={() => void discardImport()} type="button">Discard incomplete upload</button>
                        </div>
                    ) : null}

                    {job.status === "ready" ? (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 text-sm"><span>New ledger name</span><input className={controlClassNames.field} maxLength={120} onChange={(event) => { setLedgerName(event.target.value); setPreviewDirty(true); }} value={ledgerName} /></label>
                                <label className="grid gap-1 text-sm"><span>Import through month (optional)</span><input className={controlClassNames.field} onChange={(event) => { setEndMonth(event.target.value); setPreviewDirty(true); }} type="month" value={endMonth} /></label>
                            </div>
                            <div className="overflow-x-auto border border-[var(--color-border)]">
                                <table className="min-w-full text-sm">
                                    <thead><tr className="bg-[var(--color-panel-strong)] text-left"><th className="px-3 py-2">YNAB account</th><th className="px-3 py-2">Import as</th><th className="px-3 py-2">Account type</th><th className="px-3 py-2">Reason</th></tr></thead>
                                    <tbody>{accountMappings.map((mapping, index) => <tr className="border-t border-[var(--color-border)]" key={mapping.accountId}><td className="px-3 py-2 font-medium">{mapping.accountName}</td><td className="px-3 py-2"><select aria-label={`Import ${mapping.accountName} as`} className={controlClassNames.fieldCompact} onChange={(event) => updateMapping(index, { importRole: event.target.value as YnabAccountMapping["importRole"] })} value={mapping.importRole}>{(["budget", "tracking", "exclude"] as const).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></td><td className="px-3 py-2"><select aria-label={`${mapping.accountName} account type`} className={controlClassNames.fieldCompact} disabled={mapping.importRole === "exclude"} onChange={(event) => updateMapping(index, { accountType: event.target.value as YnabAccountMapping["accountType"] })} value={mapping.accountType}>{accountTypeValues.map((type) => <option key={type} value={type}>{formatAccountTypeLabel(type)}</option>)}</select></td><td className={`px-3 py-2 ${typographyClassNames.mutedBody}`}>{mapping.reason}</td></tr>)}</tbody>
                                </table>
                            </div>
                            {job.summary ? <div className="grid gap-3"><dl className="grid gap-2 sm:grid-cols-3">{summaryRows.map(([label, value]) => <div className="border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2" key={label}><dt className={typographyClassNames.mutedBody}>{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>{job.summary.warnings.length ? <div className="border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] p-3 text-sm text-[var(--tone-warning-ink)]"><p className="font-medium">Review these warnings</p><ul className="mt-2 list-disc pl-5">{job.summary.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul></div> : null}</div> : null}
                            <div className="flex flex-wrap justify-end gap-2">
                                <button className={controlClassNames.secondaryAction} disabled={busy} onClick={() => void discardImport()} type="button">Discard</button>
                                {previewDirty ? <button className={controlClassNames.primaryAction} disabled={busy || !ledgerName.trim()} onClick={() => void refreshPreview()} type="button">Update preview</button> : <button className={controlClassNames.primaryAction} disabled={busy} onClick={() => void startImport()} type="button"><FontAwesomeIcon aria-hidden="true" icon={faFileImport} /> Import as new ledger</button>}
                            </div>
                        </>
                    ) : null}

                    {job.status === "failed" && !discarding ? <div className="grid gap-3 border border-[var(--tone-danger-border)] bg-[var(--tone-danger-surface)] p-4 text-sm"><p>{job.error || "The YNAB import failed."}</p><div className="flex justify-end gap-2"><button className={controlClassNames.secondaryAction} disabled={busy} onClick={() => void discardImport()} type="button">Discard</button><button className={controlClassNames.primaryAction} disabled={busy} onClick={() => void retryImport()} type="button">Retry</button></div></div> : null}

                    {job.status === "completed" ? <div className="grid gap-3"><p>Imported {job.recordCount ?? 0} records into <strong>{job.ledgerName}</strong>. Your current ledger is still active.</p><div className="flex flex-wrap justify-end gap-3"><button className={controlClassNames.secondaryAction} onClick={() => { setJob(null); setSelectedSource(null); }} type="button">Import another YNAB budget</button><Link className={controlClassNames.primaryAction} href="/ledgers">View ledgers</Link></div></div> : null}
                </div>
            )}
        </section>
    );
}

export const ynabImportPanelTestInternals = { selectYnabSource };
