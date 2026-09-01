"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faBuildingColumns,
    faPenToSquare,
    faV,
} from "@fortawesome/free-solid-svg-icons";

import {
    hasTransactionManagedMetadata,
    TransactionMemoDisplay,
} from "@/components/transactions/transaction-memo-display";
import {
    toDisplayTransactionLineCategoryId,
    transactionHasUncategorizedActivity,
} from "@/features/transactions/models/transaction-line-normalization";
import type { TransactionAutoMatchPair } from "@/features/transactions/models/transaction-auto-match";
import { formatTransactionDisplayDate } from "@/features/transactions/models/transaction-date";
import { presentTransactionImportActivity } from "@/features/transaction-importers/models/transaction-importer-registry";

type AutoMatchTransaction = TransactionAutoMatchPair["left"];

export function TransactionSourceIcon({
    source,
}: {
    source: AutoMatchTransaction["source"];
}) {
    const normalizedSource = source ?? "manual";
    const label =
        normalizedSource === "plaid"
            ? "Plaid"
            : normalizedSource === "venmo"
              ? "Venmo"
              : "Manual";
    const icon =
        normalizedSource === "plaid"
            ? faBuildingColumns
            : normalizedSource === "venmo"
              ? faV
              : faPenToSquare;

    return (
        <span
            aria-label={`${label} source`}
            className="inline-flex h-5 w-5 items-center justify-center align-middle text-sm leading-5 text-[var(--color-ink)]"
            title={label}
        >
            <FontAwesomeIcon
                icon={icon}
                className={
                    normalizedSource === "plaid" || normalizedSource === "venmo"
                        ? "text-[var(--color-accent-contrast)]"
                        : "text-[var(--color-muted)]"
                }
            />
        </span>
    );
}

export function VenmoManagedIcon({
    hasVenmoActivity,
    source,
}: {
    hasVenmoActivity: boolean;
    source: AutoMatchTransaction["source"];
}) {
    if (!hasVenmoActivity || source === "venmo") {
        return null;
    }

    const label = "Managed Venmo transaction";

    return (
        <span
            aria-label={label}
            className="inline-flex h-5 w-5 items-center justify-center align-middle text-sm text-[var(--color-accent-contrast)]"
            title={label}
        >
            <FontAwesomeIcon aria-hidden="true" icon={faV} />
        </span>
    );
}

function transactionHasImporter(
    transaction: AutoMatchTransaction,
    provider: string,
) {
    return (transaction.importActivities ?? []).some(
        (activity) => activity.provider === provider,
    );
}

function getTransactionImportSummary(transaction: AutoMatchTransaction) {
    for (const activity of transaction.importActivities ?? []) {
        try {
            return presentTransactionImportActivity(activity).summary.text;
        } catch {
            continue;
        }
    }

    return undefined;
}

export function getTransactionAutoMatchSummary(
    transaction: AutoMatchTransaction,
) {
    return (
        transaction.payee?.trim() ||
        transaction.memo?.trim() ||
        getTransactionImportSummary(transaction) ||
        "Untitled"
    );
}

function getTransactionAutoMatchCategory(input: {
    categoryNameById: ReadonlyMap<string, string>;
    transaction: AutoMatchTransaction;
}) {
    if (transactionHasUncategorizedActivity(input.transaction)) {
        return { label: "Uncategorized", isUncategorized: true };
    }

    const categoryNames = [
        ...new Set(
            input.transaction.lines.flatMap((line) => {
                const categoryId = toDisplayTransactionLineCategoryId(
                    line.categoryId,
                );
                const categoryName = categoryId
                    ? input.categoryNameById.get(categoryId)
                    : undefined;

                return categoryName ? [categoryName] : [];
            }),
        ),
    ];

    return {
        isUncategorized: false,
        label:
            categoryNames.length > 0 ? categoryNames.join(", ") : "Transfer",
    };
}

function TransactionAutoMatchMetadata({
    categoryNameById,
    isMemoExpanded,
    onToggleMemo,
    transaction,
}: {
    categoryNameById: ReadonlyMap<string, string>;
    isMemoExpanded: boolean;
    onToggleMemo: () => void;
    transaction: AutoMatchTransaction;
}) {
    const category = getTransactionAutoMatchCategory({
        categoryNameById,
        transaction,
    });
    const hasMemoDetails = Boolean(
        transaction.memo?.trim() || hasTransactionManagedMetadata(transaction),
    );
    const summary = getTransactionAutoMatchSummary(transaction);

    return (
        <div
            className={`flex min-w-0 items-baseline gap-1 pl-7 text-xs text-[var(--color-muted)] ${
                isMemoExpanded ? "flex-wrap" : ""
            }`}
        >
            <span>{formatTransactionDisplayDate(transaction.occurredAt)}</span>
            <span aria-hidden="true">/</span>
            <span
                className={
                    category.isUncategorized
                        ? "text-[var(--tone-warning-ink)]"
                        : undefined
                }
            >
                {category.label}
            </span>
            {hasMemoDetails ? (
                <>
                    <span aria-hidden="true">/</span>
                    <button
                        type="button"
                        aria-expanded={isMemoExpanded}
                        aria-label={`${
                            isMemoExpanded ? "Collapse" : "Expand"
                        } memo for ${summary}`}
                        title={undefined}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleMemo();
                        }}
                        className={
                            isMemoExpanded
                                ? "min-w-0 text-left whitespace-normal break-words hover:text-[var(--color-ink)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                                : "min-w-0 flex-1 truncate text-left hover:text-[var(--color-ink)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                        }
                    >
                        <TransactionMemoDisplay
                            managedMetadata={transaction}
                            memo={transaction.memo}
                            showFullMemo={isMemoExpanded}
                        />
                    </button>
                </>
            ) : null}
        </div>
    );
}

export function TransactionAutoMatchDetails({
    categoryNameById,
    isMemoExpanded,
    onToggleMemo,
    transaction,
}: {
    categoryNameById: ReadonlyMap<string, string>;
    isMemoExpanded: boolean;
    onToggleMemo: () => void;
    transaction: AutoMatchTransaction;
}) {
    return (
        <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
                <TransactionSourceIcon source={transaction.source} />
                <VenmoManagedIcon
                    hasVenmoActivity={transactionHasImporter(transaction, "venmo")}
                    source={transaction.source}
                />
                <span
                    className={
                        isMemoExpanded
                            ? "min-w-0 break-words font-medium"
                            : "truncate font-medium"
                    }
                >
                    {getTransactionAutoMatchSummary(transaction)}
                </span>
            </div>
            <TransactionAutoMatchMetadata
                categoryNameById={categoryNameById}
                isMemoExpanded={isMemoExpanded}
                onToggleMemo={onToggleMemo}
                transaction={transaction}
            />
        </div>
    );
}
