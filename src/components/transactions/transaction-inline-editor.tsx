"use client";

import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import {
    faPlus,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { MoneyAmount } from "@/components/shared/money-amount";
import { MoneyExpressionInput } from "@/components/shared/money-expression-input";
import { TransactionAmountDirection } from "@/components/transactions/transaction-amount-direction";
import { TransactionTemplatePreviewPane } from "@/components/transactions/transaction-template-preview-pane";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { buildCurrentMonthCategoryBalanceOptions } from "@/features/budget/models/category-combobox-options";
import { createOptimisticTransactionChanges } from "@/features/transactions/models/optimistic-transaction";
import {
    toTransactionDateInputValue,
    toTransactionOccurredAt,
} from "@/features/transactions/models/transaction-date";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { parseUsdToCents } from "@/lib/formatting/money";
import {
    keyboardShortcuts,
    matchesKeyboardShortcut,
} from "@/lib/keyboard-shortcuts";
import { controlClassNames } from "@/lib/theme/theme-recipes";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";

import {
    buildCategoryAssignmentValue,
    buildAdjustmentAssignmentValue,
    buildFromAccountAssignmentValue,
    buildToAccountAssignmentValue,
    createEmptyLineDraft,
    createLineDraftsFromTransactionTemplate,
    createLineAssignmentPatch,
    buildTransactionTemplateAssignmentValue,
    getDefaultLineDrafts,
    getAdjustmentAssignmentValue,
    getDefaultSplitMode,
    ensureSplitLineDrafts,
    getEstimatedTransactionNetCents,
    getLineAssignmentValue,
    getPrimaryAccountId,
    getTransactionTemplateIdFromAssignmentValue,
    normalizeTransactionLineDrafts,
    resolveTransactionTemplatePreview,
    toUsdInput,
    uncategorizedAssignmentValue,
    type TransactionLineDraft,
} from "./transaction-line-editor-helpers";
import type { TransactionCategoryOption } from "./transaction-dialog";
import { TransactionMemoTextarea } from "./transaction-memo-textarea";
import {
    TransactionManagedMetadataReadonly,
} from "./transaction-memo-display";

export type InlineTransactionFocusField =
    | "amount"
    | "category"
    | "date"
    | "memo"
    | "payee";

type TransactionInlineEditorProps = {
    accountLabel?: string;
    accountContextId?: string;
    accounts: AccountWithBalance[];
    autoFocus?: boolean;
    categories: TransactionCategoryOption[];
    categoryBalanceById?: ReadonlyMap<string, number>;
    classificationPane?: (onEdit: () => void) => ReactNode;
    columnCount: number;
    initialFocus?: InlineTransactionFocusField;
    initialFocusLineId?: string;
    actionBarActions?: ReactNode;
    onCancel: () => void;
    onSaved: () => void;
    onSubmitted?: () => void;
    showAccountColumn: boolean;
    sourceCell: ReactNode;
    transaction: TransactionWithPostings;
};

type PendingTemplateApplication = {
    templateId: string;
    total: string;
};

type InlineNetTotalWarningProps = {
    currentNetCents: number;
    differenceCents: number;
    isAccepted: boolean;
    isLocked: boolean;
    onAccept: () => void;
    originalNetCents: number;
    title: string;
};

const splitTransactionAssignmentValue = "__inline_split_transaction__";
const emptyCategoryBalanceById = new Map<string, number>();
const inlineFieldClassName = `${controlClassNames.fieldCompact} h-9 w-full min-w-0 px-2 py-1 text-sm`;
const inlineAmountFieldClassName = `${inlineFieldClassName} text-right tabular-nums`;
const inlineMemoFieldClassName = `${controlClassNames.fieldCompact} w-full min-w-0 px-2 py-1.5 text-xs leading-4`;

function getInlineMemoFieldClassName(isMultiline: boolean) {
    return `${inlineMemoFieldClassName} ${
        isMultiline
            ? "h-14 resize-y overflow-y-scroll"
            : "h-9 resize-none overflow-y-hidden"
    }`;
}
const readOnlyParentRowClassName =
    "border-b border-[var(--color-border)]/70 bg-[var(--color-panel-strong)]/45";
const editableRowClassName =
    "border-b border-[var(--color-border)]/70 bg-[var(--color-panel-strong)]/55";
const splitEditableRowClassName =
    "border-b border-[var(--color-border)]/40 bg-[var(--color-panel-strong)]/35 text-xs";

function InlineNetTotalWarning({
    currentNetCents,
    differenceCents,
    isAccepted,
    isLocked,
    onAccept,
    originalNetCents,
    title,
}: InlineNetTotalWarningProps) {
    return (
        <div
            aria-live="polite"
            className="grid gap-3 border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] p-3 text-sm text-[var(--tone-warning-ink)]"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="font-semibold">{title}</div>
                    <p className="mt-1 text-xs leading-5 text-[var(--tone-warning-ink)]">
                        {isLocked
                            ? "Locked transactions must keep their original total."
                            : "Accept the difference to save this transaction with a changed total."}
                    </p>
                </div>
                {!isLocked ? (
                    <button
                        type="button"
                        onClick={onAccept}
                        disabled={isAccepted}
                        className={controlClassNames.secondaryActionSmall}
                    >
                        {isAccepted ? "Difference accepted" : "Accept difference"}
                    </button>
                ) : null}
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                    <dt className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        Original
                    </dt>
                    <dd className="mt-1 font-semibold">
                        <MoneyAmount cents={originalNetCents} />
                    </dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        Current
                    </dt>
                    <dd className="mt-1 font-semibold">
                        <MoneyAmount cents={currentNetCents} />
                    </dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                        Difference
                    </dt>
                    <dd className="mt-1 font-semibold">
                        <MoneyAmount cents={differenceCents} />
                    </dd>
                </div>
            </dl>
        </div>
    );
}

function getLineContributionCents(input: {
    line: TransactionLineDraft;
    selectedAccountId: string;
    transactionKind: TransactionWithPostings["kind"];
}) {
    return getEstimatedTransactionNetCents({
        lines: [input.line],
        selectedAccountId: input.selectedAccountId,
        transactionKind: input.transactionKind,
    });
}

function toAmountInputForContribution(input: {
    contributionCents: number;
    line: TransactionLineDraft;
    selectedAccountId: string;
}) {
    const { contributionCents, line, selectedAccountId } = input;

    if (
        line.toAccountId === selectedAccountId ||
        (line.toAccountId && !line.fromAccountId)
    ) {
        return toUsdInput(Math.abs(contributionCents));
    }

    if (
        line.fromAccountId === selectedAccountId ||
        (line.fromAccountId && !line.toAccountId)
    ) {
        return toUsdInput(-Math.abs(contributionCents));
    }

    return toUsdInput(contributionCents);
}

function isButtonLikeKeyTarget(target: EventTarget | null) {
    return (
        target instanceof Element &&
        target.closest('button, [role="button"]') !== null
    );
}

function transactionLineDraftsEqual(
    left: TransactionLineDraft[],
    right: TransactionLineDraft[],
) {
    return (
        left.length === right.length &&
        left.every((leftLine, index) => {
            const rightLine = right[index];

            return (
                rightLine &&
                leftLine.amount === rightLine.amount &&
                leftLine.categoryId === rightLine.categoryId &&
                leftLine.fromAccountId === rightLine.fromAccountId &&
                leftLine.id === rightLine.id &&
                leftLine.memo === rightLine.memo &&
                leftLine.payee === rightLine.payee &&
                leftLine.toAccountId === rightLine.toAccountId
            );
        })
    );
}

export function TransactionInlineEditor({
    actionBarActions,
    accountLabel,
    accountContextId,
    accounts,
    autoFocus = true,
    categories,
    categoryBalanceById = emptyCategoryBalanceById,
    classificationPane,
    columnCount,
    initialFocus = "category",
    initialFocusLineId,
    onCancel,
    onSaved,
    onSubmitted,
    showAccountColumn,
    sourceCell,
    transaction,
}: TransactionInlineEditorProps) {
    const { executeWorkspaceCommand, snapshot } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const selectedAccountId = accountContextId ?? transaction.referenceAccountId;
    const [initialDraft] = useState(() => ({
        dateValue: toTransactionDateInputValue(transaction.occurredAt),
        lines: getDefaultLineDrafts(transaction, selectedAccountId),
        parentMemo: transaction.memo ?? "",
        parentPayee: transaction.payee ?? "",
        splitMode: getDefaultSplitMode(transaction),
    }));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dateValue, setDateValue] = useState(initialDraft.dateValue);
    const [lines, setLines] = useState(initialDraft.lines);
    const [parentPayee, setParentPayee] = useState(initialDraft.parentPayee);
    const [parentMemo, setParentMemo] = useState(initialDraft.parentMemo);
    const [isSplitMode, setIsSplitMode] = useState(initialDraft.splitMode);
    const [hasSplitModeBeenActivated, setHasSplitModeBeenActivated] = useState(
        initialDraft.splitMode,
    );
    const [pendingTemplateApplication, setPendingTemplateApplication] =
        useState<PendingTemplateApplication | null>(null);
    const [
        shouldFocusSaveAfterTemplateApplication,
        setShouldFocusSaveAfterTemplateApplication,
    ] = useState(false);
    const [showNetTotalWarning, setShowNetTotalWarning] = useState(false);
    const [acceptedTotalDifferenceCents, setAcceptedTotalDifferenceCents] =
        useState<number | null>(null);
    const [categoryFocusRequest, setCategoryFocusRequest] = useState(0);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const payeeInputRef = useRef<HTMLInputElement>(null);
    const firstCategoryInputRef = useRef<HTMLInputElement>(null);
    const memoInputRef = useRef<HTMLTextAreaElement>(null);
    const amountInputRef = useRef<HTMLInputElement>(null);
    const templateTotalInputRef = useRef<HTMLInputElement>(null);
    const saveChangesButtonRef = useRef<HTMLButtonElement>(null);
    const focusFirstCategoryInput = useCallback(() => {
        setCategoryFocusRequest((request) => request + 1);
    }, []);
    const [transactionKind, setTransactionKind] = useState(transaction.kind);
    const isLocked = transaction.status === "reconciled";
    const activeAccounts = accounts;
    const selectedAccount =
        activeAccounts.find((account) => account.accountId === selectedAccountId) ??
        null;
    const activeCategories = useMemo(
        () => categories.filter((category) => category.status === "active"),
        [categories],
    );
    const activeCategoryOptions = useMemo(
        () =>
            buildCurrentMonthCategoryBalanceOptions({
                balanceByCategoryId: categoryBalanceById,
                categories: activeCategories,
                getValue: (category) =>
                    buildCategoryAssignmentValue(category.categoryId),
                groups: snapshot.budgetGroups,
            }),
        [activeCategories, categoryBalanceById, snapshot.budgetGroups],
    );
    const lineAssignmentOptions = useMemo<ComboboxSelectOption[]>(() => {
        const transferAccounts = activeAccounts.filter(
            (account) => account.accountId !== selectedAccountId,
        );
        const toAccountOptions = transferAccounts.map((account) => ({
            disabled: !selectedAccount,
            group: "To accounts",
            label: `To: ${account.name}`,
            value: buildToAccountAssignmentValue(account.accountId),
        }));
        const fromAccountOptions = transferAccounts.map((account) => ({
            disabled: !selectedAccount,
            group: "From accounts",
            label: `From: ${account.name}`,
            value: buildFromAccountAssignmentValue(account.accountId),
        }));
        const accountTransferOptions = [...toAccountOptions, ...fromAccountOptions];
        const adjustmentOptions = selectedAccount
            ? [
                    {
                        disabled: isLocked,
                        group: "Adjustment",
                        label: `To: ${selectedAccount.name}`,
                        value: buildAdjustmentAssignmentValue(
                            buildToAccountAssignmentValue(selectedAccount.accountId),
                        ),
                    },
                    {
                        disabled: isLocked,
                        group: "Adjustment",
                        label: `From: ${selectedAccount.name}`,
                        value: buildAdjustmentAssignmentValue(
                            buildFromAccountAssignmentValue(
                                selectedAccount.accountId,
                            ),
                        ),
                    },
                ]
            : [];

        if (isLocked) {
            return [
                {
                    group: "Categories",
                    label: "Uncategorized",
                    value: uncategorizedAssignmentValue,
                },
                ...activeCategoryOptions,
            ];
        }

        return [
            {
                group: "Categories",
                label: "Uncategorized",
                value: uncategorizedAssignmentValue,
            },
            ...activeCategoryOptions,
            ...accountTransferOptions,
            ...adjustmentOptions,
        ];
    }, [
        activeAccounts,
        activeCategoryOptions,
        selectedAccount,
        selectedAccountId,
        isLocked,
    ]);
    const singleLineAssignmentOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            transactionKind === "standard"
                ? [
                        ...lineAssignmentOptions,
                        ...(!isLocked
                            ? [...(snapshot.transactionTemplates ?? [])]
                                  .sort(
                                      (left, right) =>
                                          left.name.localeCompare(right.name) ||
                                          left.templateId.localeCompare(
                                              right.templateId,
                                          ),
                                  )
                                  .map((template) => ({
                                      description: template.payee ?? undefined,
                                      group: "Templates",
                                      label: template.name,
                                      value: buildTransactionTemplateAssignmentValue(
                                          template.templateId,
                                      ),
                                  }))
                            : []),
                        {
                            group: "Transaction",
                            label: "Split Transaction",
                            value: splitTransactionAssignmentValue,
                        },
                    ]
                : lineAssignmentOptions,
        [
            isLocked,
            lineAssignmentOptions,
            snapshot.transactionTemplates,
            transactionKind,
        ],
    );
    const templateById = useMemo(
        () =>
            new Map(
                (snapshot.transactionTemplates ?? []).map((template) => [
                    template.templateId,
                    template,
                ]),
            ),
        [snapshot.transactionTemplates],
    );
    const categoryNameById = useMemo(
        () =>
            new Map(
                categories.map((category) => [category.categoryId, category.name]),
            ),
        [categories],
    );
    const pendingTemplateId = pendingTemplateApplication?.templateId ?? null;
    const pendingTemplate = pendingTemplateId
        ? (templateById.get(pendingTemplateId) ?? null)
        : null;
    const isTemplatePaneActive = Boolean(pendingTemplateApplication);
    const pendingTemplatePreview = useMemo(() => {
        if (!pendingTemplateApplication) {
            return { errorMessage: null, lines: null };
        }

        if (!pendingTemplate) {
            return {
                errorMessage:
                    "The selected transaction template is no longer available.",
                lines: null,
            };
        }

        const total = pendingTemplateApplication.total.trim();

        if (!total) {
            return { errorMessage: null, lines: null };
        }

        try {
            const totalCents = parseUsdToCents(total);

            if (totalCents === 0) {
                throw new Error("Enter a non-zero template total.");
            }

            return {
                errorMessage: null,
                lines: resolveTransactionTemplatePreview({
                    template: pendingTemplate,
                    totalCents,
                }),
            };
        } catch (error) {
            return {
                errorMessage:
                    error instanceof Error
                        ? error.message
                        : "Unable to preview transaction template.",
                lines: null,
            };
        }
    }, [pendingTemplate, pendingTemplateApplication]);
    const activeLines = isSplitMode ? lines : lines.slice(0, 1);
    const estimatedNetCents = getEstimatedTransactionNetCents({
        lines: activeLines,
        selectedAccountId,
        transactionKind,
    });
    const originalNetAmountCents = transaction.displayAmountCents;
    const netTotalDifferenceCents = estimatedNetCents - originalNetAmountCents;
    const isManualTransactionEdit = (transaction.source ?? "manual") === "manual";
    const suppressesManualUnsplitWarning =
        isManualTransactionEdit && !hasSplitModeBeenActivated;
    const hasNetTotalMismatch =
        netTotalDifferenceCents !== 0 && !suppressesManualUnsplitWarning;
    const isNetTotalDifferenceAccepted =
        hasNetTotalMismatch &&
        acceptedTotalDifferenceCents === netTotalDifferenceCents;
    const requiresLockedNetTotalMatch = isLocked && hasNetTotalMismatch;
    const requiresNetTotalAcceptance =
        !isLocked && hasNetTotalMismatch && !isNetTotalDifferenceAccepted;
    const netTotalWarningTitle = hasSplitModeBeenActivated
        ? "Split total changed"
        : "Transaction total changed";
    const hasDraftChanges =
        dateValue !== initialDraft.dateValue ||
        isSplitMode !== initialDraft.splitMode ||
        parentMemo !== initialDraft.parentMemo ||
        parentPayee !== initialDraft.parentPayee ||
        !transactionLineDraftsEqual(lines, initialDraft.lines);

    const cancelFromEscape = useCallback(() => {
        if (hasDraftChanges) {
            return;
        }

        onCancel();
    }, [hasDraftChanges, onCancel]);

    useEffect(() => {
        if (!autoFocus) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            if (initialFocus === "date") {
                dateInputRef.current?.focus();
                dateInputRef.current?.select();
                return;
            }

            if (initialFocus === "payee") {
                payeeInputRef.current?.focus();
                payeeInputRef.current?.select();
                return;
            }

            if (initialFocus === "memo") {
                memoInputRef.current?.focus();
                memoInputRef.current?.select();
                return;
            }

            if (initialFocus === "amount") {
                amountInputRef.current?.focus();
                amountInputRef.current?.select();
                return;
            }

            firstCategoryInputRef.current?.focus();
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [autoFocus, initialFocus, initialFocusLineId]);

    useEffect(() => {
        if (categoryFocusRequest === 0) {
            return;
        }

        firstCategoryInputRef.current?.focus();
        firstCategoryInputRef.current?.select();
    }, [categoryFocusRequest]);

    useEffect(() => {
        function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
            if (event.key !== "Escape" || event.defaultPrevented || isSubmitting) {
                return;
            }

            if (
                event.target instanceof Element &&
                event.target.closest("[data-inline-transaction-editor]")
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            cancelFromEscape();
        }

        document.addEventListener("keydown", handleDocumentKeyDown);

        return () => {
            document.removeEventListener("keydown", handleDocumentKeyDown);
        };
    }, [cancelFromEscape, isSubmitting]);

    useEffect(() => {
        if (!pendingTemplateId) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            templateTotalInputRef.current?.focus();
            templateTotalInputRef.current?.select();
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [pendingTemplateId]);

    function resetDifferenceAcceptance() {
        setAcceptedTotalDifferenceCents(null);
        setShowNetTotalWarning(false);
    }

    function patchCanChangeNetTotal(patch: Partial<TransactionLineDraft>) {
        return (
            "amount" in patch || "fromAccountId" in patch || "toAccountId" in patch
        );
    }

    function updateLine(lineId: string, patch: Partial<TransactionLineDraft>) {
        if (patchCanChangeNetTotal(patch)) {
            resetDifferenceAcceptance();
        }

        setLines((currentLines) =>
            currentLines.map((line) =>
                line.id === lineId ? { ...line, ...patch } : line,
            ),
        );
    }

    function startSplitMode() {
        resetDifferenceAcceptance();
        setHasSplitModeBeenActivated(true);
        setParentPayee((current) =>
            current.trim() ? current : (lines[0]?.payee ?? transaction.payee ?? ""),
        );
        setParentMemo((current) =>
            current.trim() ? current : (lines[0]?.memo ?? transaction.memo ?? ""),
        );
        setLines((currentLines) =>
            isLocked
                ? ensureSplitLineDrafts(currentLines)
                : [createEmptyLineDraft(0), createEmptyLineDraft(1)],
        );
        setIsSplitMode(true);
    }

    function handleStartInlineSplitShortcut(event: KeyboardEvent<HTMLElement>) {
        if (
            !matchesKeyboardShortcut(
                event,
                keyboardShortcuts.transactions.startInlineSplit,
            )
        ) {
            return false;
        }

        if (isSplitMode || transactionKind !== "standard") {
            return false;
        }

        event.preventDefault();
        event.stopPropagation();
        startSplitMode();
        return true;
    }

    function addSplitLine() {
        resetDifferenceAcceptance();
        setLines((currentLines) => [
            ...currentLines,
            createEmptyLineDraft(currentLines.length),
        ]);
    }

    function updateLineAssignment(lineId: string, value: string) {
        const templateId = getTransactionTemplateIdFromAssignmentValue(value);

        if (templateId) {
            if (transactionKind !== "standard") {
                selectTransactionKind("standard");
            }
            selectTemplate(templateId);
            return;
        }

        if (value === splitTransactionAssignmentValue) {
            startSplitMode();
            return;
        }

        const line = lines.find((candidate) => candidate.id === lineId);

        if (line && value === getComboboxAssignmentValue(line)) {
            return;
        }

        const adjustmentValue = getAdjustmentAssignmentValue(value);
        const nextKind = adjustmentValue ? "adjustment" : "standard";

        if (nextKind !== transactionKind) {
            selectTransactionKind(nextKind);
        }

        updateLine(
            lineId,
            createLineAssignmentPatch({
                selectedAccountId,
                transactionKind: nextKind,
                value: adjustmentValue ?? value,
            }),
        );
    }

    function selectTransactionKind(nextKind: TransactionWithPostings["kind"]) {
        setTransactionKind(nextKind);
        setPendingTemplateApplication(null);

        if (nextKind === "adjustment") {
            setLines((currentLines) =>
                currentLines.map((line) => ({
                    ...line,
                    categoryId: "",
                    toAccountId:
                        line.fromAccountId && line.toAccountId
                            ? ""
                            : line.toAccountId,
                })),
            );
        }
    }

    function getComboboxAssignmentValue(line: TransactionLineDraft) {
        const value = getLineAssignmentValue({
            line,
            selectedAccountId,
            transactionKind,
        });

        return transactionKind === "adjustment" && value
            ? buildAdjustmentAssignmentValue(value)
            : value;
    }

    function getTemplateApplicationInitialTotal(templateId: string) {
        const template = templateById.get(templateId);

        if (!template) {
            throw new Error(
                "The selected transaction template is no longer available.",
            );
        }

        const draftAmount = lines[0]?.amount.trim() ?? "";

        if (draftAmount) {
            return draftAmount;
        }

        if (transaction.displayAmountCents !== 0) {
            return toUsdInput(transaction.displayAmountCents);
        }

        if (template.defaultAmountCents) {
            return toUsdInput(template.defaultAmountCents);
        }

        return "";
    }

    function applyTemplate(templateId: string, totalCents: number) {
        const template = templateById.get(templateId);

        if (!template) {
            throw new Error(
                "The selected transaction template is no longer available.",
            );
        }

        if (totalCents === 0) {
            throw new Error("Enter a non-zero template total.");
        }

        resetDifferenceAcceptance();
        setHasSplitModeBeenActivated(true);
        setParentPayee((current) =>
            current.trim() ? current : (template.payee ?? ""),
        );
        setParentMemo((current) =>
            current.trim() ? current : (template.memo ?? ""),
        );
        setLines(
            createLineDraftsFromTransactionTemplate({
                template,
                totalCents,
            }),
        );
        setIsSplitMode(true);
        setPendingTemplateApplication(null);
        setShouldFocusSaveAfterTemplateApplication(true);
    }

    function selectTemplate(templateId: string) {
        try {
            setPendingTemplateApplication({
                templateId,
                total: getTemplateApplicationInitialTotal(templateId),
            });
        } catch (error) {
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to apply transaction template.",
                title: "Template could not be applied.",
            });
        }
    }

    function confirmPendingTemplateApplication() {
        if (!pendingTemplateApplication) {
            return;
        }

        try {
            applyTemplate(
                pendingTemplateApplication.templateId,
                parseUsdToCents(pendingTemplateApplication.total),
            );
        } catch (error) {
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to apply transaction template.",
                title: "Template could not be applied.",
            });
        }
    }

    function fillLineDifference(lineId: string) {
        if (!isSplitMode) {
            return;
        }

        resetDifferenceAcceptance();
        setLines((currentLines) => {
            const line = currentLines.find((candidate) => candidate.id === lineId);

            if (!line) {
                return currentLines;
            }

            const currentNetCents = getEstimatedTransactionNetCents({
                lines: currentLines,
                selectedAccountId,
                transactionKind,
            });
            const currentLineContributionCents = getLineContributionCents({
                line,
                selectedAccountId,
                transactionKind,
            });
            const nextContributionCents =
                currentLineContributionCents +
                (originalNetAmountCents - currentNetCents);
            const nextAmount = toAmountInputForContribution({
                contributionCents: nextContributionCents,
                line,
                selectedAccountId,
            });

            return currentLines.map((candidate) =>
                candidate.id === lineId
                    ? { ...candidate, amount: nextAmount }
                    : candidate,
            );
        });
    }

    async function submitInlineEdit() {
        if (isSubmitting || isTemplatePaneActive) {
            return;
        }

        const linesToSubmit = isSplitMode ? lines : lines.slice(0, 1);

        if (isSplitMode && linesToSubmit.length < 2) {
            notifyError({
                message:
                    "Split transactions require at least two lines. The last saved transaction data is unchanged.",
                title: "Transaction could not be saved.",
            });
            return;
        }

        if (requiresLockedNetTotalMatch || requiresNetTotalAcceptance) {
            setShowNetTotalWarning(true);
            return;
        }

        setIsSubmitting(true);

        try {
            const normalizedLines = normalizeTransactionLineDrafts({
                lines: linesToSubmit,
                selectedAccountId,
                transactionKind,
            });
            const primaryAccountId = getPrimaryAccountId({
                normalizedLines,
                selectedAccountId,
            });

            if (!primaryAccountId) {
                throw new Error("Select a primary account for this transaction.");
            }

            const singleLine = linesToSubmit[0];
            const payload = {
                accountId: primaryAccountId,
                kind: transactionKind,
                lines: normalizedLines,
                occurredAt: toTransactionOccurredAt(dateValue),
                payee: isSplitMode ? parentPayee : (singleLine?.payee ?? ""),
                memo: isSplitMode ? parentMemo : (singleLine?.memo ?? ""),
                mutationId: createWorkspaceMutationId(),
            };
            const changes = createOptimisticTransactionChanges({
                accounts,
                categories,
                input: payload,
                transaction,
            });

            onSubmitted?.();
            setIsSubmitting(false);
            void executeWorkspaceCommand({
                activity: {
                    completedLabel: "Transaction saved.",
                    pendingLabel: "Saving transaction…",
                },
                optimisticChanges: changes,
                request: () =>
                    fetch(`/api/transactions/${transaction.transactionId}`, {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(payload),
                    }),
                onError: async (error) => {
                    notifyError({
                        message: `${error instanceof Response ? await parseApiErrorMessage(error, "Unable to save transaction.") : error instanceof Error ? error.message : "Unable to save transaction."} Save failed. The latest saved data has been restored.`,
                        title: "Transaction could not be saved.",
                    });
                },
                onCommitted: onSaved,
            });
        } catch (submitError) {
            notifyError({
                message: `${submitError instanceof Error ? submitError.message : "Unable to save transaction."} The last saved transaction data is unchanged. Review the row and try again.`,
                title: "Transaction could not be saved.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleEditorKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (isSubmitting) {
            return;
        }

        if (handleStartInlineSplitShortcut(event)) {
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelFromEscape();
            return;
        }

        if (
            matchesKeyboardShortcut(
                event,
                keyboardShortcuts.transactions.saveMemo,
            ) &&
            event.target instanceof HTMLTextAreaElement
        ) {
            event.preventDefault();
            event.stopPropagation();
            void submitInlineEdit();
            return;
        }

        if (event.key === "Enter") {
            if (
                isButtonLikeKeyTarget(event.target) ||
                event.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            void submitInlineEdit();
        }
    }

    function handleSplitLineFieldKeyDown(
        event: KeyboardEvent<HTMLElement>,
        lineId: string,
    ) {
        if (!isSplitMode) {
            return;
        }

        if (
            matchesKeyboardShortcut(
                event,
                keyboardShortcuts.transactions.fillSplitDifference,
            )
        ) {
            event.preventDefault();
            event.stopPropagation();
            fillLineDifference(lineId);
        }
    }

    function handleCategoryInputKeyDown(
        event: KeyboardEvent<HTMLInputElement>,
        lineId: string,
    ) {
        handleSplitLineFieldKeyDown(event, lineId);

        if (event.defaultPrevented || event.key !== "Tab" || event.shiftKey) {
            return;
        }

        const memoInput = event.currentTarget
            .closest("tr")
            ?.querySelector<HTMLTextAreaElement>("textarea");

        if (!memoInput || memoInput.disabled) {
            return;
        }

        event.preventDefault();
        memoInput.focus();
    }

    function renderDateInput() {
        return (
            <label className="block min-w-0">
                <span className="sr-only">Date</span>
                <input
                    ref={dateInputRef}
                    required
                    disabled={isTemplatePaneActive}
                    type="date"
                    value={dateValue}
                    onChange={(event) => setDateValue(event.target.value)}
                    className={inlineFieldClassName}
                />
            </label>
        );
    }

    function renderPayeeInput(
        line: TransactionLineDraft,
        inputRef?: typeof payeeInputRef,
    ) {
        return (
            <label className="block min-w-0">
                <span className="sr-only">Payee</span>
                <input
                    ref={inputRef}
                    disabled={isTemplatePaneActive}
                    value={line.payee}
                    onChange={(event) =>
                        updateLine(line.id, { payee: event.target.value })
                    }
                    onKeyDown={(event) =>
                        handleSplitLineFieldKeyDown(event, line.id)
                    }
                    className={inlineFieldClassName}
                />
            </label>
        );
    }

    function renderParentPayeeInput() {
        return (
            <label className="block min-w-0">
                <span className="sr-only">Transaction payee</span>
                <input
                    ref={!initialFocusLineId ? payeeInputRef : undefined}
                    disabled={isTemplatePaneActive}
                    value={parentPayee}
                    onChange={(event) => setParentPayee(event.target.value)}
                    className={inlineFieldClassName}
                />
            </label>
        );
    }

    function renderCategoryInput(
        line: TransactionLineDraft,
        options: ComboboxSelectOption[],
        inputRef?: typeof firstCategoryInputRef,
        valueOverride?: string,
    ) {
        return (
            <ComboboxSelect
                disabled={
                    isTemplatePaneActive ||
                    (isLocked && Boolean(line.fromAccountId && line.toAccountId))
                }
                hideLabel
                inputClassName="h-9 px-2 py-1 text-sm"
                inputRef={inputRef}
                label="Category"
                labelClassName="min-w-0 w-full"
                menuClassName="min-w-[18rem]"
                noResultsLabel="No categories or accounts found"
                onChange={(value) => updateLineAssignment(line.id, value)}
                onKeyDown={(event) => handleCategoryInputKeyDown(event, line.id)}
                options={options}
                placeholder={
                    transactionKind === "adjustment"
                        ? "Select adjustment direction"
                        : "Select category or transfer"
                }
                value={
                    valueOverride ??
                    getComboboxAssignmentValue(line)
                }
            />
        );
    }

    function renderMemoInput(
        line: TransactionLineDraft,
        inputRef?: typeof memoInputRef,
        showManagedMetadata = false,
    ) {
        return (
            <div className="block min-w-0">
                <label className="block min-w-0">
                    <span className="sr-only">Memo</span>
                    <TransactionMemoTextarea
                        textareaRef={inputRef}
                        disabled={isTemplatePaneActive}
                        value={line.memo}
                        onChange={(event) =>
                            updateLine(line.id, { memo: event.target.value })
                        }
                        onKeyDown={(event) =>
                            handleSplitLineFieldKeyDown(event, line.id)
                        }
                        className={getInlineMemoFieldClassName}
                    />
                </label>
                {showManagedMetadata ? (
                    <TransactionManagedMetadataReadonly
                        showLabel={false}
                        transaction={transaction}
                    />
                ) : null}
            </div>
        );
    }

    function renderParentMemoInput() {
        return (
            <div className="block min-w-0">
                <label className="block min-w-0">
                    <span className="sr-only">Transaction memo</span>
                    <TransactionMemoTextarea
                        textareaRef={!initialFocusLineId ? memoInputRef : undefined}
                        disabled={isTemplatePaneActive}
                        value={parentMemo}
                        onChange={(event) => setParentMemo(event.target.value)}
                        className={getInlineMemoFieldClassName}
                    />
                </label>
                <TransactionManagedMetadataReadonly
                    showLabel={false}
                    transaction={transaction}
                />
            </div>
        );
    }

    function renderAmountInput(
        line: TransactionLineDraft,
        inputRef?: typeof amountInputRef,
    ) {
        return (
            <div className="block min-w-0">
                <span className="sr-only">Amount</span>
                <MoneyExpressionInput
                    aria-label="Amount"
                    ref={inputRef}
                    disabled={isTemplatePaneActive || (isLocked && !isSplitMode)}
                    value={line.amount}
                    onChange={(event) =>
                        updateLine(line.id, { amount: event.target.value })
                    }
                    onKeyDown={(event) =>
                        handleSplitLineFieldKeyDown(event, line.id)
                    }
                    className={inlineAmountFieldClassName}
                />
                <TransactionAmountDirection value={line.amount} />
            </div>
        );
    }

    function shouldAttachSplitFocusRef(
        line: TransactionLineDraft,
        index: number,
    ) {
        if (initialFocusLineId) {
            return line.id === initialFocusLineId;
        }

        if (initialFocus === "payee" || initialFocus === "memo") {
            return false;
        }

        return index === 0;
    }

    const firstLine = lines[0];
    const actionButtonsDisabled =
        isSubmitting ||
        isTemplatePaneActive ||
        toTransactionDateInputValue(dateValue) === "" ||
        activeLines.length === 0 ||
        (isSplitMode && activeLines.length < 2) ||
        requiresLockedNetTotalMatch ||
        (showNetTotalWarning && requiresNetTotalAcceptance);

    useEffect(() => {
        if (!shouldFocusSaveAfterTemplateApplication || actionButtonsDisabled) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            saveChangesButtonRef.current?.focus();
            setShouldFocusSaveAfterTemplateApplication(false);
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [actionButtonsDisabled, shouldFocusSaveAfterTemplateApplication]);

    return (
        <Fragment>
            {isSplitMode ? (
                <tr
                    aria-selected="false"
                    className={readOnlyParentRowClassName}
                    data-inline-transaction-editor=""
                    onKeyDown={handleEditorKeyDown}
                >
                    <td className="px-2 py-1.5" aria-hidden="true" />
                    <td className="px-4 py-1.5 align-top">{renderDateInput()}</td>
                    {showAccountColumn ? (
                        <td className="px-4 py-1.5 align-top">{accountLabel}</td>
                    ) : null}
                    <td className="px-4 py-1.5 align-top">{renderParentPayeeInput()}</td>
                    <td className="px-4 py-1.5 align-top font-medium text-[var(--color-accent-contrast)]">
                        Split Transaction
                    </td>
                    <td className="px-4 py-1.5 align-top text-[var(--color-muted)]">
                        {renderParentMemoInput()}
                    </td>
                    <td className="px-4 py-1.5 text-right align-top font-medium">
                        <MoneyAmount cents={originalNetAmountCents} />
                    </td>
                    <td className="px-2 py-1.5 text-center align-top">{sourceCell}</td>
                </tr>
            ) : firstLine ? (
                <tr
                    aria-selected="false"
                    className={`${editableRowClassName} transition ${
                        isTemplatePaneActive ? "opacity-60" : ""
                    }`}
                    data-inline-transaction-editor=""
                    onKeyDown={handleEditorKeyDown}
                >
                    <td className="px-2 py-1.5" aria-hidden="true" />
                    <td className="px-4 py-1.5 align-top">{renderDateInput()}</td>
                    {showAccountColumn ? (
                        <td className="px-4 py-1.5 align-top">{accountLabel}</td>
                    ) : null}
                    <td className="px-4 py-1.5 align-top">
                        {renderPayeeInput(firstLine, payeeInputRef)}
                    </td>
                    <td className="px-4 py-1.5 align-top">
                        {renderCategoryInput(
                            firstLine,
                            singleLineAssignmentOptions,
                            firstCategoryInputRef,
                            pendingTemplateApplication
                                ? buildTransactionTemplateAssignmentValue(
                                        pendingTemplateApplication.templateId,
                                    )
                                : undefined,
                        )}
                    </td>
                    <td className="px-4 py-1.5 align-top">
                        {renderMemoInput(firstLine, memoInputRef, true)}
                    </td>
                    <td className="px-4 py-1.5 text-right align-top">
                        {renderAmountInput(firstLine, amountInputRef)}
                    </td>
                    <td className="px-2 py-1.5 text-center align-top">{sourceCell}</td>
                </tr>
            ) : null}

            {isSplitMode
                ? lines.map((line, lineIndex) => (
                        <tr
                            key={line.id}
                            aria-selected="false"
                            className={splitEditableRowClassName}
                            data-inline-transaction-editor=""
                            onKeyDown={handleEditorKeyDown}
                        >
                            <td className="px-2 py-2" aria-hidden="true" />
                            <td className="px-4 py-2" aria-hidden="true" />
                            {showAccountColumn ? (
                                <td className="px-4 py-2" aria-hidden="true" />
                            ) : null}
                            <td className="px-4 py-2 align-top">
                                {renderPayeeInput(
                                    line,
                                    shouldAttachSplitFocusRef(line, lineIndex)
                                        ? payeeInputRef
                                        : undefined,
                                )}
                            </td>
                            <td className="px-4 py-2 align-top">
                                {renderCategoryInput(
                                    line,
                                    lineAssignmentOptions,
                                    shouldAttachSplitFocusRef(line, lineIndex)
                                        ? firstCategoryInputRef
                                        : undefined,
                                )}
                            </td>
                            <td className="px-4 py-2 align-top">
                                {renderMemoInput(
                                    line,
                                    shouldAttachSplitFocusRef(line, lineIndex)
                                        ? memoInputRef
                                        : undefined,
                                )}
                            </td>
                            <td className="px-4 py-2 text-right align-top">
                                {renderAmountInput(
                                    line,
                                    shouldAttachSplitFocusRef(line, lineIndex)
                                        ? amountInputRef
                                        : undefined,
                                )}
                            </td>
                            <td className="px-2 py-2" aria-hidden="true" />
                        </tr>
                    ))
                : null}

            {pendingTemplateApplication ? (
                <tr data-inline-transaction-editor="" onKeyDown={handleEditorKeyDown}>
                    <td
                        colSpan={columnCount}
                        className="border-b border-[var(--color-border)] bg-[var(--color-panel-strong)]/45 px-4 py-2"
                    >
                        <TransactionTemplatePreviewPane
                            categoryNameById={categoryNameById}
                            errorMessage={pendingTemplatePreview.errorMessage}
                            inputRef={templateTotalInputRef}
                            isApplyDisabled={!pendingTemplatePreview.lines?.length}
                            onApply={confirmPendingTemplateApplication}
                            onCancel={() => setPendingTemplateApplication(null)}
                            onTotalChange={(total) =>
                                setPendingTemplateApplication((current) =>
                                    current ? { ...current, total } : current,
                                )
                            }
                            previewLines={pendingTemplatePreview.lines}
                            size="compact"
                            templateName={pendingTemplate?.name ?? "Selected template"}
                            total={pendingTemplateApplication.total}
                        />
                    </td>
                </tr>
            ) : null}

            {(showNetTotalWarning || requiresLockedNetTotalMatch) &&
            hasNetTotalMismatch ? (
                <tr data-inline-transaction-editor="" onKeyDown={handleEditorKeyDown}>
                    <td
                        colSpan={columnCount}
                        className="border-b border-[var(--color-border)] bg-[var(--color-panel-strong)]/45 px-4 py-3"
                    >
                        <InlineNetTotalWarning
                            currentNetCents={estimatedNetCents}
                            differenceCents={netTotalDifferenceCents}
                            isAccepted={isNetTotalDifferenceAccepted}
                            isLocked={isLocked}
                            onAccept={() =>
                                setAcceptedTotalDifferenceCents(netTotalDifferenceCents)
                            }
                            originalNetCents={originalNetAmountCents}
                            title={netTotalWarningTitle}
                        />
                    </td>
                </tr>
            ) : null}

            {classificationPane ? (
                <tr data-inline-transaction-editor="" onKeyDown={handleEditorKeyDown}>
                    <td
                        colSpan={columnCount}
                        className="border-b border-[var(--color-border)] bg-[var(--color-panel-strong)]/45 px-4 py-3"
                    >
                        {classificationPane(focusFirstCategoryInput)}
                    </td>
                </tr>
            ) : null}

            {isSplitMode ? (
                <tr
                    className="border-b border-[var(--color-border)]/40 bg-[var(--color-panel-strong)]/45 text-sm"
                    data-inline-transaction-editor=""
                    onKeyDown={handleEditorKeyDown}
                >
                    <td
                        className="px-4 py-2 align-middle"
                        colSpan={showAccountColumn ? 6 : 5}
                    >
                        <button
                            type="button"
                            onClick={addSplitLine}
                            disabled={isSubmitting}
                            className="inline-flex cursor-pointer items-center gap-2 font-medium text-[var(--color-ink)] transition hover:text-[var(--color-accent-contrast)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={faPlus}
                                className="h-3.5 w-3.5"
                            />
                            Add split
                        </button>
                    </td>
                    <td className="px-4 py-2 text-right align-middle font-semibold tabular-nums">
                        <span className="inline-flex items-center justify-end gap-2">
                            {hasNetTotalMismatch ? (
                                <FontAwesomeIcon
                                    aria-label="Split total mismatch"
                                    icon={faTriangleExclamation}
                                    className="h-3.5 w-3.5 text-[var(--tone-warning-ink)]"
                                />
                            ) : null}
                            <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-muted)]">
                                Total
                            </span>
                            <MoneyAmount
                                cents={estimatedNetCents}
                                className="text-[var(--color-ink)]"
                            />
                        </span>
                    </td>
                    <td className="px-2 py-2" aria-hidden="true" />
                </tr>
            ) : null}

            <tr data-inline-transaction-editor="" onKeyDown={handleEditorKeyDown}>
                <td
                    colSpan={columnCount}
                    className="border-b border-[var(--color-border)] bg-[var(--color-panel-strong)]/45 px-4 py-2"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-medium text-[var(--color-muted)]">
                            Editing transaction
                        </div>
                        <div className="ml-auto flex items-center justify-end gap-2">
                            {actionBarActions}
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={isSubmitting}
                                className={controlClassNames.secondaryActionSmall}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                ref={saveChangesButtonRef}
                                onClick={() => void submitInlineEdit()}
                                disabled={actionButtonsDisabled}
                                className={controlClassNames.primaryActionCompact}
                            >
                                {isSubmitting ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        </Fragment>
    );
}
