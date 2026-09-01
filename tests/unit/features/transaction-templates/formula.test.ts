import { describe, expect, it } from "vitest";

import {
    evaluateTransactionTemplateFormula,
    resolveTransactionTemplateLines,
    type TransactionTemplateLineDefinition,
} from "@/features/transaction-templates/models/formula";

function line(
    lineId: string,
    formula: string,
    sortOrder: number,
): TransactionTemplateLineDefinition {
    return {
        categoryId: `category-${lineId}`,
        formula,
        lineId,
        sortOrder,
    };
}

describe("transaction template formulas", () => {
    it("resolves percentage-style arithmetic and sequential remainder", () => {
        const lines = resolveTransactionTemplateLines({
            lines: [
                line("a", "total * 0.25", 0),
                line("b", "remainder * 0.5", 1),
                line("c", "remainder", 2),
            ],
            totalCents: 10_000,
        });

        expect(lines.map((resolved) => resolved.amountCents)).toEqual([
            2_500,
            3_750,
            3_750,
        ]);
    });

    it("treats numeric literals as dollars and rounds to cents", () => {
        expect(
            evaluateTransactionTemplateFormula("10.005", {
                remainderCents: 0,
                totalCents: 0,
            }),
        ).toBe(1_001);

        expect(
            resolveTransactionTemplateLines({
                lines: [line("a", "12.34", 0), line("b", "remainder", 1)],
                totalCents: 10_000,
            }).map((resolved) => resolved.amountCents),
        ).toEqual([1_234, 8_766]);
    });

    it("preserves the sign of negative totals", () => {
        const lines = resolveTransactionTemplateLines({
            lines: [line("a", "total * 0.5", 0), line("b", "remainder", 1)],
            totalCents: -10_000,
        });

        expect(lines.map((resolved) => resolved.amountCents)).toEqual([
            -5_000,
            -5_000,
        ]);
    });

    it("rejects unsupported syntax, symbols, non-finite results, and zero applied splits", () => {
        expect(() =>
            evaluateTransactionTemplateFormula("Math.max(total, 1)", {
                remainderCents: 10_000,
                totalCents: 10_000,
            }),
        ).toThrow(/can only use numbers/i);
        expect(() =>
            evaluateTransactionTemplateFormula("subtotal", {
                remainderCents: 10_000,
                totalCents: 10_000,
            }),
        ).toThrow(/variables must be total or remainder/i);
        expect(() =>
            evaluateTransactionTemplateFormula("total = 1", {
                remainderCents: 10_000,
                totalCents: 10_000,
            }),
        ).toThrow(/can only use numbers/i);
        expect(() =>
            evaluateTransactionTemplateFormula("total / 0", {
                remainderCents: 10_000,
                totalCents: 10_000,
            }),
        ).toThrow(/result must be finite/i);
        expect(() =>
            resolveTransactionTemplateLines({
                lines: [line("a", "0", 0)],
                requireNonZero: true,
                totalCents: 10_000,
            }),
        ).toThrow(/cannot resolve to zero/i);
    });
});
