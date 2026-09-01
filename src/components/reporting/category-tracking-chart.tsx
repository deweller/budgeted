"use client";

import {
    useId,
    useState,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
} from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    type DotItemDotProps,
    type TooltipContentProps,
} from "recharts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

import {
    buildCategoryTrackingChartData,
    buildCategoryTrackingTrendGroup,
    buildCategoryTrackingYAxisScale,
    getCategoryTrackingBalanceGradientZeroOffset,
    type CategoryTrackingChartDatum,
    type CategoryTrackingTrendDatum,
    type CategoryTrackingTrendKind,
} from "@/components/reporting/category-tracking-chart-data";
import { formatUsd } from "@/lib/formatting/money";
import type { CategoryTrackingReportView } from "@/lib/workspace/category-tracking-report-projector";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type CategoryTrackingChartProps = {
    view: CategoryTrackingReportView;
};

type CategoryTrackingHoverDetail =
    | CategoryTrackingChartDatum
    | CategoryTrackingTrendDatum;

type HoverDetailHandler = (detail: CategoryTrackingHoverDetail | null) => void;

function isBalanceDetail(
    detail: CategoryTrackingHoverDetail | null,
): detail is CategoryTrackingChartDatum {
    return Boolean(detail && "availableCents" in detail);
}

const chartHeight = 420;
const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
});
const trendConfigurations: Array<{
    curveType: "monotoneX" | "natural";
    kind: CategoryTrackingTrendKind;
    label: string;
    stroke: string;
    strokeWidth: number;
}> = [
    {
        curveType: "natural",
        kind: "smoothed",
        label: "Smoothed trend",
        stroke: "var(--tone-warning-ink)",
        strokeWidth: 5,
    },
    {
        curveType: "monotoneX",
        kind: "monthStart",
        label: "Start month value",
        stroke: "var(--tone-info-ink)",
        strokeWidth: 5,
    },
    {
        curveType: "monotoneX",
        kind: "monthEnd",
        label: "End month value",
        stroke: "var(--color-chart-trend-month-end)",
        strokeWidth: 5,
    },
];

function getTrendConfiguration(kind: CategoryTrackingTrendKind) {
    return trendConfigurations.find(
        (configuration) => configuration.kind === kind,
    )!;
}

function getYearDomain(year: string): [number, number] {
    const numericYear = Number(year);

    return [
        Date.UTC(numericYear, 0, 1),
        Date.UTC(numericYear, 11, 31),
    ];
}

function getMonthTicks(year: string) {
    const numericYear = Number(year);

    return Array.from({ length: 12 }, (_, monthIndex) =>
        Date.UTC(numericYear, monthIndex, 1),
    );
}

function getValueScale(
    data: CategoryTrackingChartDatum[],
    trendData: CategoryTrackingTrendDatum[],
) {
    return buildCategoryTrackingYAxisScale([
        0,
        ...data.map((point) => point.availableCents),
        ...trendData.map((point) => point.trendCents),
    ]);
}

function formatPointType(point: CategoryTrackingChartDatum) {
    if (point.type === "allocation") {
        return "Monthly allocation";
    }

    if (point.type === "transaction") {
        return "Transaction";
    }

    if (point.type === "asOf") {
        return "Balance as of";
    }

    return "Opening balance";
}

function getPointColor(availableCents: number) {
    if (availableCents > 0) {
        return "var(--tone-success-ink)";
    }

    if (availableCents < 0) {
        return "var(--tone-error-ink)";
    }

    return "var(--tone-money-zero-ink)";
}

