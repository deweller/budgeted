import { describe, expect, it } from "vitest";

import { planAutoAssignDefaults } from "@/modules/budgeting";

describe("planAutoAssignDefaults", () => {
    it("uses configured sources in order without using Unassigned", () => {
        const plan = planAutoAssignDefaults({
            availableToBudgetCents: 1_000,
            periodId: "2026-01",
            sourceCategoryIds: ["buffer", "reserve"],
            categories: [
                {
                    assignedCents: 0,
                    availableCents: 1_000,
                    categoryId: "__unassigned__",
                    defaultAssignedCents: 0,
                },
                {
                    assignedCents: 0,
                    availableCents: 0,
                    categoryId: "groceries",
                    defaultAssignedCents: 3_000,
                },
                {
                    assignedCents: 0,
                    availableCents: 2_000,
                    categoryId: "buffer",
                    defaultAssignedCents: 0,
                },
                {
                    assignedCents: 0,
                    availableCents: 1_000,
                    categoryId: "reserve",
                    defaultAssignedCents: 0,
                },
            ],
        });

        expect(plan.shortfallCents).toBe(0);
        expect(plan.sourceDraws).toEqual([
            { amountCents: 2_000, sourceId: "buffer" },
            { amountCents: 1_000, sourceId: "reserve" },
        ]);
        expect(plan.allocations).toEqual([
            {
                assignedCents: 3_000,
                categoryId: "groceries",
                fundingSources: [
                    {
                        amountCents: 2_000,
                        sourceId: "buffer",
                        sourceType: "budgetCategory",
                    },
                    {
                        amountCents: 1_000,
                        sourceId: "reserve",
                        sourceType: "budgetCategory",
                    },
                ],
            },
            {
                assignedCents: -2_000,
                categoryId: "buffer",
            },
            {
                assignedCents: -1_000,
                categoryId: "reserve",
            },
        ]);
    });

    it("reports a shortfall when source categories cannot cover the requirement", () => {
        const plan = planAutoAssignDefaults({
            availableToBudgetCents: 0,
            periodId: "2026-01",
            sourceCategoryIds: ["buffer"],
            categories: [
                {
                    assignedCents: 0,
                    availableCents: 0,
                    categoryId: "groceries",
                    defaultAssignedCents: 3_000,
                },
                {
                    assignedCents: 0,
                    availableCents: 1_000,
                    categoryId: "buffer",
                    defaultAssignedCents: 0,
                },
            ],
        });

        expect(plan.shortfallCents).toBe(2_000);
        expect(plan.allocations).toEqual([
            {
                assignedCents: 3_000,
                categoryId: "groceries",
                fundingSources: [
                    {
                        amountCents: 1_000,
                        sourceId: "buffer",
                        sourceType: "budgetCategory",
                    },
                ],
            },
            {
                assignedCents: -1_000,
                categoryId: "buffer",
            },
        ]);
    });

    it("does not assign Budget Plan defaults to categories used as sources", () => {
        const plan = planAutoAssignDefaults({
            availableToBudgetCents: 0,
            periodId: "2026-01",
            sourceCategoryIds: ["income"],
            categories: [
                {
                    assignedCents: 0,
                    availableCents: 0,
                    categoryId: "groceries",
                    defaultAssignedCents: 3_000,
                },
                {
                    assignedCents: 0,
                    availableCents: 5_000,
                    categoryId: "income",
                    defaultAssignedCents: 5_000,
                },
            ],
        });

        expect(plan.shortfallCents).toBe(0);
        expect(plan.allocations).toEqual([
            {
                assignedCents: 3_000,
                categoryId: "groceries",
                fundingSources: [
                    {
                        amountCents: 3_000,
                        sourceId: "income",
                        sourceType: "budgetCategory",
                    },
                ],
            },
            {
                assignedCents: -3_000,
                categoryId: "income",
            },
        ]);
    });

    it("flags a negative Unassigned balance instead of drawing extra source funds", () => {
        const plan = planAutoAssignDefaults({
            availableToBudgetCents: -1_000,
            periodId: "2026-01",
            sourceCategoryIds: ["income"],
            categories: [
                {
                    assignedCents: 0,
                    availableCents: -1_000,
                    categoryId: "__unassigned__",
                    defaultAssignedCents: 0,
                },
                {
                    assignedCents: 0,
                    availableCents: 0,
                    categoryId: "groceries",
                    defaultAssignedCents: 3_000,
                },
                {
                    assignedCents: 0,
                    availableCents: 5_000,
                    categoryId: "income",
                    defaultAssignedCents: 0,
                },
            ],
        });

        expect(plan.shortfallCents).toBe(0);
        expect(plan.unassignedDeficitCents).toBe(1_000);
        expect(plan.sourceDraws).toEqual([
            {
                amountCents: 3_000,
                sourceId: "income",
            },
        ]);
        expect(plan.allocations).toEqual([
            {
                assignedCents: 3_000,
                categoryId: "groceries",
                fundingSources: [
                    {
                        amountCents: 3_000,
                        sourceId: "income",
                        sourceType: "budgetCategory",
                    },
                ],
            },
            {
                assignedCents: -3_000,
                categoryId: "income",
            },
        ]);
    });

    it("returns reduced default assignments to the first configured source", () => {
        const plan = planAutoAssignDefaults({
            availableToBudgetCents: 0,
            periodId: "2026-01",
            sourceCategoryIds: ["income"],
            categories: [
                {
                    assignedCents: 5_000,
                    availableCents: 5_000,
                    categoryId: "travel",
                    defaultAssignedCents: 3_000,
                },
                {
                    assignedCents: 0,
                    availableCents: 0,
                    categoryId: "income",
                    defaultAssignedCents: 0,
                },
            ],
        });

        expect(plan.returnToSourceCents).toBe(2_000);
        expect(plan.sourceReturns).toEqual([
            {
                amountCents: 2_000,
                sourceId: "income",
            },
        ]);
        expect(plan.allocations).toEqual([
            {
                assignedCents: 3_000,
                categoryId: "travel",
            },
            {
                assignedCents: 2_000,
                categoryId: "income",
            },
        ]);
    });

    it("applies yearly default assignments only in the configured start month", () => {
        const junePlan = planAutoAssignDefaults({
            availableToBudgetCents: 0,
            periodId: "2026-06",
            sourceCategoryIds: ["income"],
            categories: [
                {
                    allocationCadence: "yearly",
                    allocationStartMonth: 6,
                    assignedCents: 0,
                    availableCents: 0,
                    categoryId: "insurance",
                    defaultAssignedCents: 120_000,
                },
                {
                    assignedCents: 0,
                    availableCents: 120_000,
                    categoryId: "income",
                    defaultAssignedCents: 0,
                },
            ],
        });
        const julyPlan = planAutoAssignDefaults({
            availableToBudgetCents: 0,
            periodId: "2026-07",
            sourceCategoryIds: ["income"],
            categories: [
                {
                    allocationCadence: "yearly",
                    allocationStartMonth: 6,
                    assignedCents: 0,
                    availableCents: 0,
                    categoryId: "insurance",
                    defaultAssignedCents: 120_000,
                },
                {
                    assignedCents: 0,
                    availableCents: 120_000,
                    categoryId: "income",
                    defaultAssignedCents: 0,
                },
            ],
        });

        expect(junePlan.allocations).toEqual([
            {
                assignedCents: 120_000,
                categoryId: "insurance",
                fundingSources: [
                    {
                        amountCents: 120_000,
                        sourceId: "income",
                        sourceType: "budgetCategory",
                    },
                ],
            },
            {
                assignedCents: -120_000,
                categoryId: "income",
            },
        ]);
        expect(julyPlan.allocations).toEqual([
            {
                assignedCents: 0,
                categoryId: "insurance",
            },
            {
                assignedCents: 0,
                categoryId: "income",
            },
        ]);
    });
});
