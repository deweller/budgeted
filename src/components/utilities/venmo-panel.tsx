"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faCheck, faTrashCan, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import {
    createVenmoExternalAccountKey,
    normalizeVenmoInstitution,
} from "@/features/venmo/models/venmo-activity";
import {
    toVenmoActivityRecord,
    type VenmoActivityRecord,
} from "@/features/transaction-importers/models/venmo-transaction-importer";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatUsd } from "@/lib/formatting/money";
import { controlClassNames, typographyClassNames } from "@/lib/theme/theme-recipes";
import { formatAccountTypeLabel } from "@/modules/accounts/account-types";

type Filter = "all" | "needsReview" | "unmatched";

function statusLabel(activity: VenmoActivityRecord) {
    if (activity.matchStatus === "needsAccount") return "Needs account";
    if (activity.matchStatus === "conflict") return "Multiple Plaid matches";
    if (activity.matchStatus === "error") return "Needs review";
    if (activity.matchStatus === "unmatched") return "Awaiting Plaid transaction";
    if (activity.matchStatus === "autoMatched") return "Plaid transaction matched";
    if (activity.matchStatus === "manualMatched") return "Plaid transaction matched";
    return "Posted";
}

function externalAccount(activity: VenmoActivityRecord) {
    const institution = activity.destinationInstitution ?? activity.fundingInstitution;
    const last4 = activity.destinationLast4 ?? activity.fundingLast4;
    return institution && last4 ? { institution, last4 } : undefined;
}

