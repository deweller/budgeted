import { describe, expect, it } from "vitest";

import {
    formatUsd,
    parseUsdToCents,
    tryParseUsdToCents,
} from "@/lib/formatting/money";

describe("money formatting", () => {
    it("parses standard USD values", () => {
        expect(parseUsdToCents("12.34")).toBe(1234);
        expect(parseUsdToCents("$1,234.56")).toBe(123456);
        expect(parseUsdToCents("+2")).toBe(200);
        expect(parseUsdToCents("-2")).toBe(-200);
    });

    it("evaluates arithmetic expressions as dollars", () => {
        expect(parseUsdToCents("100 + 12")).toBe(11200);
        expect(parseUsdToCents("4*5")).toBe(2000);
        expect(parseUsdToCents("(100 + 12) / 2")).toBe(5600);
    });

    it("ignores non-expression characters before evaluation", () => {
        expect(parseUsdToCents("$100 USD + notes 12")).toBe(11200);
        expect(parseUsdToCents("100 + 12 = $112")).toBe(11200);
    });

    it("returns null for unresolved previews", () => {
        expect(tryParseUsdToCents("100 +")).toBeNull();
        expect(tryParseUsdToCents("abc")).toBeNull();
        expect(tryParseUsdToCents("1 / 0")).toBeNull();
    });

    it("formats parsed expression values as currency", () => {
        expect(formatUsd(parseUsdToCents("100 + 12"))).toBe("$112.00");
    });
});
