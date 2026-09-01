import {
    buildCategoryDetailReportView,
    listCategoryDetailReportCategories,
    type CategoryDetailReportCategoryOption,
} from "@/lib/workspace/category-detail-report-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import { isMonthlyPeriodId } from "@/modules/ledger";

export type CategoryTrackingPointType =
    | "allocation"
    | "asOf"
    | "opening"
    | "transaction";

export type CategoryTrackingPoint = {
    amountCents: number;
    availableCents: number;
    date: string;
    description?: string;
    pointId: string;
    type: CategoryTrackingPointType;
};

export type CategoryTrackingReportView = {
    allocationTotalCents: number;
    categoryOptions: CategoryDetailReportCategoryOption[];
    endingAvailableCents: number;
    openingAvailableCents: number;
    points: CategoryTrackingPoint[];
    selectedCategoryId: string;
    selectedCategoryName: string;
    selectedYear: string;
    transactionTotalCents: number;
    yearOptions: string[];
};

type CategoryTrackingReportInput = {
    categoryId?: string;
    snapshot: WorkspaceSnapshot;
    year?: string;
};

function addPeriodYear(years: Set<string>, periodId: string) {
    if (isMonthlyPeriodId(periodId)) {
        years.add(periodId.slice(0, 4));
    }
}

function listCategoryTrackingCategories(snapshot: WorkspaceSnapshot) {
    const storedCategoryIds = new Set(
        snapshot.budgetCategories.map((category) => category.categoryId),
    );

    return listCategoryDetailReportCategories(snapshot).filter((category) =>
        storedCategoryIds.has(category.categoryId),
    );
}

export function listCategoryTrackingYears(
    snapshot: WorkspaceSnapshot,
    anchor = new Date(),
) {
    const years = new Set<string>();

    for (const period of snapshot.budgetPeriods) {
        addPeriodYear(years, period.periodId);
    }

    for (const allocation of snapshot.budgetAllocations) {
        addPeriodYear(years, allocation.periodId);
    }

    for (const transaction of snapshot.transactions) {
        addPeriodYear(years, transaction.periodId);
    }

    if (years.size === 0) {
        years.add(String(anchor.getUTCFullYear()));
    }

    return Array.from(years).sort();
}

export function getDefaultCategoryTrackingYear(
    snapshot: WorkspaceSnapshot,
    anchor = new Date(),
) {
    return listCategoryTrackingYears(snapshot, anchor).at(-1)!;
}

export function getDefaultCategoryTrackingCategoryId(
    snapshot: WorkspaceSnapshot,
) {
    return listCategoryTrackingCategories(snapshot)[0]?.categoryId ?? "";
}

export function buildCategoryTrackingReportView(
    input: CategoryTrackingReportInput,
): CategoryTrackingReportView {
    const categoryOptions = listCategoryTrackingCategories(input.snapshot);
    const selectedCategory =
        categoryOptions.find(
            (category) => category.categoryId === input.categoryId,
        ) ?? categoryOptions[0];
    const yearOptions = listCategoryTrackingYears(input.snapshot);
    const selectedYear =
        input.year && yearOptions.includes(input.year)
            ? input.year
            : yearOptions.at(-1)!;

    if (!selectedCategory) {
        return {
            allocationTotalCents: 0,
            categoryOptions,
            endingAvailableCents: 0,
            openingAvailableCents: 0,
            points: [],
            selectedCategoryId: "",
            selectedCategoryName: "",
            selectedYear,
            transactionTotalCents: 0,
            yearOptions,
        };
    }

    const detailView = buildCategoryDetailReportView({
        categoryId: selectedCategory.categoryId,
        filterMode: "year",
        snapshot: input.snapshot,
        year: selectedYear,
    });
    const openingPoint: CategoryTrackingPoint = {
        amountCents: 0,
        availableCents: detailView.openingCents,
        date: `${selectedYear}-01-01`,
        pointId: `opening:${selectedYear}:${selectedCategory.categoryId}`,
        type: "opening",
    };
    const eventPoints = detailView.events.map<CategoryTrackingPoint>((event) => ({
        amountCents: event.amountCents,
        availableCents: event.runningCents,
        date: event.date,
        description:
            event.type === "transaction"
                ? [event.payee, event.memo].filter(Boolean).join(" - ")
                : "Monthly category allocation",
        pointId: event.eventId,
        type: event.type === "allocation" ? "allocation" : "transaction",
    }));

    return {
        allocationTotalCents: detailView.allocationTotalCents,
        categoryOptions,
        endingAvailableCents: detailView.totalCents,
        openingAvailableCents: detailView.openingCents,
        points: [openingPoint, ...eventPoints],
        selectedCategoryId: selectedCategory.categoryId,
        selectedCategoryName: selectedCategory.name,
        selectedYear,
        transactionTotalCents: detailView.transactionTotalCents,
        yearOptions,
    };
}
