"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
    faFilter,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { CategoryActivityReportTable } from "@/components/reporting/category-activity-report-table";
import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { MoneyAmount } from "@/components/shared/money-amount";
import {
    buildCategoryDetailReportView,
    getDefaultCategoryDetailReportPeriodId,
    listCategoryDetailReportCategories,
    type CategoryDetailReportFilterMode,
} from "@/lib/workspace/category-detail-report-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import { isUnassignedCategoryId } from "@/modules/budgeting/unassigned";
type CategoryDetailReportProps = {
    snapshot: WorkspaceSnapshot;
};

function buildCategoryOptions(
    snapshot: WorkspaceSnapshot,
): ComboboxSelectOption[] {
    return listCategoryDetailReportCategories(snapshot)
        .filter((category) => !isUnassignedCategoryId(category.categoryId))
        .map((category) => ({
            group: category.groupName,
            label: category.name,
            value: category.categoryId,
        }));
}

function SummaryMetric({
    label,
    value,
}: {
    label: string;
    value: ReactNode;
}) {
    return (
        <div className="grid gap-1 bg-[var(--color-panel-strong)] p-3">
            <span className={typographyClassNames.eyebrow}>{label}</span>
            <span className="text-lg font-semibold text-[var(--color-ink)]">
                {value}
            </span>
        </div>
    );
}

export function CategoryDetailReport({ snapshot }: CategoryDetailReportProps) {
    const defaultPeriodId = useMemo(
        () => getDefaultCategoryDetailReportPeriodId(snapshot),
        [snapshot],
    );
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>();
    const [filterMode, setFilterMode] =
        useState<CategoryDetailReportFilterMode>("all");
    const [periodId, setPeriodId] = useState(defaultPeriodId);
    const [year, setYear] = useState(defaultPeriodId.slice(0, 4));
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const view = useMemo(
        () =>
            selectedCategoryId
                ? buildCategoryDetailReportView({
                      categoryId: selectedCategoryId,
                      filterMode,
                      periodId,
                      snapshot,
                      year,
                  })
                : null,
        [filterMode, periodId, selectedCategoryId, snapshot, year],
    );
    const categoryOptions = useMemo(
        () => buildCategoryOptions(snapshot),
        [snapshot],
    );
    const filterLabel =
        filterMode === "all"
            ? "All activity"
            : filterMode === "month"
            ? `Month: ${periodId}`
            : `Year: ${year}`;
    const hasActiveFilter = filterMode !== "all";

    function resetFilters() {
        setFilterMode("all");
        setPeriodId(defaultPeriodId);
        setYear(defaultPeriodId.slice(0, 4));
        setIsFilterOpen(false);
    }

    function updateFilterMode(value: CategoryDetailReportFilterMode) {
        setFilterMode(value);

        if (value === "year") {
            setYear(periodId.slice(0, 4));
        }
    }

    return (
        <div className="grid gap-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(18rem,28rem)_auto] lg:items-end lg:justify-between">
                <ComboboxSelect
                    optionVariant="category"
                    inputClassName={`${controlClassNames.fieldCompact} w-full`}
                    label="Category"
                    labelClassName="grid gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]"
                    noResultsLabel="No categories found"
                    onChange={(value) => {
                        setSelectedCategoryId(value || undefined);
                    }}
                    options={categoryOptions}
                    value={selectedCategoryId ?? ""}
                />
                <button
                    type="button"
                    aria-expanded={isFilterOpen}
                    aria-controls="category-detail-filter-controls"
                    onClick={() => {
                        setIsFilterOpen((currentValue) => !currentValue);
                    }}
                    className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionCompact}`}
                >
                    <FontAwesomeIcon aria-hidden="true" icon={faFilter} />
                    Filter
                </button>
            </div>

            <div className="grid gap-3">
                {hasActiveFilter ? (
                    <div
                        aria-live="polite"
                        className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]"
                    >
                        <span>Filter:</span>
                        <span className="inline-flex items-center gap-1 border border-[var(--color-accent-ink)] bg-[var(--color-accent-soft)] px-2 py-1 text-sm text-[var(--color-accent-contrast)]">
                            <span>{filterLabel}</span>
                            <button
                                type="button"
                                aria-label={`Reset ${filterLabel} filter`}
                                onClick={resetFilters}
                                className="inline-flex size-5 cursor-pointer items-center justify-center text-[var(--color-accent-contrast)] transition hover:bg-[var(--color-accent-ink)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                            >
                                <FontAwesomeIcon
                                    aria-hidden="true"
                                    icon={faXmark}
                                />
                            </button>
                        </span>
                    </div>
                ) : null}
                {isFilterOpen ? (
                    <div
                        id="category-detail-filter-controls"
                        className="grid gap-3 border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3 lg:grid-cols-2"
                    >
                        <label className="grid min-w-0 gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                            Range
                            <select
                                value={filterMode}
                                onChange={(event) => {
                                    updateFilterMode(
                                        event.currentTarget
                                            .value as CategoryDetailReportFilterMode,
                                    );
                                }}
                                className={`${controlClassNames.fieldCompact} w-full`}
                            >
                                <option value="all">All activity</option>
                                <option value="month">Month</option>
                                <option value="year">Year</option>
                            </select>
                        </label>

                        {filterMode === "month" ? (
                            <label className="grid min-w-0 gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                Month
                                <input
                                    type="month"
                                    value={periodId}
                                    onChange={(event) => {
                                        setPeriodId(event.currentTarget.value);
                                        setYear(
                                            event.currentTarget.value.slice(0, 4),
                                        );
                                    }}
                                    className={`${controlClassNames.fieldCompact} w-full`}
                                />
                            </label>
                        ) : filterMode === "year" ? (
                            <label className="grid min-w-0 gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                                Year
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1900"
                                    max="9999"
                                    value={year}
                                    onChange={(event) => {
                                        setYear(event.currentTarget.value);
                                    }}
                                    className={`${controlClassNames.fieldCompact} w-full`}
                                />
                            </label>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {view ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <SummaryMetric
                            label={`${view.selectedCategoryName} total`}
                            value={<MoneyAmount cents={view.totalCents} />}
                        />
                        <SummaryMetric
                            label="Opening"
                            value={<MoneyAmount cents={view.openingCents} />}
                        />
                        <SummaryMetric
                            label="Allocations"
                            value={
                                <MoneyAmount
                                    cents={view.allocationTotalCents}
                                />
                            }
                        />
                        <SummaryMetric
                            label="Transactions"
                            value={
                                <MoneyAmount
                                    cents={view.transactionTotalCents}
                                />
                            }
                        />
                    </div>

                    <CategoryActivityReportTable
                        emptyMessage="No category activity matches this filter."
                        events={view.events}
                    />
                </>
            ) : (
                <p className={`text-sm ${typographyClassNames.mutedBody}`}>
                    Choose a category to view its activity.
                </p>
            )}
        </div>
    );
}
