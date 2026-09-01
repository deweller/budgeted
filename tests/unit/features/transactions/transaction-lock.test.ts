import { describe, expect, it } from "vitest";

import {
    createFinancialMovementSignature,
    financialMovementsMatch,
} from "@/features/transactions/models/transaction-lock";

function posting(
    ledgerAccountId: string,
    amountCents: number,
    direction: "credit" | "debit",
    ledgerAccountKind: "category" | "equity" | "financial" = "financial",
) {
    return {
        amountCents,
        direction,
        ledgerAccountId,
        ledgerAccountKind,
    };
}

describe("transaction locking", () => {
    it("groups financial movement by account and ignores category structure", () => {
        expect(
            createFinancialMovementSignature([
                posting("checking", 1_000, "credit"),
                posting("checking", 250, "credit"),
                posting("groceries", 1_250, "debit", "category"),
            ]),
        ).toEqual([
            {
                amountCents: -1_250,
                ledgerAccountId: "checking",
            },
        ]);
    });

    it("permits category split changes with the same account movement", () => {
        const before = [
            posting("checking", 1_250, "credit"),
            posting("uncategorized", 1_250, "debit", "equity"),
        ];
        const after = [
            posting("checking", 500, "credit"),
            posting("checking", 750, "credit"),
            posting("groceries", 500, "debit", "category"),
            posting("household", 750, "debit", "category"),
        ];

        expect(financialMovementsMatch(before, after)).toBe(true);
    });

    it("rejects amount changes", () => {
        expect(
            financialMovementsMatch(
                [posting("checking", 1_250, "credit")],
                [posting("checking", 1_251, "credit")],
            ),
        ).toBe(false);
    });

    it("rejects financial account changes", () => {
        expect(
            financialMovementsMatch(
                [posting("checking", 1_250, "credit")],
                [posting("credit-card", 1_250, "credit")],
            ),
        ).toBe(false);
    });

    it("compares both sides of a transfer", () => {
        expect(
            financialMovementsMatch(
                [
                    posting("checking", 5_000, "credit"),
                    posting("savings", 5_000, "debit"),
                ],
                [
                    posting("checking", 5_000, "credit"),
                    posting("savings", 4_999, "debit"),
                    posting("category", 1, "debit", "category"),
                ],
            ),
        ).toBe(false);
    });
});
