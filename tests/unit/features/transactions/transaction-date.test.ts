import { describe, expect, it } from "vitest";

import {
    formatTransactionDisplayDate,
    isTransactionDateInRange,
    isValidTransactionDate,
    toTransactionDateInputValue,
    toTransactionOccurredAt,
} from "@/features/transactions/models/transaction-date";

describe("transaction date helpers", () => {
    it("normalizes date-only and legacy timestamp values to midnight UTC", () => {
        expect(toTransactionOccurredAt("2026-05-22")).toBe(
            "2026-05-22T00:00:00.000Z",
        );
        expect(toTransactionOccurredAt("2026-05-22T12:34:56.000Z")).toBe(
            "2026-05-22T00:00:00.000Z",
        );
    });

    it("formats transaction dates by UTC day for inputs and display", () => {
        expect(toTransactionDateInputValue("2026-05-22T00:00:00.000Z")).toBe(
            "2026-05-22",
        );
        expect(formatTransactionDisplayDate("2026-05-22T00:00:00.000Z")).toBe(
            "05/22/2026",
        );
    });

    it("compares stored UTC-midnight transaction dates by their transaction day", () => {
        expect(
            isTransactionDateInRange(
                "2026-05-22T00:00:00.000Z",
                "2026-05-22",
                "2026-05-22",
            ),
        ).toBe(true);
        expect(
            isTransactionDateInRange(
                "2026-05-22T00:00:00.000Z",
                "2026-05-23",
                "2026-05-23",
            ),
        ).toBe(false);
    });

    it("rejects invalid date-only values", () => {
        expect(isValidTransactionDate("2026-02-30")).toBe(false);
        expect(() => toTransactionOccurredAt("2026-02-30")).toThrow(
            "Transaction date is required.",
        );
    });

    it("rejects non-ISO date strings", () => {
        expect(isValidTransactionDate("May 22, 2026")).toBe(false);
    });
});
