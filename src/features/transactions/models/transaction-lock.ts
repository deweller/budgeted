import { getPostingDelta } from "@/modules/ledger/balance";

type FinancialMovementPosting = {
    amountCents: number;
    direction: "credit" | "debit";
    ledgerAccountId: string;
    ledgerAccountKind: "category" | "equity" | "financial";
};

export function createFinancialMovementSignature(
    postings: readonly FinancialMovementPosting[],
) {
    const movementByAccountId = new Map<string, number>();

    for (const posting of postings) {
        if (posting.ledgerAccountKind !== "financial") {
            continue;
        }

        movementByAccountId.set(
            posting.ledgerAccountId,
            (movementByAccountId.get(posting.ledgerAccountId) ?? 0) +
                getPostingDelta(posting),
        );
    }

    return Array.from(movementByAccountId)
        .filter(([, amountCents]) => amountCents !== 0)
        .sort(([leftAccountId], [rightAccountId]) =>
            leftAccountId.localeCompare(rightAccountId),
        )
        .map(([ledgerAccountId, amountCents]) => ({
            amountCents,
            ledgerAccountId,
        }));
}

export function financialMovementsMatch(
    left: readonly FinancialMovementPosting[],
    right: readonly FinancialMovementPosting[],
) {
    const leftSignature = createFinancialMovementSignature(left);
    const rightSignature = createFinancialMovementSignature(right);

    return (
        leftSignature.length === rightSignature.length &&
        leftSignature.every(
            (movement, index) =>
                movement.ledgerAccountId === rightSignature[index]?.ledgerAccountId &&
                movement.amountCents === rightSignature[index]?.amountCents,
        )
    );
}
