export type LedgerDirection = "debit" | "credit";

export type BalanceCheckPosting = {
    amountCents: number;
    direction: LedgerDirection;
};

export function getPostingDelta(posting: BalanceCheckPosting) {
    return posting.direction === "debit"
        ? posting.amountCents
        : -posting.amountCents;
}

export function getLedgerBalance(postings: BalanceCheckPosting[]) {
    return postings.reduce(
        (total, posting) => total + getPostingDelta(posting),
        0,
    );
}

export function isBalancedLedger(postings: BalanceCheckPosting[]) {
    return (
        postings.length >= 2 &&
        postings.every((posting) => posting.amountCents > 0) &&
        getLedgerBalance(postings) === 0
    );
}

export function assertBalancedLedger(postings: BalanceCheckPosting[]) {
    if (postings.length < 2) {
        throw new Error(
            "A balanced ledger transaction requires at least two postings.",
        );
    }

    if (postings.some((posting) => posting.amountCents <= 0)) {
        throw new Error("Posting amounts must be positive cents values.");
    }

    if (!isBalancedLedger(postings)) {
        throw new Error("Ledger postings must balance to zero.");
    }

    return postings;
}
