import { describe, expect, it } from "vitest";

import {
    buildAccountHealthSnapshot,
    buildReportingSummary,
    hasReportableActivity,
} from "@/modules/reporting/summary";

describe("reporting summary helpers", () => {
    it("aggregates category totals, cash flow, net worth, and period comparisons", () => {
        const summary = buildReportingSummary({
            accounts: [
                {
                    accountId: "account-1",
                    balanceCents: 12_000,
                },
                {
                    accountId: "account-2",
                    balanceCents: -2_500,
                },
            ],
            attentionStates: [
                {
                    code: "carryForwardReduction",
                    severity: "info",
                    message: "Groceries carried overspending forward.",
                    categoryId: "category-groceries",
                    transactionId: null,
                },
            ],
            carryForwardSummaries: [
                {
                    categoryId: "category-groceries",
                    categoryName: "Groceries",
                    carryForwardCents: -600,
                    reducedByOverspending: true,
                },
            ],
            categories: [
                {
                    categoryId: "category-groceries",
                    ledgerAccountId: "cat_groceries",
                    name: "Groceries",
                },
                {
                    categoryId: "category-rent",
                    ledgerAccountId: "cat_rent",
                    name: "Rent",
                },
            ],
            transactions: [
                {
                    periodId: "2026-04",
                    displayAmountCents: -10_000,
                    postings: [
                        {
                            ledgerAccountId: "cat_rent",
                            ledgerAccountKind: "category",
                            direction: "debit",
                            amountCents: 10_000,
                        },
                        {
                            ledgerAccountId: "acct_checking",
                            ledgerAccountKind: "financial",
                            direction: "credit",
                            amountCents: 10_000,
                        },
                    ],
                },
                {
                    periodId: "2026-05",
                    displayAmountCents: -3_000,
                    postings: [
                        {
                            ledgerAccountId: "cat_groceries",
                            ledgerAccountKind: "category",
                            direction: "debit",
                            amountCents: 3_000,
                        },
                        {
                            ledgerAccountId: "acct_checking",
                            ledgerAccountKind: "financial",
                            direction: "credit",
                            amountCents: 3_000,
                        },
                    ],
                },
                {
                    periodId: "2026-05",
                    displayAmountCents: 500,
                    postings: [
                        {
                            ledgerAccountId: "cat_groceries",
                            ledgerAccountKind: "category",
                            direction: "credit",
                            amountCents: 500,
                        },
                        {
                            ledgerAccountId: "acct_checking",
                            ledgerAccountKind: "financial",
                            direction: "debit",
                            amountCents: 500,
                        },
                    ],
                },
                {
                    periodId: "2026-05",
                    displayAmountCents: 2_000,
                    postings: [],
                },
                {
                    periodId: "2026-05",
                    displayAmountCents: -250,
                    postings: [],
                },
            ],
        });

        expect(summary.inflowCents).toBe(500);
        expect(summary.outflowCents).toBe(13_000);
        expect(summary.netWorthCents).toBe(9_500);
        expect(summary.categoryTotals).toEqual([
            {
                categoryId: "category-rent",
                name: "Rent",
                spentCents: 10_000,
                reducedByOverspending: false,
            },
            {
                categoryId: "category-groceries",
                name: "Groceries",
                spentCents: 2_500,
                reducedByOverspending: true,
            },
        ]);
        expect(summary.periodComparisons).toEqual([
            {
                periodId: "2026-04",
                inflowCents: 0,
                outflowCents: 10_000,
                netChangeCents: -10_000,
            },
            {
                periodId: "2026-05",
                inflowCents: 500,
                outflowCents: 3_000,
                netChangeCents: -2_500,
            },
        ]);
        expect(summary.attentionStates).toHaveLength(1);
        expect(summary.carryForwardSummaries).toHaveLength(1);
    });

    it("builds account health totals from positive and negative balances", () => {
        expect(
            buildAccountHealthSnapshot([
                {
                    accountId: "account-1",
                    balanceCents: 12_000,
                },
                {
                    accountId: "account-2",
                    balanceCents: -2_500,
                },
                {
                    accountId: "account-3",
                    balanceCents: 4_000,
                },
            ]),
        ).toEqual({
            accountCount: 3,
            assetBalanceCents: 16_000,
            liabilityBalanceCents: 2_500,
            netWorthCents: 13_500,
        });
    });

    it("uses selected account ledger accounts for transfer cash flow", () => {
        const checkingSummary = buildReportingSummary({
            accounts: [
                {
                    accountId: "checking",
                    balanceCents: 10_000,
                    ledgerAccountId: "acct_checking",
                },
            ],
            attentionStates: [],
            carryForwardSummaries: [],
            categories: [],
            transactions: [
                {
                    periodId: "2026-05",
                    displayAmountCents: -5_000,
                    postings: [
                        {
                            ledgerAccountId: "acct_checking",
                            ledgerAccountKind: "financial",
                            direction: "credit",
                            amountCents: 5_000,
                        },
                        {
                            ledgerAccountId: "acct_credit_card",
                            ledgerAccountKind: "financial",
                            direction: "debit",
                            amountCents: 5_000,
                        },
                    ],
                },
            ],
        });
        const creditCardSummary = buildReportingSummary({
            accounts: [
                {
                    accountId: "credit-card",
                    balanceCents: -5_000,
                    ledgerAccountId: "acct_credit_card",
                },
            ],
            attentionStates: [],
            carryForwardSummaries: [],
            categories: [],
            transactions: [
                {
                    periodId: "2026-05",
                    displayAmountCents: -5_000,
                    postings: [
                        {
                            ledgerAccountId: "acct_checking",
                            ledgerAccountKind: "financial",
                            direction: "credit",
                            amountCents: 5_000,
                        },
                        {
                            ledgerAccountId: "acct_credit_card",
                            ledgerAccountKind: "financial",
                            direction: "debit",
                            amountCents: 5_000,
                        },
                    ],
                },
            ],
        });

        expect(checkingSummary.outflowCents).toBe(5_000);
        expect(checkingSummary.inflowCents).toBe(0);
        expect(creditCardSummary.inflowCents).toBe(5_000);
        expect(creditCardSummary.outflowCents).toBe(0);
    });

    it("detects reportable activity from transactions, balances, category totals, carry-forward, or attention", () => {
        const baseInput = {
            accounts: [],
            attentionStates: [],
            carryForwardSummaries: [],
            categoryTotals: [],
            transactions: [],
        };

        expect(hasReportableActivity(baseInput)).toBe(false);
        expect(
            hasReportableActivity({
                ...baseInput,
                transactions: [
                    {
                        displayAmountCents: 0,
                        periodId: "2026-05",
                        postings: [],
                    },
                ],
            }),
        ).toBe(true);
        expect(
            hasReportableActivity({
                ...baseInput,
                accounts: [
                    {
                        accountId: "checking",
                        balanceCents: 1,
                    },
                ],
            }),
        ).toBe(true);
        expect(
            hasReportableActivity({
                ...baseInput,
                categoryTotals: [
                    {
                        categoryId: "groceries",
                        name: "Groceries",
                        reducedByOverspending: false,
                        spentCents: 1,
                    },
                ],
            }),
        ).toBe(true);
        expect(
            hasReportableActivity({
                ...baseInput,
                carryForwardSummaries: [
                    {
                        categoryId: "groceries",
                        categoryName: "Groceries",
                        carryForwardCents: 1,
                        reducedByOverspending: false,
                    },
                ],
            }),
        ).toBe(true);
        expect(
            hasReportableActivity({
                ...baseInput,
                attentionStates: [
                    {
                        categoryId: null,
                        code: "validationWarning",
                        message: "warning",
                        severity: "critical",
                        transactionId: null,
                    },
                ],
            }),
        ).toBe(true);
    });
});
