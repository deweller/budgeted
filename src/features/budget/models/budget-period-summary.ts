import {
    buildBudgetAttentionStates,
    buildCarryForwardSummaries,
    buildCategoryAttentionStates,
    type AttentionState,
    type CarryForwardSummary,
    calculateAssignedAllocationTotalCents,
} from "@/modules/budgeting";
import type { BudgetCategoryAllocationCadence } from "@/modules/budgeting/allocation-schedule";

export type CategoryAllocationSummary = {
    activityCents: number;
    allocationCadence?: BudgetCategoryAllocationCadence;
    allocationStartMonth?: number;
    assignedCents: number;
    attentionStates: AttentionState[];
    availableCents: number;
    baseAvailableCents?: number;
    carriedForwardCents: number;
    categoryId: string;
    defaultAssignedCents?: number;
    isIncomeCategory?: boolean;
    name: string;
    reducedByOverspending: boolean;
};

export type BudgetPeriodSummary = {
    activeAccountCount?: number;
    attentionStates: AttentionState[];
    assignedAllocationTotalCents: number;
    allocationDifferenceCents: number;
    allocationFundingCents: number;
    allocationFundingRows: Array<{
        accountId: string;
        accountName: string;
        amountCents: number;
    }>;
    availableToBudgetCents: number;
    categories: CategoryAllocationSummary[];
    carryForwardSummaries: CarryForwardSummary[];
    fundingReconciliationCents: number;
    hasSavedAssignments: boolean;
    periodId: string;
    status: "open" | "closed";
};

export type BudgetFundingSnapshot = {
    activeAccountCount: number;
    totalFundsCents: number;
};

export function createCategoryAllocationSummary(
    category: Pick<
        CategoryAllocationSummary,
        | "allocationCadence"
        | "allocationStartMonth"
        | "categoryId"
        | "defaultAssignedCents"
        | "isIncomeCategory"
        | "name"
    >,
    allocation: Pick<
        CategoryAllocationSummary,
        | "activityCents"
        | "assignedCents"
        | "availableCents"
        | "carriedForwardCents"
        | "categoryId"
    >,
): CategoryAllocationSummary {
    const availableCents = allocation.availableCents;
    const reducedByOverspending = allocation.carriedForwardCents < 0;
    const attentionStates = buildCategoryAttentionStates({
        availableCents,
        carriedForwardCents: allocation.carriedForwardCents,
        categoryId: category.categoryId,
        name: category.name,
    });

    return {
        activityCents: allocation.activityCents,
        allocationCadence: category.allocationCadence,
        allocationStartMonth: category.allocationStartMonth,
        assignedCents: allocation.assignedCents,
        attentionStates,
        availableCents,
        baseAvailableCents: availableCents,
        carriedForwardCents: allocation.carriedForwardCents,
        categoryId: category.categoryId,
        defaultAssignedCents: category.defaultAssignedCents,
        isIncomeCategory: category.isIncomeCategory,
        name: category.name,
        reducedByOverspending,
    };
}

export function assembleBudgetPeriodSummary(input: {
    allocationFundingRows?: BudgetPeriodSummary["allocationFundingRows"];
    categorySummaries: CategoryAllocationSummary[];
    currentFundingSnapshot: BudgetFundingSnapshot;
    hasSavedAssignments: boolean;
    periodId: string;
    status: BudgetPeriodSummary["status"];
}): BudgetPeriodSummary {
    const assignedAllocationTotalCents =
        calculateAssignedAllocationTotalCents(input.categorySummaries);
    const allocationFundingRows = input.allocationFundingRows ?? [];
    const allocationFundingCents = allocationFundingRows.reduce(
        (total, row) => total + row.amountCents,
        0,
    );
    const allocationDifferenceCents =
        allocationFundingCents - assignedAllocationTotalCents;

    return {
        activeAccountCount: input.currentFundingSnapshot.activeAccountCount,
        allocationDifferenceCents,
        allocationFundingCents,
        allocationFundingRows,
        assignedAllocationTotalCents,
        attentionStates: buildBudgetAttentionStates({
            availableToBudgetCents: allocationDifferenceCents,
            categoryStates: input.categorySummaries.flatMap(
                (category) => category.attentionStates,
            ),
        }),
        availableToBudgetCents: allocationDifferenceCents,
        carryForwardSummaries: buildCarryForwardSummaries(
            input.categorySummaries,
        ),
        categories: input.categorySummaries,
        fundingReconciliationCents: allocationDifferenceCents,
        hasSavedAssignments: input.hasSavedAssignments,
        periodId: input.periodId,
        status: input.status,
    };
}
