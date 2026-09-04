"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faBuildingColumns,
    faCaretDown,
    faCaretRight,
    faLink,
    faRotate,
    faUnlink,
} from "@fortawesome/free-solid-svg-icons";
import {
    usePlaidLink,
    type PlaidAccount,
    type PlaidInstitution,
    type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";

import { WorkspaceStatusPanel } from "@/components/dashboard/workspace-status-panel";
import { ComboboxSelect } from "@/components/shared/combobox-select";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { accountTypeSupportsPlaid } from "@/modules/accounts/account-types";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type PlaidLinkSectionProps = {
    account: AccountWithBalance;
    autoStartKey?: string | null;
    onLinkingChange?: (isLinking: boolean) => void;
};

type PendingExchange = {
    accounts: PlaidAccount[];
    institution: PlaidInstitution | null;
    plaidItemId?: string;
    publicToken: string;
};

type PendingAction = "exchange" | "link" | "sync" | "unlink" | null;

type PlaidExchangeResponse = {
    initialSyncError?: string;
    initialSyncStatus?: "failed";
};

type ReusablePlaidInstitution = {
    institutionId?: string;
    institutionName?: string;
    plaidItemId: string;
    status: "active" | "error";
    updatedAt: string;
};

type PlaidLinkTokenResponse = {
    linkToken: string;
    mode?: "create" | "update";
    plaidItemId?: string;
};

type PlaidSyncResponse = {
    addedCount?: number;
};

function getPendingPlaidFeedback(input: {
    isLinked: boolean;
    isPreparingLink: boolean;
    pendingAction: PendingAction;
}) {
    if (input.pendingAction === "exchange") {
        return {
            title: input.isLinked
                ? "Updating Plaid account."
                : "Linking Plaid account.",
        };
    }

    if (input.pendingAction === "sync") {
        return { title: "Syncing Plaid." };
    }

    if (input.pendingAction === "unlink") {
        return { title: "Unlinking Plaid." };
    }

    if (input.pendingAction === "link" || input.isPreparingLink) {
        return { title: "Opening Plaid Link." };
    }

    return null;
}

function formatLinkedAccount(input: {
    mask?: string;
    name?: string;
    subtype?: string;
}) {
    const name = input.name ?? "Plaid account";
    const mask = input.mask ? ` (...${input.mask})` : "";
    const subtype = input.subtype ? ` ${input.subtype}` : "";

    return `${name}${mask}${subtype}`;
}

function formatSyncStatus(status?: "failed" | "never" | "succeeded") {
    if (!status) {
        return "Not synced";
    }

    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getLiveSyncStartDate(form: HTMLFormElement | null, fallback: string) {
    const formValue = form
        ? String(new FormData(form).get("plaidSyncStartDate") ?? "").trim()
        : "";

    return formValue || fallback;
}

export function PlaidLinkSection({
    account,
    autoStartKey,
    onLinkingChange,
}: PlaidLinkSectionProps) {
    const { applyWorkspaceMutationResponse, snapshot } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [linkTokenPlaidItemId, setLinkTokenPlaidItemId] = useState<
        string | undefined
    >();
    const [loadedLinkToken, setLoadedLinkToken] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [pendingExchange, setPendingExchange] =
        useState<PendingExchange | null>(null);
    const [selectedPlaidAccountId, setSelectedPlaidAccountId] = useState("");
    const [reusableInstitutions, setReusableInstitutions] = useState<
        ReusablePlaidInstitution[]
    >([]);
    const [selectedReusablePlaidItemId, setSelectedReusablePlaidItemId] =
        useState("");
    const shouldOpenLinkRef = useRef(false);
    const lastAutoStartKeyRef = useRef<string | null>(null);
    const [syncStartDate, setSyncStartDate] = useState(
        account.plaidSyncStartDate ?? account.openedOn,
    );
    const [openPlaidSettingsKey, setOpenPlaidSettingsKey] = useState<
        string | null
    >(null);
    const [locallyUnlinkedAccountId, setLocallyUnlinkedAccountId] = useState<
        string | null
    >(null);
    const pendingPlaidAccountOptions = useMemo(
        () =>
            pendingExchange?.accounts.map((plaidAccount) => ({
                label: formatLinkedAccount({
                    mask: plaidAccount.mask ?? undefined,
                    name: plaidAccount.name,
                    subtype: plaidAccount.subtype,
                }),
                value: plaidAccount.id,
            })) ?? [],
        [pendingExchange],
    );
    const reusableInstitutionOptions = useMemo(
        () =>
            reusableInstitutions.map((institution) => ({
                description:
                    institution.status === "error"
                        ? "Needs reconnect"
                        : undefined,
                label:
                    institution.institutionName ??
                    institution.institutionId ??
                    "Linked institution",
                value: institution.plaidItemId,
            })),
        [reusableInstitutions],
    );
    const activeReusablePlaidItemId = reusableInstitutions.some(
        (institution) =>
            institution.plaidItemId === selectedReusablePlaidItemId,
    )
        ? selectedReusablePlaidItemId
        : "";
    const activePlaidLink = useMemo(() => {
        const bySummaryId = account.plaidAccountLinkId
            ? snapshot.plaidAccountLinks.find(
                  (link) =>
                      link.plaidAccountLinkId === account.plaidAccountLinkId &&
                      (link.status === "linked" || link.status === "error"),
              )
            : undefined;

        return (
            bySummaryId ??
            snapshot.plaidAccountLinks
                .filter(
                    (link) =>
                        link.accountId === account.accountId &&
                        (link.status === "linked" ||
                            link.status === "error"),
                )
                .sort((left, right) =>
                    right.updatedAt.localeCompare(left.updatedAt),
                )[0]
        );
    }, [account.accountId, account.plaidAccountLinkId, snapshot.plaidAccountLinks]);
    const accountSummaryIsLinked =
        Boolean(account.plaidAccountLinkId) &&
        (!account.plaidLinkStatus ||
            account.plaidLinkStatus === "linked" ||
            account.plaidLinkStatus === "error");
    const isLocallyUnlinked = locallyUnlinkedAccountId === account.accountId;
    const isLinked = !isLocallyUnlinked && Boolean(
        activePlaidLink ?? accountSummaryIsLinked,
    );
    const isBusy = pendingAction !== null;
    const isPreparingLink = Boolean(linkToken && loadedLinkToken !== linkToken);
    const isLinking =
        pendingAction === "link" ||
        pendingAction === "exchange" ||
        pendingAction === "unlink" ||
        linkToken !== null ||
        pendingExchange !== null;
    const linkedInstitutionLabel =
        activePlaidLink?.plaidInstitutionName ??
        account.plaidInstitutionName ??
        "Linked institution";
    const linkedSyncStartDate =
        activePlaidLink?.syncStartDate ??
        account.plaidSyncStartDate ??
        syncStartDate;
    const plaidSettingsKey = `${account.accountId}:${isLinked ? "linked" : "unlinked"}`;
    const showPlaidSettings = openPlaidSettingsKey === plaidSettingsKey;
    const pendingPlaidFeedback = getPendingPlaidFeedback({
        isLinked,
        isPreparingLink,
        pendingAction,
    });

    useEffect(() => {
        onLinkingChange?.(isLinking);
    }, [isLinking, onLinkingChange]);

    useEffect(
        () => () => {
            onLinkingChange?.(false);
        },
        [onLinkingChange],
    );

    useEffect(() => {
        if (!accountTypeSupportsPlaid(account.accountType) || isLinked) {
            return;
        }

        let isCurrent = true;

        async function loadReusableInstitutions() {
            try {
                const response = await fetch("/api/plaid/shared-institutions");

                if (!response.ok) {
                    return;
                }

                const payload = (await response.json()) as {
                    institutions?: ReusablePlaidInstitution[];
                };

                if (isCurrent && Array.isArray(payload.institutions)) {
                    setReusableInstitutions(payload.institutions);
                    setSelectedReusablePlaidItemId((current) => {
                        if (current || payload.institutions?.length !== 1) {
                            return current;
                        }

                        return payload.institutions[0]?.plaidItemId ?? "";
                    });
                }
            } catch {
                // Reuse is optional; a failed lookup should not block new links.
            }
        }

        void loadReusableInstitutions();

        return () => {
            isCurrent = false;
        };
    }, [account.accountType, isLinked]);

    const startPlaidLink = useCallback(async () => {
        if (!accountTypeSupportsPlaid(account.accountType)) {
            return;
        }

        setPendingAction("link");
        setPendingExchange(null);

        try {
            const response = await fetch("/api/plaid/link-token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    accountId: account.accountId,
                    ...(isLinked
                        ? { accountSelectionEnabled: true }
                        : activeReusablePlaidItemId
                          ? { plaidItemId: activeReusablePlaidItemId }
                          : {}),
                }),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to start Plaid Link.",
                    ),
                );
            }

            const payload = (await response.json()) as PlaidLinkTokenResponse;

            shouldOpenLinkRef.current = true;
            setLoadedLinkToken(null);
            setLinkTokenPlaidItemId(payload.plaidItemId);
            setLinkToken(payload.linkToken);
        } catch (linkError) {
            notifyError({
                message:
                    linkError instanceof Error
                        ? linkError.message
                        : "Unable to start Plaid Link.",
                title: "Plaid Link could not start.",
            });
        } finally {
            setPendingAction(null);
        }
    }, [
        account.accountId,
        account.accountType,
        activeReusablePlaidItemId,
        isLinked,
        notifyError,
    ]);

    async function exchangePlaidToken(input: {
        accounts: PlaidAccount[];
        institution: PlaidInstitution | null;
        plaidAccountId: string;
        plaidItemId?: string;
        publicToken: string;
    }) {
        setPendingAction("exchange");
        const activity = startActivity({
            completedLabel: "Plaid account linked.",
            pendingLabel: "Linking Plaid account…",
        });

        try {
            const response = await fetch("/api/plaid/exchange", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    accountId: account.accountId,
                    accounts: input.accounts,
                    institution: input.institution,
                    plaidAccountId: input.plaidAccountId,
                    plaidItemId: input.plaidItemId,
                    publicToken: input.publicToken,
                    syncStartDate,
                }),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to link Plaid account.",
                    ),
                );
            }

            const payload =
                await applyWorkspaceMutationResponse<PlaidExchangeResponse>(
                    response,
                );
            setLocallyUnlinkedAccountId(null);
            setPendingExchange(null);
            setSelectedPlaidAccountId("");

            if (payload.initialSyncStatus === "failed") {
                activity.complete();
                notifyError({
                    message: `${payload.initialSyncError ?? "Transactions did not sync."} Use Sync Plaid to retry.`,
                    title: "Plaid account linked. Sync failed.",
                });
            } else {
                activity.complete();
            }
        } catch (exchangeError) {
            activity.fail();
            notifyError({
                message:
                    exchangeError instanceof Error
                        ? exchangeError.message
                        : "Unable to link Plaid account.",
                title: "Plaid account could not be linked.",
            });
        } finally {
            setPendingAction(null);
        }
    }

    function handlePlaidSuccess(
        publicToken: string,
        metadata: PlaidLinkOnSuccessMetadata,
    ) {
        shouldOpenLinkRef.current = false;
        setLinkToken(null);
        setLinkTokenPlaidItemId(undefined);
        setLoadedLinkToken(null);

        if (metadata.accounts.length === 1) {
            void exchangePlaidToken({
                accounts: metadata.accounts,
                institution: metadata.institution,
                plaidAccountId: metadata.accounts[0].id,
                plaidItemId: linkTokenPlaidItemId,
                publicToken,
            });
            return;
        }

        if (metadata.accounts.length > 1) {
            setPendingExchange({
                accounts: metadata.accounts,
                institution: metadata.institution,
                plaidItemId: linkTokenPlaidItemId,
                publicToken,
            });
            setSelectedPlaidAccountId(metadata.accounts[0].id);
            return;
        }

        notifyError({
            message:
                "Plaid did not return a selected account. Start Link again and select one account.",
            title: "Plaid account could not be linked.",
        });
    }

    const { error: plaidLoadError, open, ready } = usePlaidLink({
        token: linkToken,
        onExit: (error) => {
            shouldOpenLinkRef.current = false;
            setLinkToken(null);
            setLinkTokenPlaidItemId(undefined);
            setLoadedLinkToken(null);

            if (error) {
                notifyError({
                    message:
                        error.display_message ??
                        error.error_message ??
                        "Plaid Link could not complete.",
                    title: "Plaid Link closed with an error.",
                });
            }
        },
        onLoad: () => {
            setLoadedLinkToken(linkToken);
        },
        onSuccess: handlePlaidSuccess,
    });

    useEffect(() => {
        if (
            !shouldOpenLinkRef.current ||
            !ready ||
            !linkToken ||
            loadedLinkToken !== linkToken
        ) {
            return;
        }

        shouldOpenLinkRef.current = false;
        open();
    }, [linkToken, loadedLinkToken, open, ready]);

    useEffect(() => {
        if (
            !accountTypeSupportsPlaid(account.accountType) ||
            !autoStartKey ||
            lastAutoStartKeyRef.current === autoStartKey ||
            isBusy
        ) {
            return;
        }

        lastAutoStartKeyRef.current = autoStartKey;
        void startPlaidLink();
    }, [account.accountType, autoStartKey, isBusy, startPlaidLink]);

    async function syncPlaid(form: HTMLFormElement | null) {
        const liveSyncStartDate = getLiveSyncStartDate(form, syncStartDate);

        setSyncStartDate(liveSyncStartDate);
        setPendingAction("sync");
        const activity = startActivity({
            completedLabel: "Plaid sync complete.",
            pendingLabel: "Syncing Plaid account…",
        });

        try {
            const response = await fetch(
                `/api/accounts/${account.accountId}/plaid/sync`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ syncStartDate: liveSyncStartDate }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to sync Plaid account.",
                    ),
                );
            }

            await applyWorkspaceMutationResponse<PlaidSyncResponse>(response);
            activity.complete();
        } catch (syncError) {
            activity.fail();
            notifyError({
                message:
                    syncError instanceof Error
                        ? syncError.message
                        : "Unable to sync Plaid account.",
                title: "Plaid sync failed.",
            });
        } finally {
            setPendingAction(null);
        }
    }

    async function unlinkPlaid() {
        setPendingAction("unlink");
        const activity = startActivity({
            completedLabel: "Plaid account unlinked.",
            pendingLabel: "Unlinking Plaid account…",
        });

        try {
            const response = await fetch(
                `/api/accounts/${account.accountId}/plaid`,
                {
                    method: "DELETE",
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to unlink Plaid account.",
                    ),
                );
            }

            await applyWorkspaceMutationResponse(response);
            setPendingExchange(null);
            setSelectedPlaidAccountId("");
            setSelectedReusablePlaidItemId("");
            setLocallyUnlinkedAccountId(account.accountId);
            setOpenPlaidSettingsKey(`${account.accountId}:unlinked`);
            activity.complete();
        } catch (unlinkError) {
            activity.fail();
            notifyError({
                message:
                    unlinkError instanceof Error
                        ? unlinkError.message
                        : "Unable to unlink Plaid account.",
                title: "Plaid account could not be unlinked.",
            });
        } finally {
            setPendingAction(null);
        }
    }

    if (!accountTypeSupportsPlaid(account.accountType)) {
        return null;
    }

    return (
        <section className={`grid gap-4 p-4 ${surfaceClassNames.panelStrong}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className={typographyClassNames.eyebrow}>Plaid</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink)]">
                        <FontAwesomeIcon
                            icon={faBuildingColumns}
                            className="text-[var(--color-accent-contrast)]"
                        />
                        <span>
                            {isLinked
                                ? linkedInstitutionLabel
                                : "No Plaid account linked"}
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {isLinked ? (
                        <button
                            type="button"
                            onClick={(event) => {
                                void syncPlaid(event.currentTarget.form);
                            }}
                            disabled={isBusy}
                            className={controlClassNames.secondaryActionSmall}
                        >
                            <FontAwesomeIcon icon={faRotate} className="mr-2" />
                            {pendingAction === "sync"
                                ? "Syncing..."
                                : "Sync Plaid"}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        aria-expanded={showPlaidSettings}
                        onClick={() =>
                            setOpenPlaidSettingsKey((current) =>
                                current === plaidSettingsKey
                                    ? null
                                    : plaidSettingsKey,
                            )
                        }
                        className={controlClassNames.secondaryActionSmall}
                    >
                        <FontAwesomeIcon
                            icon={showPlaidSettings ? faCaretDown : faCaretRight}
                            className="mr-2"
                        />
                        {isLinked ? "Manage Plaid" : "Set up Plaid"}
                    </button>
                </div>
            </div>

            {isLinked && !showPlaidSettings ? (
                <dl className="grid gap-3 text-sm">
                    <div>
                        <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                            Sync start date
                        </dt>
                        <dd className="mt-1 text-[var(--color-ink)]">
                            {linkedSyncStartDate}
                        </dd>
                    </div>
                </dl>
            ) : null}

            {showPlaidSettings ? (
                <div className="grid gap-4">
                    {!isLinked && reusableInstitutionOptions.length > 0 ? (
                        <ComboboxSelect
                            emptyOption={{
                                label: "New institution",
                                value: "",
                            }}
                            label="Institution"
                            noResultsLabel="No institutions found"
                            onChange={setSelectedReusablePlaidItemId}
                            options={reusableInstitutionOptions}
                            value={activeReusablePlaidItemId}
                        />
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Sync start date
                            <input
                                required
                                type="date"
                                name="plaidSyncStartDate"
                                value={syncStartDate}
                                onChange={(event) =>
                                    setSyncStartDate(event.target.value)
                                }
                                className={controlClassNames.field}
                            />
                        </label>

                        {isLinked ? (
                            <div className="flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void startPlaidLink();
                                    }}
                                    disabled={isBusy}
                                    className={controlClassNames.secondaryActionSmall}
                                >
                                    <FontAwesomeIcon icon={faLink} className="mr-2" />
                                    Choose Plaid account
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void unlinkPlaid();
                                    }}
                                    disabled={isBusy}
                                    className={controlClassNames.secondaryActionSmall}
                                >
                                    <FontAwesomeIcon
                                        icon={faUnlink}
                                        className="mr-2"
                                    />
                                    Unlink Plaid
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    void startPlaidLink();
                                }}
                                disabled={isBusy}
                                className={controlClassNames.secondaryActionSmall}
                            >
                                <FontAwesomeIcon icon={faLink} className="mr-2" />
                                Link Plaid
                            </button>
                        )}
                    </div>
                </div>
            ) : null}

            {isLinked ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                            Plaid account
                        </dt>
                        <dd className="mt-1 text-[var(--color-ink)]">
                            {formatLinkedAccount({
                                mask:
                                    activePlaidLink?.plaidAccountMask ??
                                    account.plaidAccountMask,
                                name:
                                    activePlaidLink?.plaidAccountName ??
                                    account.plaidAccountName,
                                subtype:
                                    activePlaidLink?.plaidAccountSubtype ??
                                    account.plaidAccountSubtype,
                            })}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                            Last sync
                        </dt>
                        <dd className="mt-1 text-[var(--color-ink)]">
                            {formatSyncStatus(
                                activePlaidLink?.lastSyncStatus ??
                                    account.plaidLastSyncStatus,
                            )}
                            {activePlaidLink?.lastSyncedAt ??
                            account.plaidLastSyncedAt
                                ? ` at ${new Date(
                                      activePlaidLink?.lastSyncedAt ??
                                          account.plaidLastSyncedAt ??
                                          "",
                                  ).toLocaleString()}`
                                : ""}
                        </dd>
                    </div>
                </dl>
            ) : null}

            {pendingExchange ? (
                <div className="grid gap-3 border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
                    <ComboboxSelect
                        label="Plaid account"
                        noResultsLabel="No Plaid accounts found"
                        onChange={setSelectedPlaidAccountId}
                        options={pendingPlaidAccountOptions}
                        placeholder="Select Plaid account"
                        value={selectedPlaidAccountId}
                    />
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                void exchangePlaidToken({
                                    accounts: pendingExchange.accounts,
                                    institution: pendingExchange.institution,
                                    plaidAccountId: selectedPlaidAccountId,
                                    plaidItemId: pendingExchange.plaidItemId,
                                    publicToken: pendingExchange.publicToken,
                                });
                            }}
                            disabled={isBusy || !selectedPlaidAccountId}
                            className={controlClassNames.primaryAction}
                        >
                            Attach selected account
                        </button>
                    </div>
                </div>
            ) : null}

            {activePlaidLink?.lastSyncError ? (
                <WorkspaceStatusPanel
                    compact
                    message={activePlaidLink.lastSyncError}
                    title="Last Plaid sync failed."
                    tone="error"
                />
            ) : null}

            {plaidLoadError ? (
                <WorkspaceStatusPanel
                    compact
                    message={plaidLoadError.message}
                    title="Plaid Link could not load."
                    tone="error"
                />
            ) : null}

            {pendingPlaidFeedback ? (
                <WorkspaceStatusPanel
                    compact
                    isLoading
                    message=""
                    title={pendingPlaidFeedback.title}
                    tone="info"
                />
            ) : null}

        </section>
    );
}
