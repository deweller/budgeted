import { describe, expect, it } from "vitest";

import {
    getTransactionMemoInputRows,
    isLongTransactionMemo,
} from "@/features/transactions/models/transaction-memo-input";

describe("transaction memo input sizing", () => {
    it("keeps empty and short single-line memos compact", () => {
        expect(isLongTransactionMemo("")).toBe(false);
        expect(isLongTransactionMemo("Weekly groceries")).toBe(false);
        expect(getTransactionMemoInputRows("Weekly groceries")).toBe(1);
    });

    it("expands multiline and long memos", () => {
        expect(isLongTransactionMemo("First line\nSecond line")).toBe(true);
        expect(isLongTransactionMemo("a".repeat(81))).toBe(true);
        expect(getTransactionMemoInputRows("First line\nSecond line")).toBe(2);
    });
});
