import {
    assertBalancedLedger,
    getPostingDelta,
} from "@/modules/ledger/balance";
import { getOrCreateMapValue } from "@/lib/collections";

export type LedgerAccountKind = "financial" | "category" | "equity";

export type TransactionPostingInput = {
    amountCents: number;
    direction: "debit" | "credit";
    ledgerAccountId: string;
    ledgerAccountKind: LedgerAccountKind;
};

export type TransactionLinePostingInput = {
    amountCents: number;
    categoryLedgerAccountId?: string | null;
    fromLedgerAccountId?: string | null;
    toLedgerAccountId?: string | null;
    uncategorizedEquityLedgerAccountId?: string | null;
};

export type TransactionAccountActivity = {
    postings?: readonly Pick<
        TransactionPostingInput,
        "ledgerAccountId" | "ledgerAccountKind"
    >[];
    referenceAccountId?: string | null;
};

export type LedgerAccountActivityReference = {
    accountId: string;
    ledgerAccountId: string;
};

export type FinancialPostingDeltaInput = Pick<
    TransactionPostingInput,
    "amountCents" | "direction" | "ledgerAccountId" | "ledgerAccountKind"
>;

export function assertValidTransactionPostings(input: {
    postings: TransactionPostingInput[];
}) {
    assertBalancedLedger(input.postings);

    if (
        !input.postings.some(
            (posting) => posting.ledgerAccountKind === "financial",
        )
    ) {
        throw new Error(
            "Ledger transactions must include at least one financial account posting.",
        );
    }

    return input.postings;
}

export function buildTransactionLinePostingInputs(
    input: TransactionLinePostingInput,
): TransactionPostingInput[] {
    const postings: TransactionPostingInput[] = [];

    if (input.fromLedgerAccountId) {
        postings.push({
            amountCents: input.amountCents,
            direction: "credit",
            ledgerAccountId: input.fromLedgerAccountId,
            ledgerAccountKind: "financial",
        });
    }

    if (input.toLedgerAccountId) {
        postings.push({
            amountCents: input.amountCents,
            direction: "debit",
            ledgerAccountId: input.toLedgerAccountId,
            ledgerAccountKind: "financial",
        });
    }

    if (input.fromLedgerAccountId && !input.toLedgerAccountId) {
        const balancingLedgerAccountId =
            input.categoryLedgerAccountId ||
            input.uncategorizedEquityLedgerAccountId;

        if (!balancingLedgerAccountId) {
            throw new Error("Account outflow lines require a category.");
        }

        postings.push({
            amountCents: input.amountCents,
            direction: "debit",
            ledgerAccountId: balancingLedgerAccountId,
            ledgerAccountKind: input.categoryLedgerAccountId
                ? "category"
                : "equity",
        });
    }

    if (input.toLedgerAccountId && !input.fromLedgerAccountId) {
        const balancingLedgerAccountId =
            input.categoryLedgerAccountId ||
            input.uncategorizedEquityLedgerAccountId;

        if (!balancingLedgerAccountId) {
            throw new Error("Account inflow lines require a category.");
        }

        postings.push({
            amountCents: input.amountCents,
            direction: "credit",
            ledgerAccountId: balancingLedgerAccountId,
            ledgerAccountKind: input.categoryLedgerAccountId
                ? "category"
                : "equity",
        });
    }

    return postings;
}

export function groupTransactionPostingInputs(
    postings: readonly TransactionPostingInput[],
) {
    const grouped = new Map<string, TransactionPostingInput>();

    for (const posting of postings) {
        const key = [
            posting.ledgerAccountId,
            posting.ledgerAccountKind,
            posting.direction,
        ].join(":");
        const groupedPosting = getOrCreateMapValue(grouped, key, () => ({
            ...posting,
            amountCents: 0,
        }));

        groupedPosting.amountCents += posting.amountCents;
    }

    return Array.from(grouped.values()).filter(
        (posting) => posting.amountCents > 0,
    );
}

export function deriveTransactionDisplayAmountCents(input: {
    ledgerAccountId: string;
    postings: TransactionPostingInput[];
}) {
    assertValidTransactionPostings(input);

    return (
        getFinancialPostingDeltaForLedgerAccount({
            postings: input.postings,
            ledgerAccountId: input.ledgerAccountId,
        }) ?? 0
    );
}

export function transactionHasAccountActivity(
    transaction: TransactionAccountActivity,
    account: LedgerAccountActivityReference,
) {
    return (
        transaction.referenceAccountId === account.accountId ||
        (transaction.postings ?? []).some(
            (posting) =>
                posting.ledgerAccountKind === "financial" &&
                posting.ledgerAccountId === account.ledgerAccountId,
        )
    );
}

export function sumFinancialPostingDeltas(input: {
    ledgerAccountIds?: ReadonlySet<string>;
    postings: readonly FinancialPostingDeltaInput[];
}) {
    return input.postings
        .filter(
            (posting) =>
                posting.ledgerAccountKind === "financial" &&
                (!input.ledgerAccountIds?.size ||
                    input.ledgerAccountIds.has(posting.ledgerAccountId)),
        )
        .reduce((total, posting) => total + getPostingDelta(posting), 0);
}

export function getFinancialPostingDeltaForLedgerAccount(input: {
    ledgerAccountId?: string;
    postings: readonly FinancialPostingDeltaInput[];
}) {
    if (!input.ledgerAccountId) {
        return null;
    }

    const ledgerAccountIds = new Set([input.ledgerAccountId]);
    const hasMatchingPosting = input.postings.some(
        (posting) =>
            posting.ledgerAccountKind === "financial" &&
            ledgerAccountIds.has(posting.ledgerAccountId),
    );

    if (!hasMatchingPosting) {
        return null;
    }

    return sumFinancialPostingDeltas({
        ledgerAccountIds,
        postings: input.postings,
    });
}
