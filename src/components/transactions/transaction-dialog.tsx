"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCaretDown,
    faCaretRight,
    faCodeBranch,
    faPlus,
    faTrashCan,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { MoneyAmount } from "@/components/shared/money-amount";
import { MoneyExpressionInput } from "@/components/shared/money-expression-input";
import { TransactionAmountDirection } from "@/components/transactions/transaction-amount-direction";
import { useEscapeToClose } from "@/components/shared/use-escape-to-close";
import { TransactionTemplatePreviewPane } from "@/components/transactions/transaction-template-preview-pane";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { buildCurrentMonthCategoryBalanceOptions } from "@/features/budget/models/category-combobox-options";
import {
    toPlaidTransactionReference,
    type PlaidTransactionReference,
} from "@/features/plaid/models/plaid-transaction-reference";
import { createOptimisticTransactionChanges } from "@/features/transactions/models/optimistic-transaction";
import {
    buildCategoryAssignmentValue,
    buildAdjustmentAssignmentValue,
    buildFromAccountAssignmentValue,
    buildToAccountAssignmentValue,
    createEmptyLineDraft,
    createLineAssignmentPatch,
    createLineDraftsFromTransactionTemplate,
    buildTransactionTemplateAssignmentValue,
    getDefaultLineDrafts,
    getAdjustmentAssignmentValue,
    getDefaultSplitMode,
    getEstimatedTransactionNetCents,
    getLineAssignmentValue,
    getPrimaryAccountId,
    getTransactionTemplateIdFromAssignmentValue,
    normalizeTransactionLineDrafts,
    resolveTransactionTemplatePreview,
    toUsdInput,
    uncategorizedAssignmentValue,
    type TransactionLineDraft,
} from "@/components/transactions/transaction-line-editor-helpers";
import {
    toTransactionDateInputValue,
    toTransactionOccurredAt,
} from "@/features/transactions/models/transaction-date";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { parseUsdToCents } from "@/lib/formatting/money";
import { isCurrentCachedTransactionQueryResult } from "@/lib/workspace/cached-transaction-query-result";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import {
    keyboardShortcuts,
    matchesKeyboardShortcut,
} from "@/lib/keyboard-shortcuts";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";

import { TransactionMemoTextarea } from "./transaction-memo-textarea";
import {
    getTransactionManagedReferenceFields,
    hasTransactionManagedMetadata,
    TransactionManagedMetadataReadonly,
    TransactionProviderRecordId,
} from "./transaction-memo-display";

export type TransactionCategoryOption = {
    categoryId: string;
    groupId?: string;
    ledgerAccountId: string;
    name: string;
    sortOrder?: number;
    status: "active" | "archived";
};

type TransactionDialogProps = {
    accounts: AccountWithBalance[];
    accountContextId?: string;
    categories: TransactionCategoryOption[];
    categoryBalanceById?: ReadonlyMap<string, number>;
    classificationPane?: (onEdit: () => void) => ReactNode;
    defaultAccountId?: string;
    onClose: () => void;
    onSaved?: (mode: "created" | "updated") => void;
    open: boolean;
    transaction?: TransactionWithPostings;
};

type TransactionEditorFormProps = {
    abortOnEscape?: boolean;
    accounts: AccountWithBalance[];
    accountContextId?: string;
    autoFocusCategory?: boolean;
    categories: TransactionCategoryOption[];
    categoryBalanceById?: ReadonlyMap<string, number>;
    className?: string;
    classificationPane?: (onEdit: () => void) => ReactNode;
    defaultAccountId?: string;
    onCancel: () => void;
    onSaved?: (mode: "created" | "updated") => void;
    onSubmittingChange?: (isSubmitting: boolean) => void;
    submitLabel?: string;
    transaction?: TransactionWithPostings;
};

type PendingTemplateApplication = {
    templateId: string;
    total: string;
};

type PlaidReferenceLoadState = {
    key: string;
    reference: PlaidTransactionReference | null;
};

const splitTransactionAssignmentValue = "__dialog_split_transaction__";
const emptyCategoryBalanceById = new Map<string, number>();
const transactionFieldLabelClassName =
    "grid min-w-0 gap-2 text-sm font-medium text-[var(--color-ink)]";
const transactionMemoFieldClassName = `${controlClassNames.field} min-w-0 w-full py-2 text-xs leading-4`;

function getTransactionMemoFieldClassName(isMultiline: boolean) {
    return `${transactionMemoFieldClassName} ${
        isMultiline
            ? "h-16 resize-y overflow-y-scroll"
            : "h-[46px] resize-none overflow-y-hidden"
    }`;
}
const splitLineActionClassName =
    "inline-flex cursor-pointer items-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-panel-strong)] px-2 py-1 text-[0.6875rem] font-medium leading-4 text-[var(--color-ink)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)] disabled:cursor-not-allowed disabled:opacity-60";

function formatTransactionSource(source: TransactionWithPostings["source"]) {
    return source === "plaid" ? "Plaid" : source === "venmo" ? "Venmo" : "Manual";
}

function formatTransactionStatus(status: TransactionWithPostings["status"]) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function ManagedTransactionInformationPane({
    transaction,
}: {
    transaction?: TransactionWithPostings;
}) {
    if (!transaction || !hasTransactionManagedMetadata(transaction)) {
        return null;
    }

    return (
        <div
            data-managed-order-information=""
            className="border border-[var(--color-border)] bg-[var(--color-panel-elevated)] px-4 py-3"
        >
            <div className="text-sm font-medium text-[var(--color-ink)]">
                Managed Information
            </div>
            <TransactionManagedMetadataReadonly
                displaySize="regular"
                showLabel={false}
                showSummaryIdentifierLabel
                transaction={transaction}
            />
        </div>
    );
}

