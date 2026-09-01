import type {
    CategoryTrackingPoint,
    CategoryTrackingReportView,
} from "@/lib/workspace/category-tracking-report-projector";

export type CategoryTrackingChartDatum = CategoryTrackingPoint & {
    timestamp: number;
};

export type CategoryTrackingTrendKind =
    | "monthEnd"
    | "monthStart"
    | "smoothed";

export type CategoryTrackingTrendDatum = {
    date: string;
    kind: CategoryTrackingTrendKind;
    pointId: string;
    projected: boolean;
    timestamp: number;
    trendCents: number;
    type: "trend";
};

export type CategoryTrackingTrendSeries = {
    observed: CategoryTrackingTrendDatum[];
    projected: CategoryTrackingTrendDatum[];
};

export type CategoryTrackingTrendGroup = Record<
    CategoryTrackingTrendKind,
    CategoryTrackingTrendSeries
>;

const heavySmoothingBandwidthMs = 45 * 24 * 60 * 60 * 1_000;
const minimumMoneyAxisIntervalCents = 100;
const maximumMoneyAxisTickCount = 8;

function getAxisBounds(values: number[], interval: number) {
    const minimumValue = Math.min(0, ...values);
    const maximumValue = Math.max(0, ...values);

    return {
        maximum: Math.ceil(maximumValue / interval) * interval,
        minimum: Math.floor(minimumValue / interval) * interval,
    };
}

function getAxisTickCount(
    bounds: { maximum: number; minimum: number },
    interval: number,
) {
    return Math.round((bounds.maximum - bounds.minimum) / interval) + 1;
}

export function buildCategoryTrackingYAxisScale(values: number[]) {
    const finiteValues = values.filter(Number.isFinite);
    const magnitude = Math.max(
        0,
        ...finiteValues.map((value) => Math.abs(value)),
    );

    if (magnitude === 0) {
        return {
            maximum: minimumMoneyAxisIntervalCents,
            minimum: -minimumMoneyAxisIntervalCents,
            ticks: [
                -minimumMoneyAxisIntervalCents,
                0,
                minimumMoneyAxisIntervalCents,
            ],
        };
    }

    const powerOfTenInterval = Math.max(
        minimumMoneyAxisIntervalCents,
        10 ** Math.floor(Math.log10(magnitude)),
    );
    let interval = powerOfTenInterval;
    let bounds = getAxisBounds(finiteValues, interval);

    for (const multiplier of [1, 2, 5, 10]) {
        const candidateInterval = powerOfTenInterval * multiplier;
        const candidateBounds = getAxisBounds(
            finiteValues,
            candidateInterval,
        );

        interval = candidateInterval;
        bounds = candidateBounds;

        if (
            getAxisTickCount(candidateBounds, candidateInterval) <=
            maximumMoneyAxisTickCount
        ) {
            break;
        }
    }

    if (getAxisTickCount(bounds, interval) < 3) {
        if (bounds.minimum >= 0) {
            bounds.maximum += interval;
        } else {
            bounds.minimum -= interval;
        }
    }

    const ticks = Array.from(
        { length: getAxisTickCount(bounds, interval) },
        (_, index) => bounds.minimum + index * interval,
    );

    return { ...bounds, ticks };
}

export function getCategoryTrackingBalanceGradientZeroOffset(
    availableCents: number[],
) {
    const finiteValues = availableCents.filter(Number.isFinite);
    const minimum = Math.min(0, ...finiteValues);
    const maximum = Math.max(0, ...finiteValues);

    if (minimum === maximum) {
        return 0.5;
    }

    // SVG gradients are normalized to the filled area's bounds, not the axis.
    return maximum / (maximum - minimum);
}

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function formatLocalDate(value: Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
        value.getDate(),
    )}`;
}

function formatUtcDate(value: Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
        value.getUTCDate(),
    )}`;
}

