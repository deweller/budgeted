import { isOneSidedAccountTransactionLine } from "./transaction-shape";
import { isUncategorizedAccountMovementLine } from "./transaction-line-normalization";

type CategorizationTransaction = {
    kind: "adjustment" | "standard";
    lines: Array<{
        categoryId?: string | null;
        fromAccountId?: string | null;
        toAccountId?: string | null;
    }>;
    status: "entered" | "cleared" | "reconciled" | "voided";
};

export type TransactionCategorizationEligibility = {
    canCategorize: boolean;
    reason?: string;
};

export function getTransactionCategorizationEligibility(
    transactions: CategorizationTransaction[],
): TransactionCategorizationEligibility {
    if (transactions.length === 0) {
        return {
            canCategorize: false,
            reason: "Select one or more transactions to categorize.",
        };
    }

    if (transactions.some((transaction) => transaction.status === "voided")) {
        return {
            canCategorize: false,
            reason: "Voided transactions cannot be categorized.",
        };
    }

    if (transactions.some((transaction) => transaction.kind !== "standard")) {
        return {
            canCategorize: false,
            reason: "Adjustment transactions cannot be categorized.",
        };
    }

    if (
        transactions.some(
            (transaction) =>
                transaction.lines.length !== 1 ||
                !isOneSidedAccountTransactionLine(transaction.lines[0] ?? {}),
        )
    ) {
        return {
            canCategorize: false,
            reason: "Select only single-line account transactions to categorize together.",
        };
    }

    if (
        transactions.some((transaction) =>
            transaction.lines.some(
                (line) => !isUncategorizedAccountMovementLine(line),
            ),
        )
    ) {
        return {
            canCategorize: false,
            reason: "Select only uncategorized account transactions to categorize together.",
        };
    }

    return { canCategorize: true };
}