function findNearestTrendPoint(
    event: ReactMouseEvent<SVGPathElement>,
    trendData: CategoryTrackingTrendDatum[],
) {
    const firstPoint = trendData.at(0);
    const lastPoint = trendData.at(-1);
    const bounds = event.currentTarget.getBoundingClientRect();

    if (!firstPoint || !lastPoint || bounds.width <= 0) {
        return null;
    }

    const horizontalPosition = Math.max(
        0,
        Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    const hoveredTimestamp =
        firstPoint.timestamp +
        horizontalPosition * (lastPoint.timestamp - firstPoint.timestamp);

    return trendData.reduce((nearestPoint, point) =>
        Math.abs(point.timestamp - hoveredTimestamp) <
        Math.abs(nearestPoint.timestamp - hoveredTimestamp)
            ? point
            : nearestPoint,
    );
}

function isPointerPastBalanceLine(event: ReactMouseEvent<HTMLDivElement>) {
    const balancePath =
        event.currentTarget.querySelector<SVGPathElement>(
            ".recharts-area-curve",
        );
    const bounds = balancePath?.getBoundingClientRect();

    return bounds && bounds.right > bounds.left
        ? event.clientX > bounds.right
        : false;
}

function isTrendLineTarget(target: EventTarget) {
    return (
        target instanceof Element &&
        Boolean(target.closest(".recharts-line-curve"))
    );
}

function renderEventDot(
    props: DotItemDotProps,
    onHoverDetail: HoverDetailHandler,
): ReactNode {
    const point = props.payload as CategoryTrackingChartDatum;

    if (
        point.type === "opening" ||
        point.type === "asOf" ||
        typeof props.cx !== "number" ||
        typeof props.cy !== "number"
    ) {
        return null;
    }

    return (
        <circle
            cx={props.cx}
            cy={props.cy}
            fill={getPointColor(point.availableCents)}
            aria-label={`${formatPointType(point)} on ${point.date}${
                point.description ? `, ${point.description}` : ""
            }, ${formatUsd(point.availableCents)} balance`}
            onBlur={() => {
                onHoverDetail(null);
            }}
            onFocus={() => {
                onHoverDetail(point);
            }}
            onMouseEnter={() => {
                onHoverDetail(point);
            }}
            onMouseLeave={() => {
                onHoverDetail(null);
            }}
            r="4"
            stroke="var(--color-panel-strong)"
            strokeWidth="2"
            tabIndex={0}
        />
    );
}

function CategoryTrackingTooltipCard({
    balancePoint,
    trendPoint,
}: {
    balancePoint?: CategoryTrackingChartDatum;
    trendPoint?: CategoryTrackingTrendDatum;
}) {
    const point = balancePoint ?? trendPoint;

    if (!point) {
        return null;
    }

    return (
        <div
            className="grid min-w-52 gap-2 border border-[var(--color-border)] bg-[var(--color-popover)] p-3 text-sm shadow-[var(--shadow-panel)]"
            role="tooltip"
        >
            <div>
                <p className="font-semibold text-[var(--color-ink)]">
                    {balancePoint
                        ? formatPointType(balancePoint)
                        : `${getTrendConfiguration(trendPoint!.kind).label}${
                              trendPoint!.projected ? " projection" : ""
                          }`}
                </p>
                <p className={typographyClassNames.mutedBody}>
                    {dateFormatter.format(point.timestamp)}
                </p>
            </div>
            {balancePoint?.description ? (
                <p className="text-[var(--color-ink)]">
                    {balancePoint.description}
                </p>
            ) : null}
            {balancePoint?.type === "allocation" ||
            balancePoint?.type === "transaction" ? (
                <div className="flex items-center justify-between gap-4">
                    <span className={typographyClassNames.mutedBody}>Change</span>
                    <span className={getPointColor(balancePoint.amountCents)}>
                        {formatUsd(balancePoint.amountCents)}
                    </span>
                </div>
            ) : null}
            {balancePoint ? (
                <div className="flex items-center justify-between gap-4">
                    <span className={typographyClassNames.mutedBody}>Balance</span>
                    <span className={getPointColor(balancePoint.availableCents)}>
                        {formatUsd(balancePoint.availableCents)}
                    </span>
                </div>
            ) : null}
            {trendPoint ? (
                <div className="flex items-center justify-between gap-4">
                    <span className={typographyClassNames.mutedBody}>
                        {trendPoint.projected ? "Projected balance" : "Balance"}
                    </span>
                    <span
                        style={{
                            color: getTrendConfiguration(trendPoint.kind).stroke,
                        }}
                    >
                        {formatUsd(trendPoint.trendCents)}
                    </span>
                </div>
            ) : null}
        </div>
    );
}

function CategoryTrackingTooltip({
    active,
    hideBalance,
    payload,
}: TooltipContentProps & { hideBalance: boolean }) {
    const balancePoint = payload.find(
        (entry) => entry.dataKey === "availableCents",
    )?.payload as CategoryTrackingChartDatum | undefined;

    if (!active || hideBalance) {
        return null;
    }

    return (
        <CategoryTrackingTooltipCard balancePoint={balancePoint} />
    );
}

export function CategoryTrackingChart({ view }: CategoryTrackingChartProps) {
    const [showTrend, setShowTrend] = useState(false);
    const [isPastBalanceLine, setIsPastBalanceLine] = useState(false);
    const [hoveredDetail, setHoveredDetail] =
        useState<CategoryTrackingHoverDetail | null>(null);
    const generatedId = useId().replaceAll(":", "");
    const fillGradientId = `category-tracking-fill-${generatedId}`;
    const strokeGradientId = `category-tracking-stroke-${generatedId}`;
    const chartData = buildCategoryTrackingChartData(view);
    const trendGroup = buildCategoryTrackingTrendGroup(view);
    const allTrendData = trendConfigurations.flatMap((configuration) => {
        const series = trendGroup[configuration.kind];

        return [...series.observed, ...series.projected];
    });
    const visibleTrendData = showTrend ? allTrendData : [];
    const range = getValueScale(chartData, visibleTrendData);
    const yearDomain = getYearDomain(view.selectedYear);
    const zeroOffset = getCategoryTrackingBalanceGradientZeroOffset(
        chartData.map((point) => point.availableCents),
    );
    const visibleEndingCents =
        chartData.at(-1)?.availableCents ?? view.openingAvailableCents;

    return (
        <figure className="grid gap-4 border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:p-5">
            <figcaption className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                    <h2 className="text-base font-semibold text-[var(--color-ink)]">
                        Category balance for {view.selectedYear}
                    </h2>
                    <p className={`text-sm ${typographyClassNames.mutedBody}`}>
                        The timeline spans the year; the balance line ends at today
                        or the end of that year. Trends compare smoothed activity,
                        post-allocation month starts, and completed month ends.
                        Faded dashed lines are projections.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-muted)]">
                    <span className="inline-flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="size-3 bg-[var(--tone-success-ink)]"
                        />
                        Available
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="size-3 bg-[var(--tone-error-ink)]"
                        />
                        Overspent
                    </span>
                    <button
                        aria-pressed={showTrend}
                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionCompact}`}
                        onClick={() => {
                            setHoveredDetail(null);
                            setShowTrend((currentValue) => !currentValue);
                        }}
                        type="button"
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={showTrend ? faEyeSlash : faEye}
                        />
                        {showTrend ? "Hide trends" : "Show trends"}
                    </button>
                    {showTrend
                        ? trendConfigurations.map((configuration) => (
                              <span
                                  className="inline-flex items-center gap-2"
                                  key={configuration.kind}
                              >
                                  <span
                                      aria-hidden="true"
                                      className="w-5 border-t-[3px]"
                                      style={{
                                          borderColor: configuration.stroke,
                                      }}
                                  />
                                  {configuration.label}
                              </span>
                          ))
                        : null}
                </div>
            </figcaption>

            <div
                aria-label={`${view.selectedCategoryName} category balance during ${view.selectedYear}, ending at ${formatUsd(visibleEndingCents)}.`}
                className="min-w-0 overflow-x-auto"
                role="img"
            >
                <div
                    className="relative h-[420px] min-w-[44rem]"
                    data-testid="category-tracking-plot"
                    onMouseLeave={() => {
                        setIsPastBalanceLine(false);
                    }}
                    onMouseMove={(event) => {
                        const isPastLine = isPointerPastBalanceLine(event);
                        setIsPastBalanceLine(isPastLine);

                        if (isPastLine && !isTrendLineTarget(event.target)) {
                            setHoveredDetail(null);
                        }
                    }}
                >
                    {hoveredDetail ? (
                        <div className="pointer-events-none absolute right-6 top-4 z-20">
                            <CategoryTrackingTooltipCard
                                trendPoint={
                                    isBalanceDetail(hoveredDetail)
                                        ? undefined
                                        : hoveredDetail
                                }
                                balancePoint={
                                    isBalanceDetail(hoveredDetail)
                                        ? hoveredDetail
                                        : undefined
                                }
                            />
                        </div>
                    ) : null}
                    <ResponsiveContainer
                        height={chartHeight}
                        initialDimension={{ height: chartHeight, width: 1_000 }}
                        width="100%"
                    >
                        <AreaChart
                            accessibilityLayer
                            data={chartData}
                            margin={{ bottom: 12, left: 16, right: 24, top: 12 }}
                        >
                            <defs>
                                <linearGradient
                                    id={fillGradientId}
                                    x1="0"
                                    x2="0"
                                    y1="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0"
                                        stopColor="var(--tone-success-surface-strong)"
                                    />
                                    <stop
                                        offset={zeroOffset}
                                        stopColor="var(--tone-success-surface-strong)"
                                    />
                                    <stop
                                        offset={zeroOffset}
                                        stopColor="var(--tone-error-surface-strong)"
                                    />
                                    <stop
                                        offset="1"
                                        stopColor="var(--tone-error-surface-strong)"
                                    />
                                </linearGradient>
                                <linearGradient
                                    id={strokeGradientId}
                                    x1="0"
                                    x2="0"
                                    y1="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0"
                                        stopColor="var(--tone-success-ink)"
                                    />
                                    <stop
                                        offset={zeroOffset}
                                        stopColor="var(--tone-success-ink)"
                                    />
                                    <stop
                                        offset={zeroOffset}
                                        stopColor="var(--tone-error-ink)"
                                    />
                                    <stop
                                        offset="1"
                                        stopColor="var(--tone-error-ink)"
                                    />
                                </linearGradient>
                            </defs>

                            <CartesianGrid
                                stroke="var(--color-border)"
                                strokeOpacity="0.55"
                                vertical={false}
                            />
                            <XAxis
                                allowDataOverflow
                                axisLine={{ stroke: "var(--color-border)" }}
                                dataKey="timestamp"
                                domain={yearDomain}
                                scale="time"
                                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                                tickFormatter={(value: number) =>
                                    monthFormatter.format(value)
                                }
                                tickLine={false}
                                ticks={getMonthTicks(view.selectedYear)}
                                type="number"
                            />
                            <YAxis
                                axisLine={false}
                                domain={[range.minimum, range.maximum]}
                                label={{
                                    angle: -90,
                                    fill: "var(--color-muted)",
                                    position: "insideLeft",
                                    value: "Category balance",
                                }}
                                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                                tickFormatter={(value: number) => formatUsd(value)}
                                tickLine={false}
                                ticks={range.ticks}
                                width={104}
                            />
                            <ReferenceLine
                                data-testid="category-tracking-zero-line"
                                stroke="var(--color-ink)"
                                strokeOpacity="0.85"
                                strokeWidth="1.5"
                                y={0}
                            />
                            <Tooltip
                                content={(props) => (
                                    <CategoryTrackingTooltip
                                        {...props}
                                        hideBalance={isPastBalanceLine}
                                    />
                                )}
                                cursor={{
                                    stroke: "var(--color-muted)",
                                    strokeDasharray: "4 4",
                                }}
                                isAnimationActive={false}
                            />
                            <Area
                                activeDot={false}
                                baseValue={0}
                                connectNulls
                                dataKey="availableCents"
                                dot={(props) =>
                                    renderEventDot(props, setHoveredDetail)
                                }
                                fill={`url(#${fillGradientId})`}
                                fillOpacity={1}
                                isAnimationActive={false}
                                name="Category balance"
                                stroke={`url(#${strokeGradientId})`}
                                strokeWidth={3}
                                type="stepAfter"
                            />
                            {showTrend
                                ? trendConfigurations.flatMap((configuration) => {
                                      const series =
                                          trendGroup[configuration.kind];

                                      return [
                                          <Line
                                              activeDot={false}
                                              connectNulls
                                              data={series.observed}
                                              dataKey="trendCents"
                                              dot={false}
                                              fill="none"
                                              isAnimationActive={false}
                                              key={`${configuration.kind}:observed`}
                                              name={configuration.label}
                                              onMouseLeave={() => {
                                                  setHoveredDetail(null);
                                              }}
                                              onMouseMove={(_lineProps, event) => {
                                                  setHoveredDetail(
                                                      findNearestTrendPoint(
                                                          event,
                                                          series.observed,
                                                      ),
                                                  );
                                              }}
                                              stroke={configuration.stroke}
                                              strokeWidth={
                                                  configuration.strokeWidth
                                              }
                                              type={configuration.curveType}
                                          />,
                                          series.projected.length > 1 ? (
                                              <Line
                                                  activeDot={false}
                                                  connectNulls
                                                  data={series.projected}
                                                  dataKey="trendCents"
                                                  dot={false}
                                                  fill="none"
                                                  isAnimationActive={false}
                                                  key={`${configuration.kind}:projected`}
                                                  name={`${configuration.label} projection`}
                                                  onMouseLeave={() => {
                                                      setHoveredDetail(null);
                                                  }}
                                                  onMouseMove={(
                                                      _lineProps,
                                                      event,
                                                  ) => {
                                                      setHoveredDetail(
                                                          findNearestTrendPoint(
                                                              event,
                                                              series.projected,
                                                          ),
                                                      );
                                                  }}
                                                  stroke={configuration.stroke}
                                                  strokeDasharray="8 6"
                                                  strokeOpacity={0.35}
                                                  strokeWidth={
                                                      configuration.strokeWidth
                                                  }
                                                  type={configuration.curveType}
                                              />
                                          ) : null,
                                      ];
                                  })
                                : null}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <ul className="sr-only">
                {chartData.map((point) => (
                    <li key={point.pointId}>
                        {point.date}: {formatPointType(point)}
                        {point.description ? `, ${point.description}` : ""}; {formatUsd(
                            point.availableCents,
                        )} balance.
                    </li>
                ))}
                {showTrend
                    ? allTrendData.map((point) => (
                          <li key={point.pointId}>
                              {point.date}: {getTrendConfiguration(point.kind).label}
                              {point.projected ? " projection" : ""}: {formatUsd(
                                  point.trendCents,
                              )}.
                          </li>
                      ))
                    : null}
            </ul>
        </figure>
    );
}
