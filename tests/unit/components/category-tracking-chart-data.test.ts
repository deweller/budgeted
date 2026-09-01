import { describe, expect, it } from "vitest";

import {
    buildCategoryTrackingChartData,
    buildCategoryTrackingMonthEndTrendData,
    buildCategoryTrackingMonthStartTrendData,
    buildCategoryTrackingTrendData,
    buildCategoryTrackingTrendGroup,
    buildCategoryTrackingYAxisScale,
    getCategoryTrackingBalanceGradientZeroOffset,
} from "@/components/reporting/category-tracking-chart-data";
import type { CategoryTrackingReportView } from "@/lib/workspace/category-tracking-report-projector";

function createView(
    overrides: Partial<CategoryTrackingReportView> = {},
): CategoryTrackingReportView {
    return {
        allocationTotalCents: 500,
        categoryOptions: [],
        endingAvailableCents: 650,
        openingAvailableCents: 100,
        points: [
            {
                amountCents: 0,
                availableCents: 100,
                date: "2026-01-01",
                pointId: "opening",
                type: "opening",
            },
            {
                amountCents: -50,
                availableCents: 50,
                date: "2026-02-10",
                pointId: "transaction",
                type: "transaction",
            },
            {
                amountCents: 600,
                availableCents: 650,
                date: "2026-09-01",
                pointId: "future-allocation",
                type: "allocation",
            },
        ],
        selectedCategoryId: "food",
        selectedCategoryName: "Food",
        selectedYear: "2026",
        transactionTotalCents: -50,
        yearOptions: ["2026"],
        ...overrides,
    };
}

