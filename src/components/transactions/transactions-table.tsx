"use client";

import {
    Fragment,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faAlignJustify,
    faAlignLeft,
    faCaretDown,
    faCaretRight,
    faCircleQuestion,
    faFilter,
    faLock,
    faLockOpen,
    faPlus,
    faRightLeft,
    faShuffle,
    faSliders,
    faSortDown,
    faSortUp,
    faSquare,
    faSquareCheck,
    faTag,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";

import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { ComboboxSelect } from "@/components/shared/combobox-select";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { MoneyAmount } from "@/components/shared/money-amount";
import { MoneyExpressionInput } from "@/components/shared/money-expression-input";
import { SelectionActionBar } from "@/components/shared/selection-action-bar";
import { useKeyboardShortcuts } from "@/components/shared/use-keyboard-shortcuts";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { buildGroupedCategoryComboboxOptions } from "@/features/budget/models/category-combobox-options";
import { findActivePlaidAccountLink } from "@/features/plaid/models/plaid-balance-summary";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import type { TransactionClassificationPendingPublic } from "@/features/transaction-classification/models/transaction-classification";
import {
    formatTransactionAmountFilterLabel,
    parseTransactionAmountFilter,
    transactionMatchesAmountFilter,
    type TransactionAmountFilter,
} from "@/features/transactions/models/transaction-amount-filter";
import {
    toDisplayTransactionLineCategoryId,
    transactionHasUncategorizedActivity,
} from "@/features/transactions/models/transaction-line-normalization";
import {
    findTransactionAutoMatches,
    type TransactionAutoMatchPair,
    type TransactionAutoMatchRejection,
    type TransactionAutoMatchType,
} from "@/features/transactions/models/transaction-auto-match";
import { getTransactionCategorizationEligibility } from "@/features/transactions/models/transaction-categorization";
import { getTransactionMergeEligibility } from "@/features/transactions/models/transaction-merge-eligibility";
import {
    getTransactionLineSignedAmountCents,
    getTransactionTransferCounterparty,
    getTransferLineCounterparty,
    hasMultipleTransactionLines,
    isSingleTransferLineTransaction,
    isZeroNetMultiLineTransaction,
} from "@/features/transactions/models/transaction-shape";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import {
    createOptimisticTransactionDeleteChanges,
    createOptimisticTransactionMergeChanges,
    createOptimisticTransactionStatusChanges,
} from "@/features/transactions/models/optimistic-transaction";
import { createOptimisticPendingClassificationChanges } from "@/features/transactions/models/optimistic-pending-classification";
import {
    formatTransactionDisplayDate,
    toTransactionDateInputValue,
} from "@/features/transactions/models/transaction-date";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { scrollElementIntoView } from "@/lib/browser/scroll-element-into-view";
import { formatUsd } from "@/lib/formatting/money";
import { keyboardShortcuts } from "@/lib/keyboard-shortcuts";
import { getTransactionsAccountHref } from "@/lib/navigation/transaction-account-routes";
import {
    controlClassNames,
    tableClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";
import { getFinancialPostingDeltaForLedgerAccount } from "@/modules/ledger";
import { presentTransactionImportActivity } from "@/features/transaction-importers/models/transaction-importer-registry";

import { TransactionDialog } from "./transaction-dialog";
import { BulkCategorizeTransactionsDialog } from "./bulk-categorize-transactions-dialog";
import {
    TransactionInlineEditor,
    type InlineTransactionFocusField,
} from "./transaction-inline-editor";
import {
    getDefaultPendingClassificationFieldSelection,
    TransactionPendingClassificationRow,
    type PendingClassificationFieldSelection,
} from "./transaction-pending-classification-row";
import { TransactionClassificationPane } from "./transaction-classification-pane";
import { TransactionMemoDisplay } from "./transaction-memo-display";
import {
    getTransactionAutoMatchSummary,
    TransactionAutoMatchDetails,
    TransactionSourceIcon,
    VenmoManagedIcon,
} from "./transaction-auto-match-details";

type CategoryOption = {
    categoryId: string;
    ledgerAccountId: string;
    name: string;
    status: "active" | "archived";
};

type TransactionsTableProps = {
    accountContextId?: string;
    accounts: AccountWithBalance[];
    autoMatchPlaidTransactionSyncRecords?: WorkspaceSnapshot["plaidTransactionSyncs"];
    autoMatchTransactions?: TransactionWithPostings[];
    categories: CategoryOption[];
    categoryBalanceById?: ReadonlyMap<string, number>;
    initialSelectedTransactionId?: string;
    transactions: TransactionWithPostings[];
};

type DateSortDirection = "asc" | "desc";

type TransactionTableFilters = {
    amountQuery: string;
    categoryId: string;
    duplicateAmountsOnly: boolean;
    payeeMemoQuery: string;
    uncategorizedOnly: boolean;
    unmatchedPlaidOnly: boolean;
};

type ActiveTransactionFilterId =
    | "amount"
    | "category"
    | "duplicateAmounts"
    | "payeeMemo"
    | "uncategorized"
    | "unmatchedPlaid";

type ActiveTransactionFilterSummary = {
    id: ActiveTransactionFilterId;
    label: string;
};

type PendingClassificationsResponse = {
    pending?: TransactionClassificationPendingPublic[];
};

type PendingClassificationApplyResponse = {
    appliedCount: number;
};

type BulkCategorizeTransactionsResponse = {
    updatedCount: number;
};

type InlineEditingTransaction = {
    field: InlineTransactionFocusField;
    lineId?: string;
    transactionId: string;
};

const emptyTransactionFilters: TransactionTableFilters = {
    amountQuery: "",
    categoryId: "",
    duplicateAmountsOnly: false,
    payeeMemoQuery: "",
    uncategorizedOnly: false,
    unmatchedPlaidOnly: false,
};

const duplicateTransactionWindowMs = 7 * 24 * 60 * 60 * 1_000;

function compareTransactionsByDate(
    left: TransactionWithPostings,
    right: TransactionWithPostings,
    direction: DateSortDirection,
) {
    const leftDate = toTransactionDateInputValue(left.occurredAt);
    const rightDate = toTransactionDateInputValue(right.occurredAt);
    const dateComparison =
        direction === "asc"
            ? leftDate.localeCompare(rightDate)
            : rightDate.localeCompare(leftDate);

    if (dateComparison !== 0) {
        return dateComparison;
    }

    return direction === "asc"
        ? left.transactionId.localeCompare(right.transactionId)
        : right.transactionId.localeCompare(left.transactionId);
}

function lineMatchesCategory(
    line: TransactionWithPostings["lines"][number],
    categoryId: string,
) {
    return toDisplayTransactionLineCategoryId(line.categoryId) === categoryId;
}

function transactionMatchesCategory(
    transaction: TransactionWithPostings,
    categoryId: string,
) {
    if (!categoryId) {
        return true;
    }

    return transaction.lines.some((line) =>
        lineMatchesCategory(line, categoryId),
    );
}

function isPendingClassificationCurrentForTransaction(
    pending: TransactionClassificationPendingPublic,
    transaction: TransactionWithPostings,
) {
    return (
        pending.transactionId === transaction.transactionId &&
        pending.transactionUpdatedAt === transaction.updatedAt &&
        pending.suggestion.transactionId === transaction.transactionId &&
        pending.suggestion.transactionUpdatedAt === transaction.updatedAt
    );
}

function transactionMatchesPayeeMemo(
    transaction: TransactionWithPostings,
    query: string,
) {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
        return true;
    }

    const importActivityText = (transaction.importActivities ?? []).flatMap(
        (activity) => {
            try {
                const presentation = presentTransactionImportActivity(activity);
                return [
                    presentation.summary.text,
                    presentation.summary.identifier,
                    ...presentation.referenceFields.map((field) =>
                        String(field.value),
                    ),
                ];
            } catch {
                return [];
            }
        },
    );

    return [
        transaction.payee,
        transaction.memo,
        ...importActivityText,
    ].some((value) =>
        (value ?? "").toLocaleLowerCase().includes(normalizedQuery),
    );
}

function getTransactionDisplayAmountCentsForAccount(
    transaction: TransactionWithPostings,
    ledgerAccountId: string | undefined,
) {
    const accountRelativeAmount = getFinancialPostingDeltaForLedgerAccount({
        ledgerAccountId,
        postings: transaction.postings,
    });

    return accountRelativeAmount ?? transaction.displayAmountCents;
}

function getDuplicateAmountTransactionIds(input: {
    accountById: Map<string, AccountWithBalance>;
    accountContextId?: string;
    accountContextLedgerAccountId?: string;
    transactions: TransactionWithPostings[];
}) {
    const transactionsByAmountCents = new Map<
        number,
        TransactionWithPostings[]
    >();

    for (const transaction of input.transactions) {
        if (
            !input.accountContextId &&
            isTrackingReferenceTransaction(transaction, input.accountById)
        ) {
            continue;
        }

        const amountCents = getTransactionDisplayAmountCentsForAccount(
            transaction,
            input.accountContextLedgerAccountId,
        );
        const transactionsForAmount =
            transactionsByAmountCents.get(amountCents) ?? [];

        transactionsForAmount.push(transaction);
        transactionsByAmountCents.set(amountCents, transactionsForAmount);
    }

    const duplicateTransactionIds = new Set<string>();

    for (const transactionsForAmount of transactionsByAmountCents.values()) {
        const transactionsByDate = transactionsForAmount
            .flatMap((transaction) => {
                const occurredAt = Date.parse(transaction.occurredAt);

                return Number.isFinite(occurredAt)
                    ? [{ occurredAt, transactionId: transaction.transactionId }]
                    : [];
            })
            .sort((left, right) => left.occurredAt - right.occurredAt);

        for (let index = 1; index < transactionsByDate.length; index += 1) {
            const previous = transactionsByDate[index - 1];
            const current = transactionsByDate[index];

            if (
                previous &&
                current &&
                current.occurredAt - previous.occurredAt <=
                    duplicateTransactionWindowMs
            ) {
                duplicateTransactionIds.add(previous.transactionId);
                duplicateTransactionIds.add(current.transactionId);
            }
        }
    }

    return duplicateTransactionIds;
}

function isPlaidEnabledAccount(input: {
    account: AccountWithBalance;
    plaidAccountLinks: WorkspaceSnapshot["plaidAccountLinks"];
}) {
    return Boolean(
        input.account.plaidLinkStatus !== "disabled" &&
            (input.account.plaidAccountLinkId ||
                findActivePlaidAccountLink(
                    input.account,
                    input.plaidAccountLinks,
                )),
    );
}

function isUnmatchedPlaidTransaction(input: {
    plaidEnabledAccountIds: ReadonlySet<string>;
    transaction: TransactionWithPostings;
}) {
    return (
        input.plaidEnabledAccountIds.has(input.transaction.referenceAccountId) &&
        input.transaction.source !== "plaid" &&
        input.transaction.status !== "reconciled" &&
        input.transaction.status !== "voided"
    );
}

function transactionMatchesFilters(
    transaction: TransactionWithPostings,
    filters: TransactionTableFilters,
    amountFilter: TransactionAmountFilter | null,
    displayAmountCents = transaction.displayAmountCents,
    perspectiveAccountId = transaction.referenceAccountId,
    hasDuplicateAmount = false,
    isUnmatchedPlaid = false,
) {
    if (
        filters.categoryId &&
        !transactionMatchesCategory(transaction, filters.categoryId)
    ) {
        return false;
    }

    if (
        filters.uncategorizedOnly &&
        !transactionHasUncategorizedActivity(transaction)
    ) {
        return false;
    }

    if (filters.duplicateAmountsOnly && !hasDuplicateAmount) {
        return false;
    }

    if (filters.unmatchedPlaidOnly && !isUnmatchedPlaid) {
        return false;
    }

    if (
        filters.payeeMemoQuery.trim() &&
        !transactionMatchesPayeeMemo(transaction, filters.payeeMemoQuery)
    ) {
        return false;
    }

    if (filters.amountQuery.trim()) {
        if (!amountFilter) {
            return false;
        }

        if (
            !transactionMatchesAmountFilter(
                transaction,
                amountFilter,
                displayAmountCents,
                perspectiveAccountId,
            )
        ) {
            return false;
        }
    }

    return true;
}

function transactionHasImporter(
    transaction: {
        importActivities?: readonly NonNullable<
            TransactionWithPostings["importActivities"]
        >[number][];
    },
    provider: string,
) {
    return (transaction.importActivities ?? []).some(
        (activity) => activity.provider === provider,
    );
}

function TransactionStatusIcon({
    status,
}: {
    status: TransactionWithPostings["status"];
}) {
    if (status !== "reconciled") {
        return null;
    }

    return (
        <FontAwesomeIcon
            aria-label="Reconciled and locked"
            icon={faLock}
            className="h-3 w-3 text-[var(--color-muted)]"
            title="Reconciled and locked"
        />
    );
}

function TransactionAutoMatchPane({
    autoMatches,
    categoryNameById,
    isMerging,
    isUpdatingRejection,
    onMerge,
    onReject,
    onRestore,
    showAccountContext,
}: {
    autoMatches: ReturnType<typeof findTransactionAutoMatches>;
    categoryNameById: ReadonlyMap<string, string>;
    isMerging: boolean;
    isUpdatingRejection: boolean;
    onMerge: (
        transactionIds: [string, string],
        expectedMatchType?: TransactionAutoMatchType,
    ) => void;
    onReject: (pair: TransactionAutoMatchPair) => void;
    onRestore: (rejection: TransactionAutoMatchRejection) => void;
    showAccountContext: boolean;
}) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [areRejectedMatchesExpanded, setAreRejectedMatchesExpanded] =
        useState(false);
    const [expandedMemoTransactionIds, setExpandedMemoTransactionIds] =
        useState<Set<string>>(() => new Set());
    const candidateCount =
        autoMatches.readyPairs.length + autoMatches.ambiguousPairs.length;

    if (candidateCount === 0 && autoMatches.rejectedPairs.length === 0) {
        return null;
    }

    function renderPair(
        pair: TransactionAutoMatchPair,
        key: string,
        actions: "merge" | "restore",
        showMetadata = false,
    ) {
        const isCreditCardPayment = pair.matchType === "creditCardPayment";
        const transfer =
            pair.matchType === "duplicate" ? undefined : pair.transfer;

        return (
            <div
                key={key}
                className="grid items-center gap-3 border-t border-[var(--color-border)] px-1 py-2.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]"
            >
                {showMetadata ? (
                    <TransactionAutoMatchDetails
                        categoryNameById={categoryNameById}
                        isMemoExpanded={expandedMemoTransactionIds.has(
                            pair.left.transactionId,
                        )}
                        onToggleMemo={() => {
                            setExpandedMemoTransactionIds((current) => {
                                const next = new Set(current);

                                if (next.has(pair.left.transactionId)) {
                                    next.delete(pair.left.transactionId);
                                } else {
                                    next.add(pair.left.transactionId);
                                }

                                return next;
                            });
                        }}
                        transaction={pair.left}
                    />
                ) : (
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <TransactionSourceIcon source={pair.left.source} />
                            <VenmoManagedIcon
                                hasVenmoActivity={transactionHasImporter(
                                    pair.left,
                                    "venmo",
                                )}
                                source={pair.left.source}
                            />
                            <span className="truncate font-medium">
                                {getTransactionAutoMatchSummary(pair.left)}
                            </span>
                        </div>
                        <p className="pl-7 text-xs text-[var(--color-muted)]">
                            {formatTransactionDisplayDate(pair.left.occurredAt)}
                        </p>
                    </div>
                )}
                <FontAwesomeIcon
                    aria-hidden="true"
                    icon={faRightLeft}
                    className="hidden text-[var(--color-muted)] md:block"
                />
                {showMetadata ? (
                    <TransactionAutoMatchDetails
                        categoryNameById={categoryNameById}
                        isMemoExpanded={expandedMemoTransactionIds.has(
                            pair.right.transactionId,
                        )}
                        onToggleMemo={() => {
                            setExpandedMemoTransactionIds((current) => {
                                const next = new Set(current);

                                if (next.has(pair.right.transactionId)) {
                                    next.delete(pair.right.transactionId);
                                } else {
                                    next.add(pair.right.transactionId);
                                }

                                return next;
                            });
                        }}
                        transaction={pair.right}
                    />
                ) : (
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <TransactionSourceIcon source={pair.right.source} />
                            <VenmoManagedIcon
                                hasVenmoActivity={transactionHasImporter(
                                    pair.right,
                                    "venmo",
                                )}
                                source={pair.right.source}
                            />
                            <span className="truncate font-medium">
                                {getTransactionAutoMatchSummary(pair.right)}
                            </span>
                        </div>
                        <p className="pl-7 text-xs text-[var(--color-muted)]">
                            {formatTransactionDisplayDate(pair.right.occurredAt)}
                        </p>
                    </div>
                )}
                <div className="flex items-center justify-between gap-3 md:justify-end">
                    <div className="text-right text-sm font-medium">
                        {transfer ? (
                            <p className="text-xs font-medium text-[var(--color-ink)]">
                                {isCreditCardPayment
                                    ? "Credit card payment"
                                    : "Bank transfer"}
                            </p>
                        ) : null}
                        <MoneyAmount
                            cents={
                                transfer
                                    ? -transfer.amountCents
                                    : pair.left.displayAmountCents
                            }
                        />
                        {transfer ? (
                            <p className="text-xs font-normal text-[var(--color-muted)]">
                                {transfer.sourceAccount.name} {"->"}{" "}
                                {transfer.destinationAccount.name}
                            </p>
                        ) : showAccountContext ? (
                            <p className="text-xs font-normal text-[var(--color-muted)]">
                                {pair.account.name}
                            </p>
                        ) : null}
                    </div>
                    {actions === "merge" ? (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={isMerging || isUpdatingRejection}
                                onClick={() => {
                                    onReject(pair);
                                }}
                                className={controlClassNames.secondarySolidActionCompact}
                            >
                                Do not Merge
                            </button>
                            <button
                                type="button"
                                disabled={isMerging || isUpdatingRejection}
                                onClick={() => {
                                    onMerge(
                                        [
                                            pair.left.transactionId,
                                            pair.right.transactionId,
                                        ],
                                        pair.matchType,
                                    );
                                }}
                                className={controlClassNames.primaryActionCompact}
                            >
                                {isMerging ? "Merging..." : "Merge"}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={isUpdatingRejection}
                            onClick={() => {
                                const rejection = autoMatches.rejectedPairs.find(
                                    (candidate) =>
                                        candidate.pair.left.transactionId ===
                                            pair.left.transactionId &&
                                        candidate.pair.right.transactionId ===
                                            pair.right.transactionId,
                                )?.rejection;

                                if (rejection) {
                                    onRestore(rejection);
                                }
                            }}
                            className={controlClassNames.secondaryActionCompact}
                        >
                            Restore
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <section
            aria-label="Auto matches"
            className="border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                        Auto matches
                    </h2>
                    <p className="text-xs text-[var(--color-muted)]">
                        {autoMatches.readyPairs.length} ready
                        {autoMatches.ambiguousPairs.length > 0
                            ? `, ${autoMatches.ambiguousPairs.length} need review`
                            : ""}
                        {autoMatches.rejectedPairs.length > 0
                            ? `, ${autoMatches.rejectedPairs.length} rejected`
                            : ""}
                    </p>
                </div>
                <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => {
                        setIsExpanded((current) => !current);
                    }}
                    className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-accent-contrast)] transition hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                >
                    <FontAwesomeIcon
                        aria-hidden="true"
                        icon={isExpanded ? faCaretDown : faCaretRight}
                    />
                    {isExpanded ? "Hide matches" : "Show matches"}
                </button>
            </div>

            {isExpanded ? (
                <div className="mt-3 grid gap-4">
                    {autoMatches.readyPairs.length > 0 ? (
                        <div>
                            <h3 className={typographyClassNames.eyebrow}>Ready to merge</h3>
                            <div>
                                {autoMatches.readyPairs.map((pair) =>
                                    renderPair(
                                        pair,
                                        `ready-${pair.left.transactionId}-${pair.right.transactionId}`,
                                        "merge",
                                        true,
                                    ),
                                )}
                            </div>
                        </div>
                    ) : null}
                    {autoMatches.ambiguousPairs.length > 0 ? (
                        <div>
                            <h3 className={typographyClassNames.eyebrow}>
                                Needs your choice
                            </h3>
                            <p className="mt-1 text-xs text-[var(--color-muted)]">
                                These transactions have more than one possible match. Choose the
                                pair to merge.
                            </p>
                            <div>
                                {autoMatches.ambiguousPairs.map((pair) =>
                                    renderPair(
                                        pair,
                                        `ambiguous-${pair.left.transactionId}-${pair.right.transactionId}`,
                                        "merge",
                                    ),
                                )}
                            </div>
                        </div>
                    ) : null}
                    {autoMatches.rejectedPairs.length > 0 ? (
                        <div>
                            <button
                                type="button"
                                aria-expanded={areRejectedMatchesExpanded}
                                onClick={() => {
                                    setAreRejectedMatchesExpanded((current) => !current);
                                }}
                                className="inline-flex cursor-pointer items-center gap-2 text-left text-[var(--color-muted)] transition hover:text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                            >
                                <FontAwesomeIcon
                                    aria-hidden="true"
                                    icon={areRejectedMatchesExpanded ? faCaretDown : faCaretRight}
                                />
                                <span className={typographyClassNames.eyebrow}>
                                    Rejected matches
                                </span>
                                <span className="text-xs">
                                    ({autoMatches.rejectedPairs.length})
                                </span>
                            </button>
                            {areRejectedMatchesExpanded ? (
                                <>
                                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                                        Rejected pairs return automatically if either transaction
                                        changes.
                                    </p>
                                    <div>
                                        {autoMatches.rejectedPairs.map(({ pair }) =>
                                            renderPair(
                                                pair,
                                                `rejected-${pair.left.transactionId}-${pair.right.transactionId}`,
                                                "restore",
                                            ),
                                        )}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}

function TransactionSelectionCheckbox({
    checked,
    label,
    onClick,
}: {
    checked: boolean;
    label: string;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={checked ? `Deselect ${label}` : `Select ${label}`}
            onClick={onClick}
            onMouseDown={(event) => {
                event.stopPropagation();
                if (event.shiftKey) {
                    event.preventDefault();
                }
            }}
            className="inline-flex size-5 cursor-pointer items-center justify-center text-[var(--color-muted)] transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
        >
            <FontAwesomeIcon
                aria-hidden="true"
                icon={checked ? faSquareCheck : faSquare}
                className={
                    checked
                        ? "text-[var(--color-accent-contrast)]"
                        : "text-[var(--color-muted)]"
                }
            />
        </button>
    );
}

function StartingBalanceRow({ account }: { account: AccountWithBalance }) {
    return (
        <tr
            aria-label="Starting balance"
            className="border-b border-[var(--color-border)]/70 bg-[var(--color-panel-strong)]/25 text-[var(--color-muted)]"
        >
            <td className="w-10 px-2 py-1.5" aria-hidden="true" />
            <td className="px-4 py-1.5 align-middle">
                {formatTransactionDisplayDate(account.openedOn)}
            </td>
            <td className="px-4 py-1.5 align-middle font-medium text-[var(--color-ink)]">
                Starting balance
            </td>
            <td className="px-4 py-1.5 align-middle">Account</td>
            <td className="px-4 py-1.5 align-middle">Opening balance</td>
            <td className="px-4 py-1.5 text-right align-middle font-medium text-[var(--color-ink)]">
                <MoneyAmount cents={account.openingBalanceCents} />
            </td>
            <td className="w-10 px-2 py-1.5" aria-hidden="true" />
        </tr>
    );
}

function isTrackingReferenceTransaction(
    transaction: TransactionWithPostings,
    accountById: Map<string, AccountWithBalance>,
) {
    return (
        accountById.get(transaction.referenceAccountId)?.accountType === "tracking"
    );
}

export function TransactionsTable({
    accountContextId,
    accounts,
    autoMatchPlaidTransactionSyncRecords,
    autoMatchTransactions,
    categories,
    categoryBalanceById,
    initialSelectedTransactionId,
    transactions,
}: TransactionsTableProps) {
    const router = useRouter();
    const {
        applyOptimisticWorkspaceChanges,
        applyWorkspaceMutationResponse,
        discardOptimisticWorkspaceChanges,
        refreshWorkspaceSnapshot,
        snapshot,
    } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [dialogTransaction, setDialogTransaction] =
        useState<TransactionWithPostings | null>(null);
    const [inlineEditingTransaction, setInlineEditingTransaction] =
        useState<InlineEditingTransaction | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteDialogTransaction, setDeleteDialogTransaction] =
        useState<TransactionWithPostings | null>(null);
    const [deleteImpact, setDeleteImpact] =
        useState<DeletionImpactSummary | null>(null);
    const [deletePreviewError, setDeletePreviewError] = useState<string | null>(
        null,
    );
    const [isLoadingDeletePreview, setIsLoadingDeletePreview] = useState(false);
    const [pendingDeleteTransactionId, setPendingDeleteTransactionId] = useState<
        string | null
    >(null);
    const [bulkDeleteTransactionIds, setBulkDeleteTransactionIds] = useState<
        string[]
    >([]);
    const [isSubmittingBulkDelete, setIsSubmittingBulkDelete] = useState(false);
    const [isMergingTransactions, setIsMergingTransactions] = useState(false);
    const [isUpdatingAutoMatchRejection, setIsUpdatingAutoMatchRejection] =
        useState(false);
    const [isCategorizeDialogOpen, setIsCategorizeDialogOpen] = useState(false);
    const [isCategorizingTransactions, setIsCategorizingTransactions] =
        useState(false);
    const [isUpdatingTransactionStatus, setIsUpdatingTransactionStatus] =
        useState(false);
    const [dateSortDirection, setDateSortDirection] =
        useState<DateSortDirection>("desc");
    const [filters, setFilters] = useState<TransactionTableFilters>(
        emptyTransactionFilters,
    );
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const payeeMemoFilterInputRef = useRef<HTMLInputElement>(null);
    const [
        pendingClassificationsByTransactionId,
        setPendingClassificationsByTransactionId,
    ] = useState<Record<string, TransactionClassificationPendingPublic>>({});
    const [
        pendingClassificationFieldSelectionsByTransactionId,
        setPendingClassificationFieldSelectionsByTransactionId,
    ] = useState<Record<string, PendingClassificationFieldSelection>>({});
    const [
        applyingPendingClassificationTransactionId,
        setApplyingPendingClassificationTransactionId,
    ] = useState<string | null>(null);
    const [
        rejectingPendingClassificationTransactionId,
        setRejectingPendingClassificationTransactionId,
    ] = useState<string | null>(null);
    const [
        manuallyEditingClassificationTransactionId,
        setManuallyEditingClassificationTransactionId,
    ] = useState<string | null>(null);
    const [showFullMemos, setShowFullMemos] = useState(false);
    const accountNameById = useMemo(
        () => new Map(accounts.map((account) => [account.accountId, account.name])),
        [accounts],
    );
    const accountById = useMemo(
        () => new Map(accounts.map((account) => [account.accountId, account])),
        [accounts],
    );
    const categoryNameById = useMemo(
        () =>
            new Map(
                categories.map((category) => [category.categoryId, category.name]),
            ),
        [categories],
    );
    const accountContextLedgerAccountId = accountContextId
        ? accountById.get(accountContextId)?.ledgerAccountId
        : undefined;
    const accountContext = accountContextId
        ? accountById.get(accountContextId)
        : undefined;
    const showAccountColumn = !accountContextId;
    const transactionTableColumnCount = showAccountColumn ? 8 : 7;
    const categoryFilterOptions = useMemo(() => {
        const optionCategories =
            snapshot.budgetCategories.length > 0
                ? snapshot.budgetCategories.filter(
                        (category) =>
                            category.status === "active" &&
                            isUserVisibleBudgetCategory(category),
                    )
                : categories;

        return buildGroupedCategoryComboboxOptions({
            categories: optionCategories,
            getValue: (category) => category.categoryId,
            groups: snapshot.budgetGroups,
        });
    }, [categories, snapshot.budgetCategories, snapshot.budgetGroups]);
    const parsedAmountFilter = useMemo(
        () => parseTransactionAmountFilter(filters.amountQuery),
        [filters.amountQuery],
    );
    const activeFilterSummaryItems = useMemo(() => {
        const items: ActiveTransactionFilterSummary[] = [];

        if (filters.categoryId) {
            items.push({
                id: "category",
                label: `Category: ${
                    categoryNameById.get(filters.categoryId) ?? filters.categoryId
                }`,
            });
        }

        if (filters.amountQuery.trim()) {
            items.push({
                id: "amount",
                label: formatTransactionAmountFilterLabel(filters.amountQuery),
            });
        }

        if (filters.payeeMemoQuery.trim()) {
            items.push({
                id: "payeeMemo",
                label: `Payee/Memo: ${filters.payeeMemoQuery.trim()}`,
            });
        }

        if (filters.uncategorizedOnly) {
            items.push({
                id: "uncategorized",
                label: "Uncategorized only",
            });
        }

        if (filters.duplicateAmountsOnly) {
            items.push({
                id: "duplicateAmounts",
                label: "Duplicate transactions",
            });
        }

        if (filters.unmatchedPlaidOnly) {
            items.push({
                id: "unmatchedPlaid",
                label: "Unmatched transactions",
            });
        }

        return items;
    }, [categoryNameById, filters]);
    const hasActiveFilter = activeFilterSummaryItems.length > 0;
    const showStartingBalanceRow = Boolean(accountContext && !hasActiveFilter);
    const uncategorizedTransactionCount = useMemo(
        () =>
            transactions.filter((transaction) => {
                if (
                    !accountContextId &&
                    isTrackingReferenceTransaction(transaction, accountById)
                ) {
                    return false;
                }

                return transactionHasUncategorizedActivity(transaction);
            }).length,
        [accountById, accountContextId, transactions],
    );
    const duplicateAmountTransactionIds = useMemo(
        () =>
            getDuplicateAmountTransactionIds({
                accountById,
                accountContextId,
                accountContextLedgerAccountId,
                transactions,
            }),
        [
            accountById,
            accountContextId,
            accountContextLedgerAccountId,
            transactions,
        ],
    );
    const plaidEnabledAccountIds = useMemo(
        () =>
            new Set(
                accounts
                    .filter((account) =>
                        isPlaidEnabledAccount({
                            account,
                            plaidAccountLinks: snapshot.plaidAccountLinks,
                        }),
                    )
                    .map((account) => account.accountId),
            ),
        [accounts, snapshot.plaidAccountLinks],
    );
    const canFilterUnmatchedTransactions = accountContextId
        ? plaidEnabledAccountIds.has(accountContextId)
        : plaidEnabledAccountIds.size > 0;
    const visibleTransactions = useMemo(
        () =>
            transactions
                .filter((transaction) => {
                    if (
                        !accountContextId &&
                        isTrackingReferenceTransaction(transaction, accountById)
                    ) {
                        return false;
                    }

                    return transactionMatchesFilters(
                        transaction,
                        filters,
                        parsedAmountFilter,
                        getTransactionDisplayAmountCentsForAccount(
                            transaction,
                            accountContextLedgerAccountId,
                        ),
                        accountContextId ?? transaction.referenceAccountId,
                        duplicateAmountTransactionIds.has(transaction.transactionId),
                        isUnmatchedPlaidTransaction({
                            plaidEnabledAccountIds,
                            transaction,
                        }),
                    );
                })
                .sort((left, right) =>
                    compareTransactionsByDate(left, right, dateSortDirection),
                ),
        [
            dateSortDirection,
            filters,
            parsedAmountFilter,
            transactions,
            accountContextLedgerAccountId,
            accountContextId,
            accountById,
            duplicateAmountTransactionIds,
            plaidEnabledAccountIds,
        ],
    );
    const autoMatches = useMemo(
        () =>
            findTransactionAutoMatches({
                accountId: accountContextId,
                accounts: accounts.map((account) => ({
                    accountId: account.accountId,
                    accountType: account.accountType,
                    ledgerAccountId: account.ledgerAccountId,
                    name: account.name,
                })),
                rejections: snapshot.transactionAutoMatchRejections,
                transactions: autoMatchTransactions ?? transactions,
            }),
        [
            accountContextId,
            accounts,
            autoMatchTransactions,
            snapshot.transactionAutoMatchRejections,
            transactions,
        ],
    );
    const accountPendingPreloadTransactionIdsKey = useMemo(() => {
        if (!accountContextId) {
            return "";
        }

        return transactions
            .filter(
                (transaction) =>
                    transaction.referenceAccountId === accountContextId &&
                    transactionHasUncategorizedActivity(transaction),
            )
            .map((transaction) => transaction.transactionId)
            .sort()
            .join("\n");
    }, [accountContextId, transactions]);
    const hasInitialSelectedTransaction =
        Boolean(initialSelectedTransactionId) &&
        visibleTransactions.some(
            (transaction) =>
                transaction.transactionId === initialSelectedTransactionId,
        );
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<
        string[]
    >(() =>
        hasInitialSelectedTransaction && initialSelectedTransactionId
            ? [initialSelectedTransactionId]
            : [],
    );

    useEffect(() => {
        if (isFilterOpen) {
            payeeMemoFilterInputRef.current?.focus();
        }
    }, [isFilterOpen]);
    const [selectionAnchorTransactionId, setSelectionAnchorTransactionId] =
        useState<string | null>(() =>
            hasInitialSelectedTransaction && initialSelectedTransactionId
                ? initialSelectedTransactionId
                : null,
        );
    const selectedTransactionIdSet = useMemo(
        () => new Set(selectedTransactionIds),
        [selectedTransactionIds],
    );
    const initialSelectedTransactionRowRef = useRef<HTMLTableRowElement | null>(
        null,
    );
    const transactionsTableRef = useRef<HTMLTableElement | null>(null);
    const selectedTransactions = useMemo(
        () =>
            visibleTransactions.filter((transaction) =>
                selectedTransactionIdSet.has(transaction.transactionId),
            ),
        [selectedTransactionIdSet, visibleTransactions],
    );
    const selectedTransaction =
        selectedTransactions.length === 1 ? selectedTransactions[0] : null;
    const selectedTransactionCount = selectedTransactions.length;
    const hasSelectedTransactions = selectedTransactionCount > 0;
    const hasSelectedLockedTransactions = selectedTransactions.some(
        (transaction) => transaction.status === "reconciled",
    );
    const hasSelectedUnlockedTransactions = selectedTransactions.some(
        (transaction) =>
            transaction.status !== "reconciled" && transaction.status !== "voided",
    );
    const selectedMergeEligibility = useMemo(
        () => getTransactionMergeEligibility(selectedTransactions),
        [selectedTransactions],
    );
    const selectedCategorizationEligibility = useMemo(
        () => getTransactionCategorizationEligibility(selectedTransactions),
        [selectedTransactions],
    );
    const inlineEditingTransactionId =
        inlineEditingTransaction?.transactionId ?? null;

    useEffect(() => {
        if (!initialSelectedTransactionId || !hasInitialSelectedTransaction) {
            return;
        }

        scrollElementIntoView(initialSelectedTransactionRowRef.current);
    }, [hasInitialSelectedTransaction, initialSelectedTransactionId]);

    useEffect(() => {
        const transactionIds = accountPendingPreloadTransactionIdsKey
            ? accountPendingPreloadTransactionIdsKey.split("\n")
            : [];

        if (!accountContextId) {
            return;
        }

        const pendingAccountId = accountContextId;

        if (transactionIds.length === 0) {
            return;
        }

        let isMounted = true;

        async function loadPendingClassifications() {
            try {
                const response = await fetch(
                    "/api/transactions/classification/pending",
                    {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            accountId: pendingAccountId,
                        }),
                    },
                );

                if (!response.ok) {
                    throw response;
                }

                const payload =
                    (await response.json()) as PendingClassificationsResponse;

                if (!isMounted) {
                    return;
                }

                setPendingClassificationsByTransactionId((current) => {
                    const next = { ...current };

                    for (const [transactionId, pending] of Object.entries(next)) {
                        if (pending.accountId === pendingAccountId) {
                            delete next[transactionId];
                        }
                    }

                    for (const pending of payload.pending ?? []) {
                        next[pending.transactionId] = pending;
                    }

                    return next;
                });
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                notifyError({
                    message:
                        error instanceof Response
                            ? await parseApiErrorMessage(
                                    error,
                                    "Unable to load AI classifications.",
                                )
                            : error instanceof Error
                                ? error.message
                                : "Unable to load AI classifications.",
                    title: "AI classifications unavailable.",
                });
            }
        }

        void loadPendingClassifications();

        return () => {
            isMounted = false;
        };
    }, [accountContextId, accountPendingPreloadTransactionIdsKey, notifyError]);

    useEffect(() => {
        if (accountContextId) {
            return;
        }

        const transaction = inlineEditingTransactionId
            ? visibleTransactions.find(
                    (candidate) => candidate.transactionId === inlineEditingTransactionId,
                )
            : null;

        if (!transaction || !transactionHasUncategorizedActivity(transaction)) {
            return;
        }

        const transactionId = transaction.transactionId;
        let isMounted = true;

        async function loadPendingClassification() {
            try {
                const response = await fetch(
                    "/api/transactions/classification/pending",
                    {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            transactionIds: [transactionId],
                        }),
                    },
                );

                if (!response.ok) {
                    throw response;
                }

                const payload =
                    (await response.json()) as PendingClassificationsResponse;

                if (!isMounted) {
                    return;
                }

                setPendingClassificationsByTransactionId((current) => {
                    const next = { ...current };
                    delete next[transactionId];

                    for (const pending of payload.pending ?? []) {
                        next[pending.transactionId] = pending;
                    }

                    return next;
                });
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                notifyError({
                    message:
                        error instanceof Response
                            ? await parseApiErrorMessage(
                                    error,
                                    "Unable to load AI classifications.",
                                )
                            : error instanceof Error
                                ? error.message
                                : "Unable to load AI classifications.",
                    title: "AI classifications unavailable.",
                });
            }
        }

        void loadPendingClassification();

        return () => {
            isMounted = false;
        };
    }, [
        accountContextId,
        inlineEditingTransactionId,
        notifyError,
        visibleTransactions,
    ]);

    function removePendingClassification(transactionId: string) {
        setManuallyEditingClassificationTransactionId((current) =>
            current === transactionId ? null : current,
        );
        setPendingClassificationsByTransactionId((current) => {
            if (!current[transactionId]) {
                return current;
            }

            const next = { ...current };
            delete next[transactionId];

            return next;
        });
        setPendingClassificationFieldSelectionsByTransactionId((current) => {
            if (!current[transactionId]) {
                return current;
            }

            const next = { ...current };
            delete next[transactionId];

            return next;
        });
    }

    function restorePendingClassification(
        pending: TransactionClassificationPendingPublic,
        fieldSelection: PendingClassificationFieldSelection,
    ) {
        setPendingClassificationsByTransactionId((current) => ({
            ...current,
            [pending.transactionId]: pending,
        }));
        setPendingClassificationFieldSelectionsByTransactionId((current) => ({
            ...current,
            [pending.transactionId]: fieldSelection,
        }));
    }

    function getPendingClassificationFieldSelection(
        pending: TransactionClassificationPendingPublic,
        transaction: TransactionWithPostings,
    ) {
        return (
            pendingClassificationFieldSelectionsByTransactionId[
                pending.transactionId
            ] ??
            getDefaultPendingClassificationFieldSelection({
                suggestion: pending.suggestion,
                transaction,
            })
        );
    }

    function updatePendingClassificationFieldSelection(
        transactionId: string,
        fieldSelection: PendingClassificationFieldSelection,
    ) {
        setPendingClassificationFieldSelectionsByTransactionId((current) => ({
            ...current,
            [transactionId]: fieldSelection,
        }));
    }

    async function applyPendingClassification(
        pending: TransactionClassificationPendingPublic,
        fieldSelection: PendingClassificationFieldSelection,
    ) {
        if (pending.status === "rejected" || pending.suggestion.type === "noSuggestion") {
            return;
        }

        const transaction =
            transactions.find(
                (candidate) => candidate.transactionId === pending.transactionId,
            ) ?? null;
        const optimisticChanges = transaction
            ? createOptimisticPendingClassificationChanges({
                    accounts,
                    categories,
                    fieldSelection,
                    pending,
                    transaction,
                })
            : [];
        const isOptimistic = optimisticChanges.length > 0;

        setApplyingPendingClassificationTransactionId(pending.transactionId);
        const activity = startActivity({
            completedLabel: "AI classification applied.",
            pendingLabel: "Applying AI classification…",
        });

        const optimisticMutationId = isOptimistic
            ? applyOptimisticWorkspaceChanges(optimisticChanges)
            : null;

        if (isOptimistic) {
            removePendingClassification(pending.transactionId);
            setInlineEditingTransaction(null);
        }

        try {
            const response = await fetch(
                "/api/transactions/classification/pending/apply",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        fieldSelection,
                        mutationId: createWorkspaceMutationId(),
                        transactionId: pending.transactionId,
                    }),
                },
            );

            if (!response.ok) {
                throw response;
            }

            await applyWorkspaceMutationResponse<PendingClassificationApplyResponse>(
                response,
                { optimisticMutationId },
            );

            if (!isOptimistic) {
                removePendingClassification(pending.transactionId);
                setInlineEditingTransaction(null);
            }

            activity.complete();
        } catch (error) {
            activity.fail();
            if (isOptimistic) {
                discardOptimisticWorkspaceChanges(optimisticMutationId);
                await refreshWorkspaceSnapshot();
                restorePendingClassification(pending, fieldSelection);
            }

            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                                error,
                                "Unable to apply AI classification.",
                            )
                        : error instanceof Error
                            ? error.message
                            : "Unable to apply AI classification.",
                title: "Classification could not be applied.",
            });
        } finally {
            setApplyingPendingClassificationTransactionId((current) =>
                current === pending.transactionId ? null : current,
            );
        }
    }

    async function rejectPendingClassification(
        pending: TransactionClassificationPendingPublic,
    ) {
        if (
            pending.status === "rejected" ||
            rejectingPendingClassificationTransactionId === pending.transactionId
        ) {
            return;
        }

        setRejectingPendingClassificationTransactionId(pending.transactionId);
        const activity = startActivity({
            completedLabel: "AI classification rejected.",
            pendingLabel: "Rejecting AI classification…",
        });

        try {
            const response = await fetch(
                "/api/transactions/classification/pending/reject",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ transactionId: pending.transactionId }),
                },
            );

            if (!response.ok) {
                throw response;
            }

            const payload = (await response.json()) as {
                pending?: TransactionClassificationPendingPublic | null;
            };

            if (!payload.pending) {
                throw new Error("The rejected AI classification was not returned.");
            }

            setPendingClassificationsByTransactionId((current) => ({
                ...current,
                [pending.transactionId]: payload.pending!,
            }));
            setPendingClassificationFieldSelectionsByTransactionId((current) => {
                const next = { ...current };
                delete next[pending.transactionId];
                return next;
            });
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to reject AI classification.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to reject AI classification.",
                title: "Classification could not be rejected.",
            });
        } finally {
            setRejectingPendingClassificationTransactionId((current) =>
                current === pending.transactionId ? null : current,
            );
        }
    }

    function clearTransactionSelection() {
        setSelectedTransactionIds([]);
        setSelectionAnchorTransactionId(null);
    }

    function activateAdjacentTransaction(direction: "next" | "previous") {
        if (visibleTransactions.length === 0) {
            return;
        }

        const currentTransactionId =
            selectionAnchorTransactionId ??
            selectedTransactionIds[selectedTransactionIds.length - 1];
        const currentIndex = visibleTransactions.findIndex(
            (transaction) =>
                transaction.transactionId === currentTransactionId,
        );
        const nextIndex =
            currentIndex === -1
                ? direction === "next"
                    ? 0
                    : visibleTransactions.length - 1
                : direction === "next"
                  ? (currentIndex + 1) % visibleTransactions.length
                  : (currentIndex - 1 + visibleTransactions.length) %
                    visibleTransactions.length;
        const nextTransaction = visibleTransactions[nextIndex];

        if (!nextTransaction) {
            return;
        }

        setSelectedTransactionIds([nextTransaction.transactionId]);
        setSelectionAnchorTransactionId(nextTransaction.transactionId);

        const nextRow = Array.from(
            transactionsTableRef.current?.querySelectorAll<HTMLTableRowElement>(
                "[data-transaction-navigation-id]",
            ) ?? [],
        ).find(
            (row) =>
                row.dataset.transactionNavigationId ===
                nextTransaction.transactionId,
        );

        nextRow?.focus({ preventScroll: true });
        scrollElementIntoView(nextRow ?? null, {
            behavior: "auto",
            block: "nearest",
        });
    }

    function openNewTransaction() {
        clearTransactionSelection();
        setDialogTransaction(null);
        setInlineEditingTransaction(null);
        setIsCreating(true);
    }

    function mergeTransactionSelection(transactionIds: string[]) {
        const transactionIdSet = new Set(transactionIds);

        return visibleTransactions
            .filter((transaction) => transactionIdSet.has(transaction.transactionId))
            .map((transaction) => transaction.transactionId);
    }

    function getVisibleRangeTransactionIds(
        startTransactionId: string,
        endTransactionId: string,
    ) {
        const startIndex = visibleTransactions.findIndex(
            (transaction) => transaction.transactionId === startTransactionId,
        );
        const endIndex = visibleTransactions.findIndex(
            (transaction) => transaction.transactionId === endTransactionId,
        );

        if (startIndex < 0 || endIndex < 0) {
            return [endTransactionId];
        }

        const [fromIndex, toIndex] =
            startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

        return visibleTransactions
            .slice(fromIndex, toIndex + 1)
            .map((transaction) => transaction.transactionId);
    }

    function selectTransaction(
        transaction: TransactionWithPostings,
        input: {
            shiftKey?: boolean;
        } = {},
    ) {
        const transactionId = transaction.transactionId;

        if (input.shiftKey) {
            const anchorTransactionId =
                selectionAnchorTransactionId ??
                selectedTransactionIds[selectedTransactionIds.length - 1] ??
                transactionId;
            const rangeTransactionIds = getVisibleRangeTransactionIds(
                anchorTransactionId,
                transactionId,
            );

            setSelectedTransactionIds(
                mergeTransactionSelection([
                    ...selectedTransactionIds,
                    ...rangeTransactionIds,
                ]),
            );
            setSelectionAnchorTransactionId(transactionId);
            return;
        }

        if (selectedTransactionIdSet.has(transactionId)) {
            const nextSelection = selectedTransactionIds.filter(
                (selectedTransactionId) => selectedTransactionId !== transactionId,
            );

            setSelectedTransactionIds(nextSelection);
            setSelectionAnchorTransactionId(
                nextSelection[nextSelection.length - 1] ?? null,
            );
            return;
        }

        setSelectedTransactionIds(
            mergeTransactionSelection([...selectedTransactionIds, transactionId]),
        );
        setSelectionAnchorTransactionId(transactionId);
    }

    function toggleTransactionSelectionCheckbox(
        event: MouseEvent<HTMLButtonElement>,
        transaction: TransactionWithPostings,
    ) {
        event.stopPropagation();

        const transactionId = transaction.transactionId;

        if (event.shiftKey && !selectedTransactionIdSet.has(transactionId)) {
            selectTransaction(transaction, { shiftKey: true });
            return;
        }

        if (selectedTransactionIdSet.has(transactionId)) {
            const nextSelection = selectedTransactionIds.filter(
                (selectedTransactionId) => selectedTransactionId !== transactionId,
            );

            setSelectedTransactionIds(nextSelection);
            setSelectionAnchorTransactionId(
                nextSelection[nextSelection.length - 1] ?? null,
            );
            return;
        }

        selectTransaction(transaction);
    }

    const selectedActionTitle =
        selectedTransactionCount > 1
            ? `${selectedTransactionCount} transactions selected`
            : selectedTransaction?.payee?.trim() || "Transaction";
    const selectedActionDetail =
        selectedTransactionCount > 1 ? undefined : selectedTransaction ? (
            <div className="grid min-w-0 max-w-full gap-1 overflow-hidden">
                <span className="block min-w-0 truncate">
                    {getTransactionAccountLabel(selectedTransaction)} -{" "}
                    {formatTransactionDisplayDate(selectedTransaction.occurredAt)}
                </span>
                <span className="block min-w-0 max-w-full overflow-hidden">
                    <TransactionMemoDisplay
                        managedMetadata={selectedTransaction}
                        memo={selectedTransaction.memo}
                    />
                </span>
            </div>
        ) : undefined;
    const selectedTransferCounterpartyAccount = selectedTransaction
        ? getTransferCounterpartyAccount(selectedTransaction)
        : null;
    const selectedTransferCounterpartyActionLabel = selectedTransaction
        ? getTransferCounterpartyActionLabel(selectedTransaction)
        : "Show Destination";
    const isSingleDeletePending =
        deleteDialogTransaction !== null &&
        pendingDeleteTransactionId === deleteDialogTransaction.transactionId;
    const isDeleteDialogOpen =
        deleteDialogTransaction !== null || bulkDeleteTransactionIds.length > 0;
    const deleteDialogTitle =
        bulkDeleteTransactionIds.length > 0
            ? `Delete ${bulkDeleteTransactionIds.length} transactions?`
            : undefined;
    const isDeleteSubmitting = isSingleDeletePending || isSubmittingBulkDelete;
    const isSelectedDeletePending =
        selectedTransaction !== null &&
        pendingDeleteTransactionId === selectedTransaction.transactionId;

    function getCategoryLabel(categoryId: string | undefined) {
        const displayCategoryId = toDisplayTransactionLineCategoryId(categoryId);

        return displayCategoryId
            ? (categoryNameById.get(displayCategoryId) ?? displayCategoryId)
            : "Uncategorized";
    }

    function getTransactionAccountLabel(transaction: TransactionWithPostings) {
        if (accountContextId) {
            return accountNameById.get(accountContextId) ?? accountContextId;
        }

        return (
            accountNameById.get(transaction.referenceAccountId) ??
            transaction.referenceAccountId
        );
    }

    function getTransferCounterpartyDisplay(
        transaction: TransactionWithPostings,
    ) {
        const transferCounterparty = getTransactionTransferCounterparty(
            transaction,
            accountContextId,
        );
        const counterpartyAccountId = transferCounterparty?.counterpartyAccountId;
        const label = counterpartyAccountId
            ? (accountNameById.get(counterpartyAccountId) ?? counterpartyAccountId)
            : "Unknown account";

        return {
            label,
            preposition: transferCounterparty?.direction ?? "to",
        };
    }

    function getTransferCounterpartyAccount(
        transaction: TransactionWithPostings,
    ) {
        const transferCounterparty = getTransactionTransferCounterparty(
            transaction,
            accountContextId,
        );
        const counterpartyAccountId = transferCounterparty?.counterpartyAccountId;

        return counterpartyAccountId
            ? (accountById.get(counterpartyAccountId) ?? null)
            : null;
    }

    function getTransferCounterpartyActionLabel(
        transaction: TransactionWithPostings,
    ) {
        const transferCounterparty = getTransactionTransferCounterparty(
            transaction,
            accountContextId,
        );

        return transferCounterparty?.direction === "from"
            ? "Show Source"
            : "Show Destination";
    }

    function getTransactionCategoryDisplay(transaction: TransactionWithPostings) {
        if (isSingleTransferLineTransaction(transaction)) {
            const transferDisplay = getTransferCounterpartyDisplay(transaction);
            const transferText = `Transfer ${transferDisplay.preposition} ${transferDisplay.label}`;
            const directionLabel =
                transferDisplay.preposition === "from" ? "From" : "To";

            return {
                icon: faRightLeft,
                iconClassName: "text-[var(--color-accent-contrast)]",
                iconLabel: transferText,
                label: `${directionLabel}: ${transferDisplay.label}`,
                labelClassName: "text-[var(--color-ink)]",
                title: transferText,
            };
        }

        if (transaction.kind === "adjustment") {
            return {
                icon: faSliders,
                iconClassName: "text-[var(--color-muted)]",
                iconLabel: "Adjustment",
                label: "adjustment",
                labelClassName: "text-[var(--color-muted)]",
                title: "Adjustment",
            };
        }

        if (isZeroNetMultiLineTransaction(transaction)) {
            return {
                icon: faShuffle,
                iconClassName: "text-[var(--color-accent-contrast)]",
                iconLabel: "Internal transfer",
                label: "Internal Transfer",
                labelClassName: "text-[var(--color-ink)]",
                title: "Internal transfer",
            };
        }

        if (hasMultipleTransactionLines(transaction)) {
            return {
                icon: faTag,
                iconClassName: "text-[var(--color-accent-contrast)]",
                iconLabel: "Mixed transaction",
                label: "Mixed",
                labelClassName: "text-[var(--color-ink)]",
                title: "Mixed transaction",
            };
        }

        const displayCategoryId = toDisplayTransactionLineCategoryId(
            transaction.referenceCategoryId,
        );

        if (displayCategoryId) {
            const label =
                categoryNameById.get(displayCategoryId) ?? displayCategoryId;

            return {
                icon: faTag,
                iconClassName: "text-[var(--color-accent-contrast)]",
                iconLabel: "Category assigned",
                label,
                labelClassName: "text-[var(--color-ink)]",
                title: `Category assigned: ${label}`,
            };
        }

        return {
            icon: faCircleQuestion,
            iconClassName: "text-[var(--tone-warning-ink)]",
            iconLabel: "Unassigned category",
            label: "Uncategorized",
            labelClassName: "text-[var(--tone-warning-ink)]",
            title: "Unassigned category",
        };
    }

    function getLineCategoryLabel(
        line: TransactionWithPostings["lines"][number],
        transaction: TransactionWithPostings,
    ) {
        const transferCounterparty = getTransferLineCounterparty(
            line,
            accountContextId,
        );

        if (transferCounterparty) {
            const accountLabel = accountNameById.get(
                transferCounterparty.counterpartyAccountId,
            );
            const directionLabel =
                transferCounterparty.direction === "from" ? "From" : "To";

            return accountLabel ? `${directionLabel}: ${accountLabel}` : "Transfer";
        }

        if (transaction.kind === "adjustment") {
            return "adjustment";
        }

        return getCategoryLabel(line.categoryId);
    }

    function getLineDisplayAmountCents(
        line: TransactionWithPostings["lines"][number],
        transaction: TransactionWithPostings,
    ) {
        const perspectiveAccountId =
            accountContextId ?? transaction.referenceAccountId;

        return getTransactionLineSignedAmountCents(line, perspectiveAccountId);
    }

    function startInlineEditor(
        transaction: TransactionWithPostings,
        field: InlineTransactionFocusField,
        lineId?: string,
    ) {
        clearTransactionSelection();
        setDialogTransaction(null);
        setIsCreating(false);
        setManuallyEditingClassificationTransactionId(null);
        setInlineEditingTransaction({
            field,
            lineId,
            transactionId: transaction.transactionId,
        });
    }

    function openInlineEditor(
        event: MouseEvent<HTMLButtonElement>,
        transaction: TransactionWithPostings,
        field: InlineTransactionFocusField,
        lineId?: string,
    ) {
        event.stopPropagation();
        startInlineEditor(transaction, field, lineId);
    }

    function handleSelectableRowKeyDown(
        event: KeyboardEvent<HTMLTableRowElement>,
        transaction: TransactionWithPostings,
    ) {
        if (event.currentTarget !== event.target) {
            return;
        }

        if (
            event.key === "Enter" &&
            selectedTransactionIdSet.has(transaction.transactionId)
        ) {
            event.preventDefault();
            startInlineEditor(transaction, "payee");
            return;
        }

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectTransaction(transaction);
        }
    }

    function toggleDateSortDirection() {
        setDateSortDirection((currentDirection) =>
            currentDirection === "desc" ? "asc" : "desc",
        );
    }

    function updateAmountFilter(amountQuery: string) {
        clearTransactionSelection();
        setFilters((currentFilters) => ({
            ...currentFilters,
            amountQuery,
        }));
    }

    function updatePayeeMemoFilter(payeeMemoQuery: string) {
        clearTransactionSelection();
        setFilters((currentFilters) => ({
            ...currentFilters,
            payeeMemoQuery,
        }));
    }

    function updateCategoryFilter(categoryId: string) {
        clearTransactionSelection();
        setFilters((currentFilters) => ({
            ...currentFilters,
            categoryId,
            uncategorizedOnly: categoryId ? false : currentFilters.uncategorizedOnly,
        }));
        setIsFilterOpen(false);
    }

    function updateUncategorizedFilter(uncategorizedOnly: boolean) {
        clearTransactionSelection();
        setFilters((currentFilters) => ({
            ...currentFilters,
            categoryId: uncategorizedOnly ? "" : currentFilters.categoryId,
            uncategorizedOnly,
        }));
        setIsFilterOpen(false);
    }

    function updateDuplicateAmountsFilter(duplicateAmountsOnly: boolean) {
        clearTransactionSelection();
        setFilters((currentFilters) => ({
            ...currentFilters,
            duplicateAmountsOnly,
        }));
    }

    function updateUnmatchedPlaidFilter(unmatchedPlaidOnly: boolean) {
        clearTransactionSelection();
        setFilters((currentFilters) => ({
            ...currentFilters,
            unmatchedPlaidOnly,
        }));
    }

    function clearFocusedFilterAndClose(
        event: KeyboardEvent<HTMLInputElement>,
        clearValue: () => void,
    ) {
        if (event.key !== "Escape") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearValue();
        setIsFilterOpen(false);
    }

    function acceptFocusedFilterAndClose(
        event: KeyboardEvent<HTMLInputElement>,
    ) {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        setIsFilterOpen(false);
    }

    function clearFilters() {
        clearTransactionSelection();
        setFilters(emptyTransactionFilters);
    }

    function clearFilter(filterId: ActiveTransactionFilterId) {
        clearTransactionSelection();
        setFilters((currentFilters) => {
            if (filterId === "category") {
                return {
                    ...currentFilters,
                    categoryId: "",
                };
            }

            if (filterId === "amount") {
                return {
                    ...currentFilters,
                    amountQuery: "",
                };
            }

            if (filterId === "payeeMemo") {
                return {
                    ...currentFilters,
                    payeeMemoQuery: "",
                };
            }

            if (filterId === "duplicateAmounts") {
                return {
                    ...currentFilters,
                    duplicateAmountsOnly: false,
                };
            }

            if (filterId === "unmatchedPlaid") {
                return {
                    ...currentFilters,
                    unmatchedPlaidOnly: false,
                };
            }

            return {
                ...currentFilters,
                uncategorizedOnly: false,
            };
        });
    }

    async function loadDeletePreview(transaction: TransactionWithPostings) {
        setDeleteDialogTransaction(transaction);
        setDeleteImpact(null);
        setDeletePreviewError(null);
        setIsLoadingDeletePreview(true);

        try {
            const response = await fetch(
                `/api/transactions/${transaction.transactionId}`,
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to load delete preview.",
                    ),
                );
            }

            const impact = (await response.json()) as DeletionImpactSummary;
            setDeleteImpact(impact);
        } catch (previewError) {
            setDeletePreviewError(
                previewError instanceof Error
                    ? previewError.message
                    : "Unable to load delete preview.",
            );
        } finally {
            setIsLoadingDeletePreview(false);
        }
    }

    async function loadBulkDeletePreview(transactionIds: string[]) {
        if (transactionIds.length === 0) {
            return;
        }

        setBulkDeleteTransactionIds(transactionIds);
        setDeleteDialogTransaction(null);
        setDeleteImpact(null);
        setDeletePreviewError(null);
        setIsLoadingDeletePreview(true);

        try {
            const response = await fetch("/api/transactions/deletion-impact", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ transactionIds }),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to load delete preview.",
                    ),
                );
            }

            const impact = (await response.json()) as DeletionImpactSummary;
            setDeleteImpact(impact);
        } catch (previewError) {
            setDeletePreviewError(
                previewError instanceof Error
                    ? previewError.message
                    : "Unable to load delete preview.",
            );
        } finally {
            setIsLoadingDeletePreview(false);
        }
    }

    function openSelectedTransactionForEdit() {
        if (!selectedTransaction) {
            return;
        }

        setDialogTransaction(selectedTransaction);
        setIsCreating(false);
        setInlineEditingTransaction(null);
        clearTransactionSelection();
    }

    function openSelectedTransactionDeletePreview() {
        if (hasSelectedLockedTransactions) {
            notifyError({
                title: "Transactions are locked.",
                message: "Unlock reconciled transactions before deleting them.",
            });
            return;
        }

        if (selectedTransactionCount > 1) {
            void loadBulkDeletePreview(
                selectedTransactions.map((transaction) => transaction.transactionId),
            );
            clearTransactionSelection();
            return;
        }

        if (
            !selectedTransaction ||
            isLoadingDeletePreview ||
            pendingDeleteTransactionId === selectedTransaction.transactionId
        ) {
            return;
        }

        clearTransactionSelection();
        void loadDeletePreview(selectedTransaction);
    }

    function showSelectedTransferCounterpartyAccount() {
        if (!selectedTransaction || !selectedTransferCounterpartyAccount) {
            return;
        }

        const href = getTransactionsAccountHref(
            selectedTransferCounterpartyAccount,
            accounts,
        );

        clearTransactionSelection();
        router.push(
            `${href}?selected=${encodeURIComponent(
                selectedTransaction.transactionId,
            )}`,
        );
    }

    async function deleteExistingTransaction() {
        if (!deleteDialogTransaction || !deleteImpact) {
            return;
        }

        const transactionToDelete = deleteDialogTransaction;

        setPendingDeleteTransactionId(transactionToDelete.transactionId);
        setDeletePreviewError(null);
        setDeleteDialogTransaction(null);
        setDeleteImpact(null);
        const optimisticMutationId = applyOptimisticWorkspaceChanges(
            createOptimisticTransactionDeleteChanges({
                transactions: [transactionToDelete],
            }),
        );
        const activity = startActivity({
            completedLabel: "Transaction deleted.",
            pendingLabel: "Deleting transaction…",
        });

        void (async () => {
            try {
                const response = await fetch(
                    `/api/transactions/${transactionToDelete.transactionId}`,
                    {
                        method: "DELETE",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            mutationId: createWorkspaceMutationId(),
                            previewRevision: deleteImpact.previewRevision,
                        }),
                    },
                );

                if (!response.ok) {
                    throw new Error(
                        await parseApiErrorMessage(
                            response,
                            "Unable to delete transaction.",
                        ),
                    );
                }

                await applyWorkspaceMutationResponse(response, {
                    optimisticMutationId,
                });
                activity.complete();
            } catch {
                activity.fail();
                discardOptimisticWorkspaceChanges(optimisticMutationId);
                await refreshWorkspaceSnapshot();
                notifyError({
                    title: "Transaction could not be deleted.",
                    message: "Delete failed. The latest saved data has been restored.",
                });
            } finally {
                setPendingDeleteTransactionId(null);
            }
        })();
    }

    async function deleteSelectedTransactions() {
        if (bulkDeleteTransactionIds.length === 0 || !deleteImpact) {
            return;
        }

        const transactionIdsToDelete = [...bulkDeleteTransactionIds];
        const previewRevision = deleteImpact.previewRevision;
        const transactionById = new Map(
            transactions.map((transaction) => [
                transaction.transactionId,
                transaction,
            ]),
        );
        const transactionsToDelete = transactionIdsToDelete
            .map((transactionId) => transactionById.get(transactionId))
            .filter((transaction): transaction is TransactionWithPostings =>
                Boolean(transaction),
            );

        setIsSubmittingBulkDelete(true);
        setDeletePreviewError(null);
        setBulkDeleteTransactionIds([]);
        setDeleteImpact(null);
        const optimisticMutationId = applyOptimisticWorkspaceChanges(
            createOptimisticTransactionDeleteChanges({
                transactions: transactionsToDelete,
            }),
        );
        const activity = startActivity({
            completedLabel: "Transactions deleted.",
            pendingLabel: "Deleting transactions…",
        });

        void (async () => {
            try {
                const response = await fetch("/api/transactions", {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        mutationId: createWorkspaceMutationId(),
                        previewRevision,
                        transactionIds: transactionIdsToDelete,
                    }),
                });

                if (!response.ok) {
                    throw new Error(
                        await parseApiErrorMessage(
                            response,
                            "Unable to delete selected transactions.",
                        ),
                    );
                }

                await applyWorkspaceMutationResponse(response, {
                    optimisticMutationId,
                });
                activity.complete();
            } catch {
                activity.fail();
                discardOptimisticWorkspaceChanges(optimisticMutationId);
                await refreshWorkspaceSnapshot();
                notifyError({
                    title: "Transactions could not be deleted.",
                    message: "Delete failed. The latest saved data has been restored.",
                });
            } finally {
                setIsSubmittingBulkDelete(false);
            }
        })();
    }

    async function mergeTransactions(
        transactionIds: [string, string],
        expectedMatchType?: TransactionAutoMatchType,
    ) {
        if (isMergingTransactions) {
            return;
        }

        const transactionsById = new Map(
            (autoMatchTransactions ?? transactions).map((transaction) => [
                transaction.transactionId,
                transaction,
            ]),
        );
        const left = transactionsById.get(transactionIds[0]);
        const right = transactionsById.get(transactionIds[1]);

        if (!left || !right) {
            return;
        }

        const optimisticMutationId = applyOptimisticWorkspaceChanges(
            createOptimisticTransactionMergeChanges({
                accounts,
                categories,
                expectedMatchType,
                plaidTransactionSyncRecords:
                    autoMatchPlaidTransactionSyncRecords ??
                    snapshot.plaidTransactionSyncs,
                transactions: [left, right],
            }),
        );
        setIsMergingTransactions(true);
        clearTransactionSelection();
        const activity = startActivity({
            completedLabel: "Transactions merged.",
            pendingLabel: "Merging transactions…",
        });

        void (async () => {
            try {
                const response = await fetch("/api/transactions/merge", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        ...(expectedMatchType ? { expectedMatchType } : {}),
                        mutationId: createWorkspaceMutationId(),
                        transactionIds,
                    }),
                });

                if (!response.ok) {
                    throw new Error(
                        await parseApiErrorMessage(
                            response,
                            "Unable to merge selected transactions.",
                        ),
                    );
                }

                await applyWorkspaceMutationResponse(response, {
                    optimisticMutationId,
                });
                activity.complete();
            } catch (mergeError) {
                activity.fail();
                discardOptimisticWorkspaceChanges(optimisticMutationId);
                await refreshWorkspaceSnapshot();
                notifyError({
                    title: "Transactions could not be merged.",
                    message:
                        mergeError instanceof Error
                            ? mergeError.message
                            : "Unable to merge selected transactions.",
                });
            } finally {
                setIsMergingTransactions(false);
            }
        })();
    }

    async function updateAutoMatchRejection(input: {
        method: "DELETE" | "POST";
        payload: Record<string, unknown>;
    }) {
        if (isUpdatingAutoMatchRejection) {
            return;
        }

        setIsUpdatingAutoMatchRejection(true);
        const activity = startActivity({
            completedLabel:
                input.method === "POST"
                    ? "Auto match rejected."
                    : "Auto match restored.",
            pendingLabel:
                input.method === "POST"
                    ? "Rejecting auto match…"
                    : "Restoring auto match…",
        });

        try {
            const response = await fetch("/api/transactions/auto-match-rejections", {
                method: input.method,
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    ...input.payload,
                    mutationId: crypto.randomUUID(),
                }),
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to update the auto-match decision.",
                    ),
                );
            }

            await applyWorkspaceMutationResponse(response);
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                title: "Auto match could not be updated.",
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to update the auto-match decision.",
            });
        } finally {
            setIsUpdatingAutoMatchRejection(false);
        }
    }

    async function mergeSelectedTransactions() {
        if (selectedTransactionCount !== 2 || !selectedMergeEligibility.canMerge) {
            return;
        }

        const [left, right] = selectedTransactions;

        if (!left || !right) {
            return;
        }

        await mergeTransactions([left.transactionId, right.transactionId]);
    }

    function openCategorizeDialog() {
        if (!selectedCategorizationEligibility.canCategorize) {
            return;
        }

        setIsCategorizeDialogOpen(true);
    }

    async function categorizeSelectedTransactions(categoryId: string) {
        if (
            isCategorizingTransactions ||
            !selectedCategorizationEligibility.canCategorize
        ) {
            return;
        }

        const transactionIds = selectedTransactions.map(
            (transaction) => transaction.transactionId,
        );

        setIsCategorizingTransactions(true);
        const activity = startActivity({
            completedLabel: "Transactions categorized.",
            pendingLabel: "Categorizing transactions…",
        });

        try {
            const response = await fetch("/api/transactions/categorize", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    categoryId,
                    mutationId: createWorkspaceMutationId(),
                    transactionIds,
                }),
            });

            if (!response.ok) {
                throw response;
            }

            await applyWorkspaceMutationResponse<BulkCategorizeTransactionsResponse>(
                response,
            );
            clearTransactionSelection();
            setIsCategorizeDialogOpen(false);
            activity.complete();
        } catch (error) {
            activity.fail();
            await refreshWorkspaceSnapshot();
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                                error,
                                "Unable to categorize the selected transactions.",
                            )
                        : error instanceof Error
                            ? error.message
                            : "Unable to categorize the selected transactions.",
                title: "Transactions could not be categorized.",
            });
        } finally {
            setIsCategorizingTransactions(false);
        }
    }

    async function updateSelectedTransactionStatus(
        status: "cleared" | "reconciled",
    ) {
        if (isUpdatingTransactionStatus || selectedTransactions.length === 0) {
            return;
        }

        const targetTransactions = selectedTransactions.filter((transaction) =>
            status === "reconciled"
                ? transaction.status !== "reconciled" && transaction.status !== "voided"
                : transaction.status === "reconciled",
        );
        const optimisticChanges = createOptimisticTransactionStatusChanges({
            status,
            transactions: targetTransactions,
        });
        const optimisticMutationId =
            applyOptimisticWorkspaceChanges(optimisticChanges);

        setIsUpdatingTransactionStatus(true);
        const activity = startActivity({
            completedLabel:
                status === "reconciled"
                    ? "Transactions locked."
                    : "Transactions unlocked.",
            pendingLabel:
                status === "reconciled"
                    ? "Locking transactions…"
                    : "Unlocking transactions…",
        });

        try {
            const response = await fetch("/api/transactions/status", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    mutationId: createWorkspaceMutationId(),
                    status,
                    transactionIds: targetTransactions.map(
                        (transaction) => transaction.transactionId,
                    ),
                }),
            });

            if (!response.ok) {
                throw response;
            }

            await applyWorkspaceMutationResponse(response, {
                optimisticMutationId,
            });
            activity.complete();
        } catch (error) {
            activity.fail();
            if (optimisticMutationId) {
                discardOptimisticWorkspaceChanges(optimisticMutationId);
            }
            await refreshWorkspaceSnapshot();
            notifyError({
                title:
                    status === "reconciled"
                        ? "Transactions could not be locked."
                        : "Transactions could not be unlocked.",
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                                error,
                                "Unable to update transaction status.",
                            )
                        : error instanceof Error
                            ? error.message
                            : "Unable to update transaction status.",
            });
        } finally {
            setIsUpdatingTransactionStatus(false);
        }
    }

    useKeyboardShortcuts({
        enabled:
            hasSelectedTransactions &&
            !isDeleteDialogOpen &&
            dialogTransaction === null &&
            !isCreating &&
            !isCategorizeDialogOpen &&
            inlineEditingTransaction === null,
        shortcuts: [
            {
                handler: openSelectedTransactionForEdit,
                key: keyboardShortcuts.transactions.openEditDetails.key,
            },
            {
                handler: openSelectedTransactionDeletePreview,
                key: keyboardShortcuts.transactions.openDeletePreview.key,
            },
            {
                handler: openSelectedTransactionDeletePreview,
                key: keyboardShortcuts.transactions.openDeletePreviewWithDeleteKey.key,
            },
            {
                handler: openSelectedTransactionDeletePreview,
                key: keyboardShortcuts.transactions.openDeletePreviewWithBackspace.key,
            },
            {
                handler: () => {
                    void mergeSelectedTransactions();
                },
                key: keyboardShortcuts.transactions.mergeSelected.key,
            },
            {
                handler: openCategorizeDialog,
                key: keyboardShortcuts.transactions.categorizeSelected.key,
            },
            ...(hasSelectedLockedTransactions
                ? [
                      {
                          handler: () => {
                              void updateSelectedTransactionStatus("cleared");
                          },
                          key: keyboardShortcuts.transactions.unlockSelected.key,
                      },
                  ]
                : []),
            {
                handler: showSelectedTransferCounterpartyAccount,
                key: keyboardShortcuts.transactions.showTransferCounterparty.key,
            },
        ],
    });

    useKeyboardShortcuts({
        enabled:
            !isDeleteDialogOpen &&
            dialogTransaction === null &&
            inlineEditingTransaction === null &&
            !isCreating &&
            !isCategorizeDialogOpen,
        shortcuts: [
            {
                ...keyboardShortcuts.transactions.activateNextTransaction,
                allowRepeat: true,
                handler: () => activateAdjacentTransaction("next"),
            },
            {
                ...keyboardShortcuts.transactions.activatePreviousTransaction,
                allowRepeat: true,
                handler: () => activateAdjacentTransaction("previous"),
            },
            {
                ...keyboardShortcuts.transactions.createTransaction,
                handler: openNewTransaction,
            },
            {
                ...keyboardShortcuts.transactions.openFilter,
                handler: () => {
                    setIsFilterOpen(true);
                },
            },
        ],
    });

    const dialogClassification =
        dialogTransaction &&
        pendingClassificationsByTransactionId[dialogTransaction.transactionId] &&
        pendingClassificationsByTransactionId[dialogTransaction.transactionId]
            .suggestion.type !== "noSuggestion" &&
        isPendingClassificationCurrentForTransaction(
            pendingClassificationsByTransactionId[dialogTransaction.transactionId],
            dialogTransaction,
        )
            ? pendingClassificationsByTransactionId[dialogTransaction.transactionId]
            : undefined;

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <p className={typographyClassNames.eyebrow}>Ledger activity</p>
                <div className="flex flex-wrap items-center gap-2">
                    {!hasActiveFilter && uncategorizedTransactionCount > 0 ? (
                        <button
                            type="button"
                            onClick={() => updateUncategorizedFilter(true)}
                            className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionCompact}`}
                        >
                            <FontAwesomeIcon aria-hidden="true" icon={faCircleQuestion} />
                            Show Uncategorized ({uncategorizedTransactionCount})
                        </button>
                    ) : null}
                    <button
                        type="button"
                        aria-expanded={isFilterOpen}
                        aria-controls="transaction-filter-controls"
                        onClick={() => {
                            setIsFilterOpen((currentValue) => !currentValue);
                        }}
                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionCompact}`}
                    >
                        <FontAwesomeIcon aria-hidden="true" icon={faFilter} />
                        Filter
                    </button>
                    <button
                        type="button"
                        onClick={openNewTransaction}
                        className={`inline-flex items-center gap-2 ${controlClassNames.primaryActionCompact}`}
                    >
                        <FontAwesomeIcon aria-hidden="true" icon={faPlus} />
                        New transaction
                    </button>
                </div>
            </div>

            <div className="grid gap-3">
                {hasActiveFilter ? (
                    <div
                        aria-live="polite"
                        className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]"
                    >
                        <span>Filter:</span>
                        {activeFilterSummaryItems.map((item) => (
                            <span
                                key={item.id}
                                className="inline-flex items-center gap-1 border border-[var(--color-accent-ink)] bg-[var(--color-accent-soft)] px-2 py-1 text-sm text-[var(--color-accent-contrast)]"
                            >
                                <span>{item.label}</span>
                                <button
                                    type="button"
                                    aria-label={`Clear ${item.label} filter`}
                                    onClick={() => {
                                        clearFilter(item.id);
                                    }}
                                    className="inline-flex size-5 cursor-pointer items-center justify-center text-[var(--color-accent-contrast)] transition hover:bg-[var(--color-accent-ink)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                >
                                    <FontAwesomeIcon aria-hidden="true" icon={faXmark} />
                                </button>
                            </span>
                        ))}
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex cursor-pointer items-center gap-1 border border-[#3b4658] bg-[#202632] px-2.5 py-1 text-sm font-medium text-[var(--color-ink)] transition hover:bg-[#2b3443] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                        >
                            <FontAwesomeIcon aria-hidden="true" icon={faXmark} />
                            Clear all
                        </button>
                    </div>
                ) : null}
                {isFilterOpen ? (
                    <div
                        id="transaction-filter-controls"
                        className="grid gap-3 border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3 lg:grid-cols-3"
                    >
                        <label className="grid min-w-0 gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                            Payee/Memo
                            <input
                                ref={payeeMemoFilterInputRef}
                                type="text"
                                placeholder="Search payee or memo"
                                value={filters.payeeMemoQuery}
                                onChange={(event) => {
                                    updatePayeeMemoFilter(event.target.value);
                                }}
                                onKeyDown={(event) => {
                                    acceptFocusedFilterAndClose(event);
                                    clearFocusedFilterAndClose(event, () => {
                                        updatePayeeMemoFilter("");
                                    });
                                }}
                                className={`${controlClassNames.fieldCompact} h-10 w-full`}
                            />
                        </label>
                        <ComboboxSelect
                            className="min-w-0"
                            emptyOption={{
                                label: "All categories",
                                value: "",
                            }}
                            optionVariant="category"
                            inputClassName={`${controlClassNames.fieldCompact} h-10 w-full`}
                            label="Category"
                            labelClassName="grid gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]"
                            noResultsLabel="No categories found"
                            onChange={updateCategoryFilter}
                            onKeyDown={(event) => {
                                clearFocusedFilterAndClose(event, () => {
                                    updateCategoryFilter("");
                                });
                            }}
                            options={categoryFilterOptions}
                            value={filters.categoryId}
                        />
                        <div className="grid min-w-0 gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                            Amount
                            <MoneyExpressionInput
                                aria-label="Amount"
                                inputMode="decimal"
                                placeholder="$0.00"
                                value={filters.amountQuery}
                                onChange={(event) => {
                                    updateAmountFilter(event.target.value);
                                }}
                                onKeyDown={(event) => {
                                    acceptFocusedFilterAndClose(event);
                                    clearFocusedFilterAndClose(event, () => {
                                        updateAmountFilter("");
                                    });
                                }}
                                className={`${controlClassNames.fieldCompact} h-10 w-full`}
                            />
                        </div>
                        <label className="flex h-10 min-w-0 items-center justify-between gap-3 self-end border border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-sm font-medium normal-case tracking-normal text-[var(--color-ink)]">
                            <span>Duplicate transactions</span>
                            <input
                                checked={filters.duplicateAmountsOnly}
                                className="peer sr-only"
                                role="switch"
                                type="checkbox"
                                onChange={(event) => {
                                    updateDuplicateAmountsFilter(event.target.checked);
                                }}
                                onKeyDown={(event) => {
                                    clearFocusedFilterAndClose(event, () => {
                                        updateDuplicateAmountsFilter(false);
                                    });
                                }}
                            />
                            <span
                                aria-hidden="true"
                                className="relative h-5 w-9 shrink-0 border border-[var(--color-border-strong)] bg-[var(--color-panel-strong)] transition after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:bg-[var(--color-muted)] after:transition-transform peer-checked:border-[var(--color-accent-ink)] peer-checked:bg-[var(--color-accent-ink)] peer-checked:after:translate-x-4 peer-checked:after:bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent-ring)]"
                            />
                        </label>
                        {canFilterUnmatchedTransactions ? (
                            <label className="flex h-10 min-w-0 items-center justify-between gap-3 self-end border border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-sm font-medium normal-case tracking-normal text-[var(--color-ink)]">
                                <span>Unmatched transactions</span>
                                <input
                                    checked={filters.unmatchedPlaidOnly}
                                    className="peer sr-only"
                                    role="switch"
                                    type="checkbox"
                                    onChange={(event) => {
                                        updateUnmatchedPlaidFilter(
                                            event.target.checked,
                                        );
                                    }}
                                    onKeyDown={(event) => {
                                        clearFocusedFilterAndClose(event, () => {
                                            updateUnmatchedPlaidFilter(false);
                                        });
                                    }}
                                />
                                <span
                                    aria-hidden="true"
                                    className="relative h-5 w-9 shrink-0 border border-[var(--color-border-strong)] bg-[var(--color-panel-strong)] transition after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:bg-[var(--color-muted)] after:transition-transform peer-checked:border-[var(--color-accent-ink)] peer-checked:bg-[var(--color-accent-ink)] peer-checked:after:translate-x-4 peer-checked:after:bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent-ring)]"
                                />
                            </label>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <TransactionAutoMatchPane
                autoMatches={autoMatches}
                categoryNameById={categoryNameById}
                isMerging={isMergingTransactions}
                isUpdatingRejection={isUpdatingAutoMatchRejection}
                onMerge={(transactionIds, expectedMatchType) => {
                    void mergeTransactions(transactionIds, expectedMatchType);
                }}
                onReject={(pair) => {
                    void updateAutoMatchRejection({
                        method: "POST",
                        payload: {
                            transactionIds: [
                                pair.left.transactionId,
                                pair.right.transactionId,
                            ],
                        },
                    });
                }}
                onRestore={(rejection) => {
                    void updateAutoMatchRejection({
                        method: "DELETE",
                        payload: {
                            matchDecisionId: rejection.matchDecisionId,
                        },
                    });
                }}
                showAccountContext={!accountContextId}
            />

            <table
                ref={transactionsTableRef}
                className="w-full table-fixed border-collapse text-left text-sm"
            >
                <colgroup>
                    <col className="w-10" />
                    <col className="w-28" />
                    {showAccountColumn ? <col className="w-36" /> : null}
                    <col className="w-48" />
                    <col className="w-48" />
                    <col />
                    <col className="w-32" />
                    <col className="w-10" />
                </colgroup>
                <thead className={tableClassNames.stickyHeader}>
                    <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                        <th className="w-10 px-2 py-3 font-medium" />
                        <th
                            aria-sort={
                                dateSortDirection === "desc" ? "descending" : "ascending"
                            }
                            className="px-4 py-3 font-medium"
                        >
                            <button
                                type="button"
                                onClick={toggleDateSortDirection}
                                className="inline-flex items-center gap-2 text-left font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
                                title={
                                    dateSortDirection === "desc"
                                        ? "Sort by oldest first"
                                        : "Sort by newest first"
                                }
                            >
                                Date
                                <FontAwesomeIcon
                                    aria-hidden="true"
                                    icon={dateSortDirection === "desc" ? faSortDown : faSortUp}
                                    className="h-3.5 w-3.5"
                                />
                            </button>
                        </th>
                        {showAccountColumn ? (
                            <th className="px-4 py-3 font-medium">Account</th>
                        ) : null}
                        <th className="px-4 py-3 font-medium">Payee</th>
                        <th className="px-4 py-3 font-medium">Category</th>
                        <th className="px-4 py-3 font-medium">
                            <span className="inline-flex items-center gap-2">
                                <button
                                    type="button"
                                    aria-label={
                                        showFullMemos ? "Truncate memos" : "Show full memos"
                                    }
                                    aria-pressed={showFullMemos}
                                    title={showFullMemos ? "Truncate memos" : "Show full memos"}
                                    className={`inline-flex h-5 w-5 items-center justify-center transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] ${
                                        showFullMemos
                                            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-contrast)] ring-1 ring-[var(--color-accent-ring)]"
                                            : "text-[var(--color-muted)]"
                                    }`}
                                    onClick={() => setShowFullMemos((current) => !current)}
                                >
                                    <FontAwesomeIcon
                                        aria-hidden="true"
                                        icon={showFullMemos ? faAlignJustify : faAlignLeft}
                                        className="h-3.5 w-3.5"
                                    />
                                </button>
                                Memo
                            </span>
                        </th>
                        <th className="px-4 py-3 text-right font-medium">Amount</th>
                        <th className="w-10 px-2 py-3 font-medium" />
                    </tr>
                </thead>
                <tbody>
                    {transactions.length === 0 && !showStartingBalanceRow ? (
                        <tr>
                            <td
                                colSpan={transactionTableColumnCount}
                                className="px-4 py-8 text-center text-[var(--color-muted)]"
                            >
                                No transactions yet. Record one to reconcile spending against
                                your accounts.
                            </td>
                        </tr>
                    ) : visibleTransactions.length === 0 && !showStartingBalanceRow ? (
                        <tr>
                            <td
                                colSpan={transactionTableColumnCount}
                                className="px-4 py-8 text-center text-[var(--color-muted)]"
                            >
                                No transactions match this filter.
                            </td>
                        </tr>
                    ) : (
                        <>
                            {accountContext &&
                            showStartingBalanceRow &&
                            dateSortDirection === "asc" ? (
                                <StartingBalanceRow account={accountContext} />
                            ) : null}
                            {visibleTransactions.map((transaction, index) => {
                                const categoryDisplay =
                                    getTransactionCategoryDisplay(transaction);
                                const isTransactionSelected = selectedTransactionIdSet.has(
                                    transaction.transactionId,
                                );
                                const isInlineEditingTransaction =
                                    inlineEditingTransactionId === transaction.transactionId;
                                const previousTransaction = visibleTransactions[index - 1];
                                const nextTransaction = visibleTransactions[index + 1];
                                const startsSelectionGroup =
                                    isTransactionSelected &&
                                    (!previousTransaction ||
                                        !selectedTransactionIdSet.has(
                                            previousTransaction.transactionId,
                                        ));
                                const endsSelectionGroup =
                                    isTransactionSelected &&
                                    (!nextTransaction ||
                                        !selectedTransactionIdSet.has(
                                            nextTransaction.transactionId,
                                        ));
                                const hasSplitChildRows =
                                    hasMultipleTransactionLines(transaction);
                                const showSplitChildRows =
                                    hasSplitChildRows && !isInlineEditingTransaction;
                                const selectedFocusClassName =
                                    isTransactionSelected &&
                                    (selectedTransactionCount > 1 || showSplitChildRows)
                                        ? "focus:outline-none"
                                        : "focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent-ring)]";
                                const selectedGroupClassName = isTransactionSelected
                                    ? "transaction-selection-row"
                                    : "";
                                const selectedGroupStartClassName = startsSelectionGroup
                                    ? "transaction-selection-group-start"
                                    : "";
                                const parentSelectedGroupEndClassName =
                                    endsSelectionGroup && !showSplitChildRows
                                        ? "transaction-selection-group-end"
                                        : "";
                                const transactionDateLabel = formatTransactionDisplayDate(
                                    transaction.occurredAt,
                                );
                                const transactionAccountLabel =
                                    getTransactionAccountLabel(transaction);

                                if (isInlineEditingTransaction) {
                                    const pendingClassificationCandidate =
                                        pendingClassificationsByTransactionId[
                                            transaction.transactionId
                                        ];
                                    const pendingClassification =
                                        pendingClassificationCandidate &&
                                        pendingClassificationCandidate.status !== "rejected" &&
                                        pendingClassificationCandidate.suggestion.type !==
                                            "noSuggestion" &&
                                        manuallyEditingClassificationTransactionId !==
                                            transaction.transactionId &&
                                        transactionHasUncategorizedActivity(transaction) &&
                                        isPendingClassificationCurrentForTransaction(
                                            pendingClassificationCandidate,
                                            transaction,
                                        )
                                            ? pendingClassificationCandidate
                                            : undefined;
                                    const pendingClassificationFieldSelection =
                                        pendingClassification
                                            ? getPendingClassificationFieldSelection(
                                                    pendingClassification,
                                                    transaction,
                                                )
                                            : undefined;
                                    const isApplyingPendingClassification =
                                        applyingPendingClassificationTransactionId ===
                                        transaction.transactionId;

                                    return (
                                        <Fragment key={transaction.transactionId}>
                                            {pendingClassification &&
                                            pendingClassificationFieldSelection ? (
                                                <TransactionPendingClassificationRow
                                                    categories={categories}
                                                    columnCount={transactionTableColumnCount}
                                                    fieldSelection={pendingClassificationFieldSelection}
                                                    isApplying={isApplyingPendingClassification}
                                                    isRejecting={
                                                        rejectingPendingClassificationTransactionId ===
                                                        transaction.transactionId
                                                    }
                                                    onApply={
                                                        pendingClassification.suggestion.type !==
                                                        "noSuggestion"
                                                            ? () =>
                                                                    void applyPendingClassification(
                                                                        pendingClassification,
                                                                        pendingClassificationFieldSelection,
                                                                    )
                                                            : undefined
                                                    }
                                                    onEdit={() => {
                                                        setManuallyEditingClassificationTransactionId(
                                                            transaction.transactionId,
                                                        );
                                                        setInlineEditingTransaction({
                                                            field: "category",
                                                            transactionId: transaction.transactionId,
                                                        });
                                                    }}
                                                    onReject={() => {
                                                        void rejectPendingClassification(
                                                            pendingClassification,
                                                        );
                                                    }}
                                                    onFieldSelectionChange={(fieldSelection) => {
                                                        updatePendingClassificationFieldSelection(
                                                            transaction.transactionId,
                                                            fieldSelection,
                                                        );
                                                    }}
                                                    pending={pendingClassification}
                                                    transaction={transaction}
                                                />
                                            ) : null}
                                            <TransactionInlineEditor
                                                accountLabel={transactionAccountLabel}
                                                accountContextId={accountContextId}
                                                accounts={accounts}
                                                autoFocus={!pendingClassification}
                                                categories={categories}
                                                categoryBalanceById={categoryBalanceById}
                                                columnCount={transactionTableColumnCount}
                                                classificationPane={
                                                    !pendingClassification &&
                                                    pendingClassificationCandidate &&
                                                    pendingClassificationCandidate.suggestion.type !==
                                                        "noSuggestion" &&
                                                    isPendingClassificationCurrentForTransaction(
                                                        pendingClassificationCandidate,
                                                        transaction,
                                                    )
                                                        ? (onEdit) => {
                                                              const classification =
                                                                  pendingClassificationCandidate;

                                                              return (
                                                                  <TransactionClassificationPane
                                                                      categories={categories}
                                                                      isApplying={
                                                                          applyingPendingClassificationTransactionId ===
                                                                          transaction.transactionId
                                                                      }
                                                                      isRejecting={
                                                                          rejectingPendingClassificationTransactionId ===
                                                                          transaction.transactionId
                                                                      }
                                                                      onApply={
                                                                          classification.status !==
                                                                          "rejected"
                                                                              ? () =>
                                                                                    void applyPendingClassification(
                                                                                        classification,
                                                                                        getPendingClassificationFieldSelection(
                                                                                            classification,
                                                                                            transaction,
                                                                                        ),
                                                                                    )
                                                                              : undefined
                                                                      }
                                                                      onEdit={
                                                                          classification.status !==
                                                                          "rejected"
                                                                              ? onEdit
                                                                              : undefined
                                                                      }
                                                                      onReject={
                                                                          classification.status !==
                                                                          "rejected"
                                                                              ? () =>
                                                                                    void rejectPendingClassification(
                                                                                        classification,
                                                                                    )
                                                                              : undefined
                                                                      }
                                                                      pending={classification}
                                                                      transaction={transaction}
                                                                  />
                                                              );
                                                          }
                                                        : undefined
                                                }
                                                initialFocus={inlineEditingTransaction?.field}
                                                initialFocusLineId={inlineEditingTransaction?.lineId}
                                                onCancel={() => {
                                                    setManuallyEditingClassificationTransactionId(null);
                                                    setInlineEditingTransaction(null);
                                                }}
                                                onSaved={() => {
                                                    removePendingClassification(
                                                        transaction.transactionId,
                                                    );
                                                }}
                                                onSubmitted={() => {
                                                    setManuallyEditingClassificationTransactionId(null);
                                                    setInlineEditingTransaction(null);
                                                }}
                                                showAccountColumn={showAccountColumn}
                                                sourceCell={
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <TransactionStatusIcon
                                                            status={transaction.status}
                                                        />
                                                        <TransactionSourceIcon
                                                            source={transaction.source}
                                                        />
                                                        <VenmoManagedIcon hasVenmoActivity={transactionHasImporter(transaction, "venmo")} source={transaction.source} />
                                                    </span>
                                                }
                                                transaction={transaction}
                                            />
                                        </Fragment>
                                    );
                                }

                                return (
                                    <Fragment key={transaction.transactionId}>
                                        <tr
                                            ref={
                                                transaction.transactionId ===
                                                initialSelectedTransactionId
                                                    ? initialSelectedTransactionRowRef
                                                    : undefined
                                            }
                                            aria-selected={isTransactionSelected}
                                            data-transaction-navigation-id={
                                                transaction.transactionId
                                            }
                                            className={`scroll-mb-28 scroll-mt-16 cursor-pointer border-b border-[var(--color-border)]/70 transition last:border-b-0 ${selectedFocusClassName} ${selectedGroupClassName} ${selectedGroupStartClassName} ${parentSelectedGroupEndClassName} ${
                                                isTransactionSelected
                                                    ? "bg-[var(--color-accent-soft)] hover:bg-[var(--color-accent-soft)]"
                                                    : "hover:bg-[var(--color-panel-strong)]"
                                            }`}
                                            onClick={(event) =>
                                                selectTransaction(transaction, {
                                                    shiftKey: event.shiftKey,
                                                })
                                            }
                                            onKeyDown={(event) =>
                                                handleSelectableRowKeyDown(event, transaction)
                                            }
                                            onMouseDown={(event) => {
                                                if (event.shiftKey) {
                                                    event.preventDefault();
                                                }
                                            }}
                                            tabIndex={0}
                                        >
                                            <td className="w-10 px-2 py-1.5 text-center align-middle">
                                                <TransactionSelectionCheckbox
                                                    checked={isTransactionSelected}
                                                    label={transaction.payee?.trim() || "transaction"}
                                                    onClick={(event) =>
                                                        toggleTransactionSelectionCheckbox(
                                                            event,
                                                            transaction,
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td className="px-4 py-1.5 align-middle">
                                                <button
                                                    type="button"
                                                    onClick={(event) =>
                                                        openInlineEditor(event, transaction, "date")
                                                    }
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    className="cursor-pointer text-left transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                >
                                                    {transactionDateLabel}
                                                </button>
                                            </td>
                                            {showAccountColumn ? (
                                                <td className="px-4 py-1.5 align-middle">
                                                    {transactionAccountLabel}
                                                </td>
                                            ) : null}
                                            <td className="px-4 py-1.5 align-middle">
                                                <button
                                                    type="button"
                                                    onClick={(event) =>
                                                        openInlineEditor(event, transaction, "payee")
                                                    }
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    className="max-w-48 cursor-pointer truncate text-left transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                >
                                                    {transaction.payee ?? "-"}
                                                </button>
                                            </td>
                                            <td className="px-4 py-1.5 align-middle">
                                                {hasSplitChildRows ? (
                                                    <button
                                                        type="button"
                                                        onClick={(event) =>
                                                            openInlineEditor(event, transaction, "category")
                                                        }
                                                        onMouseDown={(event) => event.stopPropagation()}
                                                        className="inline-flex cursor-pointer items-center gap-2 text-left font-medium text-[var(--color-ink)] transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                    >
                                                        <FontAwesomeIcon
                                                            aria-label={categoryDisplay.iconLabel}
                                                            icon={categoryDisplay.icon}
                                                            className={`h-3.5 w-3.5 shrink-0 ${categoryDisplay.iconClassName}`}
                                                        />
                                                        {categoryDisplay.label}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={(event) =>
                                                            openInlineEditor(event, transaction, "category")
                                                        }
                                                        onMouseDown={(event) => event.stopPropagation()}
                                                        className="inline-flex max-w-48 cursor-pointer items-center gap-2 text-left transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                        title={categoryDisplay.title}
                                                    >
                                                        <FontAwesomeIcon
                                                            aria-label={categoryDisplay.iconLabel}
                                                            icon={categoryDisplay.icon}
                                                            className={`h-3.5 w-3.5 shrink-0 ${categoryDisplay.iconClassName}`}
                                                        />
                                                        <span className="truncate">
                                                            <span className={categoryDisplay.labelClassName}>
                                                                {categoryDisplay.label}
                                                            </span>
                                                        </span>
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-1.5 align-middle">
                                                <button
                                                    type="button"
                                                    onClick={(event) =>
                                                        openInlineEditor(event, transaction, "memo")
                                                    }
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    className="block w-full min-w-0 cursor-pointer text-left transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                >
                                                    <TransactionMemoDisplay
                                                        managedMetadata={transaction}
                                                        memo={transaction.memo}
                                                        showFullMemo={showFullMemos}
                                                    />
                                                </button>
                                            </td>
                                            <td className="px-4 py-1.5 text-right align-middle font-medium">
                                                <button
                                                    type="button"
                                                    disabled={transaction.status === "reconciled"}
                                                    title={
                                                        transaction.status === "reconciled"
                                                            ? "Unlock this transaction before changing its amount."
                                                            : undefined
                                                    }
                                                    onClick={(event) =>
                                                        openInlineEditor(event, transaction, "amount")
                                                    }
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    className="cursor-pointer text-right font-medium transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-75"
                                                >
                                                    <MoneyAmount
                                                        cents={getTransactionDisplayAmountCentsForAccount(
                                                            transaction,
                                                            accountContextLedgerAccountId,
                                                        )}
                                                    />
                                                </button>
                                            </td>
                                            <td className="w-10 px-2 py-1.5 text-center align-middle">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <TransactionStatusIcon status={transaction.status} />
                                                    <TransactionSourceIcon source={transaction.source} />
                                                    <VenmoManagedIcon hasVenmoActivity={transactionHasImporter(transaction, "venmo")} source={transaction.source} />
                                                </span>
                                            </td>
                                        </tr>
                                        {showSplitChildRows
                                            ? transaction.lines.map((line, lineIndex) => {
                                                    const isLastSplitRow =
                                                        lineIndex === transaction.lines.length - 1;
                                                    const childSelectedGroupEndClassName =
                                                        endsSelectionGroup && isLastSplitRow
                                                            ? "transaction-selection-group-end"
                                                            : "";
                                                    const lineCategoryLabel = getLineCategoryLabel(
                                                        line,
                                                        transaction,
                                                    );
                                                    const lineDisplayAmountCents =
                                                        getLineDisplayAmountCents(line, transaction);
                                                    const lineAmountLabel = formatUsd(
                                                        lineDisplayAmountCents,
                                                    );
                                                    const linePayeeLabel = line.payee || "-";

                                                    return (
                                                        <tr
                                                            key={line.lineId}
                                                            aria-selected={isTransactionSelected}
                                                            className={`cursor-pointer border-b border-[var(--color-border)]/40 text-xs transition last:border-b-0 ${selectedFocusClassName} ${selectedGroupClassName} ${childSelectedGroupEndClassName} ${
                                                                isTransactionSelected
                                                                    ? "bg-[var(--color-accent-soft)] hover:bg-[var(--color-accent-soft)]"
                                                                    : "bg-[var(--color-panel-strong)]/35 hover:bg-[var(--color-panel-strong)]"
                                                            }`}
                                                            onClick={(event) =>
                                                                selectTransaction(transaction, {
                                                                    shiftKey: event.shiftKey,
                                                                })
                                                            }
                                                            onKeyDown={(event) =>
                                                                handleSelectableRowKeyDown(event, transaction)
                                                            }
                                                            onMouseDown={(event) => {
                                                                if (event.shiftKey) {
                                                                    event.preventDefault();
                                                                }
                                                            }}
                                                            tabIndex={0}
                                                        >
                                                            <td className="px-2 py-2" aria-hidden="true" />
                                                            <td className="px-4 py-2" aria-hidden="true" />
                                                            {showAccountColumn ? (
                                                                <td className="px-4 py-2" aria-hidden="true" />
                                                            ) : null}
                                                            <td className="px-4 py-2 align-top">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Edit split payee: ${
                                                                        line.payee || "blank"
                                                                    }`}
                                                                    onClick={(event) =>
                                                                        openInlineEditor(
                                                                            event,
                                                                            transaction,
                                                                            "payee",
                                                                            line.lineId,
                                                                        )
                                                                    }
                                                                    onMouseDown={(event) =>
                                                                        event.stopPropagation()
                                                                    }
                                                                    className="max-w-48 cursor-pointer truncate text-left text-[var(--color-ink)] transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                                >
                                                                    {linePayeeLabel}
                                                                </button>
                                                            </td>
                                                            <td className="px-4 py-2 align-top">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Edit split category: ${lineCategoryLabel}`}
                                                                    onClick={(event) =>
                                                                        openInlineEditor(
                                                                            event,
                                                                            transaction,
                                                                            "category",
                                                                            line.lineId,
                                                                        )
                                                                    }
                                                                    onMouseDown={(event) =>
                                                                        event.stopPropagation()
                                                                    }
                                                                    className="inline-flex max-w-48 cursor-pointer items-center gap-2 text-left transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                                    title={lineCategoryLabel}
                                                                >
                                                                    <span
                                                                        aria-hidden="true"
                                                                        className="h-3.5 w-3.5 shrink-0"
                                                                    />
                                                                    <span className="truncate text-[var(--color-ink)]">
                                                                        {lineCategoryLabel}
                                                                    </span>
                                                                </button>
                                                            </td>
                                                            <td className="px-4 py-2 align-top">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Edit split memo: ${
                                                                        line.memo || "blank"
                                                                    }`}
                                                                    onClick={(event) =>
                                                                        openInlineEditor(
                                                                            event,
                                                                            transaction,
                                                                            "memo",
                                                                            line.lineId,
                                                                        )
                                                                    }
                                                                    onMouseDown={(event) =>
                                                                        event.stopPropagation()
                                                                    }
                                                                    className="block w-full min-w-0 cursor-pointer text-left transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                                >
                                                                    <TransactionMemoDisplay
                                                                        memo={line.memo}
                                                                        showFullMemo={showFullMemos}
                                                                    />
                                                                </button>
                                                            </td>
                                                            <td className="px-4 py-2 text-right align-top font-medium">
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Edit split amount: ${lineAmountLabel}`}
                                                                    onClick={(event) =>
                                                                        openInlineEditor(
                                                                            event,
                                                                            transaction,
                                                                            "amount",
                                                                            line.lineId,
                                                                        )
                                                                    }
                                                                    onMouseDown={(event) =>
                                                                        event.stopPropagation()
                                                                    }
                                                                    className="cursor-pointer text-right font-medium transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                                                >
                                                                    <MoneyAmount cents={lineDisplayAmountCents} />
                                                                </button>
                                                            </td>
                                                            <td className="px-2 py-2" aria-hidden="true" />
                                                        </tr>
                                                    );
                                                })
                                            : null}
                                    </Fragment>
                                );
                            })}
                            {accountContext &&
                            showStartingBalanceRow &&
                            dateSortDirection === "desc" ? (
                                <StartingBalanceRow account={accountContext} />
                            ) : null}
                        </>
                    )}
                </tbody>
            </table>
            {visibleTransactions.length > 0 ? (
                <div
                    aria-hidden="true"
                    className="h-28"
                    data-transaction-list-bottom-spacer="true"
                />
            ) : null}

            <TransactionDialog
                key={
                    isCreating
                        ? `new-transaction-${accountContextId ?? "all"}`
                        : (dialogTransaction?.transactionId ?? "closed-transaction")
                }
                accounts={accounts}
                accountContextId={accountContextId}
                categories={categories}
                categoryBalanceById={categoryBalanceById}
                classificationPane={
                    dialogClassification && dialogTransaction
                        ? (onEdit) => (
                              <TransactionClassificationPane
                                  categories={categories}
                                  isApplying={
                                      applyingPendingClassificationTransactionId ===
                                      dialogTransaction.transactionId
                                  }
                                  isRejecting={
                                      rejectingPendingClassificationTransactionId ===
                                      dialogTransaction.transactionId
                                  }
                                  onApply={
                                      dialogClassification.status !== "rejected"
                                          ? () =>
                                                void applyPendingClassification(
                                                    dialogClassification,
                                                    getPendingClassificationFieldSelection(
                                                        dialogClassification,
                                                        dialogTransaction,
                                                    ),
                                                )
                                          : undefined
                                  }
                                  onEdit={
                                      dialogClassification.status !== "rejected"
                                          ? onEdit
                                          : undefined
                                  }
                                  onReject={
                                      dialogClassification.status !== "rejected"
                                          ? () =>
                                                void rejectPendingClassification(
                                                    dialogClassification,
                                                )
                                          : undefined
                                  }
                                  pending={dialogClassification}
                                  transaction={dialogTransaction}
                              />
                          )
                        : undefined
                }
                defaultAccountId={isCreating ? accountContextId : undefined}
                transaction={isCreating ? undefined : (dialogTransaction ?? undefined)}
                open={isCreating || dialogTransaction !== null}
                onSaved={() => undefined}
                onClose={() => {
                    setDialogTransaction(null);
                    setIsCreating(false);
                }}
            />

            <BulkCategorizeTransactionsDialog
                key={
                    isCategorizeDialogOpen
                        ? "bulk-categorize-open"
                        : "bulk-categorize-closed"
                }
                isSubmitting={isCategorizingTransactions}
                onClose={() => {
                    if (!isCategorizingTransactions) {
                        setIsCategorizeDialogOpen(false);
                    }
                }}
                onSubmit={(categoryId) => {
                    void categorizeSelectedTransactions(categoryId);
                }}
                open={isCategorizeDialogOpen}
                options={categoryFilterOptions}
                transactionCount={selectedTransactionCount}
            />

            <SelectionActionBar
                closeOnEscape={!isCategorizeDialogOpen}
                detail={selectedActionDetail}
                onClose={clearTransactionSelection}
                open={hasSelectedTransactions}
                title={selectedActionTitle}
                titleClearsSelection={selectedTransactionCount > 1}
            >
                {selectedTransactionCount === 1 ? (
                    <button
                        type="button"
                        onClick={openSelectedTransactionForEdit}
                        className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-4 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span className="font-bold underline">E</span>dit Details
                    </button>
                ) : null}
                {selectedTransactionCount === 1 &&
                selectedTransferCounterpartyAccount ? (
                    <button
                        type="button"
                        onClick={showSelectedTransferCounterpartyAccount}
                        className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-4 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {selectedTransferCounterpartyActionLabel === "Show Destination" ? (
                            <>
                                <span className="font-bold underline">S</span>
                                how Destination
                            </>
                        ) : selectedTransferCounterpartyActionLabel === "Show Source" ? (
                            <>
                                <span className="font-bold underline">S</span>
                                how Source
                            </>
                        ) : (
                            selectedTransferCounterpartyActionLabel
                        )}
                    </button>
                ) : null}
                {selectedTransactionCount === 2 ? (
                    <button
                        type="button"
                        onClick={() => {
                            void mergeSelectedTransactions();
                        }}
                        disabled={
                            !selectedMergeEligibility.canMerge || isMergingTransactions
                        }
                        title={selectedMergeEligibility.reason}
                        className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-4 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isMergingTransactions ? (
                            "Merging..."
                        ) : (
                            <>
                                <span className="font-bold underline">M</span>
                                erge
                            </>
                        )}
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={openCategorizeDialog}
                    disabled={
                        !selectedCategorizationEligibility.canCategorize ||
                        isCategorizingTransactions
                    }
                    title={selectedCategorizationEligibility.reason}
                    className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-4 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <span className="font-bold underline">C</span>ategorize
                </button>
                {hasSelectedUnlockedTransactions ? (
                    <button
                        type="button"
                        onClick={() => {
                            void updateSelectedTransactionStatus("reconciled");
                        }}
                        disabled={isUpdatingTransactionStatus}
                        className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-4 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={faLock}
                            className="mr-1.5 h-3 w-3"
                        />
                        {isUpdatingTransactionStatus ? "Updating..." : "Lock"}
                    </button>
                ) : null}
                {hasSelectedLockedTransactions ? (
                    <button
                        type="button"
                        onClick={() => {
                            void updateSelectedTransactionStatus("cleared");
                        }}
                        disabled={isUpdatingTransactionStatus}
                        className="border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-4 py-2 text-sm font-medium text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={faLockOpen}
                            className="mr-1.5 h-3 w-3"
                        />
                        {isUpdatingTransactionStatus ? (
                            "Updating..."
                        ) : (
                            <>
                                <span className="font-bold underline">U</span>nlock
                            </>
                        )}
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={openSelectedTransactionDeletePreview}
                    disabled={
                        isLoadingDeletePreview ||
                        isSelectedDeletePending ||
                        isSubmittingBulkDelete ||
                        isMergingTransactions ||
                        hasSelectedLockedTransactions
                    }
                    title={
                        hasSelectedLockedTransactions
                            ? "Unlock reconciled transactions before deleting."
                            : undefined
                    }
                    className="border border-[var(--color-action-bar-danger-border)] bg-[var(--color-action-bar-danger)] px-4 py-2 text-sm font-medium text-[var(--color-action-bar-danger-ink)] transition hover:bg-[var(--color-action-bar-danger-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isSelectedDeletePending || isSubmittingBulkDelete ? (
                        "Deleting..."
                    ) : (
                        <>
                            <span className="font-bold underline">D</span>elete
                        </>
                    )}
                </button>
            </SelectionActionBar>

            <DeleteConfirmationDialog
                open={isDeleteDialogOpen}
                impact={deleteImpact}
                errorMessage={deletePreviewError}
                isLoading={isLoadingDeletePreview}
                isSubmitting={isDeleteSubmitting}
                onRefresh={
                    bulkDeleteTransactionIds.length > 0
                        ? () => {
                                void loadBulkDeletePreview(bulkDeleteTransactionIds);
                            }
                        : deleteDialogTransaction
                            ? () => {
                                    void loadDeletePreview(deleteDialogTransaction);
                                }
                            : undefined
                }
                onConfirm={() => {
                    if (bulkDeleteTransactionIds.length > 0) {
                        void deleteSelectedTransactions();
                        return;
                    }

                    void deleteExistingTransaction();
                }}
                onClose={() => {
                    if (isDeleteSubmitting) {
                        return;
                    }

                    setDeleteDialogTransaction(null);
                    setBulkDeleteTransactionIds([]);
                    setDeleteImpact(null);
                    setDeletePreviewError(null);
                }}
                pendingLabel={
                    bulkDeleteTransactionIds.length > 0
                        ? "Deleting transactions..."
                        : undefined
                }
                title={deleteDialogTitle}
            />
        </div>
    );
}
