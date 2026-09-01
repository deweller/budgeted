import { describe, expect, it } from "vitest";

import {
    amountCentsMatchesTransactionAmountFilter,
    formatTransactionAmountFilterLabel,
    parseTransactionAmountFilter,
    type TransactionAmountFilter,
    transactionMatchesAmountFilter,
} from "@/features/transactions/models/transaction-amount-filter";

function requireParsedFilter(value: string): TransactionAmountFilter {
    const filter = parseTransactionAmountFilter(value);

    if (!filter) {
        throw new Error(`Expected ${value} to parse as amount filter.`);
    }

    return filter;
}

describe("transaction amount filter helpers", () => {
    it("parses signed and unsigned dollar inputs", () => {
        expect(parseTransactionAmountFilter("$1,234.50")).toEqual({
            amountCents: 123_450,
            sign: "any",
        });
        expect(parseTransactionAmountFilter("+78.5")).toEqual({
            amountCents: 7_850,
            sign: "positive",
        });
        expect(parseTransactionAmountFilter("-78.05")).toEqual({
            amountCents: 7_805,
            sign: "negative",
        });
        expect(parseTransactionAmountFilter(" ")).toBeNull();
        expect(parseTransactionAmountFilter("12.345")).toEqual({
            amountCents: 1_235,
            sign: "any",
        });
        expect(parseTransactionAmountFilter("abc")).toBeNull();
    });

    it("parses arithmetic expressions", () => {
        expect(parseTransactionAmountFilter("100 + 12")).toEqual({
            amountCents: 11_200,
            sign: "any",
        });
        expect(parseTransactionAmountFilter("+4*5")).toEqual({
            amountCents: 2_000,
            sign: "positive",
        });
        expect(parseTransactionAmountFilter("-(100 + 12) / 2")).toEqual({
            amountCents: 5_600,
            sign: "negative",
        });
    });

    it("matches unsigned filters against positive and negative amounts", () => {
        const filter = requireParsedFilter("50");

        expect(
            amountCentsMatchesTransactionAmountFilter(5_000, filter),
        ).toBe(true);
        expect(
            amountCentsMatchesTransactionAmountFilter(-5_000, filter),
        ).toBe(true);
        expect(
            amountCentsMatchesTransactionAmountFilter(4_999, filter),
        ).toBe(false);
    });

    it("matches signed filters only against the requested direction", () => {
        const positiveFilter = requireParsedFilter("+50");
        const negativeFilter = requireParsedFilter("-50");

        expect(
            amountCentsMatchesTransactionAmountFilter(5_000, positiveFilter),
        ).toBe(true);
        expect(
            amountCentsMatchesTransactionAmountFilter(-5_000, positiveFilter),
        ).toBe(false);
        expect(
            amountCentsMatchesTransactionAmountFilter(-5_000, negativeFilter),
        ).toBe(true);
        expect(
            amountCentsMatchesTransactionAmountFilter(5_000, negativeFilter),
        ).toBe(false);
    });

    it("formats active filter labels consistently with sign input", () => {
        expect(formatTransactionAmountFilterLabel("50")).toBe("Amount: $50.00");
        expect(formatTransactionAmountFilterLabel("+50")).toBe(
            "Amount: +$50.00",
        );
        expect(formatTransactionAmountFilterLabel("-50")).toBe(
            "Amount: -$50.00",
        );
        expect(formatTransactionAmountFilterLabel("oops")).toBe(
            "Amount: oops",
        );
    });

    it("matches transactions by display amount or signed line amount", () => {
        const filter = requireParsedFilter("+25");

        expect(
            transactionMatchesAmountFilter(
                {
                    displayAmountCents: -10_000,
                    lines: [
                        {
                            amountCents: 2_500,
                            fromAccountId: "checking",
                            toAccountId: "savings",
                        },
                    ],
                    referenceAccountId: "checking",
                },
                filter,
                undefined,
                "savings",
            ),
        ).toBe(true);
        expect(
            transactionMatchesAmountFilter(
                {
                    displayAmountCents: -10_000,
                    lines: [
                        {
                            amountCents: 2_500,
                            fromAccountId: "checking",
                            toAccountId: "savings",
                        },
                    ],
                    referenceAccountId: "checking",
                },
                filter,
                undefined,
                "checking",
            ),
        ).toBe(false);
    });
});
