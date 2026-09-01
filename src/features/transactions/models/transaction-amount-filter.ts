import { formatUsd, parseUsdToCents } from "@/lib/formatting/money";

import {
    getTransactionLineSignedAmountCents,
    type TransactionAmountLine,
} from "./transaction-shape";

export type TransactionAmountFilter = {
    amountCents: number;
    sign: "any" | "negative" | "positive";
};

export type TransactionAmountFilterable = {
    displayAmountCents: number;
    lines: readonly TransactionAmountLine[];
    referenceAccountId: string;
};

export function parseTransactionAmountFilter(
    value: string,
): TransactionAmountFilter | null {
    const normalized = value.trim().replace(/[$,\s]/g, "");

    if (!normalized) {
        return null;
    }

    const sign = normalized.startsWith("-")
        ? "negative"
        : normalized.startsWith("+")
          ? "positive"
          : "any";

    try {
        return {
            amountCents: Math.abs(parseUsdToCents(normalized)),
            sign,
        };
    } catch {
        return null;
    }
}

export function amountCentsMatchesTransactionAmountFilter(
    amountCents: number,
    filter: TransactionAmountFilter,
) {
    if (filter.sign === "positive") {
        return amountCents === filter.amountCents;
    }

    if (filter.sign === "negative") {
        return amountCents === -filter.amountCents;
    }

    return Math.abs(amountCents) === filter.amountCents;
}

export function transactionMatchesAmountFilter(
    transaction: TransactionAmountFilterable,
    filter: TransactionAmountFilter,
    displayAmountCents = transaction.displayAmountCents,
    perspectiveAccountId = transaction.referenceAccountId,
) {
    return (
        amountCentsMatchesTransactionAmountFilter(
            displayAmountCents,
            filter,
        ) ||
        transaction.lines.some((line) =>
            amountCentsMatchesTransactionAmountFilter(
                getTransactionLineSignedAmountCents(
                    line,
                    perspectiveAccountId,
                ),
                filter,
            ),
        )
    );
}

export function formatTransactionAmountFilterLabel(value: string) {
    const parsedAmountFilter = parseTransactionAmountFilter(value);

    if (!parsedAmountFilter) {
        return `Amount: ${value.trim()}`;
    }

    if (parsedAmountFilter.sign === "positive") {
        return `Amount: +${formatUsd(parsedAmountFilter.amountCents)}`;
    }

    if (parsedAmountFilter.sign === "negative") {
        return `Amount: ${formatUsd(-parsedAmountFilter.amountCents)}`;
    }

    return `Amount: ${formatUsd(parsedAmountFilter.amountCents)}`;
}
