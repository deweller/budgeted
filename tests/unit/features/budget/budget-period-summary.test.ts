import { describe, expect, it } from "vitest";

import {
    assembleBudgetPeriodSummary,
    createCategoryAllocationSummary,
} from "@/features/budget/models/budget-period-summary";

describe("budget period summary model", () => {
    it("builds category summaries with attention state metadata", () => {
        const summary = createCategoryAllocationSummary(
            {
                categoryId: "groceries",
                defaultAssignedCents: 20_000,
                isIncomeCategory: false,
                name: "Groceries",
            },
            {
                activityCents: -5_000,
                assignedCents: 10_000,
                availableCents: -1_000,
                carriedForwardCents: -6_000,
                categoryId: "groceries",
            },
        );

        expect(summary).toMatchObject({
            activityCents: -5_000,
            assignedCents: 10_000,
            availableCents: -1_000,
            baseAvailableCents: -1_000,
            carriedForwardCents: -6_000,
            categoryId: "groceries",
            defaultAssignedCents: 20_000,
            isIncomeCategory: false,
            name: "Groceries",
            reducedByOverspending: true,
        });
        expect(summary.attentionStates).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                severity: "info",
            }),
        ]);
    });

    it("assembles full period summaries with explicit assignment and funding totals", () => {
        const groceries = createCategoryAllocationSummary(
            {
                categoryId: "groceries",
                defaultAssignedCents: 20_000,
                isIncomeCategory: false,
                name: "Groceries",
            },
            {
                activityCents: -5_000,
                assignedCents: 10_000,
                availableCents: -1_000,
                carriedForwardCents: -6_000,
                categoryId: "groceries",
            },
        );
        const summary = assembleBudgetPeriodSummary({
            allocationFundingRows: [
                {
                    accountId: "checking",
                    accountName: "Checking",
                    amountCents: 10_000,
                },
            ],
            categorySummaries: [groceries],
            currentFundingSnapshot: {
                activeAccountCount: 2,
                totalFundsCents: -2_000,
            },
            hasSavedAssignments: true,
            periodId: "2026-06",
            status: "open",
        });

        expect(summary).toMatchObject({
            activeAccountCount: 2,
            allocationDifferenceCents: 0,
            allocationFundingCents: 10_000,
            assignedAllocationTotalCents: 10_000,
            availableToBudgetCents: 0,
            fundingReconciliationCents: 0,
            hasSavedAssignments: true,
            periodId: "2026-06",
            status: "open",
        });
        expect(
            summary.categories.map((category) => ({
                availableCents: category.availableCents,
                carriedForwardCents: category.carriedForwardCents,
                categoryId: category.categoryId,
            })),
        ).toEqual([
            {
                availableCents: -1_000,
                carriedForwardCents: -6_000,
                categoryId: "groceries",
            },
        ]);
        expect(summary.attentionStates).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                code: "carryForwardReduction",
            }),
        ]);
        expect(summary.carryForwardSummaries).toEqual([
            expect.objectContaining({
                carryForwardCents: -6_000,
                categoryId: "groceries",
            }),
        ]);
    });
});
