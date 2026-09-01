import { describe, expect, it } from "vitest";

import {
    ADJUSTMENT_REFERENCE_CATEGORY_ID,
    MIXED_REFERENCE_CATEGORY_ID,
    UNCATEGORIZED_REFERENCE_CATEGORY_ID,
    ZERO_NET_REFERENCE_CATEGORY_ID,
    inferTransactionReferenceCategoryId,
    isSystemReferenceCategoryId,
    toVisibleReferenceCategoryId,
} from "@/features/transactions/models/reference-category";

describe("transaction reference category helpers", () => {
    it("hides system reference category ids from public records", () => {
        expect(toVisibleReferenceCategoryId("__uncategorized__")).toBeUndefined();
        expect(toVisibleReferenceCategoryId("__mixed__")).toBeUndefined();
        expect(toVisibleReferenceCategoryId("__zero_net__")).toBeUndefined();
        expect(toVisibleReferenceCategoryId("__adjustment__")).toBeUndefined();
        expect(toVisibleReferenceCategoryId("groceries")).toBe("groceries");
        expect(isSystemReferenceCategoryId("__mixed__")).toBe(true);
        expect(isSystemReferenceCategoryId("groceries")).toBe(false);
    });

    it("preserves visible imported reference categories", () => {
        expect(
            inferTransactionReferenceCategoryId({
                displayAmountCents: 0,
                kind: "standard",
                lines: [
                    {
                        fromAccountId: "checking",
                        toAccountId: "savings",
                    },
                    {
                        categoryId: "groceries",
                        fromAccountId: "checking",
                    },
                ],
                referenceCategoryId: "existing-category",
            }),
        ).toBe("existing-category");
    });

    it("infers system categories for adjustment, zero-net, mixed, and uncategorized transactions", () => {
        expect(
            inferTransactionReferenceCategoryId({
                displayAmountCents: 100,
                kind: "adjustment",
                lines: [{ toAccountId: "checking" }],
            }),
        ).toBe(ADJUSTMENT_REFERENCE_CATEGORY_ID);

        expect(
            inferTransactionReferenceCategoryId({
                displayAmountCents: 0,
                kind: "standard",
                lines: [
                    { fromAccountId: "checking", toAccountId: "savings" },
                    { categoryId: "groceries", fromAccountId: "checking" },
                ],
            }),
        ).toBe(ZERO_NET_REFERENCE_CATEGORY_ID);

        expect(
            inferTransactionReferenceCategoryId({
                displayAmountCents: -500,
                kind: "standard",
                lines: [{ fromAccountId: "checking", toAccountId: "savings" }],
            }),
        ).toBe(MIXED_REFERENCE_CATEGORY_ID);

        expect(
            inferTransactionReferenceCategoryId({
                displayAmountCents: -500,
                kind: "standard",
                lines: [{ fromAccountId: "checking" }],
            }),
        ).toBe(UNCATEGORIZED_REFERENCE_CATEGORY_ID);
    });

    it("uses a single category only when no transfer line is present", () => {
        expect(
            inferTransactionReferenceCategoryId({
                displayAmountCents: -500,
                kind: "standard",
                lines: [
                    { categoryId: "groceries", fromAccountId: "checking" },
                    { categoryId: "groceries", fromAccountId: "checking" },
                ],
            }),
        ).toBe("groceries");

        expect(
            inferTransactionReferenceCategoryId({
                displayAmountCents: -500,
                kind: "standard",
                lines: [
                    { categoryId: "groceries", fromAccountId: "checking" },
                    { categoryId: "rent", fromAccountId: "checking" },
                ],
            }),
        ).toBe(MIXED_REFERENCE_CATEGORY_ID);
    });
});
