import { describe, expect, it } from "vitest";

import { buildCategoryAttentionStates } from "@/modules/budgeting";
import { UNASSIGNED_CATEGORY_ID } from "@/modules/budgeting/unassigned";

describe("budget attention states", () => {
    it("does not create negative available warnings for Unassigned", () => {
        expect(
            buildCategoryAttentionStates({
                availableCents: -500,
                carriedForwardCents: 0,
                categoryId: UNASSIGNED_CATEGORY_ID,
                name: "Unassigned",
            }),
        ).toEqual([]);
    });

    it("does not create negative available warnings for assigned categories", () => {
        expect(
            buildCategoryAttentionStates({
                availableCents: -500,
                carriedForwardCents: 0,
                categoryId: "groceries",
                name: "Groceries",
            }),
        ).toEqual([]);
    });

    it("keeps carry-forward reduction attention states", () => {
        expect(
            buildCategoryAttentionStates({
                availableCents: 0,
                carriedForwardCents: -500,
                categoryId: "groceries",
                name: "Groceries",
            }),
        ).toEqual([
            {
                categoryId: "groceries",
                code: "carryForwardReduction",
                message: "Groceries carried overspending into this period.",
                severity: "info",
                transactionId: null,
            },
        ]);
    });
});
