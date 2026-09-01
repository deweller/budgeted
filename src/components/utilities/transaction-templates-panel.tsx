"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import {
    faPen,
    faPlus,
    faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { MoneyAmount } from "@/components/shared/money-amount";
import { MoneyExpressionInput } from "@/components/shared/money-expression-input";
import { useEscapeToClose } from "@/components/shared/use-escape-to-close";
import { useInitialFocus } from "@/components/shared/use-initial-focus";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { buildGroupedCategoryComboboxOptions } from "@/features/budget/models/category-combobox-options";
import {
    getTransactionTemplateRemainderCents,
    resolveTransactionTemplateLines,
    type TransactionTemplateLineDefinition,
} from "@/features/transaction-templates/models/formula";
import { parseTransactionTemplateLines } from "@/features/transaction-templates/models/transaction-template";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatUsd, parseUsdToCents } from "@/lib/formatting/money";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import {
    createOptimisticWorkspaceDelete,
    createOptimisticWorkspaceUpsert,
} from "@/lib/workspace/optimistic-changes";
import type { WorkspaceTransactionTemplateRecord } from "@/lib/workspace/sync-types";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";

type TemplateDraftLine = TransactionTemplateLineDefinition;

type TemplateDraft = {
    accountId: string;
    defaultAmount: string;
    lines: TemplateDraftLine[];
    memo: string;
    name: string;
    payee: string;
};

type DialogState =
    | { mode: "create"; template?: undefined }
    | { mode: "edit"; template: WorkspaceTransactionTemplateRecord };

function createDraftLine(index: number): TemplateDraftLine {
    return {
        categoryId: "",
        formula: index === 0 ? "remainder" : "",
        lineId: `new-${Date.now()}-${index}`,
        sortOrder: index,
    };
}

function draftFromTemplate(
    template: WorkspaceTransactionTemplateRecord | undefined,
): TemplateDraft {
    if (!template) {
        return {
            accountId: "",
            defaultAmount: "",
            lines: [createDraftLine(0)],
            memo: "",
            name: "New template",
            payee: "",
        };
    }

    return {
        accountId: template.accountId ?? "",
        defaultAmount:
            template.defaultAmountCents === undefined
                ? ""
                : (template.defaultAmountCents / 100).toFixed(2),
        lines: parseTransactionTemplateLines(template),
        memo: template.memo ?? "",
        name: template.name,
        payee: template.payee ?? "",
    };
}

function makePayload(draft: TemplateDraft) {
    return {
        accountId: draft.accountId || null,
        defaultAmountCents: draft.defaultAmount.trim()
            ? parseUsdToCents(draft.defaultAmount)
            : null,
        lines: draft.lines.map((line, index) => ({
            categoryId: line.categoryId,
            formula: line.formula,
            lineId: line.lineId.startsWith("new-") ? undefined : line.lineId,
            sortOrder: index,
        })),
        memo: draft.memo || null,
        name: draft.name,
        payee: draft.payee || null,
    };
}

function createOptimisticTemplateRecord(input: {
    draft: TemplateDraft;
    template: WorkspaceTransactionTemplateRecord;
}) {
    const payload = makePayload(input.draft);

    return {
        ...input.template,
        accountId: payload.accountId ?? undefined,
        defaultAmountCents: payload.defaultAmountCents ?? undefined,
        linesJson: JSON.stringify(
            payload.lines.map((line, index) => ({
                categoryId: line.categoryId,
                formula: line.formula,
                lineId: line.lineId ?? `optimistic-${input.template.templateId}-${index}`,
                sortOrder: index,
            })),
        ),
        memo: payload.memo ?? undefined,
        name: payload.name.trim(),
        payee: payload.payee ?? undefined,
        updatedAt: new Date().toISOString(),
    };
}

function getTemplatePreview(input: {
    draft: TemplateDraft;
    sampleTotalCents: number;
}) {
    const resolvedLines = resolveTransactionTemplateLines({
        lines: input.draft.lines,
        totalCents: input.sampleTotalCents,
    });

    return {
        remainderCents: getTransactionTemplateRemainderCents(
            resolvedLines,
            input.sampleTotalCents,
        ),
        resolvedLines,
    };
}

