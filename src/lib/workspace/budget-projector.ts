import {
    assembleBudgetPeriodSummary,
    createCategoryAllocationSummary,
    type BudgetPeriodSummary,
} from "@/features/budget/models/budget-period-summary";
import {
    buildCategoryActivityByCategoryId,
    calculateAvailableCents,
    calculateUncategorizedActivityCents,
    deriveBudgetPeriodAllocationState,
    isUserVisibleBudgetCategory,
    listOpeningBalanceFundingRowsForPeriod,
    UNCATEGORIZED_CATEGORY_ID,
    UNCATEGORIZED_CATEGORY_NAME,
    type BudgetPeriodCategoryState,
} from "@/modules/budgeting";
import { calculateAccountBalanceCents } from "@/modules/ledger/account-balance";
import { getMonthlyPeriodBounds } from "@/modules/ledger";
import { isBudgetFundingAccountEligibleForPeriod } from "@/modules/accounts/account-types";
import type {
    WorkspaceBudgetCategoryRecord,
    WorkspaceSnapshot,
} from "@/lib/workspace/sync-types";

function listContinuityPeriodIds(
    snapshot: WorkspaceSnapshot,
    targetPeriodId: string,
) {
    const candidatePeriodIds = new Set([
        ...snapshot.budgetAllocations.map((allocation) => allocation.periodId),
        ...snapshot.transactions.map((transaction) => transaction.periodId),
        targetPeriodId,
    ]);

    return Array.from(candidatePeriodIds)
        .filter((periodId) => periodId <= targetPeriodId)
        .sort();
}

function listPeriodAllocations(
    snapshot: WorkspaceSnapshot,
    periodId: string,
) {
    return snapshot.budgetAllocations.filter(
        (allocation) => allocation.periodId === periodId,
    );
}

function listPeriodActivityByCategoryId(
    snapshot: WorkspaceSnapshot,
    periodId: string,
    categories: WorkspaceBudgetCategoryRecord[],
) {
    return buildCategoryActivityByCategoryId({
        accounts: snapshot.accounts,
        categories,
        lines: snapshot.transactionLines,
        periodId,
        transactions: snapshot.transactions,
    });
}

const uncategorizedBudgetCategoryState: BudgetPeriodCategoryState = {
    allocationCadence: "monthly",
    categoryId: UNCATEGORIZED_CATEGORY_ID,
    defaultAssignedCents: 0,
    groupId: "__synthetic_uncategorized__",
    isIncomeCategory: false,
    ledgerAccountId: UNCATEGORIZED_CATEGORY_ID,
    name: UNCATEGORIZED_CATEGORY_NAME,
    sortOrder: Number.MIN_SAFE_INTEGER,
    status: "active",
};

function calculatePeriodUncategorizedActivityCents(
    snapshot: WorkspaceSnapshot,
    periodId: string,
) {
    return calculateUncategorizedActivityCents({
        accounts: snapshot.accounts,
        lines: snapshot.transactionLines,
        periodId,
        transactions: snapshot.transactions,
    });
}

function createUncategorizedAllocation(input: {
    activityCents: number;
    carriedForwardCents: number;
}) {
    const assignedCents = 0;

    return {
        activityCents: input.activityCents,
        assignedCents,
        availableCents: calculateAvailableCents({
            activityCents: input.activityCents,
            assignedCents,
            carriedForwardCents: input.carriedForwardCents,
        }),
        carriedForwardCents: input.carriedForwardCents,
        categoryId: UNCATEGORIZED_CATEGORY_ID,
    };
}

