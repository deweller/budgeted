"use client";

import { useRef, useState } from "react";

import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import {
    PaneList,
    PaneListShortcutLabel,
} from "@/components/shared/pane-list";
import { useEscapeToClose } from "@/components/shared/use-escape-to-close";
import { useInitialFocus } from "@/components/shared/use-initial-focus";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { LedgerRecord } from "@/features/ledgers/server/ledger-service";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatMediumDisplayDate } from "@/lib/dates/local-date";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { createOptimisticWorkspaceUpsert } from "@/lib/workspace/optimistic-changes";

type LedgerManagerProps = {
    activeLedgerId: string;
    ledgers: LedgerRecord[];
};

function createLedgerNames(ledgers: LedgerRecord[]) {
    return Object.fromEntries(
        ledgers.map((ledger) => [ledger.ledgerId, ledger.name]),
    ) as Record<string, string>;
}

export function LedgerManager({ activeLedgerId, ledgers }: LedgerManagerProps) {
    const {
        applyWorkspaceMutationResponse,
        executeWorkspaceCommand,
        refreshWorkspaceSnapshot,
        reconcileFullWorkspaceMutation,
        snapshot,
    } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [ledgerNames, setLedgerNames] = useState(() =>
        createLedgerNames(ledgers),
    );
    const [ledgerRecords, setLedgerRecords] = useState(ledgers);
    const [renameLedgerTarget, setRenameLedgerTarget] =
        useState<LedgerRecord | null>(null);
    const [renameLedgerName, setRenameLedgerName] = useState("");
    const [pendingRenameLedgerId, setPendingRenameLedgerId] = useState<
        string | null
    >(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [pendingLedgerId, setPendingLedgerId] = useState<string | null>(null);
    const [archiveLedgerTarget, setArchiveLedgerTarget] =
        useState<LedgerRecord | null>(null);
    const [pendingArchiveLedgerId, setPendingArchiveLedgerId] = useState<
        string | null
    >(null);
    const [deleteLedgerTarget, setDeleteLedgerTarget] =
        useState<LedgerRecord | null>(null);
    const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
    const [pendingDeleteLedgerId, setPendingDeleteLedgerId] = useState<
        string | null
    >(null);
    const createLedgerNameInputRef = useRef<HTMLInputElement>(null);
    const renameLedgerNameInputRef = useRef<HTMLInputElement>(null);
    const deleteLedgerConfirmationInputRef = useRef<HTMLInputElement>(null);
    const currentActiveLedgerId = snapshot.activeLedgerId || activeLedgerId;

    async function refreshLedgerCatalog() {
        const response = await fetch("/api/ledgers");

        if (!response.ok) {
            throw new Error(
                await parseApiErrorMessage(
                    response,
                    "Unable to refresh the ledger list.",
                ),
            );
        }

        const payload = (await response.json()) as { ledgers: LedgerRecord[] };
        setLedgerRecords(payload.ledgers);
        setLedgerNames(createLedgerNames(payload.ledgers));
    }

    useEscapeToClose({
        enabled: isCreateDialogOpen && !isCreating,
        onClose: closeCreateDialog,
    });
    useEscapeToClose({
        enabled: renameLedgerTarget !== null && !pendingRenameLedgerId,
        onClose: closeRenameLedgerDialog,
    });
    useEscapeToClose({
        enabled: deleteLedgerTarget !== null && !pendingDeleteLedgerId,
        onClose: closeDeleteLedgerDialog,
    });
    useEscapeToClose({
        enabled: archiveLedgerTarget !== null && !pendingArchiveLedgerId,
        onClose: closeArchiveLedgerDialog,
    });
    useInitialFocus(createLedgerNameInputRef, {
        enabled: isCreateDialogOpen,
    });
    useInitialFocus(renameLedgerNameInputRef, {
        enabled: renameLedgerTarget !== null,
    });
    useInitialFocus(deleteLedgerConfirmationInputRef, {
        enabled: deleteLedgerTarget !== null,
    });

    function closeCreateDialog() {
        if (isCreating) {
            return;
        }

        setIsCreateDialogOpen(false);
    }

    function closeDeleteLedgerDialog() {
        if (pendingDeleteLedgerId) {
            return;
        }

        setDeleteLedgerTarget(null);
        setDeleteConfirmationName("");
    }

    function closeArchiveLedgerDialog() {
        if (pendingArchiveLedgerId) {
            return;
        }

        setArchiveLedgerTarget(null);
    }

    function openRenameLedgerDialog(ledger: LedgerRecord) {
        const currentName = ledgerNames[ledger.ledgerId] ?? ledger.name;

        setRenameLedgerTarget({ ...ledger, name: currentName });
        setRenameLedgerName(currentName);
    }

    function closeRenameLedgerDialog() {
        if (pendingRenameLedgerId) {
            return;
        }

        setRenameLedgerTarget(null);
        setRenameLedgerName("");
    }

    async function saveLedgerName() {
        if (!renameLedgerTarget || pendingRenameLedgerId) {
            return;
        }

        const ledger = renameLedgerTarget;
        const name = renameLedgerName.trim();

        if (!name) {
            notifyError({
                message:
                    "Ledger name is required. The last saved ledger name is unchanged.",
                title: "Ledger name could not be saved.",
            });
            return;
        }

        const currentName = ledgerNames[ledger.ledgerId] ?? ledger.name;

        if (name === currentName) {
            closeRenameLedgerDialog();
            return;
        }

        const updatedAt = new Date().toISOString();

        setPendingRenameLedgerId(ledger.ledgerId);
        setLedgerNames((current) => ({
            ...current,
            [ledger.ledgerId]: name,
        }));
        const outcome = await executeWorkspaceCommand({
            activity: {
                completedLabel: "Ledger name saved.",
                pendingLabel: "Saving ledger name…",
            },
            optimisticChanges: [
                createOptimisticWorkspaceUpsert({
                    entityId: ledger.ledgerId,
                    entityType: "ledger",
                    record: {
                        ...ledger,
                        name,
                        updatedAt,
                    },
                }),
            ],
            request: () =>
                fetch(`/api/ledgers/${ledger.ledgerId}`, {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ name }),
                }),
            onError: async (error) => {
                setLedgerNames((current) => ({
                    ...current,
                    [ledger.ledgerId]: currentName,
                }));
                notifyError({
                    message: `${error instanceof Response ? await parseApiErrorMessage(error, "Unable to save ledger name.") : error instanceof Error ? error.message : "Unable to save ledger name."} Save failed. The latest saved data has been restored.`,
                    title: "Ledger name could not be saved.",
                });
            },
            onCommitted: async () => {
                await refreshLedgerCatalog();
            },
        });

        setPendingRenameLedgerId(null);
        if (outcome === "committed") {
            setRenameLedgerTarget(null);
            setRenameLedgerName("");
        }
    }

    async function createNewLedger(formData: FormData) {
        setIsCreating(true);
        const activity = startActivity({
            completedLabel: "Ledger created.",
            pendingLabel: "Creating ledger…",
        });

        try {
            const response = await fetch("/api/ledgers", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: String(formData.get("name") ?? ""),
                }),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to create ledger.",
                    ),
                );
            }

            setIsCreateDialogOpen(false);
            await reconcileFullWorkspaceMutation(response);
            await refreshLedgerCatalog();
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message: `${error instanceof Error ? error.message : "Unable to create ledger."} The active ledger was not changed.`,
                title: "Ledger could not be created.",
            });
        } finally {
            setIsCreating(false);
        }
    }

    async function activateLedger(ledgerId: string) {
        setPendingLedgerId(ledgerId);
        const activity = startActivity({
            completedLabel: "Ledger switched.",
            pendingLabel: "Switching ledger…",
        });

        try {
            const response = await fetch(`/api/ledgers/${ledgerId}`, {
                method: "PATCH",
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to switch ledgers.",
                    ),
                );
            }

            await refreshWorkspaceSnapshot();
            await refreshLedgerCatalog();
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message: `${error instanceof Error ? error.message : "Unable to switch ledgers."} The previous active ledger is still selected.`,
                title: "Ledger could not be switched.",
            });
        } finally {
            setPendingLedgerId(null);
        }
    }

    async function deleteLedgerNow() {
        if (!deleteLedgerTarget) {
            return;
        }

        setPendingDeleteLedgerId(deleteLedgerTarget.ledgerId);
        const activity = startActivity({
            completedLabel: "Ledger deleted.",
            pendingLabel: "Deleting ledger…",
        });

        try {
            const response = await fetch(
                `/api/ledgers/${deleteLedgerTarget.ledgerId}`,
                {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        confirmationName: deleteConfirmationName,
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to delete ledger.",
                    ),
                );
            }

            setDeleteLedgerTarget(null);
            setDeleteConfirmationName("");
            await reconcileFullWorkspaceMutation(response);
            await refreshLedgerCatalog();
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to delete ledger.",
                title: "Ledger could not be deleted.",
            });
        } finally {
            setPendingDeleteLedgerId(null);
        }
    }

    async function updateLedgerArchiveStatus(input: {
        action: "archive" | "restore";
        ledger: LedgerRecord;
    }) {
        const isDeactivating = input.action === "archive";
        const statusAction = isDeactivating ? "deactivate" : "activate";

        setPendingArchiveLedgerId(input.ledger.ledgerId);
        const activity = startActivity({
            completedLabel:
                isDeactivating ? "Ledger deactivated." : "Ledger activated.",
            pendingLabel:
                isDeactivating ? "Deactivating ledger…" : "Activating ledger…",
        });

        try {
            const response = await fetch(
                `/api/ledgers/${input.ledger.ledgerId}?action=${input.action}`,
                { method: "POST" },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        `Unable to ${statusAction} ledger.`,
                    ),
                );
            }

            setArchiveLedgerTarget(null);
            await applyWorkspaceMutationResponse(response);
            await refreshLedgerCatalog();
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : `Unable to ${statusAction} ledger.`,
                title: "Ledger status could not be updated.",
            });
        } finally {
            setPendingArchiveLedgerId(null);
        }
    }

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className={typographyClassNames.eyebrow}>Ledgers</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setIsCreateDialogOpen(true);
                    }}
                    className={controlClassNames.primaryActionCompact}
                >
                    New ledger
                </button>
            </div>

            <PaneList aria-label="Ledgers">
                {ledgerRecords.map((ledger) => {
                    const isActive = ledger.ledgerId === currentActiveLedgerId;
                    const isPending = pendingLedgerId === ledger.ledgerId;
                    const isRenaming = pendingRenameLedgerId === ledger.ledgerId;
                    const isArchivePending =
                        pendingArchiveLedgerId === ledger.ledgerId;
                    const isDeletePending =
                        pendingDeleteLedgerId === ledger.ledgerId;
                    const ledgerName =
                        ledgerNames[ledger.ledgerId] ?? ledger.name;
                    const canSwitch = !isActive && !isPending;
                    const switchLedger = () => {
                        if (canSwitch) {
                            void activateLedger(ledger.ledgerId);
                        }
                    };
                    const editLedger = () => {
                        if (!isRenaming) {
                            openRenameLedgerDialog(ledger);
                        }
                    };
                    const updateArchiveStatus = () => {
                        if (isArchivePending) {
                            return;
                        }

                        if (ledger.status === "archived") {
                            void updateLedgerArchiveStatus({
                                action: "restore",
                                ledger,
                            });
                            return;
                        }

                        setArchiveLedgerTarget({
                            ...ledger,
                            name: ledgerName,
                        });
                    };
                    const deleteLedger = () => {
                        if (isDeletePending) {
                            return;
                        }

                        setDeleteLedgerTarget({
                            ...ledger,
                            name: ledgerName,
                        });
                        setDeleteConfirmationName("");
                    };
                    const statusActionLabel =
                        ledger.status === "archived" ? "Activate" : "Deactivate";

                    return (
                        <PaneList.Item
                            key={ledger.ledgerId}
                            itemId={ledger.ledgerId}
                            aria-label={ledgerName}
                            className="sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_auto]"
                            shortcuts={[
                                ...(isActive
                                    ? []
                                    : [
                                          {
                                              disabled: isPending,
                                              key: "s",
                                              onAction: switchLedger,
                                          },
                                      ]),
                                {
                                    disabled: isRenaming,
                                    key: "e",
                                    onAction: editLedger,
                                },
                                {
                                    disabled: isArchivePending,
                                    key:
                                        ledger.status === "archived"
                                            ? "r"
                                            : "a",
                                    onAction: updateArchiveStatus,
                                },
                                {
                                    disabled: isDeletePending,
                                    key: "d",
                                    onAction: deleteLedger,
                                },
                            ]}
                        >
                            <div className="grid min-w-0 gap-1">
                                <span className="truncate text-sm font-semibold text-[var(--color-ink)]">
                                    {ledgerName}
                                </span>
                                <span className="text-xs text-[var(--color-muted)]">
                                    Created {formatMediumDisplayDate(ledger.createdAt)}
                                    {isActive ? " · Current" : null}
                                    {ledger.status === "archived"
                                        ? " · Archived"
                                        : null}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                                <span
                                    className={
                                        ledger.status === "archived"
                                            ? "text-[var(--color-muted)]"
                                            : "text-[var(--tone-success-ink)]"
                                    }
                                >
                                    Automation{" "}
                                    {ledger.status === "archived"
                                        ? "off"
                                        : "on"}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 lg:col-span-1">
                                {!isActive ? (
                                    <button
                                        type="button"
                                        disabled={!canSwitch}
                                        onClick={switchLedger}
                                        className={
                                            controlClassNames.secondaryActionSmall
                                        }
                                    >
                                        <PaneListShortcutLabel
                                            label={
                                                isPending
                                                    ? "Switching..."
                                                    : "Switch"
                                            }
                                        />
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    disabled={isRenaming}
                                    onClick={editLedger}
                                    className={
                                        controlClassNames.secondaryActionSmall
                                    }
                                >
                                    <PaneListShortcutLabel label="Edit" />
                                </button>
                                <button
                                    type="button"
                                    disabled={isArchivePending}
                                    onClick={updateArchiveStatus}
                                    className={
                                        controlClassNames.secondaryActionSmall
                                    }
                                >
                                    <PaneListShortcutLabel
                                        label={
                                            isArchivePending
                                                ? ledger.status === "archived"
                                                    ? "Activating..."
                                                    : "Deactivating..."
                                                : statusActionLabel
                                        }
                                    />
                                </button>
                                <button
                                    type="button"
                                    disabled={isDeletePending}
                                    onClick={deleteLedger}
                                    className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] px-3 py-2 text-xs font-medium text-[var(--tone-error-ink)] transition hover:bg-[var(--tone-error-surface-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <PaneListShortcutLabel
                                        label={
                                            isDeletePending
                                                ? "Deleting..."
                                                : "Delete"
                                        }
                                    />
                                </button>
                            </div>
                        </PaneList.Item>
                    );
                })}
            </PaneList>

            {renameLedgerTarget ? (
                <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
                    <form
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rename-ledger-title"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void saveLedgerName();
                        }}
                        className={`max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className={typographyClassNames.eyebrow}>
                                    Rename ledger
                                </p>
                                <h2
                                    id="rename-ledger-title"
                                    className="mt-2 text-2xl font-semibold tracking-tight"
                                >
                                    Rename {renameLedgerTarget.name}?
                                </h2>
                            </div>
                            <DialogCloseButton
                                onClick={closeRenameLedgerDialog}
                                disabled={Boolean(pendingRenameLedgerId)}
                                aria-label="Close rename ledger dialog"
                            />
                        </div>

                        <label className="mt-6 grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Ledger name
                            <input
                                ref={renameLedgerNameInputRef}
                                required
                                value={renameLedgerName}
                                onChange={(event) => {
                                    setRenameLedgerName(event.target.value);
                                }}
                                className={controlClassNames.field}
                            />
                        </label>

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeRenameLedgerDialog}
                                disabled={Boolean(pendingRenameLedgerId)}
                                className={controlClassNames.secondaryAction}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={Boolean(pendingRenameLedgerId)}
                                className={controlClassNames.primaryAction}
                            >
                                {pendingRenameLedgerId
                                    ? "Saving..."
                                    : "Save name"}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}

            {isCreateDialogOpen ? (
                <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
                    <form
                        action={createNewLedger}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="new-ledger-title"
                        className={`max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className={typographyClassNames.eyebrow}>
                                    New ledger
                                </p>
                                <h2
                                    id="new-ledger-title"
                                    className="mt-2 text-2xl font-semibold tracking-tight"
                                >
                                    Create a separate ledger with its own accounts, budget, and transactions.
                                </h2>
                            </div>
                            <DialogCloseButton
                                onClick={closeCreateDialog}
                                disabled={isCreating}
                                aria-label="Close new ledger dialog"
                            />
                        </div>

                        <label className="mt-6 grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Ledger name
                            <input
                                ref={createLedgerNameInputRef}
                                required
                                name="name"
                                placeholder="2027 ledger"
                                className={controlClassNames.field}
                            />
                        </label>

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeCreateDialog}
                                disabled={isCreating}
                                className={controlClassNames.secondaryAction}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isCreating}
                                className={controlClassNames.primaryAction}
                            >
                                {isCreating ? "Creating..." : "Create ledger"}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}

            {deleteLedgerTarget ? (
                <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-ledger-title"
                        className={`max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className={typographyClassNames.eyebrow}>
                                    Delete ledger
                                </p>
                                <h2
                                    id="delete-ledger-title"
                                    className="mt-2 text-2xl font-semibold tracking-tight"
                                >
                                    Delete {deleteLedgerTarget.name}?
                                </h2>
                            </div>
                            <DialogCloseButton
                                onClick={closeDeleteLedgerDialog}
                                disabled={Boolean(pendingDeleteLedgerId)}
                                aria-label="Close delete ledger dialog"
                            />
                        </div>

                        <div className="mt-6 rounded-none border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] p-4 text-sm text-[var(--tone-error-ink)]">
                            This permanently deletes the ledger and every
                            account, category, budget month, transaction, and
                            ledger posting associated with it.
                        </div>

                        <label className="mt-6 grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Type the ledger name to confirm
                            <input
                                ref={deleteLedgerConfirmationInputRef}
                                value={deleteConfirmationName}
                                onChange={(event) =>
                                    setDeleteConfirmationName(
                                        event.target.value,
                                    )
                                }
                                className={controlClassNames.field}
                            />
                        </label>

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeDeleteLedgerDialog}
                                disabled={Boolean(pendingDeleteLedgerId)}
                                className={controlClassNames.secondaryAction}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={
                                    Boolean(pendingDeleteLedgerId) ||
                                    deleteConfirmationName !==
                                        deleteLedgerTarget.name
                                }
                                onClick={() => {
                                    void deleteLedgerNow();
                                }}
                                className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] px-4 py-3 text-sm font-semibold text-[var(--tone-error-ink)] transition hover:bg-[var(--tone-error-surface-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {pendingDeleteLedgerId
                                    ? "Deleting..."
                                    : "Delete permanently"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {archiveLedgerTarget ? (
                <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="deactivate-ledger-title"
                        className={`max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className={typographyClassNames.eyebrow}>
                                    Deactivate ledger
                                </p>
                                <h2
                                    id="deactivate-ledger-title"
                                    className="mt-2 text-2xl font-semibold tracking-tight"
                                >
                                    Deactivate {archiveLedgerTarget.name}?
                                </h2>
                            </div>
                            <DialogCloseButton
                                onClick={closeArchiveLedgerDialog}
                                disabled={Boolean(pendingArchiveLedgerId)}
                                aria-label="Close deactivate ledger dialog"
                            />
                        </div>

                        <p className={`mt-6 text-sm ${typographyClassNames.mutedBody}`}>
                            This ledger remains available for viewing and manual
                            work. Scheduled Plaid sync, Amazon imports, and AI
                            classification will stop until it is activated.
                        </p>

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeArchiveLedgerDialog}
                                disabled={Boolean(pendingArchiveLedgerId)}
                                className={controlClassNames.secondaryAction}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={Boolean(pendingArchiveLedgerId)}
                                onClick={() => {
                                    void updateLedgerArchiveStatus({
                                        action: "archive",
                                        ledger: archiveLedgerTarget,
                                    });
                                }}
                                className={controlClassNames.primaryAction}
                            >
                                {pendingArchiveLedgerId
                                    ? "Deactivating..."
                                    : "Deactivate ledger"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