function toChartDatum(
    point: CategoryTrackingPoint,
): CategoryTrackingChartDatum {
    return {
        ...point,
        timestamp: Date.parse(`${point.date}T00:00:00.000Z`),
    };
}

export function buildCategoryTrackingChartData(
    view: CategoryTrackingReportView,
    anchor = new Date(),
) {
    const yearStartsOn = `${view.selectedYear}-01-01`;
    const yearEndsOn = `${view.selectedYear}-12-31`;
    const currentDate = formatLocalDate(anchor);

    if (currentDate < yearStartsOn) {
        return [];
    }

    const chartEndsOn = currentDate < yearEndsOn ? currentDate : yearEndsOn;
    const visiblePoints = view.points.filter(
        (point) => point.date <= chartEndsOn,
    );
    const lastPoint = visiblePoints.at(-1);

    if (!lastPoint) {
        return [];
    }

    const chartData = visiblePoints.map(toChartDatum);

    if (lastPoint.date < chartEndsOn) {
        chartData.push(
            toChartDatum({
                amountCents: 0,
                availableCents: lastPoint.availableCents,
                date: chartEndsOn,
                pointId: `as-of:${chartEndsOn}`,
                type: "asOf",
            }),
        );
    }

    return chartData;
}

function getSmoothingWeight(
    sourceTimestamp: number,
    targetTimestamp: number,
) {
    const distance = (sourceTimestamp - targetTimestamp) / heavySmoothingBandwidthMs;

    return Math.exp(-0.5 * distance * distance);
}

function getSmoothedBalance(
    chartData: CategoryTrackingChartDatum[],
    targetTimestamp: number,
) {
    let weightedBalanceCents = 0;
    let totalWeight = 0;

    for (const point of chartData) {
        const weight = getSmoothingWeight(point.timestamp, targetTimestamp);
        weightedBalanceCents += point.availableCents * weight;
        totalWeight += weight;
    }

    return Math.round(weightedBalanceCents / totalWeight);
}

function toTrendDatum(input: {
    date: string;
    kind: CategoryTrackingTrendKind;
    pointId: string;
    projected?: boolean;
    trendCents: number;
}): CategoryTrackingTrendDatum {
    return {
        ...input,
        projected: input.projected ?? false,
        timestamp: Date.parse(`${input.date}T00:00:00.000Z`),
        type: "trend",
    };
}

export function buildCategoryTrackingTrendData(
    view: CategoryTrackingReportView,
    anchor = new Date(),
) {
    const chartData = buildCategoryTrackingChartData(view, anchor);

    return chartData.map<CategoryTrackingTrendDatum>((point) => ({
        date: point.date,
        kind: "smoothed",
        pointId: `trend:${point.pointId}`,
        projected: false,
        timestamp: point.timestamp,
        trendCents: getSmoothedBalance(chartData, point.timestamp),
        type: "trend",
    }));
}

function getMonthStartDate(year: number, monthIndex: number) {
    return `${year}-${pad(monthIndex + 1)}-01`;
}

function getMonthEndDate(year: number, monthIndex: number) {
    return formatUtcDate(new Date(Date.UTC(year, monthIndex + 1, 0)));
}

export function buildCategoryTrackingMonthStartTrendData(
    view: CategoryTrackingReportView,
    anchor = new Date(),
) {
    const chartData = buildCategoryTrackingChartData(view, anchor);
    const chartEndsOn = chartData.at(-1)?.date;

    if (!chartEndsOn) {
        return [];
    }

    const year = Number(view.selectedYear);
    const points: CategoryTrackingTrendDatum[] = [];

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const date = getMonthStartDate(year, monthIndex);

        if (date > chartEndsOn) {
            break;
        }

        const pointsOnDate = chartData.filter((point) => point.date === date);
        const afterAllocation = pointsOnDate
            .filter((point) => point.type === "allocation")
            .at(-1);
        const previousBalance = chartData
            .filter((point) => point.date < date)
            .at(-1);
        const openingBalance = pointsOnDate.find(
            (point) => point.type === "opening",
        );
        const balancePoint =
            afterAllocation ?? previousBalance ?? openingBalance ?? pointsOnDate[0];

        if (!balancePoint) {
            continue;
        }

        points.push(
            toTrendDatum({
                date,
                kind: "monthStart",
                pointId: `month-start:${date}`,
                trendCents: balancePoint.availableCents,
            }),
        );
    }

    return points;
}

