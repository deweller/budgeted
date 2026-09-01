import { describe, expect, it } from "vitest";

import {
    formatLocalDate,
    formatLocalDateTime,
    formatMediumDisplayDate,
    formatMediumDisplayDateTime,
    formatShortDisplayDate,
    isDateInLocalDateRange,
} from "@/lib/dates/local-date";

describe("local date formatting", () => {
    it("formats dates with local calendar fields for date inputs", () => {
        const value = new Date(2026, 5, 23, 14, 32);

        expect(formatLocalDate(value)).toBe("2026-06-23");
        expect(formatLocalDateTime(value)).toBe("2026-06-23T14:32");
    });

    it("matches date ranges by local calendar day", () => {
        const value = new Date(2026, 5, 23, 23, 30).toISOString();

        expect(
            isDateInLocalDateRange(value, "2026-06-23", "2026-06-23"),
        ).toBe(true);
        expect(
            isDateInLocalDateRange(value, "2026-06-24", "2026-06-24"),
        ).toBe(false);
    });

    it("formats shared display dates", () => {
        const value = new Date(2026, 5, 23, 14, 32);

        expect(formatShortDisplayDate(value)).toBe("06/23/2026");
        expect(formatMediumDisplayDate(value)).toBe("Jun 23, 2026");
        expect(formatMediumDisplayDateTime(value)).toBe(
            "Jun 23, 2026, 2:32 PM",
        );
    });

    it("returns empty display dates for invalid inputs", () => {
        expect(formatShortDisplayDate("not-a-date")).toBe("");
        expect(formatMediumDisplayDate("not-a-date")).toBe("");
        expect(formatMediumDisplayDateTime("not-a-date")).toBe("");
    });
});
