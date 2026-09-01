import { describe, expect, it } from "vitest";

import { normalizeOptionalString } from "@/lib/strings";

describe("string helpers", () => {
    it("trims non-empty strings and normalizes blank values to undefined", () => {
        expect(normalizeOptionalString("  value  ")).toBe("value");
        expect(normalizeOptionalString("   ")).toBeUndefined();
        expect(normalizeOptionalString(null)).toBeUndefined();
        expect(normalizeOptionalString(undefined)).toBeUndefined();
    });
});