export function buildCategoryTrackingMonthEndTrendData(
    view: CategoryTrackingReportView,
    anchor = new Date(),
) {
    const chartData = buildCategoryTrackingChartData(view, anchor);
    const currentDate = formatLocalDate(anchor);
    const year = Number(view.selectedYear);
    const points: CategoryTrackingTrendDatum[] = [];

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const date = getMonthEndDate(year, monthIndex);

        if (date >= currentDate) {
            break;
        }

        const balancePoint = chartData
            .filter((point) => point.date <= date)
            .at(-1);

        if (!balancePoint) {
            continue;
        }

        points.push(
            toTrendDatum({
                date,
                kind: "monthEnd",
                pointId: `month-end:${date}`,
                trendCents: balancePoint.availableCents,
            }),
        );
    }

    return points;
}

function getProjectionSlope(
    samples: Array<{ timestamp: number; trendCents: number }>,
) {
    const distinctTimestamps = new Set(
        samples.map((sample) => sample.timestamp),
    );

    if (samples.length < 2 || distinctTimestamps.size < 2) {
        return 0;
    }

    const origin = samples[0]!.timestamp;
    const normalized = samples.map((sample) => ({
        x: (sample.timestamp - origin) / (24 * 60 * 60 * 1_000),
        y: sample.trendCents,
    }));
    const averageX =
        normalized.reduce((total, sample) => total + sample.x, 0) /
        normalized.length;
    const averageY =
        normalized.reduce((total, sample) => total + sample.y, 0) /
        normalized.length;
    const denominator = normalized.reduce(
        (total, sample) => total + (sample.x - averageX) ** 2,
        0,
    );

    if (denominator === 0) {
        return 0;
    }

    return (
        normalized.reduce(
            (total, sample) =>
                total + (sample.x - averageX) * (sample.y - averageY),
            0,
        ) / denominator
    );
}

type SeriesProjectionModel = {
    anchorCents: number;
    anchorTimestamp: number;
    initialSlopeCentsPerDay: number;
};

type JointProjectionModel = {
    seriesByKind: Record<CategoryTrackingTrendKind, SeriesProjectionModel>;
    slopeCentsPerDay: number;
};

const projectionSlopeTransitionDays = 60;
const projectionLocalSampleCount = 4;

function getDaysSince(timestamp: number, originTimestamp: number) {
    return (timestamp - originTimestamp) / (24 * 60 * 60 * 1_000);
}

function getSharedProjectionSlope(
    observed: Record<
        CategoryTrackingTrendKind,
        CategoryTrackingTrendDatum[]
    >,
    fallbackSamples: Array<{ timestamp: number; trendCents: number }>,
    originTimestamp: number,
) {
    let numerator = 0;
    let denominator = 0;

    for (const samples of Object.values(observed)) {
        if (samples.length < 2) {
            continue;
        }

        const normalized = samples.map((sample) => ({
            x: getDaysSince(sample.timestamp, originTimestamp),
            y: sample.trendCents,
        }));
        const averageX =
            normalized.reduce((total, sample) => total + sample.x, 0) /
            normalized.length;
        const averageY =
            normalized.reduce((total, sample) => total + sample.y, 0) /
            normalized.length;

        for (const sample of normalized) {
            numerator += (sample.x - averageX) * (sample.y - averageY);
            denominator += (sample.x - averageX) ** 2;
        }
    }

    return denominator === 0
        ? getProjectionSlope(fallbackSamples)
        : numerator / denominator;
}

