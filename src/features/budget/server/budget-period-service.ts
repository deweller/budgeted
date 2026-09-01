import {
    buildCategoryActivityByCategoryId,
    deriveBudgetPeriodAllocationState,
    listOpeningBalanceFundingRowsForPeriod,
} from "@/modules/budgeting";
import {
    assembleBudgetPeriodSummary,
    createCategoryAllocationSummary,
    type BudgetPeriodSummary,
} from "@/features/budget/models/budget-period-summary";
import { listAccounts } from "@/features/accounts/server/account-service";
import {
    getMonthlyPeriodBounds,
    getMonthlyPeriodId,
    getPreviousMonthlyPeriodId,
} from "@/modules/ledger";
import { isBudgetFundingAccountEligibleForPeriod } from "@/modules/accounts/account-types";
import { getBudgetedSchema } from "@/lib/db/schema";
import {
    toPublicTransactionLineRecord,
    type PersistedTransactionLine,
} from "@/features/transactions/server/transaction-line-service";
import { queryAllPages } from "@/lib/db/query-all-pages";

import {
    isUserVisibleBudgetCategory,
    listBudgetCategories,
} from "./category-service";

function createDefaultBudgetPeriodRecord(ledgerId: string, periodId: string) {
    const bounds = getMonthlyPeriodBounds(periodId);
    const timestamp = `${bounds.startsOn}T00:00:00.000Z`;

    return {
        ledgerId,
        periodId,
        startsOn: bounds.startsOn,
        endsOn: bounds.endsOn,
        currency: "USD" as const,
        status: "open" as const,
        carryForwardFromPeriodId: getPreviousMonthlyPeriodId(periodId),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

async function readBudgetPeriodRecord(ledgerId: string, periodId: string) {
    const { entities } = getBudgetedSchema();
    const existing = await entities.budgetPeriods
        .get({ ledgerId, periodId })
        .go({ consistent: true });

    if (existing.data) {
        return existing.data;
    }

    return createDefaultBudgetPeriodRecord(ledgerId, periodId);
}

async function listPeriodAllocations(ledgerId: string, periodId: string) {
    const { entities } = getBudgetedSchema();
    const allocations = await queryAllPages(
        entities.categoryAllocations.query.byPeriod({ ledgerId, periodId }),
    );

    return allocations;
}

async function listContinuityPeriodIds(ledgerId: string, targetPeriodId: string) {
    const { entities } = getBudgetedSchema();
    const [allocations, transactions] = await Promise.all([
        queryAllPages(
            entities.categoryAllocations.query.byAllocation({ ledgerId }),
            { consistent: true },
        ),
        queryAllPages(entities.transactions.query.byTransaction({ ledgerId }), {
            consistent: true,
        }),
    ]);
    const candidatePeriodIds = new Set([
        ...allocations.map((allocation) => allocation.periodId),
        ...transactions.map((transaction) => transaction.periodId),
        targetPeriodId,
    ]);

    return Array.from(candidatePeriodIds)
        .filter((periodId) => periodId <= targetPeriodId)
        .sort();
}

async function listPeriodActivityByCategoryId(
    ledgerId: string,
    periodId: string,
    categories: Awaited<ReturnType<typeof listBudgetCategories>>,
) {
    const { entities } = getBudgetedSchema();
    const [accountsResult, transactionsResult, linesResult] =
        await Promise.all([
            queryAllPages(entities.accounts.query.byAccount({ ledgerId }), {
                consistent: true,
            }),
            queryAllPages(
                entities.transactions.query.byTransaction({ ledgerId }),
                { consistent: true },
            ),
            queryAllPages(entities.transactionLines.query.byLine({ ledgerId }), {
                consistent: true,
            }),
        ]);

    return buildCategoryActivityByCategoryId({
        accounts: accountsResult,
        categories,
        lines: (linesResult as PersistedTransactionLine[]).map(
            toPublicTransactionLineRecord,
        ),
        periodId,
        transactions: transactionsResult,
    });
}

async function resolveBudgetPeriodState(ledgerId: string, periodId: string) {
    const categories = await listBudgetCategories(ledgerId);
    const visibleCategories = categories.filter(isUserVisibleBudgetCategory);
    const retiredCategoryIds = new Set(
        categories
            .filter((category) => !isUserVisibleBudgetCategory(category))
            .map((category) => category.categoryId),
    );
    const continuityPeriodIds = await listContinuityPeriodIds(ledgerId, periodId);
    let previousAvailableByCategoryId = new Map<string, number>();

    for (const continuityPeriodId of continuityPeriodIds) {
        const [currentAllocations, activityByCategoryId] = await Promise.all([
            listPeriodAllocations(ledgerId, continuityPeriodId),
            listPeriodActivityByCategoryId(
                ledgerId,
                continuityPeriodId,
                visibleCategories,
            ),
        ]);
        const periodState = deriveBudgetPeriodAllocationState({
            activityByCategoryId,
            currentAllocations,
            missingActivityFallback: "zero",
            previousAvailableByCategoryId,
            retiredCategoryIds,
            visibleCategories,
        });

        if (continuityPeriodId === periodId) {
            return {
                ...periodState,
                carriedForwardByCategoryId: previousAvailableByCategoryId,
            };
        }

        previousAvailableByCategoryId = new Map(
            periodState.allocations.map((allocation) => [
                allocation.categoryId,
                allocation.availableCents,
            ]),
        );
    }

    return {
        allocations: [],
        carriedForwardByCategoryId: new Map<string, number>(),
        categories: [],
        hasSavedAssignments: false,
    };
}

function getFundingAccountSnapshotFromAccounts(
    accounts: Awaited<ReturnType<typeof listAccounts>>,
    periodEndDate: string,
) {
    const activeAccounts = accounts.filter((account) =>
        isBudgetFundingAccountEligibleForPeriod(account, periodEndDate),
    );

    return {
        activeAccountCount: activeAccounts.length,
        totalFundsCents: activeAccounts.reduce(
            (total, account) => total + account.balanceCents,
            0,
        ),
    };
}

export async function buildBudgetPeriodSummary(
    ledgerId: string,
    periodId = getMonthlyPeriodId(new Date()),
): Promise<BudgetPeriodSummary> {
    const period = await readBudgetPeriodRecord(ledgerId, periodId);
    const periodBounds = getMonthlyPeriodBounds(periodId);
    const {
        allocations,
        categories,
        hasSavedAssignments,
    } = await resolveBudgetPeriodState(ledgerId, periodId);
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

    const accounts = await listAccounts(ledgerId, periodBounds.endsOn);
    const currentFundingSnapshot = getFundingAccountSnapshotFromAccounts(
        accounts,
        periodBounds.endsOn,
    );
    const allocationFundingRows = listOpeningBalanceFundingRowsForPeriod({
        accounts,
        periodId,
    });

    const summary = assembleBudgetPeriodSummary({
        allocationFundingRows,
        categorySummaries,
        currentFundingSnapshot,
        hasSavedAssignments,
        periodId: period.periodId,
        status: period.status,
    });

    return summary;
}