describe("category tracking chart data", () => {
    it("rounds y-axis labels to power-of-ten money intervals", () => {
        expect(buildCategoryTrackingYAxisScale([-200, 1_100])).toEqual({
            maximum: 2_000,
            minimum: -1_000,
            ticks: [-1_000, 0, 1_000, 2_000],
        });
        expect(buildCategoryTrackingYAxisScale([-100, 341_200])).toEqual({
            maximum: 400_000,
            minimum: -100_000,
            ticks: [-100_000, 0, 100_000, 200_000, 300_000, 400_000],
        });
    });

    it("uses a larger nice interval when power-of-ten labels would be crowded", () => {
        expect(buildCategoryTrackingYAxisScale([-99_900, 99_900])).toEqual({
            maximum: 100_000,
            minimum: -100_000,
            ticks: [-100_000, -50_000, 0, 50_000, 100_000],
        });
    });

    it("splits the balance gradient at zero using the plotted area bounds", () => {
        expect(
            getCategoryTrackingBalanceGradientZeroOffset([-350, 1_100]),
        ).toBeCloseTo(1_100 / 1_450);
        expect(
            getCategoryTrackingBalanceGradientZeroOffset([100, 1_100]),
        ).toBe(1);
        expect(
            getCategoryTrackingBalanceGradientZeroOffset([-350, -100]),
        ).toBe(0);
    });

    it("stops a current-year balance line at the current date", () => {
        const anchor = new Date("2026-08-08T12:00:00.000Z");
        const data = buildCategoryTrackingChartData(
            createView(),
            anchor,
        );
        const trend = buildCategoryTrackingTrendData(
            createView(),
            anchor,
        );

        expect(data.map((point) => point.date)).toEqual([
            "2026-01-01",
            "2026-02-10",
            "2026-08-08",
        ]);
        expect(data.at(-1)).toEqual(
            expect.objectContaining({
                availableCents: 50,
                type: "asOf",
            }),
        );
        expect(trend.map((point) => point.date)).toEqual([
            "2026-01-01",
            "2026-02-10",
            "2026-08-08",
        ]);
        expect(trend[0]?.trendCents).toBe(80);
        expect(trend[1]?.trendCents).toBe(70);
        expect(trend.at(-1)?.trendCents).toBe(50);
    });

    it("extends a historical balance line to the end of its year", () => {
        const data = buildCategoryTrackingChartData(
            createView({
                points: [
                    {
                        amountCents: 0,
                        availableCents: 100,
                        date: "2025-01-01",
                        pointId: "opening",
                        type: "opening",
                    },
                ],
                selectedYear: "2025",
            }),
            new Date("2026-08-08T12:00:00.000Z"),
        );
        const trend = buildCategoryTrackingTrendData(
            createView({
                points: [
                    {
                        amountCents: 0,
                        availableCents: 100,
                        date: "2025-01-01",
                        pointId: "opening",
                        type: "opening",
                    },
                ],
                selectedYear: "2025",
            }),
            new Date("2026-08-08T12:00:00.000Z"),
        );

        expect(data.at(-1)).toEqual(
            expect.objectContaining({
                availableCents: 100,
                date: "2025-12-31",
                type: "asOf",
            }),
        );
        expect(trend).toHaveLength(2);
        expect(trend.at(-1)).toEqual(
            expect.objectContaining({
                date: "2025-12-31",
                trendCents: 100,
            }),
        );
    });

    it("does not draw a balance line for a future year", () => {
        const data = buildCategoryTrackingChartData(
            createView({ selectedYear: "2027" }),
            new Date("2026-08-08T12:00:00.000Z"),
        );

        expect(data).toEqual([]);
        expect(
            buildCategoryTrackingTrendData(
                createView({ selectedYear: "2027" }),
                new Date("2026-08-08T12:00:00.000Z"),
            ),
        ).toEqual([]);
    });

    it("uses every balance change when smoothing the trend", () => {
        const trend = buildCategoryTrackingTrendData(
            createView({
                points: [
                    {
                        amountCents: 0,
                        availableCents: 100,
                        date: "2026-01-01",
                        pointId: "opening",
                        type: "opening",
                    },
                    {
                        amountCents: -100,
                        availableCents: 0,
                        date: "2026-01-01",
                        pointId: "transaction",
                        type: "transaction",
                    },
                ],
            }),
            new Date("2026-01-01T12:00:00.000Z"),
        );

        expect(trend).toHaveLength(2);
        expect(trend.map((point) => point.trendCents)).toEqual([50, 50]);
    });

    it("samples month starts after allocation and only completed month ends", () => {
        const view = createView({
            points: [
                {
                    amountCents: 0,
                    availableCents: 0,
                    date: "2026-01-01",
                    pointId: "opening",
                    type: "opening",
                },
                {
                    amountCents: 100,
                    availableCents: 100,
                    date: "2026-01-01",
                    pointId: "january-allocation",
                    type: "allocation",
                },
                {
                    amountCents: -20,
                    availableCents: 80,
                    date: "2026-01-01",
                    pointId: "january-first-transaction",
                    type: "transaction",
                },
                {
                    amountCents: -10,
                    availableCents: 70,
                    date: "2026-01-31",
                    pointId: "january-last-transaction",
                    type: "transaction",
                },
                {
                    amountCents: 100,
                    availableCents: 170,
                    date: "2026-02-01",
                    pointId: "february-allocation",
                    type: "allocation",
                },
                {
                    amountCents: -20,
                    availableCents: 150,
                    date: "2026-02-15",
                    pointId: "february-last-transaction",
                    type: "transaction",
                },
                {
                    amountCents: 100,
                    availableCents: 250,
                    date: "2026-03-01",
                    pointId: "march-allocation",
                    type: "allocation",
                },
                {
                    amountCents: -20,
                    availableCents: 230,
                    date: "2026-03-10",
                    pointId: "march-transaction",
                    type: "transaction",
                },
            ],
        });
        const anchor = new Date("2026-03-15T12:00:00.000Z");
        const monthStarts = buildCategoryTrackingMonthStartTrendData(
            view,
            anchor,
        );
        const monthEnds = buildCategoryTrackingMonthEndTrendData(view, anchor);

        expect(
            monthStarts.map((point) => [point.date, point.trendCents]),
        ).toEqual([
            ["2026-01-01", 100],
            ["2026-02-01", 170],
            ["2026-03-01", 250],
        ]);
        expect(
            monthEnds.map((point) => [point.date, point.trendCents]),
        ).toEqual([
            ["2026-01-31", 70],
            ["2026-02-28", 150],
        ]);
    });

    it("projects every trend series through the end of the year", () => {
        const view = createView();
        const group = buildCategoryTrackingTrendGroup(
            view,
            new Date("2026-08-08T12:00:00.000Z"),
        );

        for (const series of Object.values(group)) {
            expect(series.projected[0]).toEqual(
                expect.objectContaining({
                    date: series.observed.at(-1)!.date,
                    trendCents: series.observed.at(-1)!.trendCents,
                }),
            );
            expect(series.projected.at(-1)).toEqual(
                expect.objectContaining({
                    date: "2026-12-31",
                    projected: true,
                }),
            );
            expect(series.projected.at(-1)!.trendCents).toBeLessThan(
                series.observed.at(-1)!.trendCents,
            );
        }
        expect(group.monthEnd.observed.at(-1)?.date).toBe("2026-07-31");
        expect(group.monthEnd.projected[1]?.date).toBe("2026-08-31");
        expect(group.monthStart.projected[1]?.date).toBe("2026-09-01");
        expect(
            group.monthEnd.projected.some(
                (point) => point.date === "2026-08-31",
            ),
        ).toBe(true);

        const yearEndSmoothed = group.smoothed.projected.at(-1)!.trendCents;
        const yearEndStart = group.monthStart.projected.at(-1)!.trendCents;
        const yearEndEnd = group.monthEnd.projected.at(-1)!.trendCents;

        expect(yearEndSmoothed).toBeGreaterThanOrEqual(
            Math.min(yearEndStart, yearEndEnd),
        );
        expect(yearEndSmoothed).toBeLessThanOrEqual(
            Math.max(yearEndStart, yearEndEnd),
        );
    });
});