function getInitialProjectionSlope(
    samples: Array<{ timestamp: number; trendCents: number }>,
    sharedSlopeCentsPerDay: number,
) {
    const recentSamples = samples.slice(-projectionLocalSampleCount);

    if (recentSamples.length < 2) {
        return sharedSlopeCentsPerDay;
    }

    const localSlope = getProjectionSlope(recentSamples);
    const localWeight = Math.min(0.6, (recentSamples.length - 1) * 0.2);

    return (
        localSlope * localWeight +
        sharedSlopeCentsPerDay * (1 - localWeight)
    );
}

function buildSeriesProjectionModel(
    samples: CategoryTrackingTrendDatum[],
    fallback: { timestamp: number; trendCents: number },
    sharedSlopeCentsPerDay: number,
): SeriesProjectionModel {
    const anchor = samples.at(-1) ?? fallback;

    return {
        anchorCents: anchor.trendCents,
        anchorTimestamp: anchor.timestamp,
        initialSlopeCentsPerDay: getInitialProjectionSlope(
            samples,
            sharedSlopeCentsPerDay,
        ),
    };
}

function buildJointProjectionModel(input: {
    chartData: CategoryTrackingChartDatum[];
    observed: Record<
        CategoryTrackingTrendKind,
        CategoryTrackingTrendDatum[]
    >;
    selectedYear: string;
}): JointProjectionModel {
    const originTimestamp = Date.parse(
        `${input.selectedYear}-01-01T00:00:00.000Z`,
    );
    const fallbackSamples = input.chartData.map((point) => ({
        timestamp: point.timestamp,
        trendCents: point.availableCents,
    }));
    const slopeCentsPerDay = getSharedProjectionSlope(
        input.observed,
        fallbackSamples,
        originTimestamp,
    );
    const fallbackPoint = input.chartData.at(-1);
    const fallback = {
        timestamp: fallbackPoint?.timestamp ?? originTimestamp,
        trendCents: fallbackPoint?.availableCents ?? 0,
    };
    const seriesByKind = {
        monthEnd: buildSeriesProjectionModel(
            input.observed.monthEnd,
            fallback,
            slopeCentsPerDay,
        ),
        monthStart: buildSeriesProjectionModel(
            input.observed.monthStart,
            fallback,
            slopeCentsPerDay,
        ),
        smoothed: buildSeriesProjectionModel(
            input.observed.smoothed,
            fallback,
            slopeCentsPerDay,
        ),
    };

    return { seriesByKind, slopeCentsPerDay };
}

function getRawProjectedTrendCents(
    kind: CategoryTrackingTrendKind,
    timestamp: number,
    model: JointProjectionModel,
) {
    const series = model.seriesByKind[kind];
    const elapsedDays = Math.max(
        0,
        getDaysSince(timestamp, series.anchorTimestamp),
    );
    const localSlopeAdjustment =
        (series.initialSlopeCentsPerDay - model.slopeCentsPerDay) *
        projectionSlopeTransitionDays *
        (1 - Math.exp(-elapsedDays / projectionSlopeTransitionDays));

    return (
        series.anchorCents +
        model.slopeCentsPerDay * elapsedDays +
        localSlopeAdjustment
    );
}

function getProjectedTrendCents(
    kind: CategoryTrackingTrendKind,
    timestamp: number,
    model: JointProjectionModel,
) {
    const projectedCents = getRawProjectedTrendCents(kind, timestamp, model);

    if (kind !== "smoothed") {
        return Math.round(projectedCents);
    }

    const monthStartCents = getRawProjectedTrendCents(
        "monthStart",
        timestamp,
        model,
    );
    const monthEndCents = getRawProjectedTrendCents(
        "monthEnd",
        timestamp,
        model,
    );
    const lowerBoundary = Math.min(monthStartCents, monthEndCents);
    const upperBoundary = Math.max(monthStartCents, monthEndCents);

    return Math.round(
        Math.max(lowerBoundary, Math.min(upperBoundary, projectedCents)),
    );
}

