import { describe, expect, it } from "vitest";

import {
    assertValidTransactionPostings,
    buildTransactionLinePostingInputs,
    deriveTransactionDisplayAmountCents,
    getFinancialPostingDeltaForLedgerAccount,
    groupTransactionPostingInputs,
    sumFinancialPostingDeltas,
    transactionHasAccountActivity,
} from "@/modules/ledger";

describe("assertValidTransactionPostings", () => {
    it("accepts balanced outflow postings", () => {
        expect(
            assertValidTransactionPostings({
                postings: [
                    {
                        ledgerAccountId: "cat_groceries",
                        ledgerAccountKind: "category",
                        direction: "debit",
                        amountCents: 5_000,
                    },
                    {
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 5_000,
                    },
                ],
            }),
        ).toHaveLength(2);
    });

    it("rejects unbalanced postings", () => {
        expect(() =>
            assertValidTransactionPostings({
                postings: [
                    {
                        ledgerAccountId: "cat_groceries",
                        ledgerAccountKind: "category",
                        direction: "debit",
                        amountCents: 5_000,
                    },
                    {
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 4_000,
                    },
                ],
            }),
        ).toThrow("Ledger postings must balance to zero.");
    });

    it("derives signed display amounts from the reference financial posting", () => {
        expect(
            deriveTransactionDisplayAmountCents({
                ledgerAccountId: "acct_checking",
                postings: [
                    {
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "debit",
                        amountCents: 5_000,
                    },
                    {
                        ledgerAccountId: "cat_income",
                        ledgerAccountKind: "category",
                        direction: "credit",
                        amountCents: 5_000,
                    },
                ],
            }),
        ).toBe(5_000);

        expect(
            deriveTransactionDisplayAmountCents({
                ledgerAccountId: "acct_checking",
                postings: [
                    {
                        ledgerAccountId: "cat_groceries",
                        ledgerAccountKind: "category",
                        direction: "debit",
                        amountCents: 1_250,
                    },
                    {
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 1_250,
                    },
                ],
            }),
        ).toBe(-1_250);

        expect(
            deriveTransactionDisplayAmountCents({
                ledgerAccountId: "acct_checking",
                postings: [
                    {
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 3_000,
                    },
                    {
                        ledgerAccountId: "acct_savings",
                        ledgerAccountKind: "financial",
                        direction: "debit",
                        amountCents: 3_000,
                    },
                ],
            }),
        ).toBe(-3_000);
    });

    it("detects account activity from reference accounts or financial postings", () => {
        const checking = {
            accountId: "checking",
            ledgerAccountId: "acct_checking",
        };

        expect(
            transactionHasAccountActivity(
                {
                    referenceAccountId: "checking",
                    postings: [],
                },
                checking,
            ),
        ).toBe(true);

        expect(
            transactionHasAccountActivity(
                {
                    referenceAccountId: "savings",
                    postings: [
                        {
                            ledgerAccountId: "acct_checking",
                            ledgerAccountKind: "financial",
                        },
                    ],
                },
                checking,
            ),
        ).toBe(true);

        expect(
            transactionHasAccountActivity(
                {
                    referenceAccountId: "savings",
                    postings: [
                        {
                            ledgerAccountId: "cat_groceries",
                            ledgerAccountKind: "category",
                        },
                    ],
                },
                checking,
            ),
        ).toBe(false);

        expect(
            transactionHasAccountActivity(
                {
                    referenceAccountId: "savings",
                },
                checking,
            ),
        ).toBe(false);
    });

    it("sums financial posting deltas for all or selected ledger accounts", () => {
        const postings = [
            {
                amountCents: 5_000,
                direction: "debit" as const,
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
            },
            {
                amountCents: 1_500,
                direction: "credit" as const,
                ledgerAccountId: "acct_savings",
                ledgerAccountKind: "financial" as const,
            },
            {
                amountCents: 2_000,
                direction: "debit" as const,
                ledgerAccountId: "cat_groceries",
                ledgerAccountKind: "category" as const,
            },
        ];

        expect(sumFinancialPostingDeltas({ postings })).toBe(3_500);
        expect(
            sumFinancialPostingDeltas({
                ledgerAccountIds: new Set(["acct_savings"]),
                postings,
            }),
        ).toBe(-1_500);
    });

    it("returns nullable financial posting deltas for one ledger account", () => {
        const postings = [
            {
                amountCents: 2_000,
                direction: "debit" as const,
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
            },
            {
                amountCents: 500,
                direction: "credit" as const,
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
            },
        ];

        expect(
            getFinancialPostingDeltaForLedgerAccount({
                ledgerAccountId: "acct_checking",
                postings,
            }),
        ).toBe(1_500);
        expect(
            getFinancialPostingDeltaForLedgerAccount({
                ledgerAccountId: "acct_savings",
                postings,
            }),
        ).toBeNull();
        expect(
            getFinancialPostingDeltaForLedgerAccount({
                postings,
            }),
        ).toBeNull();
    });

    it("builds posting inputs for category account outflows and inflows", () => {
        expect(
            buildTransactionLinePostingInputs({
                amountCents: 5_000,
                categoryLedgerAccountId: "cat_groceries",
                fromLedgerAccountId: "acct_checking",
            }),
        ).toEqual([
            {
                amountCents: 5_000,
                direction: "credit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
            },
            {
                amountCents: 5_000,
                direction: "debit",
                ledgerAccountId: "cat_groceries",
                ledgerAccountKind: "category",
            },
        ]);

        expect(
            buildTransactionLinePostingInputs({
                amountCents: 7_500,
                categoryLedgerAccountId: "cat_income",
                toLedgerAccountId: "acct_checking",
            }),
        ).toEqual([
            {
                amountCents: 7_500,
                direction: "debit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
            },
            {
                amountCents: 7_500,
                direction: "credit",
                ledgerAccountId: "cat_income",
                ledgerAccountKind: "category",
            },
        ]);
    });

    it("builds posting inputs for transfers without category or equity balancing", () => {
        expect(
            buildTransactionLinePostingInputs({
                amountCents: 2_500,
                categoryLedgerAccountId: "cat_unused",
                fromLedgerAccountId: "acct_checking",
                toLedgerAccountId: "acct_savings",
            }),
        ).toEqual([
            {
                amountCents: 2_500,
                direction: "credit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
            },
            {
                amountCents: 2_500,
                direction: "debit",
                ledgerAccountId: "acct_savings",
                ledgerAccountKind: "financial",
            },
        ]);
    });

    it("rejects one-sided account movement without a category or uncategorized equity account", () => {
        expect(() =>
            buildTransactionLinePostingInputs({
                amountCents: 1_250,
                fromLedgerAccountId: "acct_checking",
            }),
        ).toThrow("Account outflow lines require a category.");

        expect(() =>
            buildTransactionLinePostingInputs({
                amountCents: 1_250,
                toLedgerAccountId: "acct_checking",
            }),
        ).toThrow("Account inflow lines require a category.");
    });

    it("builds posting inputs for uncategorized one-sided account movement", () => {
        expect(
            buildTransactionLinePostingInputs({
                amountCents: 1_250,
                fromLedgerAccountId: "acct_checking",
                uncategorizedEquityLedgerAccountId: "equity_uncategorized",
            }),
        ).toEqual([
            {
                amountCents: 1_250,
                direction: "credit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
            },
            {
                amountCents: 1_250,
                direction: "debit",
                ledgerAccountId: "equity_uncategorized",
                ledgerAccountKind: "equity",
            },
        ]);

        expect(
            buildTransactionLinePostingInputs({
                amountCents: 1_250,
                toLedgerAccountId: "acct_checking",
                uncategorizedEquityLedgerAccountId: "equity_uncategorized",
            }),
        ).toEqual([
            {
                amountCents: 1_250,
                direction: "debit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
            },
            {
                amountCents: 1_250,
                direction: "credit",
                ledgerAccountId: "equity_uncategorized",
                ledgerAccountKind: "equity",
            },
        ]);
    });

    it("groups matching transaction posting inputs and removes zero totals", () => {
        expect(
            groupTransactionPostingInputs([
                {
                    amountCents: 1_000,
                    direction: "debit",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                },
                {
                    amountCents: 500,
                    direction: "debit",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                },
                {
                    amountCents: 0,
                    direction: "credit",
                    ledgerAccountId: "cat_groceries",
                    ledgerAccountKind: "category",
                },
                {
                    amountCents: 300,
                    direction: "credit",
                    ledgerAccountId: "cat_groceries",
                    ledgerAccountKind: "category",
                },
            ]),
        ).toEqual([
            {
                amountCents: 1_500,
                direction: "debit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
            },
            {
                amountCents: 300,
                direction: "credit",
                ledgerAccountId: "cat_groceries",
                ledgerAccountKind: "category",
            },
        ]);
    });
});
