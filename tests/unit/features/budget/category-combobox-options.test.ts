import { describe, expect, it } from "vitest";

import {
    buildCurrentMonthCategoryBalanceOptions,
    buildGroupedCategoryComboboxOptions,
} from "@/features/budget/models/category-combobox-options";

describe("category combobox options", () => {
    it("groups and sorts categories like transaction category choosers", () => {
        expect(
            buildGroupedCategoryComboboxOptions({
                categories: [
                    {
                        categoryId: "rent",
                        groupId: "bills",
                        name: "Rent",
                        sortOrder: 2,
                    },
                    {
                        categoryId: "groceries",
                        groupId: "needs",
                        name: "Groceries",
                        sortOrder: 2,
                    },
                    {
                        categoryId: "electric",
                        groupId: "bills",
                        name: "Electric",
                        sortOrder: 1,
                    },
                    {
                        categoryId: "misc",
                        name: "Misc",
                    },
                ],
                getValue: (category) => category.categoryId,
                groups: [
                    {
                        groupId: "bills",
                        name: "Bills",
                        sortOrder: 2,
                        status: "active",
                    },
                    {
                        groupId: "needs",
                        name: "Needs",
                        sortOrder: 1,
                        status: "active",
                    },
                ],
            }),
        ).toEqual([
            {
                group: "Needs",
                label: "Groceries",
                value: "groceries",
            },
            {
                group: "Bills",
                label: "Electric",
                value: "electric",
            },
            {
                group: "Bills",
                label: "Rent",
                value: "rent",
            },
            {
                group: "Categories",
                label: "Misc",
                value: "misc",
            },
        ]);
    });

    it("keeps supplied category descriptions and their display tone", () => {
        expect(
            buildGroupedCategoryComboboxOptions({
                categories: [
                    {
                        categoryId: "groceries",
                        groupId: "needs",
                        name: "Groceries",
                    },
                ],
                getDescription: () => "Balance: -$12.34",
                getDescriptionClassName: () => "money-negative",
                getValue: (category) => category.categoryId,
                groups: [
                    {
                        groupId: "needs",
                        name: "Needs",
                        sortOrder: 0,
                        status: "active",
                    },
                ],
            }),
        ).toEqual([
            {
                description: "Balance: -$12.34",
                descriptionClassName: "money-negative",
                group: "Needs",
                label: "Groceries",
                value: "groceries",
            },
        ]);
    });

    it("adds current-month balances with standard money tones", () => {
        expect(
            buildCurrentMonthCategoryBalanceOptions({
                balanceByCategoryId: new Map([["groceries", -1_234]]),
                categories: [
                    {
                        categoryId: "groceries",
                        groupId: "needs",
                        name: "Groceries",
                    },
                ],
                getValue: (category) => category.categoryId,
                groups: [
                    {
                        groupId: "needs",
                        name: "Needs",
                        sortOrder: 0,
                        status: "active",
                    },
                ],
            }),
        ).toEqual([
            {
                description: "Balance: -$12.34",
                descriptionClassName: "money-negative",
                group: "Needs",
                label: "Groceries",
                value: "groceries",
            },
        ]);
    });
});