function ReferenceField({
    children,
    label,
}: {
    children: ReactNode;
    label: string;
}) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {label}
            </dt>
            <dd className="mt-1 break-words text-[var(--color-ink)]">{children}</dd>
        </div>
    );
}

function ManagedMetadataReferenceFields({
    transaction,
}: {
    transaction: TransactionWithPostings;
}) {
    const fields = getTransactionManagedReferenceFields(transaction);

    return (
        <>
            {fields.map((field) => (
                <ReferenceField
                    key={`${field.key}:${field.label}`}
                    label={field.label}
                >
                    {field.kind === "money" ? (
                        <MoneyAmount cents={Number(field.value)} />
                    ) : field.kind === "identifier" ? (
                        <TransactionProviderRecordId value={String(field.value)} />
                    ) : (
                        String(field.value)
                    )}
                </ReferenceField>
            ))}
        </>
    );
}

type TransactionNetTotalWarningProps = {
    currentNetCents: number;
    differenceCents: number;
    isAccepted: boolean;
    isLocked: boolean;
    onAccept: () => void;
    originalNetCents: number;
    requiresAcceptance: boolean;
    title: string;
};

function TransactionNetTotalWarning({
    currentNetCents,
    differenceCents,
    isAccepted,
    isLocked,
    onAccept,
    originalNetCents,
    requiresAcceptance,
    title,
}: TransactionNetTotalWarningProps) {
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
                            : requiresAcceptance
                            ? "Accept the difference to save this split with a changed total."
                            : "Review the difference before saving this transaction with a changed total."}
                    </p>
                </div>
                {requiresAcceptance && !isLocked ? (
                    <button
                        type="button"
                        onClick={onAccept}
                        disabled={isAccepted}
                        className={splitLineActionClassName}
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

export function TransactionEditorForm({
    abortOnEscape = false,
    accounts,
    accountContextId,
    autoFocusCategory = false,
    categories,
    categoryBalanceById = emptyCategoryBalanceById,
    className = "grid gap-4",
    classificationPane,
    defaultAccountId: createDefaultAccountId,
    onCancel,
    onSaved,
    onSubmittingChange,
    submitLabel = "Save transaction",
    transaction,
}: TransactionEditorFormProps) {
    const {
        executeWorkspaceCommand,
        getWorkspaceCacheIdentity,
        readCachedTransactions,
        snapshot,
    } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const initialSplitMode = getDefaultSplitMode(transaction);
    const [isReferenceInfoOpen, setIsReferenceInfoOpen] = useState(false);
    const [plaidReferenceLoadState, setPlaidReferenceLoadState] =
        useState<PlaidReferenceLoadState | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [transactionKind, setTransactionKind] = useState<
        TransactionWithPostings["kind"]
    >(transaction?.kind ?? "standard");
    const initialSelectedAccountId =
        accountContextId ?? transaction?.referenceAccountId ?? createDefaultAccountId ?? "";
    const [selectedAccountId, setSelectedAccountId] = useState(
        initialSelectedAccountId,
    );
    const [lines, setLines] = useState(() =>
        getDefaultLineDrafts(transaction, initialSelectedAccountId),
    );
    const [parentPayee, setParentPayee] = useState(transaction?.payee ?? "");
    const [parentMemo, setParentMemo] = useState(transaction?.memo ?? "");
    const [isSplitMode, setIsSplitMode] = useState(initialSplitMode);
    const [hasSplitModeBeenActivated, setHasSplitModeBeenActivated] =
        useState(initialSplitMode);
    const [pendingTemplateApplication, setPendingTemplateApplication] =
        useState<PendingTemplateApplication | null>(null);
    const [
        shouldFocusSaveAfterTemplateApplication,
        setShouldFocusSaveAfterTemplateApplication,
    ] = useState(false);
    const [singleLineBeforeSplit, setSingleLineBeforeSplit] =
        useState<TransactionLineDraft | null>(null);
    const [shouldFocusFirstSplitAmount, setShouldFocusFirstSplitAmount] =
        useState(false);
    const [categoryFocusRequest, setCategoryFocusRequest] = useState(0);
    const accountInputRef = useRef<HTMLInputElement>(null);
    const firstCategoryInputRef = useRef<HTMLInputElement>(null);
    const firstSplitAmountInputRef = useRef<HTMLInputElement>(null);
    const payeeInputRef = useRef<HTMLInputElement>(null);
    const templateTotalInputRef = useRef<HTMLInputElement>(null);
    const saveTransactionButtonRef = useRef<HTMLButtonElement>(null);
    const focusFirstCategoryInput = useCallback(() => {
        setCategoryFocusRequest((request) => request + 1);
    }, []);
    const [splitOriginalTotalCents, setSplitOriginalTotalCents] = useState<
        number | null
    >(() =>
        initialSplitMode ? (transaction?.displayAmountCents ?? null) : null,
    );
    const [
        acceptedSplitTotalDifferenceCents,
        setAcceptedSplitTotalDifferenceCents,
    ] = useState<number | null>(null);
    const activeAccounts = accounts;
    const activeCategories = useMemo(
        () => categories.filter((category) => category.status === "active"),
        [categories],
    );
    const selectedAccount =
        activeAccounts.find((account) => account.accountId === selectedAccountId) ??
        null;
    const emptyTransactionAmountSignPreference =
        selectedAccount?.accountType === "checking" ||
        selectedAccount?.accountType === "creditCard"
            ? "negative"
            : "positive";
    const transactionAmountSignPreferenceKey = selectedAccount?.accountId ?? "";
    const canChooseAccount = !transaction && !createDefaultAccountId;
    const isLocked = transaction?.status === "reconciled";
    const snapshotPlaidSyncRecord = transaction?.plaidTransactionSyncId
        ? (snapshot.plaidTransactionSyncs.find(
                (record) =>
                    record.plaidTransactionSyncId === transaction.plaidTransactionSyncId,
            ) ?? null)
        : null;
    const plaidReferenceKey =
        transaction?.plaidTransactionSyncId && transaction.transactionId
            ? `${transaction.transactionId}:${transaction.plaidTransactionSyncId}`
            : null;
    const loadedPlaidReference =
        plaidReferenceLoadState?.key === plaidReferenceKey
            ? plaidReferenceLoadState.reference
            : null;
    const plaidSyncReference = snapshotPlaidSyncRecord
        ? toPlaidTransactionReference(
                snapshotPlaidSyncRecord,
                transaction?.displayAmountCents ?? 0,
            )
        : loadedPlaidReference;
    const plaidDisplayAmountCents = plaidSyncReference
        ? (plaidSyncReference.plaidDisplayAmountCents ??
            -plaidSyncReference.plaidAmountCents)
        : undefined;
    const plaidAmountDiffersFromTransaction =
        plaidSyncReference && transaction
            ? (plaidSyncReference.amountDiffersFromTransaction ??
                plaidDisplayAmountCents !== transaction.displayAmountCents)
            : false;
    const isPlaidTransaction = Boolean(transaction?.plaidTransactionSyncId);
    const isPlaidReferenceLoading = Boolean(
        isReferenceInfoOpen &&
            plaidReferenceKey &&
            !snapshotPlaidSyncRecord &&
            plaidReferenceLoadState?.key !== plaidReferenceKey,
    );

    useEffect(() => {
        const plaidTransactionSyncId = transaction?.plaidTransactionSyncId;

        if (
            !isReferenceInfoOpen ||
            !transaction ||
            !plaidTransactionSyncId ||
            !plaidReferenceKey ||
            snapshotPlaidSyncRecord ||
            plaidReferenceLoadState?.key === plaidReferenceKey
        ) {
            return;
        }

        let cancelled = false;

        void (async () => {
            const identity = getWorkspaceCacheIdentity(transaction.ledgerId);
            const query = { transactionId: transaction.transactionId };
            const cachedResult = identity
                ? await readCachedTransactions({
                        identity,
                        query,
                    })
                : null;
            const currentCachedResult =
                identity &&
                cachedResult &&
                isCurrentCachedTransactionQueryResult({
                    identity,
                    knowledge: snapshot.knowledge,
                    query,
                    result: cachedResult,
                })
                    ? cachedResult
                    : null;
            const cachedRecord = currentCachedResult?.plaidTransactionSyncs.find(
                (record) => record.plaidTransactionSyncId === plaidTransactionSyncId,
            );

            if (cachedRecord) {
                if (!cancelled) {
                    setPlaidReferenceLoadState({
                        key: plaidReferenceKey,
                        reference: toPlaidTransactionReference(
                            cachedRecord,
                            transaction.displayAmountCents,
                        ),
                    });
                }
                return;
            }

            let reference: PlaidTransactionReference | null = null;

            try {
                const response = await fetch(
                    `/api/transactions/${encodeURIComponent(transaction.transactionId)}/plaid-reference`,
                );

                if (!response.ok) {
                    return;
                }

                const payload = (await response.json()) as {
                    reference: PlaidTransactionReference | null;
                };

                if (
                    !cancelled &&
                    payload.reference?.plaidTransactionSyncId === plaidTransactionSyncId
                ) {
                    reference = payload.reference;
                }
            } catch {
                // Reference details are optional diagnostics; the pane can
                // still show the transaction id when the fallback read fails.
            } finally {
                if (!cancelled) {
                    setPlaidReferenceLoadState({
                        key: plaidReferenceKey,
                        reference,
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        getWorkspaceCacheIdentity,
        isReferenceInfoOpen,
        plaidReferenceKey,
        plaidReferenceLoadState?.key,
        readCachedTransactions,
        snapshot.knowledge,
        snapshotPlaidSyncRecord,
        transaction,
    ]);

    const activeAccountOptions = useMemo(
        () =>
            activeAccounts.map((account) => ({
                label: account.name,
                value: account.accountId,
            })),
        [activeAccounts],
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
    const templateOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            [...(snapshot.transactionTemplates ?? [])]
                .sort(
                    (left, right) =>
                        left.name.localeCompare(right.name) ||
                        left.templateId.localeCompare(right.templateId),
                )
                .map((template) => ({
                    description: template.payee ?? undefined,
                    group: "Templates",
                    label: template.name,
                    value: buildTransactionTemplateAssignmentValue(template.templateId),
                })),
        [snapshot.transactionTemplates],
    );
    const singleLineAssignmentOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            transactionKind === "standard"
                ? [
                      ...lineAssignmentOptions,
                      ...(!isLocked ? templateOptions : []),
                      {
                          group: "Transaction",
                          label: "Split Transaction",
                          value: splitTransactionAssignmentValue,
                      },
                  ]
                : lineAssignmentOptions,
        [isLocked, lineAssignmentOptions, templateOptions, transactionKind],
    );
    const activeLines = isSplitMode ? lines : lines.slice(0, 1);
    const hasTwoSplitLineAmounts =
        isSplitMode &&
        activeLines.filter((line) => line.amount.trim().length > 0).length >= 2;
    const estimatedNetCents = getEstimatedTransactionNetCents({
        lines: activeLines,
        selectedAccountId,
        transactionKind,
    });
    const originalNetAmountCents =
        transaction?.displayAmountCents ?? splitOriginalTotalCents;
    const netTotalDifferenceCents =
        originalNetAmountCents !== null
            ? estimatedNetCents - originalNetAmountCents
            : 0;
    const isManualTransactionEdit =
        Boolean(transaction) && (transaction?.source ?? "manual") === "manual";
    const suppressesManualUnsplitWarning =
        isManualTransactionEdit && !hasSplitModeBeenActivated;
    const hasNetTotalMismatch =
        originalNetAmountCents !== null &&
        netTotalDifferenceCents !== 0 &&
        !suppressesManualUnsplitWarning &&
        (!isSplitMode || hasTwoSplitLineAmounts);
    const isNetTotalOverrideAccepted =
        hasNetTotalMismatch &&
        acceptedSplitTotalDifferenceCents === netTotalDifferenceCents;
    const requiresLockedNetTotalMatch = isLocked && hasNetTotalMismatch;
    const requiresNetTotalOverride =
        !isLocked &&
        hasNetTotalMismatch &&
        hasSplitModeBeenActivated &&
        !isNetTotalOverrideAccepted;
    const netTotalWarningTitle = hasSplitModeBeenActivated
        ? "Split total changed"
        : "Transaction total changed";
    const splitHeaderTotalCents = originalNetAmountCents ?? estimatedNetCents;
    const splitHeaderTotalLabel =
        originalNetAmountCents === null ? "Running total" : "Reference total";

    useEffect(() => {
        onSubmittingChange?.(isSubmitting);
    }, [isSubmitting, onSubmittingChange]);

    useEffect(() => {
        if (transaction || autoFocusCategory) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            if (canChooseAccount) {
                accountInputRef.current?.focus();
                return;
            }

            payeeInputRef.current?.focus();
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [autoFocusCategory, canChooseAccount, transaction]);

    useEffect(() => {
        if (!autoFocusCategory) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            firstCategoryInputRef.current?.focus();
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [autoFocusCategory]);

    useEffect(() => {
        if (categoryFocusRequest === 0) {
            return;
        }

        firstCategoryInputRef.current?.focus();
        firstCategoryInputRef.current?.select();
    }, [categoryFocusRequest]);

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

    useEffect(() => {
        if (!shouldFocusSaveAfterTemplateApplication) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            saveTransactionButtonRef.current?.focus();
            setShouldFocusSaveAfterTemplateApplication(false);
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [shouldFocusSaveAfterTemplateApplication]);

    useEffect(() => {
        if (!isSplitMode || !shouldFocusFirstSplitAmount) {
            return;
        }

        const focusTimer = window.setTimeout(() => {
            firstSplitAmountInputRef.current?.focus();
            firstSplitAmountInputRef.current?.select();
            setShouldFocusFirstSplitAmount(false);
        }, 0);

        return () => window.clearTimeout(focusTimer);
    }, [isSplitMode, shouldFocusFirstSplitAmount]);

    function updateLine(lineId: string, patch: Partial<TransactionLineDraft>) {
        setLines((currentLines) =>
            currentLines.map((line) =>
                line.id === lineId ? { ...line, ...patch } : line,
            ),
        );
    }

    function removeLine(lineId: string) {
        setLines((currentLines) =>
            currentLines.length > (isSplitMode ? 2 : 1)
                ? currentLines.filter((line) => line.id !== lineId)
                : currentLines,
        );
    }

    function addLine() {
        setLines((currentLines) => [
            ...currentLines,
            createEmptyLineDraft(currentLines.length),
        ]);
    }

    function startSplitMode() {
        const hasEnteredTotal = activeLines.some((line) => line.amount.trim());
        const firstLine = activeLines[0] ?? createEmptyLineDraft(0);

        setHasSplitModeBeenActivated(true);
        setParentPayee((current) =>
            current.trim() ? current : (firstLine?.payee ?? transaction?.payee ?? ""),
        );
        setParentMemo((current) =>
            current.trim() ? current : (firstLine?.memo ?? transaction?.memo ?? ""),
        );
        setSplitOriginalTotalCents(
            transaction?.displayAmountCents ??
                (hasEnteredTotal ? estimatedNetCents : null),
        );
        setAcceptedSplitTotalDifferenceCents(null);
        setSingleLineBeforeSplit(firstLine);
        setLines([
            { ...firstLine, amount: "" },
            createEmptyLineDraft(1),
        ]);
        setIsSplitMode(true);
        setShouldFocusFirstSplitAmount(true);
    }

    function handleStartSplitShortcut(event: KeyboardEvent<HTMLFormElement>) {
        if (
            !matchesKeyboardShortcut(
                event,
                keyboardShortcuts.transactions.startInlineSplit,
            )
        ) {
            return false;
        }

        if (
            isSplitMode ||
            transactionKind !== "standard" ||
            isTemplatePaneActive ||
            isSubmitting
        ) {
            return false;
        }

        event.preventDefault();
        event.stopPropagation();
        startSplitMode();
        return true;
    }

    function cancelSplitMode() {
        const restoredTotalCents = splitOriginalTotalCents;

        setSplitOriginalTotalCents(null);
        setAcceptedSplitTotalDifferenceCents(null);
        setPendingTemplateApplication(null);
        setLines((currentLines) => [
            {
                ...(singleLineBeforeSplit ??
                    currentLines[0] ??
                    createEmptyLineDraft(0)),
                ...(restoredTotalCents === null
                    ? {}
                    : { amount: toUsdInput(restoredTotalCents) }),
            },
        ]);
        setSingleLineBeforeSplit(null);
        setShouldFocusFirstSplitAmount(false);
        setIsSplitMode(false);
    }

    function getTemplateApplicationInitialTotal(templateId: string) {
        const template = templateById.get(templateId);

        if (!template) {
            throw new Error(
                "The selected transaction template is no longer available.",
            );
        }

        const draftAmount = activeLines[0]?.amount.trim() ?? "";

        if (draftAmount) {
            return draftAmount;
        }

        if (transaction && transaction.displayAmountCents !== 0) {
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

        const nextLines = createLineDraftsFromTransactionTemplate({
            template,
            totalCents,
        });

        if (!selectedAccountId && canChooseAccount && template.accountId) {
            setSelectedAccountId(template.accountId);
        }

        setParentPayee((current) =>
            current.trim() ? current : (template.payee ?? ""),
        );
        setParentMemo((current) =>
            current.trim() ? current : (template.memo ?? ""),
        );
        setHasSplitModeBeenActivated(true);
        setSplitOriginalTotalCents(transaction?.displayAmountCents ?? totalCents);
        setAcceptedSplitTotalDifferenceCents(null);
        setLines(nextLines);
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

    function updateLineAssignment(lineId: string, value: string) {
        if (value === splitTransactionAssignmentValue) {
            startSplitMode();
            return;
        }

        const templateId = getTransactionTemplateIdFromAssignmentValue(value);

        if (templateId) {
            if (transactionKind !== "standard") {
                selectTransactionKind("standard");
            }
            selectTemplate(templateId);
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

    function selectTransactionKind(nextKind: TransactionWithPostings["kind"]) {
        setTransactionKind(nextKind);
        setPendingTemplateApplication(null);

        if (nextKind === "adjustment") {
            setLines((currentLines) =>
                currentLines.map((line) => ({
                    ...line,
                    categoryId: "",
                    toAccountId:
                        line.fromAccountId && line.toAccountId ? "" : line.toAccountId,
                })),
            );
        }
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (isTemplatePaneActive) {
            return;
        }

        const formData = new FormData(event.currentTarget);

        setIsSubmitting(true);

        try {
            const occurredAt = toTransactionOccurredAt(
                String(
                    formData.get("occurredAt") ?? toTransactionDateInputValue(new Date()),
                ),
            );
            const linesToSubmit = isSplitMode ? lines : lines.slice(0, 1);

            if (isSplitMode && linesToSubmit.length < 2) {
                throw new Error("Split transactions require at least two lines.");
            }

            if (isSplitMode && !hasTwoSplitLineAmounts) {
                throw new Error("Enter amounts for at least two split lines.");
            }

            if (requiresLockedNetTotalMatch) {
                throw new Error("Locked transactions must keep their original total.");
            }

            if (requiresNetTotalOverride) {
                throw new Error("Accept the split total difference before saving.");
            }

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

            const payload = {
                accountId: primaryAccountId,
                kind: transactionKind,
                lines: normalizedLines,
                occurredAt,
                payee: String(formData.get("payee") ?? ""),
                memo: String(formData.get("memo") ?? ""),
                mutationId: createWorkspaceMutationId(),
            };

            if (transaction) {
                const changes = createOptimisticTransactionChanges({
                    accounts,
                    categories,
                    input: payload,
                    transaction,
                });

                onCancel();
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
                    onCommitted: () => {
                        onSaved?.("updated");
                    },
                });
                return;
            }

            onCancel();
            setIsSubmitting(false);
            void executeWorkspaceCommand({
                activity: {
                    completedLabel: "Transaction saved.",
                    pendingLabel: "Saving transaction…",
                },
                request: () =>
                    fetch("/api/transactions", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(payload),
                    }),
                onError: async (error) => {
                    notifyError({
                        message: `${error instanceof Response ? await parseApiErrorMessage(error, "Unable to save transaction.") : error instanceof Error ? error.message : "Unable to save transaction."} Save failed. The latest saved data has been restored.`,
                        title: "Transaction could not be saved.",
                    });
                },
                onCommitted: () => {
                    onSaved?.("created");
                },
            });
            return;
        } catch (submitError) {
            notifyError({
                message: `${submitError instanceof Error ? submitError.message : "Unable to save transaction."} The last saved transaction data is unchanged. Review the form and try again.`,
                title: "Transaction could not be saved.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
        if (isSubmitting) {
            return;
        }

        if (handleStartSplitShortcut(event)) {
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
            event.currentTarget.requestSubmit();
            return;
        }

        if (!abortOnEscape || event.key !== "Escape") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        onCancel();
    }

    return (
        <form
            key={transaction?.transactionId ?? "new-transaction"}
            onKeyDown={handleFormKeyDown}
            onSubmit={handleSubmit}
            className={className}
        >
            {canChooseAccount ? (
                <ComboboxSelect
                    inputRef={accountInputRef}
                    label="Account"
                    name="accountId"
                    noResultsLabel="No accounts found"
                    onChange={setSelectedAccountId}
                    options={activeAccountOptions}
                    placeholder="Select account"
                    required
                    value={selectedAccountId}
                />
            ) : null}

            <div className="grid gap-4 md:grid-cols-[15rem]">
                <label className="grid min-w-0 gap-2 text-sm font-medium text-[var(--color-ink)]">
                    Date
                    <input
                        required
                        type="date"
                        name="occurredAt"
                        defaultValue={
                            toTransactionDateInputValue(transaction?.occurredAt) ||
                            toTransactionDateInputValue(new Date())
                        }
                        className={`${controlClassNames.field} min-w-0 w-full`}
                    />
                </label>
            </div>

            {isSplitMode ? (
                <div className="grid gap-3">
                    <div className="grid items-start gap-4 md:grid-cols-[minmax(8rem,0.85fr)_minmax(12rem,1fr)_minmax(10rem,1fr)_7.5rem_2.5rem]">
                        <label className={`${transactionFieldLabelClassName} md:col-span-2`}>
                            Transaction payee
                            <input
                                name="payee"
                                disabled={isTemplatePaneActive}
                                value={parentPayee}
                                onChange={(event) => setParentPayee(event.target.value)}
                                className={`${controlClassNames.field} min-w-0 w-full`}
                            />
                        </label>
                        <div className={transactionFieldLabelClassName}>
                            <label className="grid min-w-0 gap-2">
                                Transaction memo
                                <TransactionMemoTextarea
                                    name="memo"
                                    disabled={isTemplatePaneActive}
                                    value={parentMemo}
                                    onChange={(event) => setParentMemo(event.target.value)}
                                    className={getTransactionMemoFieldClassName}
                                />
                            </label>
                        </div>
                        <div className="grid min-w-0 gap-2 text-right text-sm font-medium text-[var(--color-ink)]">
                            <span>{splitHeaderTotalLabel}</span>
                            <span className="flex h-[46px] items-center justify-end pr-4 tabular-nums">
                                <MoneyAmount
                                    cents={splitHeaderTotalCents}
                                    className="font-semibold"
                                />
                            </span>
                        </div>
                        <div aria-hidden="true" />
                    </div>
                    <ManagedTransactionInformationPane transaction={transaction} />
                </div>
            ) : null}

            {!isSplitMode && activeLines[0] ? (
                <div className="grid gap-3">
                    <div
                        className={`grid items-start gap-4 transition md:grid-cols-[minmax(8rem,0.85fr)_minmax(12rem,1fr)_minmax(10rem,1fr)_7.5rem_auto] ${
                            isTemplatePaneActive ? "opacity-60" : ""
                        }`}
                    >
                        <label className={transactionFieldLabelClassName}>
                            Payee
                            <input
                                ref={payeeInputRef}
                                name="payee"
                                disabled={isTemplatePaneActive}
                                value={activeLines[0].payee}
                                onChange={(event) =>
                                    updateLine(activeLines[0].id, {
                                        payee: event.target.value,
                                    })
                                }
                                className={`${controlClassNames.field} min-w-0 w-full`}
                            />
                        </label>
                        <ComboboxSelect
                            disabled={
                                isTemplatePaneActive ||
                                (isLocked &&
                                    Boolean(
                                        activeLines[0].fromAccountId && activeLines[0].toAccountId,
                                    ))
                            }
                            inputRef={firstCategoryInputRef}
                            label="Category"
                            labelClassName={transactionFieldLabelClassName}
                            menuClassName="min-w-[18rem]"
                            noResultsLabel="No categories or accounts found"
                            onChange={(value) =>
                                updateLineAssignment(activeLines[0].id, value)
                            }
                            options={singleLineAssignmentOptions}
                            placeholder={
                                transactionKind === "adjustment"
                                    ? "Select adjustment direction"
                                    : "Select category or transfer"
                            }
                            value={
                                pendingTemplateApplication
                                    ? buildTransactionTemplateAssignmentValue(
                                            pendingTemplateApplication.templateId,
                                        )
                                    : getComboboxAssignmentValue(activeLines[0])
                            }
                        />
                        <div className={transactionFieldLabelClassName}>
                            <label className="grid min-w-0 gap-2">
                                Memo
                                <TransactionMemoTextarea
                                    name="memo"
                                    disabled={isTemplatePaneActive}
                                    value={activeLines[0].memo}
                                    onChange={(event) =>
                                        updateLine(activeLines[0].id, {
                                            memo: event.target.value,
                                        })
                                    }
                                    className={getTransactionMemoFieldClassName}
                                />
                            </label>
                        </div>
                        <div className={transactionFieldLabelClassName}>
                            Amount
                            <MoneyExpressionInput
                                aria-label="Amount"
                                emptySignPreference={emptyTransactionAmountSignPreference}
                                required
                                disabled={
                                    isTemplatePaneActive ||
                                    (isLocked && !isSplitMode)
                                }
                                signPreferenceKey={transactionAmountSignPreferenceKey}
                                value={activeLines[0].amount}
                                onChange={(event) =>
                                    updateLine(activeLines[0].id, {
                                        amount: event.target.value,
                                    })
                                }
                                className={`${controlClassNames.field} min-w-0 w-full`}
                            />
                            <TransactionAmountDirection value={activeLines[0].amount} />
                        </div>
                        <div className="flex items-start pt-7">
                            <button
                                type="button"
                                onClick={startSplitMode}
                                disabled={isTemplatePaneActive}
                                className={`${controlClassNames.secondaryAction} flex h-[46px] cursor-pointer items-center gap-2 whitespace-nowrap`}
                            >
                                <FontAwesomeIcon aria-hidden="true" icon={faCodeBranch} />
                                Split
                            </button>
                        </div>
                    </div>
                    <ManagedTransactionInformationPane transaction={transaction} />
                    {pendingTemplateApplication ? (
                        <TransactionTemplatePreviewPane
                            categoryNameById={categoryNameById}
                            emptySignPreference={emptyTransactionAmountSignPreference}
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
                            required
                            signPreferenceKey={transactionAmountSignPreferenceKey}
                            templateName={pendingTemplate?.name ?? "Selected template"}
                            total={pendingTemplateApplication.total}
                        />
                    ) : null}
                </div>
            ) : null}

            {isSplitMode ? (
                <div className="grid gap-3">
                    <div className="grid gap-3">
                        {lines.map((line, lineIndex) => {
                            const showLineLabels = lineIndex === 0;

                            return (
                                <div
                                    key={line.id}
                                    className="grid items-start gap-4 md:grid-cols-[minmax(8rem,0.85fr)_minmax(12rem,1fr)_minmax(10rem,1fr)_7.5rem_2.5rem]"
                                >
                                    <div className={transactionFieldLabelClassName}>
                                        <span className={showLineLabels ? "" : "sr-only"}>
                                            Payee
                                        </span>
                                        <input
                                            value={line.payee}
                                            onChange={(event) =>
                                                updateLine(line.id, {
                                                    payee: event.target.value,
                                                })
                                            }
                                            className={`${controlClassNames.field} min-w-0 w-full`}
                                        />
                                    </div>
                                    <ComboboxSelect
                                        disabled={
                                            isLocked &&
                                            Boolean(line.fromAccountId && line.toAccountId)
                                        }
                                        inputRef={
                                            lineIndex === 0 ? firstCategoryInputRef : undefined
                                        }
                                        label="Category"
                                        hideLabel={!showLineLabels}
                                        labelClassName={transactionFieldLabelClassName}
                                        menuClassName="min-w-[18rem]"
                                        noResultsLabel="No categories or accounts found"
                                        onChange={(value) =>
                                            updateLine(
                                                line.id,
                                                createLineAssignmentPatch({
                                                    selectedAccountId,
                                                    transactionKind,
                                                    value,
                                                }),
                                            )
                                        }
                                        options={lineAssignmentOptions}
                                        placeholder={
                                            transactionKind === "adjustment"
                                                ? "Select adjustment direction"
                                                : "Select category or transfer"
                                        }
                                        value={getComboboxAssignmentValue(line)}
                                    />
                                    <div className={transactionFieldLabelClassName}>
                                        <span className={showLineLabels ? "" : "sr-only"}>
                                            Memo
                                        </span>
                                        <TransactionMemoTextarea
                                            value={line.memo}
                                            onChange={(event) =>
                                                updateLine(line.id, {
                                                    memo: event.target.value,
                                                })
                                            }
                                            className={getTransactionMemoFieldClassName}
                                        />
                                    </div>
                                    <div className={transactionFieldLabelClassName}>
                                        <span className={showLineLabels ? "" : "sr-only"}>
                                            Amount
                                        </span>
                                        <MoneyExpressionInput
                                            aria-label="Amount"
                                            ref={
                                                lineIndex === 0
                                                    ? firstSplitAmountInputRef
                                                    : undefined
                                            }
                                            emptySignPreference={emptyTransactionAmountSignPreference}
                                            required
                                            disabled={isTemplatePaneActive}
                                            signPreferenceKey={transactionAmountSignPreferenceKey}
                                            value={line.amount}
                                            onChange={(event) =>
                                                updateLine(line.id, {
                                                    amount: event.target.value,
                                                })
                                            }
                                            className={`${controlClassNames.field} min-w-0 w-full text-right`}
                                        />
                                        <TransactionAmountDirection value={line.amount} />
                                    </div>
                                    <div className="h-[46px]">
                                        {lineIndex >= 2 ? (
                                            <button
                                                type="button"
                                                aria-label="Remove split line"
                                                title="Remove split line"
                                                onClick={() => removeLine(line.id)}
                                                className="flex h-full w-10 cursor-pointer items-center justify-center border border-[var(--color-border)] bg-[var(--color-panel-strong)] text-sm text-[var(--color-ink)] transition hover:border-[var(--tone-error-ink)] hover:bg-[var(--tone-error-surface)] hover:text-[var(--tone-error-ink)]"
                                            >
                                                <FontAwesomeIcon
                                                    aria-hidden="true"
                                                    icon={faTrashCan}
                                                />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="grid items-center gap-2 md:grid-cols-[minmax(8rem,0.85fr)_minmax(12rem,1fr)_minmax(10rem,1fr)_7.5rem_auto] md:gap-4">
                            <div className="hidden md:block" />
                            <div className="hidden md:block" />
                            <div className="hidden md:block" />
                            <div className="relative h-8 text-sm font-semibold tabular-nums">
                                <span className="absolute right-[2.75rem] top-1/2 inline-flex -translate-y-1/2 items-baseline whitespace-nowrap">
                                    <span className="mr-[0.5em] text-xs leading-none text-[var(--color-muted)]">
                                        Total:
                                    </span>
                                    <MoneyAmount
                                        cents={estimatedNetCents}
                                        className="font-semibold"
                                    />
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                <button
                                    type="button"
                                    onClick={cancelSplitMode}
                                    disabled={isSubmitting || isLocked}
                                    className={splitLineActionClassName}
                                >
                                    <FontAwesomeIcon aria-hidden="true" icon={faXmark} />
                                    Cancel split
                                </button>
                                <button
                                    type="button"
                                    onClick={addLine}
                                    disabled={isSubmitting}
                                    className={splitLineActionClassName}
                                >
                                    <FontAwesomeIcon aria-hidden="true" icon={faPlus} />
                                    Add line
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {hasNetTotalMismatch && originalNetAmountCents !== null ? (
                <TransactionNetTotalWarning
                    currentNetCents={estimatedNetCents}
                    differenceCents={netTotalDifferenceCents}
                    isAccepted={isNetTotalOverrideAccepted}
                    isLocked={isLocked}
                    onAccept={() =>
                        setAcceptedSplitTotalDifferenceCents(netTotalDifferenceCents)
                    }
                    originalNetCents={originalNetAmountCents}
                    requiresAcceptance={hasSplitModeBeenActivated}
                    title={netTotalWarningTitle}
                />
            ) : null}

            {transaction || !canChooseAccount ? (
                <section className="mt-2 border border-[var(--color-border)] bg-[var(--color-panel-strong)]">
                    {!canChooseAccount ? (
                        <input
                            type="hidden"
                            name="accountId"
                            value={selectedAccountId}
                            readOnly
                        />
                    ) : null}
                    <button
                        type="button"
                        aria-controls="transaction-reference-info"
                        aria-expanded={isReferenceInfoOpen}
                        onClick={() => setIsReferenceInfoOpen((isOpen) => !isOpen)}
                        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel-elevated)]"
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={isReferenceInfoOpen ? faCaretDown : faCaretRight}
                            className="h-4 w-4 text-[var(--color-muted)]"
                        />
                        Reference info
                    </button>
                    {isReferenceInfoOpen ? (
                        <div
                            id="transaction-reference-info"
                            className="border-t border-[var(--color-border)] p-4"
                        >
                            <dl className="grid gap-3 text-sm md:grid-cols-3">
                                {!canChooseAccount ? (
                                    <div>
                                        <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                            Account
                                        </dt>
                                        <dd className="mt-1 font-medium text-[var(--color-ink)]">
                                            {selectedAccount?.name ?? "Unknown account"}
                                        </dd>
                                    </div>
                                ) : null}
                                {transaction ? (
                                    <>
                                        <div>
                                            <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                Transaction ID
                                            </dt>
                                            <dd className="mt-1 break-all font-mono text-xs text-[var(--color-muted)]">
                                                {transaction.transactionId}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                Source
                                            </dt>
                                            <dd className="mt-1 font-medium text-[var(--color-ink)]">
                                                {formatTransactionSource(transaction.source)}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                Status
                                            </dt>
                                            <dd className="mt-1 font-medium text-[var(--color-ink)]">
                                                {formatTransactionStatus(transaction.status)}
                                            </dd>
                                        </div>
                                        <ManagedMetadataReferenceFields
                                            transaction={transaction}
                                        />
                                        {isPlaidTransaction && plaidSyncReference ? (
                                            <>
                                                <div>
                                                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                        Plaid payee
                                                    </dt>
                                                    <dd className="mt-1 text-[var(--color-ink)]">
                                                        {plaidSyncReference.merchantName ??
                                                            plaidSyncReference.name}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                        Plaid category
                                                    </dt>
                                                    <dd className="mt-1 text-[var(--color-ink)]">
                                                        {plaidSyncReference.categoryText ?? "Uncategorized"}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                        Plaid status
                                                    </dt>
                                                    <dd className="mt-1 text-[var(--color-ink)]">
                                                        {plaidSyncReference.status === "removed"
                                                            ? "Removed by Plaid"
                                                            : plaidSyncReference.pending
                                                                ? "Pending"
                                                                : "Posted"}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                        Last synced
                                                    </dt>
                                                    <dd className="mt-1 text-[var(--color-ink)]">
                                                        {new Date(
                                                            plaidSyncReference.lastSyncedAt,
                                                        ).toLocaleString()}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                        Latest Plaid date
                                                    </dt>
                                                    <dd className="mt-1 font-medium text-[var(--color-ink)]">
                                                        {plaidSyncReference.plaidDate}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                                        Latest Plaid amount
                                                    </dt>
                                                    <dd className="mt-1 font-medium">
                                                        <MoneyAmount cents={plaidDisplayAmountCents ?? 0} />
                                                    </dd>
                                                </div>
                                            </>
                                        ) : null}
                                    </>
                                ) : null}
                            </dl>
                            {plaidSyncReference?.status === "removed" ? (
                                <p className="mt-4 border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] p-3 text-sm text-[var(--tone-warning-ink)]">
                                    Plaid reports this transaction as removed.
                                    {isLocked
                                        ? " The saved transaction was preserved because it is locked."
                                        : " The saved transaction remains available for manual review."}
                                </p>
                            ) : plaidAmountDiffersFromTransaction ? (
                                <div className="mt-4 border border-[var(--tone-warning-border)] bg-[var(--tone-warning-surface)] p-3 text-sm text-[var(--tone-warning-ink)]">
                                    <p>
                                        The latest Plaid amount differs from the saved transaction.
                                    </p>
                                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                                        <div>
                                            <dt>Saved transaction</dt>
                                            <dd className="font-semibold">
                                                <MoneyAmount
                                                    cents={transaction?.displayAmountCents ?? 0}
                                                />
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Latest Plaid value</dt>
                                            <dd className="font-semibold">
                                                <MoneyAmount cents={plaidDisplayAmountCents ?? 0} />
                                            </dd>
                                        </div>
                                    </dl>
                                    <p className="mt-2 text-xs">
                                        Unlocking does not apply this value automatically. Edit the
                                        transaction manually if the saved amount should change.
                                    </p>
                                </div>
                            ) : null}
                            {isPlaidTransaction &&
                            !plaidSyncReference &&
                            isPlaidReferenceLoading ? (
                                <p className="mt-3 text-sm text-[var(--color-muted)]">
                                    Loading Plaid reference...
                                </p>
                            ) : null}
                            {isPlaidTransaction &&
                            !plaidSyncReference &&
                            !isPlaidReferenceLoading ? (
                                <p className="mt-3 text-sm text-[var(--color-muted)]">
                                    Plaid reference unavailable.
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </section>
            ) : null}

            {classificationPane ? classificationPane(focusFirstCategoryInput) : null}

            <div className="mt-auto flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    className={controlClassNames.secondaryAction}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    ref={saveTransactionButtonRef}
                    disabled={
                        isSubmitting ||
                        activeLines.length === 0 ||
                        (isSplitMode && !hasTwoSplitLineAmounts) ||
                        isTemplatePaneActive ||
                        requiresLockedNetTotalMatch ||
                        requiresNetTotalOverride
                    }
                    className={controlClassNames.primaryAction}
                >
                    {isSubmitting ? "Saving..." : submitLabel}
                </button>
            </div>
        </form>
    );
}

export function TransactionDialog({
    accounts,
    accountContextId,
    categories,
    categoryBalanceById,
    classificationPane,
    defaultAccountId,
    onClose,
    onSaved,
    open,
    transaction,
}: TransactionDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEscapeToClose({ enabled: open && !isSubmitting, onClose });

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-2">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="transaction-dialog-title"
                className={`flex h-[50vh] min-h-[40rem] w-[calc(100vw-1rem)] max-w-none flex-col overflow-y-auto overscroll-contain p-4 pb-10 sm:p-6 sm:pb-12 ${surfaceClassNames.panel}`}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p
                            id="transaction-dialog-title"
                            className={typographyClassNames.eyebrow}
                        >
                            {transaction ? "Edit transaction" : "New transaction"}
                        </p>
                    </div>
                    <DialogCloseButton
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close transaction dialog"
                    />
                </div>

                <TransactionEditorForm
                    accounts={accounts}
                    accountContextId={accountContextId}
                    categories={categories}
                    categoryBalanceById={categoryBalanceById}
                    className="mt-6 flex min-h-0 flex-1 flex-col gap-4"
                    classificationPane={classificationPane}
                    defaultAccountId={defaultAccountId}
                    onCancel={onClose}
                    onSaved={onSaved}
                    onSubmittingChange={setIsSubmitting}
                    transaction={transaction}
                />
            </div>
        </div>
    );
}
