import { describe, expect, it } from "vitest";

import {
    buildBudgetReportingSignals,
    buildUncategorizedActivityAttentionStates,
    createEmptyBudgetReportingSignals,
    listMonthlyPeriodIdsInRange,
} from "@/features/reporting/models/reporting-signals";

describe("reporting signal helpers", () => {
    it("lists monthly period ids included in a local date range", () => {
        expect(
            listMonthlyPeriodIdsInRange("2026-04-15", "2026-06-01"),
        ).toEqual(["2026-04", "2026-05", "2026-06"]);
    });

    it("builds budget attention states and carry-forward details for report periods", () => {
        const signals = buildBudgetReportingSignals({
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                },
            ],
            periods: [
                {
                    periodId: "2026-05",
                    summary: {
                        availableToBudgetCents: -100,
                        categories: [
                            {
                                availableCents: -50,
                                carriedForwardCents: -250,
                                categoryId: "groceries",
                            },
                            {
                                availableCents: 0,
                                carriedForwardCents: -500,
                                categoryId: "hidden",
                            },
                        ],
                    },
                },
                {
                    periodId: "2026-06",
                    summary: null,
                },
            ],
        });

        expect(signals.attentionStates).toEqual([
            expect.objectContaining({
                categoryId: null,
                code: "validationWarning",
                message: "2026-05 is over-assigned against available funds.",
            }),
            expect.objectContaining({
                categoryId: "groceries",
                code: "carryForwardReduction",
                message:
                    "Groceries started 2026-05 reduced by overspending.",
            }),
        ]);
        expect(signals.carryForwardDetails).toEqual([
            {
                carryForwardCents: -250,
                categoryId: "groceries",
                categoryName: "Groceries",
                periodId: "2026-05",
                reducedByOverspending: true,
            },
        ]);
        expect(signals.carryForwardSummaries).toEqual([
            {
                carryForwardCents: -250,
                categoryId: "groceries",
                categoryName: "Groceries",
                reducedByOverspending: true,
            },
        ]);
    });

    it("creates independent empty budget signals", () => {
        const first = createEmptyBudgetReportingSignals();
        const second = createEmptyBudgetReportingSignals();

        first.attentionStates.push({
            categoryId: null,
            code: "validationWarning",
            message: "warning",
            severity: "critical",
            transactionId: null,
        });

        expect(second.attentionStates).toEqual([]);
    });

    it("flags uncategorized standard account movement only", () => {
        const signals = buildUncategorizedActivityAttentionStates([
            {
                kind: "standard",
                lines: [
                    {
                        categoryId: null,
                        fromAccountId: "checking",
                        toAccountId: null,
                    },
                ],
                periodId: "2026-05",
                status: "entered",
                transactionId: "uncategorized",
            },
            {
                kind: "standard",
                lines: [
                    {
                        categoryId: "groceries",
                        fromAccountId: "checking",
                        toAccountId: null,
                    },
                ],
                periodId: "2026-05",
                status: "entered",
                transactionId: "categorized",
            },
            {
                kind: "standard",
                lines: [
                    {
                        categoryId: null,
                        fromAccountId: "checking",
                        toAccountId: "savings",
                    },
                ],
                periodId: "2026-05",
                status: "entered",
                transactionId: "transfer",
            },
            {
                kind: "adjustment",
                lines: [
                    {
                        categoryId: null,
                        fromAccountId: null,
                        toAccountId: "checking",
                    },
                ],
                periodId: "2026-05",
                status: "entered",
                transactionId: "adjustment",
            },
            {
                kind: "standard",
                lines: [
                    {
                        categoryId: null,
                        fromAccountId: "checking",
                        toAccountId: null,
                    },
                ],
                periodId: "2026-05",
                status: "voided",
                transactionId: "voided",
            },
        ]);

        expect(signals).toEqual([
            expect.objectContaining({
                code: "uncategorizedActivity",
                transactionId: "uncategorized",
            }),
        ]);
    });
});