function candidates(activity: VenmoActivityRecord) {
    try {
        const parsed = JSON.parse(activity.candidateTransactionIdsJson ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
        return [];
    }
}

export function VenmoPanel() {
    const { snapshot, applyWorkspaceMutationResponse } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const integration = (snapshot.venmoIntegrations ?? []).find((item) => item.integrationId === "venmo-email");
    const eligibleVenmoAccounts = snapshot.accounts.filter((account) => ["cash", "checking", "savings"].includes(account.accountType) && !account.plaidAccountLinkId);
    const mappingAccounts = useMemo(
        () =>
            snapshot.accounts.filter((account) =>
                ["cash", "checking", "savings", "creditCard"].includes(
                    account.accountType,
                ),
            ),
        [snapshot.accounts],
    );
    const mappingAccountOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            [...mappingAccounts]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((account) => ({
                    description: formatAccountTypeLabel(account.accountType),
                    label: account.name,
                    value: account.accountId,
                })),
        [mappingAccounts],
    );
    const [venmoAccountId, setVenmoAccountId] = useState(integration?.venmoAccountId ?? eligibleVenmoAccounts[0]?.accountId ?? "");
    const [inboxEnabled, setInboxEnabled] = useState(integration?.inboxEnabled ?? false);
    const [filter, setFilter] = useState<Filter>("needsReview");
    const [busy, setBusy] = useState(false);
    const [mappingActivity, setMappingActivity] = useState<VenmoActivityRecord>();
    const [mappingAccountId, setMappingAccountId] = useState(mappingAccounts[0]?.accountId ?? "");
    const [matchSelections, setMatchSelections] = useState<Record<string, string>>({});
    const [deletingActivity, setDeletingActivity] = useState<VenmoActivityRecord>();
    const [deleteImpact, setDeleteImpact] = useState<DeletionImpactSummary | null>(null);
    const [deletePreviewError, setDeletePreviewError] = useState<string | null>(null);
    const [isLoadingDeletePreview, setIsLoadingDeletePreview] = useState(false);
    const [isDeletingActivity, setIsDeletingActivity] = useState(false);
    const activities = useMemo(
        () =>
            (snapshot.transactionImportActivities ?? [])
                .filter((activity) => activity.provider === "venmo")
                .map(toVenmoActivityRecord)
                .filter(
                    (activity) =>
                        filter === "all" ||
                        (filter === "unmatched"
                            ? activity.matchStatus === "unmatched"
                            : ["needsAccount", "conflict", "error"].includes(
                                  activity.matchStatus,
                              )),
                )
                .sort((a, b) => b.occurredDate.localeCompare(a.occurredDate)),
        [snapshot.transactionImportActivities, filter],
    );

    function resolveActivityAccount(activity: VenmoActivityRecord) {
        const external = externalAccount(activity);
        if (!external) {
            const account = snapshot.accounts.find(
                (candidate) => candidate.accountId === integration?.venmoAccountId,
            );
            return account
                ? { account, resolution: "Venmo balance" }
                : undefined;
        }

        const externalAccountKey = createVenmoExternalAccountKey(external);
        const savedMapping = (snapshot.venmoAccountMappings ?? []).find(
            (mapping) => mapping.externalAccountKey === externalAccountKey,
        );
        if (savedMapping) {
            const account = snapshot.accounts.find(
                (candidate) => candidate.accountId === savedMapping.accountId,
            );
            if (account) return { account, resolution: "Saved mapping" };
        }

        const normalizedInstitution = normalizeVenmoInstitution(
            external.institution,
        );
        const inferredAccounts = snapshot.accounts.filter(
            (account) =>
                account.plaidAccountMask === external.last4 &&
                normalizeVenmoInstitution(account.plaidInstitutionName ?? "") ===
                    normalizedInstitution,
        );
        if (inferredAccounts.length === 1) {
            return {
                account: inferredAccounts[0]!,
                resolution: "Matched from Plaid account details",
            };
        }

        const linkedTransaction = snapshot.transactions.find(
            (transaction) =>
                transaction.transactionId === activity.linkedTransactionId,
        );
        const linkedAccount = linkedTransaction
            ? snapshot.accounts.find(
                  (account) =>
                      account.accountId === linkedTransaction.referenceAccountId,
              )
            : undefined;

        return linkedAccount
            ? { account: linkedAccount, resolution: "Transaction account" }
            : undefined;
    }

    function canDeleteActivity(activity: VenmoActivityRecord) {
        if (!activity.linkedTransactionId) return true;
        if (
            activity.matchStatus === "autoMatched" ||
            activity.matchStatus === "manualMatched"
        ) {
            return false;
        }

        return snapshot.transactions.some(
            (transaction) =>
                transaction.transactionId === activity.linkedTransactionId &&
                transaction.source === "venmo",
        );
    }

    async function mutate(url: string, method: "DELETE" | "POST" | "PUT", body?: unknown) {
        setBusy(true);
        try {
            const response = await fetch(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
            if (!response.ok) throw new Error(await parseApiErrorMessage(response, "Unable to update Venmo."));
            await applyWorkspaceMutationResponse(response);
            return true;
        } catch (error) {
            notifyError({ title: "Venmo update failed.", message: error instanceof Error ? error.message : "Unable to update Venmo." });
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function loadDeletePreview(activity: VenmoActivityRecord) {
        setDeletingActivity(activity);
        setDeleteImpact(null);
        setDeletePreviewError(null);

        if (!activity.linkedTransactionId) return;

        setIsLoadingDeletePreview(true);
        try {
            const response = await fetch(
                `/api/transactions/${encodeURIComponent(activity.linkedTransactionId)}`,
            );
            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to load the transaction deletion preview.",
                    ),
                );
            }
            setDeleteImpact((await response.json()) as DeletionImpactSummary);
        } catch (error) {
            setDeletePreviewError(
                error instanceof Error
                    ? error.message
                    : "Unable to load the transaction deletion preview.",
            );
        } finally {
            setIsLoadingDeletePreview(false);
        }
    }

    async function deleteSelectedActivity() {
        if (!deletingActivity) return;

        setIsDeletingActivity(true);
        try {
            if (deletingActivity.linkedTransactionId) {
                if (!deleteImpact) return;
                const transactionResponse = await fetch(
                    `/api/transactions/${encodeURIComponent(deletingActivity.linkedTransactionId)}`,
                    {
                        body: JSON.stringify({
                            previewRevision: deleteImpact.previewRevision,
                        }),
                        headers: { "Content-Type": "application/json" },
                        method: "DELETE",
                    },
                );
                if (!transactionResponse.ok) {
                    throw new Error(
                        await parseApiErrorMessage(
                            transactionResponse,
                            "Unable to delete the linked Venmo transaction.",
                        ),
                    );
                }
                await applyWorkspaceMutationResponse(transactionResponse);
            }

            const activityResponse = await fetch(
                `/api/utilities/venmo/activities/${encodeURIComponent(deletingActivity.activityId)}`,
                { method: "DELETE" },
            );
            if (!activityResponse.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        activityResponse,
                        "Unable to remove the Venmo importer activity.",
                    ),
                );
            }
            await applyWorkspaceMutationResponse(activityResponse);
            setDeletingActivity(undefined);
            setDeleteImpact(null);
        } catch (error) {
            notifyError({
                title: "Venmo activity could not be deleted.",
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to delete the Venmo activity.",
            });
        } finally {
            setIsDeletingActivity(false);
        }
    }

    return (
        <div className="grid gap-6">
            <section className="grid gap-4 border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                <div>
                    <h2 className="text-lg font-semibold">Inbox and balance account</h2>
                    <p className={typographyClassNames.mutedBody}>{integration ? <>Forward Venmo mail to <strong className="text-[var(--color-ink)]">{integration.inboundRecipient}</strong>.</> : <>The forwarding recipient is configured per deployment.</>} The inbox can be enabled after choosing the non-Plaid account that represents your Venmo balance.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(14rem,24rem)_auto_auto] sm:items-end">
                    <label className="grid gap-1 text-sm">Venmo balance account<select className={controlClassNames.field} value={venmoAccountId} onChange={(event) => setVenmoAccountId(event.target.value)}>{eligibleVenmoAccounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name}</option>)}</select></label>
                    <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={inboxEnabled} onChange={(event) => setInboxEnabled(event.target.checked)} /> Inbox enabled</label>
                    <button className={controlClassNames.primaryAction} disabled={busy || !venmoAccountId} type="button" onClick={() => void mutate("/api/utilities/venmo/settings", "PUT", { inboxEnabled, venmoAccountId })}>Save settings</button>
                </div>
                <p className={typographyClassNames.mutedBody}>Last processing: {integration?.latestProcessingStatus ?? "never"}{integration?.lastError ? ` — ${integration.lastError}` : ""}</p>
            </section>

            <section className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex border border-[var(--color-border)]" role="group" aria-label="Venmo activity filter">{([['needsReview','Needs review'],['unmatched','Awaiting Plaid'],['all','All']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`cursor-pointer border-r border-[var(--color-border)] px-3 py-2 text-sm last:border-r-0 ${filter === value ? "bg-[var(--color-accent-soft)]" : "text-[var(--color-muted)]"}`}>{label}</button>)}</div>
                    <button className={controlClassNames.secondaryActionCompact} disabled={busy} type="button" onClick={() => void mutate("/api/utilities/venmo/reprocess", "POST")}><FontAwesomeIcon aria-hidden="true" icon={faArrowsRotate} /> Retry matching</button>
                </div>
                <div className="overflow-x-auto border border-[var(--color-border)]">
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-[var(--color-panel-strong)] text-left text-[var(--color-muted)]"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Counterparty / memo</th><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
                        <tbody>{activities.map((activity) => {
                            const ext = externalAccount(activity);
                            const accountResolution = resolveActivityAccount(activity);
                            const activityCandidates = candidates(activity);
                            const selected = matchSelections[activity.activityId] ?? activityCandidates[0] ?? "";
                            return <tr key={activity.activityId} className="border-t border-[var(--color-border)] align-top"><td className="px-3 py-2 whitespace-nowrap">{activity.occurredDate}</td><td className="px-3 py-2">{activity.kind === "paymentReceived" ? "Receive" : activity.kind === "paymentSent" ? "Payment" : "Transfer"}</td><td className="px-3 py-2"><div>{activity.counterpartyName ?? "Venmo"}</div>{activity.memo ? <div className={typographyClassNames.mutedBody}>{activity.memo}</div> : null}</td><td className="px-3 py-2"><div>{ext ? `${ext.institution} ····${ext.last4}` : "Venmo balance"}</div>{accountResolution ? <div className={typographyClassNames.mutedBody}>{accountResolution.account.name} · {accountResolution.resolution}</div> : null}</td><td className="px-3 py-2 text-right font-medium">{formatUsd(activity.kind === "paymentSent" || activity.kind === "standardTransfer" ? -activity.amountCents : activity.amountCents)}</td><td className="px-3 py-2">{["needsAccount","conflict","error"].includes(activity.matchStatus) ? <FontAwesomeIcon className="mr-1 text-[var(--tone-warning-ink)]" aria-hidden="true" icon={faTriangleExclamation} /> : null}{statusLabel(activity)}</td><td className="px-3 py-2 text-right"><div className="flex justify-end gap-2">{activity.matchStatus === "needsAccount" && ext ? <button className={controlClassNames.secondaryActionCompact} type="button" onClick={() => { setMappingActivity(activity); setMappingAccountId(mappingAccounts[0]?.accountId ?? ""); }}>Map account</button> : activity.matchStatus === "conflict" ? <div className="flex justify-end gap-2"><select className={controlClassNames.fieldCompact} value={selected} onChange={(event) => setMatchSelections((current) => ({...current,[activity.activityId]:event.target.value}))}>{activityCandidates.map((id) => <option key={id} value={id}>{id}</option>)}</select><button className={controlClassNames.primaryActionCompact} disabled={!selected || busy} type="button" onClick={() => void mutate(`/api/utilities/venmo/activities/${encodeURIComponent(activity.activityId)}/match`, "POST", { transactionId: selected })}><FontAwesomeIcon aria-hidden="true" icon={faCheck} /> Match</button></div> : activity.linkedTransactionId ? <Link className="self-center text-[var(--color-accent-contrast)] hover:underline" href={`/transactions/all?transactionId=${encodeURIComponent(activity.linkedTransactionId)}`}>Transaction</Link> : null}{canDeleteActivity(activity) ? <button className={controlClassNames.secondaryActionCompact} disabled={busy || isDeletingActivity} type="button" onClick={() => void loadDeletePreview(activity)}><FontAwesomeIcon aria-hidden="true" icon={faTrashCan} /> Delete</button> : null}</div></td></tr>;
                        })}</tbody>
                    </table>
                    {activities.length === 0 ? <p className={`p-4 ${typographyClassNames.mutedBody}`}>No Venmo activities match this filter.</p> : null}
                </div>
            </section>

            <section className="grid gap-2"><h2 className="text-lg font-semibold">Saved account mappings</h2><p className={typographyClassNames.mutedBody}>Only mappings you explicitly save appear here. Unique institution and last-four matches resolved from Plaid account details are shown on the activity row and do not create a saved mapping.</p>{(snapshot.venmoAccountMappings ?? []).length ? <div className="overflow-x-auto border border-[var(--color-border)]"><table className="min-w-full text-sm"><tbody>{(snapshot.venmoAccountMappings ?? []).map((mapping) => <tr className="border-t border-[var(--color-border)] first:border-t-0" key={mapping.mappingId}><td className="px-3 py-2">{mapping.institution} ····{mapping.last4}</td><td className="px-3 py-2">{snapshot.accounts.find((account) => account.accountId === mapping.accountId)?.name ?? "Missing account"}</td><td className="px-3 py-2 text-right"><button className={controlClassNames.secondaryActionCompact} disabled={busy} type="button" onClick={() => void mutate(`/api/utilities/venmo/account-mappings/${mapping.mappingId}`, "DELETE")}><FontAwesomeIcon aria-hidden="true" icon={faTrashCan} /> Delete</button></td></tr>)}</tbody></table></div> : <p className={typographyClassNames.mutedBody}>No explicit account mappings have been saved.</p>}</section>

            {mappingActivity ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="venmo-mapping-title"><div className="grid w-full max-w-lg gap-4 border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-5"><h2 id="venmo-mapping-title" className="text-lg font-semibold">Map external Venmo account</h2><p className={typographyClassNames.mutedBody}>{externalAccount(mappingActivity)?.institution} ····{externalAccount(mappingActivity)?.last4}</p><ComboboxSelect disabled={busy || mappingAccountOptions.length === 0} label="Budgeted account" noResultsLabel="No eligible accounts found" onChange={setMappingAccountId} options={mappingAccountOptions} placeholder="Choose an account" value={mappingAccountId} /><div className="flex justify-end gap-2"><button className={controlClassNames.secondaryAction} type="button" onClick={() => setMappingActivity(undefined)}>Cancel</button><button className={controlClassNames.primaryAction} disabled={busy || !mappingAccountId} type="button" onClick={() => { const ext = externalAccount(mappingActivity); if (!ext) return; void mutate("/api/utilities/venmo/account-mappings", "PUT", { accountId: mappingAccountId, externalAccountKey: createVenmoExternalAccountKey(ext) }).then((saved) => { if (saved) setMappingActivity(undefined); }); }}>Save mapping</button></div></div></div> : null}

            <DeleteConfirmationDialog
                canConfirm={Boolean(deletingActivity && (!deletingActivity.linkedTransactionId || deleteImpact))}
                confirmLabel="Delete Venmo activity"
                errorMessage={deletePreviewError}
                impact={deleteImpact}
                isLoading={isLoadingDeletePreview}
                isSubmitting={isDeletingActivity}
                onClose={() => { if (!isDeletingActivity) { setDeletingActivity(undefined); setDeleteImpact(null); setDeletePreviewError(null); } }}
                onConfirm={() => void deleteSelectedActivity()}
                onRefresh={() => deletingActivity ? void loadDeletePreview(deletingActivity) : undefined}
                open={Boolean(deletingActivity)}
                pendingLabel="Deleting..."
                title="Delete Venmo activity?"
                warningMessage={deletingActivity?.linkedTransactionId ? "This permanently deletes the linked Venmo-created transaction and removes the importer activity. Account balances and reports will update." : "This permanently removes the importer activity. A future delivery of the same Venmo notification may create it again."}
            />
        </div>
    );
}