function TransactionTemplateDialog({
    accountOptions,
    categoryOptions,
    onClose,
    onSaved,
    state,
}: {
    accountOptions: ComboboxSelectOption[];
    categoryOptions: ComboboxSelectOption[];
    onClose: () => void;
    onSaved: () => Promise<void>;
    state: DialogState | null;
}) {
    const { executeWorkspaceCommand } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const [draft, setDraft] = useState(() => draftFromTemplate(state?.template));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const sampleTotalCents = draft.defaultAmount.trim()
        ? (() => {
              try {
                  return parseUsdToCents(draft.defaultAmount);
              } catch {
                  return 10_000;
              }
          })()
        : 10_000;
    const previewResult = useMemo(() => {
        try {
            return {
                error: null,
                preview: getTemplatePreview({ draft, sampleTotalCents }),
            };
        } catch (error) {
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Unable to resolve the template preview.",
                preview: null,
            };
        }
    }, [draft, sampleTotalCents]);
    const preview = previewResult.preview;
    const previewError = previewResult.error;

    useEscapeToClose({
        enabled: Boolean(state) && !isSubmitting,
        onClose,
    });
    useInitialFocus(nameInputRef, {
        enabled: Boolean(state),
        select: state?.mode === "edit",
    });

    if (!state) {
        return null;
    }

    function updateDraft(patch: Partial<TemplateDraft>) {
        setDraft((current) => ({ ...current, ...patch }));
    }

    function updateLine(lineId: string, patch: Partial<TemplateDraftLine>) {
        setDraft((current) => ({
            ...current,
            lines: current.lines.map((line) =>
                line.lineId === lineId ? { ...line, ...patch } : line,
            ),
        }));
    }

    function addLine() {
        setDraft((current) => ({
            ...current,
            lines: [
                ...current.lines,
                createDraftLine(current.lines.length),
            ],
        }));
    }

    function removeLine(lineId: string) {
        setDraft((current) => ({
            ...current,
            lines:
                current.lines.length > 1
                    ? current.lines.filter((line) => line.lineId !== lineId)
                    : current.lines,
        }));
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);

        try {
            if (!state) {
                return;
            }
            const payload = makePayload(draft);
            const optimisticChanges =
                state.mode === "edit"
                    ? [
                          createOptimisticWorkspaceUpsert({
                              entityId: state.template.templateId,
                              entityType: "transactionTemplate",
                              record: createOptimisticTemplateRecord({
                                  draft,
                                  template: state.template,
                              }),
                          }),
                      ]
                    : [];

            await onSaved();
            setIsSubmitting(false);
            void executeWorkspaceCommand({
                activity: {
                    completedLabel: "Transaction template saved.",
                    pendingLabel: "Saving transaction template…",
                },
                optimisticChanges,
                request: () =>
                    fetch(
                        state.mode === "create"
                            ? "/api/utilities/transaction-templates"
                            : `/api/utilities/transaction-templates/${state.template.templateId}`,
                        {
                            method: state.mode === "create" ? "POST" : "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify(payload),
                        },
                    ),
                onError: async (error) => {
                    notifyError({
                        message: `${error instanceof Response ? await parseApiErrorMessage(error, "Unable to save transaction template.") : error instanceof Error ? error.message : "Unable to save transaction template."} The latest saved data has been restored.`,
                        title: "Transaction template could not be saved.",
                    });
                },
            });
        } catch (error) {
            notifyError({
                message: `${error instanceof Error ? error.message : "Unable to save transaction template."} The latest saved data has been restored.`,
                title: "Transaction template could not be saved.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="transaction-template-dialog-title"
                className={`max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className={typographyClassNames.eyebrow}>
                            Transaction templates
                        </p>
                        <h2
                            id="transaction-template-dialog-title"
                            className="mt-2 text-2xl font-semibold tracking-tight"
                        >
                            {state.mode === "create"
                                ? "Add template"
                                : "Edit template"}
                        </h2>
                    </div>
                    <DialogCloseButton
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close transaction template dialog"
                    />
                </div>

                <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Template name
                            <input
                                ref={nameInputRef}
                                required
                                value={draft.name}
                                onChange={(event) =>
                                    updateDraft({ name: event.target.value })
                                }
                                className={controlClassNames.field}
                            />
                        </label>
                        <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Default payee
                            <input
                                value={draft.payee}
                                onChange={(event) =>
                                    updateDraft({ payee: event.target.value })
                                }
                                className={controlClassNames.field}
                            />
                        </label>
                        <ComboboxSelect
                            emptyOption={{ label: "No default account", value: "" }}
                            label="Default account"
                            noResultsLabel="No accounts found"
                            onChange={(accountId) => updateDraft({ accountId })}
                            options={accountOptions}
                            value={draft.accountId}
                        />
                        <div className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Default amount
                            <MoneyExpressionInput
                                aria-label="Default amount"
                                value={draft.defaultAmount}
                                onChange={(event) =>
                                    updateDraft({
                                        defaultAmount: event.target.value,
                                    })
                                }
                                placeholder="-100.00"
                                className={controlClassNames.fieldCompact}
                            />
                        </div>
                        <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)] md:col-span-2">
                            Default memo
                            <input
                                value={draft.memo}
                                onChange={(event) =>
                                    updateDraft({ memo: event.target.value })
                                }
                                className={controlClassNames.field}
                            />
                        </label>
                    </div>

                    <section className="grid gap-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold">
                                    Split formulas
                                </h3>
                                <p className={`mt-1 text-sm ${typographyClassNames.mutedBody}`}>
                                    Use dollars with arithmetic,{" "}
                                    <code>total</code>, and <code>remainder</code>.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={addLine}
                                className={`${controlClassNames.secondaryAction} inline-flex cursor-pointer items-center gap-2`}
                            >
                                <FontAwesomeIcon aria-hidden icon={faPlus} />
                                Add split
                            </button>
                        </div>

                        <table className="min-w-full border-collapse text-left text-sm">
                            <thead>
                                <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                                    <th className="px-4 py-3 font-medium">
                                        Category
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                        Formula
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium">
                                        Example ({formatUsd(sampleTotalCents)})
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {draft.lines.map((line, index) => {
                                    const resolvedLine =
                                        preview?.resolvedLines.find(
                                            (candidate) =>
                                                candidate.lineId ===
                                                line.lineId,
                                        );

                                    return (
                                        <tr
                                            key={line.lineId}
                                            className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                        >
                                            <td className="min-w-56 px-4 py-3 align-top">
                                                <ComboboxSelect
                                                    optionVariant="category"
                                                    hideLabel
                                                    label={`Split ${index + 1} category`}
                                                    noResultsLabel="No categories found"
                                                    onChange={(categoryId) =>
                                                        updateLine(
                                                            line.lineId,
                                                            { categoryId },
                                                        )
                                                    }
                                                    options={categoryOptions}
                                                    value={line.categoryId}
                                                />
                                            </td>
                                            <td className="min-w-52 px-4 py-3 align-top">
                                                <label className="sr-only">
                                                    Split {index + 1} formula
                                                </label>
                                                <input
                                                    required
                                                    value={line.formula}
                                                    onChange={(event) =>
                                                        updateLine(
                                                            line.lineId,
                                                            {
                                                                formula:
                                                                    event
                                                                        .target
                                                                        .value,
                                                            },
                                                        )
                                                    }
                                                    className={controlClassNames.field}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right align-middle font-medium tabular-nums">
                                                {resolvedLine ? (
                                                    <MoneyAmount
                                                        cents={
                                                            resolvedLine.amountCents
                                                        }
                                                    />
                                                ) : (
                                                    "-"
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-middle">
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeLine(
                                                                line.lineId,
                                                            )
                                                        }
                                                        disabled={
                                                            draft.lines
                                                                .length <= 1
                                                        }
                                                        className={controlClassNames.secondaryActionSmall}
                                                    >
                                                        <FontAwesomeIcon
                                                            aria-hidden
                                                            icon={faTrashCan}
                                                        />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold tabular-nums">
                            {previewError ? (
                                <span className="mr-auto text-[var(--tone-error-ink)]">
                                    {previewError}
                                </span>
                            ) : null}
                            <span className={typographyClassNames.mutedBody}>
                                Remaining
                            </span>
                            <MoneyAmount
                                cents={preview?.remainderCents ?? sampleTotalCents}
                            />
                        </div>
                    </section>

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
                            type="submit"
                            disabled={isSubmitting}
                            className={controlClassNames.primaryAction}
                        >
                            {isSubmitting ? "Saving..." : "Save template"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function TransactionTemplatesPanel() {
    const {
        executeWorkspaceCommand,
        snapshot,
    } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const [dialogState, setDialogState] = useState<DialogState | null>(null);
    const [deleteTemplate, setDeleteTemplate] =
        useState<WorkspaceTransactionTemplateRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const templateRows = useMemo(
        () =>
            [...(snapshot.transactionTemplates ?? [])].sort(
                (left, right) =>
                    left.name.localeCompare(right.name) ||
                    left.templateId.localeCompare(right.templateId),
            ),
        [snapshot.transactionTemplates],
    );
    const accountOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            snapshot.accounts.map((account) => ({
                label: account.name,
                value: account.accountId,
            })),
        [snapshot.accounts],
    );
    const categoryOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            buildGroupedCategoryComboboxOptions({
                categories: snapshot.budgetCategories.filter(
                    (category) =>
                        category.status === "active" &&
                        isUserVisibleBudgetCategory(category),
                ),
                getValue: (category) => category.categoryId,
                groups: snapshot.budgetGroups,
            }),
        [snapshot.budgetCategories, snapshot.budgetGroups],
    );
    const accountNameById = useMemo(
        () =>
            new Map(
                snapshot.accounts.map((account) => [
                    account.accountId,
                    account.name,
                ]),
            ),
        [snapshot.accounts],
    );

    async function closeDialogAfterSave() {
        setDialogState(null);
    }

    async function confirmDeleteTemplate() {
        if (!deleteTemplate) {
            return;
        }

        setIsDeleting(true);

        try {
            const templateToDelete = deleteTemplate;
            const optimisticChanges = [
                createOptimisticWorkspaceDelete({
                    entityId: templateToDelete.templateId,
                    entityType: "transactionTemplate",
                }),
            ];
            setDeleteTemplate(null);
            setIsDeleting(false);

            void executeWorkspaceCommand({
                activity: {
                    completedLabel: "Transaction template deleted.",
                    pendingLabel: "Deleting transaction template…",
                },
                optimisticChanges,
                request: () =>
                    fetch(
                        `/api/utilities/transaction-templates/${templateToDelete.templateId}`,
                        { method: "DELETE" },
                    ),
                onError: async (error) => {
                    notifyError({
                        message: `${error instanceof Response ? await parseApiErrorMessage(error, "Unable to delete transaction template.") : error instanceof Error ? error.message : "Unable to delete transaction template."} The latest saved data has been restored.`,
                        title: "Transaction template could not be deleted.",
                    });
                },
            });
        } catch (error) {
            notifyError({
                message: `${error instanceof Error ? error.message : "Unable to delete transaction template."} The latest saved data has been restored.`,
                title: "Transaction template could not be deleted.",
            });
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="grid gap-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className={typographyClassNames.eyebrow}>
                        Transaction entry
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Transaction templates
                    </h1>
                    <p className={`mt-3 max-w-3xl text-sm ${typographyClassNames.mutedBody}`}>
                        Define reusable split formulas for repeated purchases,
                        paychecks, and allocations across categories.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setDialogState({ mode: "create" })}
                    className={`${controlClassNames.primaryAction} inline-flex cursor-pointer items-center gap-2`}
                >
                    <FontAwesomeIcon aria-hidden icon={faPlus} />
                    Add template
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Payee</th>
                            <th className="px-4 py-3 font-medium">
                                Default account
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Default amount
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Splits
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {templateRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={6}
                                    className={`px-4 py-6 text-center text-sm ${typographyClassNames.mutedBody}`}
                                >
                                    No transaction templates defined.
                                </td>
                            </tr>
                        ) : (
                            templateRows.map((template) => {
                                const lineCount =
                                    parseTransactionTemplateLines(template)
                                        .length;

                                return (
                                    <tr
                                        key={template.templateId}
                                        className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                    >
                                        <td className="px-4 py-3 align-middle font-medium">
                                            {template.name}
                                        </td>
                                        <td className="px-4 py-3 align-middle">
                                            {template.payee || "-"}
                                        </td>
                                        <td className="px-4 py-3 align-middle">
                                            {template.accountId
                                                ? (accountNameById.get(
                                                      template.accountId,
                                                  ) ?? "Unknown account")
                                                : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-right align-middle tabular-nums">
                                            {template.defaultAmountCents ===
                                            undefined ? (
                                                "-"
                                            ) : (
                                                <MoneyAmount
                                                    cents={
                                                        template.defaultAmountCents
                                                    }
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right align-middle">
                                            {lineCount}
                                        </td>
                                        <td className="px-4 py-3 align-middle">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDialogState({
                                                            mode: "edit",
                                                            template,
                                                        })
                                                    }
                                                    className={controlClassNames.secondaryActionSmall}
                                                >
                                                    <FontAwesomeIcon
                                                        aria-hidden
                                                        icon={faPen}
                                                    />
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDeleteTemplate(
                                                            template,
                                                        )
                                                    }
                                                    className={controlClassNames.secondaryActionSmall}
                                                >
                                                    <FontAwesomeIcon
                                                        aria-hidden
                                                        icon={faTrashCan}
                                                    />
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <TransactionTemplateDialog
                key={
                    dialogState?.mode === "edit"
                        ? dialogState.template.templateId
                        : "create-template"
                }
                accountOptions={accountOptions}
                categoryOptions={categoryOptions}
                onClose={() => setDialogState(null)}
                onSaved={closeDialogAfterSave}
                state={dialogState}
            />
            <DeleteConfirmationDialog
                canConfirm
                confirmLabel="Delete template"
                isSubmitting={isDeleting}
                onClose={() => setDeleteTemplate(null)}
                onConfirm={() => void confirmDeleteTemplate()}
                open={deleteTemplate !== null}
                pendingLabel="Deleting..."
                title={
                    deleteTemplate
                        ? `Delete ${deleteTemplate.name}?`
                        : "Delete template?"
                }
                warningMessage="This template will be permanently deleted. Existing transactions that were created from it will not change."
            />
        </div>
    );
}
