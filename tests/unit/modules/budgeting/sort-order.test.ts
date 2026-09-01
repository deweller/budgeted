import { describe, expect, it } from "vitest";

import { compareBudgetItemsBySortOrder } from "@/modules/budgeting";

describe("budget item sort order", () => {
    it("sorts by sort order and then by name", () => {
        const items = [
            { name: "Utilities", sortOrder: 2 },
            { name: "Rent", sortOrder: 1 },
            { name: "Dining", sortOrder: 1 },
        ];

        expect(items.sort(compareBudgetItemsBySortOrder)).toEqual([
            { name: "Dining", sortOrder: 1 },
            { name: "Rent", sortOrder: 1 },
            { name: "Utilities", sortOrder: 2 },
        ]);
    });
});
