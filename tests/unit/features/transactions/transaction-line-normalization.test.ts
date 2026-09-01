import { describe, expect, it } from "vitest";

import { ADJUSTMENT_REFERENCE_CATEGORY_ID } from "@/features/transactions/models/reference-category";
import {
    NO_TRANSACTION_LINE_CATEGORY_ID,
    NO_TRANSACTION_LINE_FROM_ACCOUNT_ID,
    NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
    isUncategorizedAccountMovementLine,
    toDisplayTransactionLineCategoryId,
    toEditableTransactionLineAccountId,
    toEditableTransactionLineCategoryId,
    toPublicTransactionLineCategoryId,
    toPublicTransactionLineFromAccountId,
    toPublicTransactionLineToAccountId,
    toStoredTransactionLineCategoryId,
    toStoredTransactionLineFromAccountId,
    toStoredTransactionLineToAccountId,
} from "@/features/transactions/models/transaction-line-normalization";

describe("transaction line normalization", () => {
    it("converts empty public values to stored sentinel ids", () => {
        expect(toStoredTransactionLineCategoryId(undefined)).toBe(
            NO_TRANSACTION_LINE_CATEGORY_ID,
        );
        expect(toStoredTransactionLineCategoryId("  ")).toBe(
            NO_TRANSACTION_LINE_CATEGORY_ID,
        );
        expect(toStoredTransactionLineFromAccountId(undefined)).toBe(
            NO_TRANSACTION_LINE_FROM_ACCOUNT_ID,
        );
        expect(toStoredTransactionLineToAccountId(undefined)).toBe(
            NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
        );
    });

    it("preserves real ids when converting to stored values", () => {
        expect(toStoredTransactionLineCategoryId(" groceries ")).toBe(
            "groceries",
        );
        expect(toStoredTransactionLineFromAccountId(" checking ")).toBe(
            "checking",
        );
        expect(toStoredTransactionLineToAccountId(" savings ")).toBe(
            "savings",
        );
    });

    it("converts stored sentinel ids back to public undefined values", () => {
        expect(
            toPublicTransactionLineCategoryId(
                NO_TRANSACTION_LINE_CATEGORY_ID,
            ),
        ).toBeUndefined();
        expect(
            toPublicTransactionLineFromAccountId(
                NO_TRANSACTION_LINE_FROM_ACCOUNT_ID,
            ),
        ).toBeUndefined();
        expect(
            toPublicTransactionLineToAccountId(
                NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
            ),
        ).toBeUndefined();
    });

    it("hides system category ids from editable and display category fields", () => {
        expect(toEditableTransactionLineCategoryId("groceries")).toBe(
            "groceries",
        );
        expect(toDisplayTransactionLineCategoryId("groceries")).toBe(
            "groceries",
        );
        expect(
            toEditableTransactionLineCategoryId(
                ADJUSTMENT_REFERENCE_CATEGORY_ID,
            ),
        ).toBe("");
        expect(
            toDisplayTransactionLineCategoryId(
                ADJUSTMENT_REFERENCE_CATEGORY_ID,
            ),
        ).toBeUndefined();
        expect(
            toEditableTransactionLineCategoryId(
                NO_TRANSACTION_LINE_CATEGORY_ID,
            ),
        ).toBe("");
        expect(
            toDisplayTransactionLineCategoryId(
                NO_TRANSACTION_LINE_CATEGORY_ID,
            ),
        ).toBeUndefined();
    });

    it("hides account sentinel ids from editable account fields", () => {
        expect(toEditableTransactionLineAccountId("checking")).toBe(
            "checking",
        );
        expect(
            toEditableTransactionLineAccountId(
                NO_TRANSACTION_LINE_FROM_ACCOUNT_ID,
            ),
        ).toBe("");
        expect(
            toEditableTransactionLineAccountId(
                NO_TRANSACTION_LINE_TO_ACCOUNT_ID,
            ),
        ).toBe("");
    });

    it("detects uncategorized one-sided account movement lines", () => {
        expect(
            isUncategorizedAccountMovementLine({
                fromAccountId: "checking",
            }),
        ).toBe(true);
        expect(
            isUncategorizedAccountMovementLine({
                categoryId: "groceries",
                fromAccountId: "checking",
            }),
        ).toBe(false);
        expect(
            isUncategorizedAccountMovementLine({
                fromAccountId: "checking",
                toAccountId: "savings",
            }),
        ).toBe(false);
        expect(
            isUncategorizedAccountMovementLine({
                categoryId: ADJUSTMENT_REFERENCE_CATEGORY_ID,
                toAccountId: "checking",
            }),
        ).toBe(true);
    });
});
