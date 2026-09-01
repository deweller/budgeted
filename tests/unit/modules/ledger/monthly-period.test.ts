import { describe, expect, it } from "vitest";

import {
    formatMonthlyPeriodLabel,
    getNextMonthlyPeriodId,
    getPreviousMonthlyPeriodId,
    isMonthlyPeriodId,
    shiftMonthlyPeriod,
} from "@/modules/ledger/monthly-period";

describe("monthly period helpers", () => {
    it("formats a monthly period label as Month, YYYY", () => {
        expect(formatMonthlyPeriodLabel("2026-05")).toBe("May, 2026");
    });

    it("shifts backward across a year boundary", () => {
        expect(getPreviousMonthlyPeriodId("2026-01")).toBe("2025-12");
        expect(shiftMonthlyPeriod("2026-01", -1).periodId).toBe("2025-12");
    });

    it("shifts forward across a year boundary", () => {
        expect(getNextMonthlyPeriodId("2026-12")).toBe("2027-01");
        expect(shiftMonthlyPeriod("2026-12", 1).periodId).toBe("2027-01");
    });

    it("recognizes valid monthly period identifiers", () => {
        expect(isMonthlyPeriodId("2026-05")).toBe(true);
        expect(isMonthlyPeriodId("2026-13")).toBe(false);
        expect(isMonthlyPeriodId("2026-5")).toBe(false);
        expect(isMonthlyPeriodId("not-a-month")).toBe(false);
    });
});
