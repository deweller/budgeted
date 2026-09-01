"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { CategoryTrackingChart } from "@/components/reporting/category-tracking-chart";
import { getCategoryTrackingAvailableCents } from "@/components/reporting/category-tracking-chart-data";
import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { MoneyAmount } from "@/components/shared/money-amount";
import { getCategoryTrackingHref } from "@/lib/navigation/category-tracking-routes";
import {
    buildCategoryTrackingReportView,
    getDefaultCategoryTrackingCategoryId,
    getDefaultCategoryTrackingYear,
} from "@/lib/workspace/category-tracking-report-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type CategoryTrackingReportProps = {
    snapshot: WorkspaceSnapshot;
};

function buildCategoryOptions(
    view: ReturnType<typeof buildCategoryTrackingReportView>,
): ComboboxSelectOption[] {
    return view.categoryOptions.map((category) => ({
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

export function CategoryTrackingReport({
    snapshot,
}: CategoryTrackingReportProps) {
    const searchParams = useSearchParams();
    const queryCategoryId = searchParams.get("category");
    const defaultCategoryId = useMemo(
        () => getDefaultCategoryTrackingCategoryId(snapshot),
        [snapshot],
    );
    const defaultYear = useMemo(
        () => getDefaultCategoryTrackingYear(snapshot),
        [snapshot],
    );
    const selectedCategoryId = queryCategoryId ?? defaultCategoryId;
    const [selectedYear, setSelectedYear] = useState(defaultYear);
    const view = useMemo(
        () =>
            buildCategoryTrackingReportView({
                categoryId: selectedCategoryId,
                snapshot,
                year: selectedYear,
            }),
        [selectedCategoryId, selectedYear, snapshot],
    );
    const categoryOptions = useMemo(() => buildCategoryOptions(view), [view]);
    const availableCents = getCategoryTrackingAvailableCents(view);

    function selectCategory(categoryId: string) {
        window.history.pushState(
            null,
            "",
            getCategoryTrackingHref(categoryId),
        );
    }

    if (categoryOptions.length === 0) {
        return (
            <div className="border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
                <p className="font-medium text-[var(--color-ink)]">
                    No categories are available to track.
                </p>
                <p className={`mt-2 text-sm ${typographyClassNames.mutedBody}`}>
                    Add a budget category, then return here to review its available
                    amount over time.
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(18rem,28rem)_minmax(10rem,14rem)] lg:items-end lg:justify-between">
                <ComboboxSelect
                    inputClassName={`${controlClassNames.fieldCompact} w-full`}
                    label="Category"
                    labelClassName="grid gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]"
                    noResultsLabel="No categories found"
                    onChange={selectCategory}
                    options={categoryOptions}
                    optionVariant="category"
                    value={view.selectedCategoryId}
                />
                <label className="grid min-w-0 gap-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-muted)]">
                    Year
                    <select
                        className={`${controlClassNames.fieldCompact} w-full`}
                        onChange={(event) => {
                            setSelectedYear(event.currentTarget.value);
                        }}
                        value={view.selectedYear}
                    >
                        {view.yearOptions.map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryMetric
                    label="Allocated"
                    value={<MoneyAmount cents={view.allocationTotalCents} />}
                />
                <SummaryMetric
                    label="Transaction activity"
                    value={<MoneyAmount cents={view.transactionTotalCents} />}
                />
                <SummaryMetric
                    label="Available"
                    value={<MoneyAmount cents={availableCents} />}
                />
            </div>

            <CategoryTrackingChart view={view} />
        </div>
    );
}
