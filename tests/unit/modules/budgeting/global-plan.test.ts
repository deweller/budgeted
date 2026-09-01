import { describe, expect, it } from "vitest";

import { deriveUntouchedMonthAllocations } from "@/modules/budgeting/global-plan";

describe("budget plan budgeting helpers", () => {
    it("derives untouched month allocation rows without auto-assigned category dollars", () => {
        expect(
            deriveUntouchedMonthAllocations({
                categories: [
                    {
                        categoryId: "archived",
                        defaultAssignedCents: 999,
                        groupId: "old",
                        isIncomeCategory: false,
                        name: "Archived",
                        sortOrder: 99,
                        status: "archived",
                        systemCategoryKey: undefined,
                    },
                    {
                        categoryId: "travel",
                        defaultAssignedCents: 4_500,
                        groupId: "goals",
                        isIncomeCategory: false,
                        name: "Travel",
                        sortOrder: 2,
                        status: "active",
                        systemCategoryKey: undefined,
                    },
                    {
                        categoryId: "income",
                        defaultAssignedCents: 0,
                        groupId: "income",
                        isIncomeCategory: true,
                        name: "Paycheck",
                        sortOrder: 1,
                        status: "active",
                        systemCategoryKey: undefined,
                    },
                ],
                carriedForwardByCategoryId: new Map([
                    ["travel", -1_250],
                    ["income", 500],
                ]),
                activityByCategoryId: new Map([
                    ["travel", -500],
                    ["income", 0],
                ]),
            }),
        ).toEqual([
            {
                categoryId: "income",
                assignedCents: 0,
                carriedForwardCents: 500,
                activityCents: 0,
                availableCents: 500,
                source: "global-plan-derived",
            },
            {
                categoryId: "travel",
                assignedCents: 0,
                carriedForwardCents: -1_250,
                activityCents: -500,
                availableCents: -1_750,
                source: "global-plan-derived",
            },
        ]);
    });
});