function getProjectionDates(
    kind: CategoryTrackingTrendKind,
    selectedYear: string,
    projectionStartsAfter: string,
) {
    const year = Number(selectedYear);
    const dates = Array.from({ length: 12 }, (_, monthIndex) =>
        kind === "monthEnd"
            ? getMonthEndDate(year, monthIndex)
            : getMonthStartDate(year, monthIndex),
    ).filter((date) => date > projectionStartsAfter);
    const yearEndsOn = `${selectedYear}-12-31`;

    if (yearEndsOn > projectionStartsAfter && !dates.includes(yearEndsOn)) {
        dates.push(yearEndsOn);
    }

    return dates.sort();
}

function buildProjectedTrendData(input: {
    chartData: CategoryTrackingChartDatum[];
    kind: CategoryTrackingTrendKind;
    model: JointProjectionModel;
    observed: CategoryTrackingTrendDatum[];
    selectedYear: string;
}) {
    const chartEndsAt = input.chartData.at(-1);
    const yearEndsOn = `${input.selectedYear}-12-31`;

    if (!chartEndsAt || chartEndsAt.date >= yearEndsOn) {
        return [];
    }

    const projectionAnchorSource =
        input.observed.at(-1) ??
        toTrendDatum({
            date: chartEndsAt.date,
            kind: input.kind,
            pointId: `projection-anchor:${input.kind}:${chartEndsAt.date}`,
            trendCents: chartEndsAt.availableCents,
        });
    const projectionAnchor = {
        ...projectionAnchorSource,
        pointId: `projection-anchor:${input.kind}:${projectionAnchorSource.date}`,
    };
    const projectionDates = getProjectionDates(
        input.kind,
        input.selectedYear,
        chartEndsAt.date,
    );

    if (projectionDates.length === 0) {
        return [];
    }

    return [
        projectionAnchor,
        ...projectionDates.map((date) => {
            const timestamp = Date.parse(`${date}T00:00:00.000Z`);

            return toTrendDatum({
                date,
                kind: input.kind,
                pointId: `projected:${input.kind}:${date}`,
                projected: true,
                trendCents: getProjectedTrendCents(
                    input.kind,
                    timestamp,
                    input.model,
                ),
            });
        }),
    ];
}

export function buildCategoryTrackingTrendGroup(
    view: CategoryTrackingReportView,
    anchor = new Date(),
): CategoryTrackingTrendGroup {
    const chartData = buildCategoryTrackingChartData(view, anchor);
    const observed = {
        monthEnd: buildCategoryTrackingMonthEndTrendData(view, anchor),
        monthStart: buildCategoryTrackingMonthStartTrendData(view, anchor),
        smoothed: buildCategoryTrackingTrendData(view, anchor),
    } satisfies Record<CategoryTrackingTrendKind, CategoryTrackingTrendDatum[]>;
    const model = buildJointProjectionModel({
        chartData,
        observed,
        selectedYear: view.selectedYear,
    });

    return {
        monthEnd: {
            observed: observed.monthEnd,
            projected: buildProjectedTrendData({
                chartData,
                kind: "monthEnd",
                model,
                observed: observed.monthEnd,
                selectedYear: view.selectedYear,
            }),
        },
        monthStart: {
            observed: observed.monthStart,
            projected: buildProjectedTrendData({
                chartData,
                kind: "monthStart",
                model,
                observed: observed.monthStart,
                selectedYear: view.selectedYear,
            }),
        },
        smoothed: {
            observed: observed.smoothed,
            projected: buildProjectedTrendData({
                chartData,
                kind: "smoothed",
                model,
                observed: observed.smoothed,
                selectedYear: view.selectedYear,
            }),
        },
    };
}

export function getCategoryTrackingAvailableCents(
    view: CategoryTrackingReportView,
    anchor = new Date(),
) {
    return (
        buildCategoryTrackingChartData(view, anchor).at(-1)?.availableCents ?? 0
    );
}
