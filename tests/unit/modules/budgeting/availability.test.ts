import { describe, expect, it } from "vitest";

import {
    calculateAvailableCents,
    carryForwardAvailableCents,
    summarizeAvailability,
} from "@/modules/budgeting";
import {
    getMonthlyPeriodBounds,
    getMonthlyPeriodId,
    getPreviousMonthlyPeriodId,
    shiftMonthlyPeriod,
} from "@/modules/ledger";

describe("monthly period helpers", () => {
    it("derives a period id from a date", () => {
        expect(getMonthlyPeriodId("2026-05-22T12:30:00.000Z")).toBe("2026-05");
    });

    it("returns exact calendar month bounds", () => {
        expect(getMonthlyPeriodBounds("2024-02")).toEqual({
            periodId: "2024-02",
            startsOn: "2024-02-01",
            endsOn: "2024-02-29",
        });
    });

    it("shifts across year boundaries", () => {
        expect(getPreviousMonthlyPeriodId("2026-01")).toBe("2025-12");
        expect(shiftMonthlyPeriod("2026-12", 1).periodId).toBe("2027-01");
    });
});

describe("category availability helpers", () => {
    it("calculates available cents from carry-forward, assignment, and activity", () => {
        expect(
            calculateAvailableCents({
                assignedCents: 8_000,
                carriedForwardCents: -2_500,
                activityCents: -1_250,
            }),
        ).toBe(4_250);
    });

    it("carries negative balances forward unchanged", () => {
        expect(carryForwardAvailableCents(-3_275)).toBe(-3_275);
    });

    it("summarizes multiple category totals", () => {
        expect(
            summarizeAvailability([
                {
                    assignedCents: 3_000,
                    carriedForwardCents: 500,
                    activityCents: -1_000,
                },
                {
                    assignedCents: 2_000,
                    carriedForwardCents: -750,
                    activityCents: -250,
                },
            ]),
        ).toEqual({
            assignedCents: 5_000,
            carriedForwardCents: -250,
            activityCents: -1_250,
            availableCents: 3_500,
        });
    });
});
