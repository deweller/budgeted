import { getPostingDelta } from "@/modules/ledger/balance";

export type AccountBalanceRecord = {
    ledgerAccountId: string;
    openedOn: string;
    openingBalanceCents: number;
};

export type AccountBalancePosting = {
    amountCents: number;
    direction: "debit" | "credit";
    ledgerAccountId: string;
    ledgerAccountKind: "category" | "equity" | "financial";
    occurredAt?: string;
    transactionId?: string;
};

function toTimestamp(value: Date | string) {
    if (value instanceof Date) {
        return value.getTime();
    }

    const normalizedValue = value.includes("T")
        ? value
        : `${value}T23:59:59.999Z`;

    return new Date(normalizedValue).getTime();
}

export function calculateAccountBalanceCents(
    account: AccountBalanceRecord,
    postings: AccountBalancePosting[],
    asOf?: Date | string,
) {
    const asOfTimestamp = asOf ? toTimestamp(asOf) : undefined;

    if (
        asOfTimestamp !== undefined &&
        toTimestamp(account.openedOn) > asOfTimestamp
    ) {
        return 0;
    }

    return (
        account.openingBalanceCents +
        postings
            .filter(
                (posting) =>
                    posting.ledgerAccountKind === "financial" &&
                    posting.ledgerAccountId === account.ledgerAccountId &&
                    (asOfTimestamp === undefined ||
                        !posting.occurredAt ||
                        toTimestamp(posting.occurredAt) <= asOfTimestamp),
            )
            .reduce((total, posting) => total + getPostingDelta(posting), 0)
    );
}
