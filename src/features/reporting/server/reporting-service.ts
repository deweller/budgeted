import type { AttentionState, CarryForwardSummary } from "@/modules/budgeting";
import { getMonthlyPeriodId, shiftMonthlyPeriod } from "@/modules/ledger";
import {
    buildAccountHealthSnapshot,
    buildReportingSummary,
    hasReportableActivity,
    type AccountHealthSnapshot,
    type CategoryReportTotal,
    type PeriodComparison,
} from "@/modules/reporting";

import type { ReportingQuery } from "@/features/reporting/models/reporting-query";
import {
    buildBudgetReportingSignals,
    buildUncategorizedActivityAttentionStates,
    createEmptyBudgetReportingSignals,
    listMonthlyPeriodIdsInRange,
    type CarryForwardDetail,
} from "@/features/reporting/models/reporting-signals";
import { listAccounts } from "@/features/accounts/server/account-service";
import { buildBudgetPeriodSummary } from "@/features/budget/server/budget-period-service";
import {
    isUserVisibleBudgetCategory,
    listBudgetCategories,
} from "@/features/budget/server/category-service";
import { listTransactionsWithPostings } from "@/features/transactions/server/transaction-query-service";
import { HttpError } from "@/lib/api/errors";
import { formatLocalDate } from "@/lib/dates/local-date";

export type ReportingRouteSummary = {
    attentionStates: AttentionState[];
    carryForwardSummaries: CarryForwardSummary[];
    categoryTotals: Array<{
        categoryId: string;
        reducedByOverspending: boolean;
        spentCents: number;
    }>;
    endDate: string;
    inflowCents: number;
    netWorthCents: number;
    outflowCents: number;
    startDate: string;
};

export type ReportingView = {
    accountHealth: AccountHealthSnapshot;
    accounts: Awaited<ReturnType<typeof listAccounts>>;
    attentionStates: AttentionState[];
    carryForwardDetails: CarryForwardDetail[];
    carryForwardSummaries: CarryForwardSummary[];
    categoryTotals: CategoryReportTotal[];
    endDate: string;
    hasReportableActivity: boolean;
    inflowCents: number;
    netWorthCents: number;
    outflowCents: number;
    periodComparisons: PeriodComparison[];
    selectedAccountId?: string;
    startDate: string;
};

export function getDefaultReportingRange(anchor = new Date()) {
    const currentPeriodId = getMonthlyPeriodId(anchor);
    const startPeriod = shiftMonthlyPeriod(currentPeriodId, -2);

    return {
        startDate: startPeriod.startsOn,
        endDate: formatLocalDate(anchor),
    };
}

async function listBudgetSummariesByPeriod(
    ledgerId: string,
    periodIds: string[],
) {
    const pairs = await Promise.all(
        periodIds.map(
            async (periodId) =>
                [
                    periodId,
                    await buildBudgetPeriodSummary(ledgerId, periodId),
                ] as const,
        ),
    );

    return new Map(pairs);
}

export async function buildReportingView(
    ledgerId: string,
    query: ReportingQuery,
): Promise<ReportingView> {
    const [accounts, categories, transactions] = await Promise.all([
        listAccounts(ledgerId),
        listBudgetCategories(ledgerId),
        listTransactionsWithPostings(ledgerId, query),
    ]);
    const visibleCategories = categories.filter(isUserVisibleBudgetCategory);
    const selectedAccount = query.accountId
        ? accounts.find((account) => account.accountId === query.accountId)
        : undefined;

    if (query.accountId && !selectedAccount) {
        throw new HttpError(
            404,
            "account_missing",
            "The selected account could not be found.",
        );
    }

    const filteredAccounts = selectedAccount ? [selectedAccount] : accounts;
    const visibleTransactions = transactions.filter(
        (transaction) => transaction.status !== "voided",
    );
    const periodIds = listMonthlyPeriodIdsInRange(
        query.startDate,
        query.endDate,
    );

    const budgetSignals = selectedAccount
        ? createEmptyBudgetReportingSignals()
        : buildBudgetReportingSignals({
              categories: visibleCategories,
              periods: await listBudgetReportingPeriods(ledgerId, periodIds),
          });

    const reportingAccounts = filteredAccounts.map((account) => ({
        accountId: account.accountId,
        balanceCents: account.balanceCents,
        ledgerAccountId: account.ledgerAccountId,
    }));
    const reportingTransactions = visibleTransactions.map((transaction) => ({
        displayAmountCents: transaction.displayAmountCents,
        periodId: transaction.periodId,
        postings: transaction.postings,
    }));
    const summary = buildReportingSummary({
        accounts: reportingAccounts,
        attentionStates: [
            ...budgetSignals.attentionStates,
            ...buildUncategorizedActivityAttentionStates(visibleTransactions),
        ],
        carryForwardSummaries: budgetSignals.carryForwardSummaries,
        categories: visibleCategories.map((category) => ({
            categoryId: category.categoryId,
            ledgerAccountId: category.ledgerAccountId,
            name: category.name,
        })),
        transactions: reportingTransactions,
    });
    const reportableActivity = hasReportableActivity({
        accounts: reportingAccounts,
        attentionStates: summary.attentionStates,
        carryForwardSummaries: summary.carryForwardSummaries,
        categoryTotals: summary.categoryTotals,
        transactions: reportingTransactions,
    });

    return {
        accountHealth: buildAccountHealthSnapshot(
            filteredAccounts.map((account) => ({
                accountId: account.accountId,
                balanceCents: account.balanceCents,
            })),
        ),
        accounts,
        attentionStates: summary.attentionStates,
        carryForwardDetails: budgetSignals.carryForwardDetails,
        carryForwardSummaries: summary.carryForwardSummaries,
        categoryTotals: summary.categoryTotals,
        startDate: query.startDate,
        endDate: query.endDate,
        hasReportableActivity: reportableActivity,
        inflowCents: summary.inflowCents,
        netWorthCents: summary.netWorthCents,
        outflowCents: summary.outflowCents,
        periodComparisons: summary.periodComparisons,
        selectedAccountId: selectedAccount?.accountId,
    };
}

async function listBudgetReportingPeriods(
    ledgerId: string,
    periodIds: string[],
) {
    const summariesByPeriodId = await listBudgetSummariesByPeriod(
        ledgerId,
        periodIds,
    );

    return periodIds.map((periodId) => ({
        periodId,
        summary: summariesByPeriodId.get(periodId),
    }));
}

export async function buildReportingRouteSummary(
    ledgerId: string,
    query: ReportingQuery,
): Promise<ReportingRouteSummary> {
    const view = await buildReportingView(ledgerId, query);

    return {
        attentionStates: view.attentionStates,
        carryForwardSummaries: view.carryForwardSummaries,
        categoryTotals: view.categoryTotals.map((total) => ({
            categoryId: total.categoryId,
            spentCents: total.spentCents,
            reducedByOverspending: total.reducedByOverspending,
        })),
        startDate: view.startDate,
        endDate: view.endDate,
        inflowCents: view.inflowCents,
        netWorthCents: view.netWorthCents,
        outflowCents: view.outflowCents,
    };
}
