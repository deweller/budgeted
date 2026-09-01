import { toTransactionDateInputValue } from "@/features/transactions/models/transaction-date";
import { getFinancialPostingDeltaForLedgerAccount } from "@/modules/ledger";
import { amazonTransactionImporter } from "@/features/transaction-importers/models/amazon-transaction-importer";

export type AmazonMatchPayment = {
    amazonPaymentId: string;
    amountCents: number;
    completedDate: string;
};

export type AmazonMatchAccount = {
    accountId: string;
    ledgerAccountId: string;
};

export type AmazonMatchTransaction = {
    displayAmountCents: number;
    occurredAt: string;
    postings: Array<{
        amountCents: number;
        direction: "credit" | "debit";
        ledgerAccountId: string;
        ledgerAccountKind: "category" | "equity" | "financial";
    }>;
    referenceAccountId: string;
    status: "entered" | "cleared" | "reconciled" | "voided";
    transactionId: string;
};

function toUtcDay(value: string) {
    return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function isWithinMatchingWindow(leftDate: string, rightDate: string) {
    const dayMs = 24 * 60 * 60 * 1000;
    const left = toUtcDay(leftDate);
    const right = toUtcDay(rightDate);

    return (
        Number.isFinite(left) &&
        Math.abs(left - right) <=
            amazonTransactionImporter.matchingPolicy.dateWindowDays * dayMs
    );
}

export function getTransactionAmountForAmazonAccount(input: {
    account: AmazonMatchAccount;
    transaction: AmazonMatchTransaction;
}) {
    if (input.transaction.referenceAccountId === input.account.accountId) {
        return input.transaction.displayAmountCents;
    }

    return getFinancialPostingDeltaForLedgerAccount({
        ledgerAccountId: input.account.ledgerAccountId,
        postings: input.transaction.postings,
    });
}

export function findAmazonPaymentMatchCandidates(input: {
    account: AmazonMatchAccount;
    excludedTransactionIds?: ReadonlySet<string>;
    payment: AmazonMatchPayment;
    transactions: AmazonMatchTransaction[];
}) {
    return input.transactions
        .filter((transaction) => transaction.status !== "voided")
        .filter(
            (transaction) =>
                !input.excludedTransactionIds?.has(transaction.transactionId),
        )
        .filter((transaction) =>
            isWithinMatchingWindow(
                input.payment.completedDate,
                toTransactionDateInputValue(transaction.occurredAt),
            ),
        )
        .filter(
            (transaction) =>
                getTransactionAmountForAmazonAccount({
                    account: input.account,
                    transaction,
                }) === input.payment.amountCents,
        )
        .map((transaction) => transaction.transactionId);
}