function resolveBudgetPeriodState(
    snapshot: WorkspaceSnapshot,
    periodId: string,
) {
    const categories = snapshot.budgetCategories;
    const visibleCategories = categories.filter(isUserVisibleBudgetCategory);
    const retiredCategoryIds = new Set(
        categories
            .filter((category) => !isUserVisibleBudgetCategory(category))
            .map((category) => category.categoryId),
    );
    const continuityPeriodIds = listContinuityPeriodIds(snapshot, periodId);
    let previousAvailableByCategoryId = new Map<string, number>();
    let previousUncategorizedAvailableCents = 0;

    for (const continuityPeriodId of continuityPeriodIds) {
        const periodState = deriveBudgetPeriodAllocationState({
            activityByCategoryId: listPeriodActivityByCategoryId(
                snapshot,
                continuityPeriodId,
                visibleCategories,
            ),
            currentAllocations: listPeriodAllocations(
                snapshot,
                continuityPeriodId,
            ),
            missingActivityFallback: "zero",
            previousAvailableByCategoryId,
            retiredCategoryIds,
            visibleCategories,
        });
        const uncategorizedAllocation = createUncategorizedAllocation({
            activityCents: calculatePeriodUncategorizedActivityCents(
                snapshot,
                continuityPeriodId,
            ),
            carriedForwardCents: previousUncategorizedAvailableCents,
        });

        if (continuityPeriodId === periodId) {
            return {
                ...periodState,
                allocations: [
                    uncategorizedAllocation,
                    ...periodState.allocations,
                ],
                carriedForwardByCategoryId: previousAvailableByCategoryId,
                categories: [
                    uncategorizedBudgetCategoryState,
                    ...periodState.categories,
                ],
            };
        }

        previousAvailableByCategoryId = new Map(
            periodState.allocations.map((allocation) => [
                allocation.categoryId,
                allocation.availableCents,
            ]),
        );
        previousUncategorizedAvailableCents =
            uncategorizedAllocation.availableCents;
    }

    return {
        allocations: [
            createUncategorizedAllocation({
                activityCents: 0,
                carriedForwardCents: 0,
            }),
        ],
        carriedForwardByCategoryId: new Map<string, number>(),
        categories: [uncategorizedBudgetCategoryState],
        hasSavedAssignments: false,
    };
}

function getFundingAccountSnapshot(
    snapshot: WorkspaceSnapshot,
    periodEndDate: string,
) {
    const activeAccounts = snapshot.accounts.filter((account) =>
        isBudgetFundingAccountEligibleForPeriod(account, periodEndDate),
    );

    return {
        activeAccountCount: activeAccounts.length,
        totalFundsCents: activeAccounts.reduce(
            (total, account) =>
                total +
                calculateAccountBalanceCents(
                    account,
                    snapshot.ledgerPostings,
                    periodEndDate,
                ),
            0,
        ),
    };
}

export function buildBudgetPeriodSummaryFromSnapshot(
    snapshot: WorkspaceSnapshot,
    periodId: string,
): BudgetPeriodSummary {
    const period =
        snapshot.budgetPeriods.find((record) => record.periodId === periodId) ??
        {
            periodId,
            status: "open" as const,
        };
    const periodBounds = getMonthlyPeriodBounds(periodId);
    const {
        allocations,
        categories,
        hasSavedAssignments,
    } = resolveBudgetPeriodState(snapshot, periodId);
    const allocationMap = new Map(
        allocations.map((allocation) => [allocation.categoryId, allocation]),
    );
    const categorySummaries = categories.map((category) =>
        createCategoryAllocationSummary(
            category,
            allocationMap.get(category.categoryId) ?? {
                categoryId: category.categoryId,
                assignedCents: 0,
                carriedForwardCents: 0,
                activityCents: 0,
                availableCents: 0,
            },
        ),
    );
    const currentFundingSnapshot = getFundingAccountSnapshot(
        snapshot,
        periodBounds.endsOn,
    );
    const allocationFundingRows = listOpeningBalanceFundingRowsForPeriod({
        accounts: snapshot.accounts,
        periodId,
    });

    return assembleBudgetPeriodSummary({
        allocationFundingRows,
        categorySummaries,
        currentFundingSnapshot,
        hasSavedAssignments,
        periodId,
        status: period.status,
    });
}
