import type { ReportingQuery } from "@/features/reporting/models/reporting-query";
import type { ReportingView } from "@/features/reporting/server/reporting-service";
import {
    buildBudgetReportingSignals,
    buildUncategorizedActivityAttentionStates,
    createEmptyBudgetReportingSignals,
    listMonthlyPeriodIdsInRange,
} from "@/features/reporting/models/reporting-signals";
import { isTransactionDateInRange } from "@/features/transactions/models/transaction-date";
import {
    buildAccountHealthSnapshot,
    buildReportingSummary,
    hasReportableActivity,
} from "@/modules/reporting";
import { transactionHasAccountActivity } from "@/modules/ledger";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";
import { buildBudgetPeriodSummaryFromSnapshot } from "@/lib/workspace/budget-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

export function buildReportingViewFromSnapshot(
    snapshot: WorkspaceSnapshot,
    query: ReportingQuery,
): ReportingView {
    const selectedAccount = query.accountId
        ? snapshot.accounts.find((account) => account.accountId === query.accountId)
        : undefined;
    const filteredAccounts = selectedAccount
        ? [selectedAccount]
        : snapshot.accounts;
    const visibleCategories = snapshot.budgetCategories.filter(
        isUserVisibleBudgetCategory,
    );
    const visibleTransactions = snapshot.transactions.filter(
        (transaction) =>
            transaction.status !== "voided" &&
            (!selectedAccount ||
                transactionHasAccountActivity(transaction, selectedAccount)) &&
            isTransactionDateInRange(
                transaction.occurredAt,
                query.startDate,
                query.endDate,
            ),
    );
    const periodIds = listMonthlyPeriodIdsInRange(
        query.startDate,
        query.endDate,
    );
    const budgetSignals = selectedAccount
        ? createEmptyBudgetReportingSignals()
        : buildBudgetReportingSignals({
              categories: visibleCategories,
              periods: periodIds.map((periodId) => ({
                  periodId,
                  summary: buildBudgetPeriodSummaryFromSnapshot(
                      snapshot,
                      periodId,
                  ),
              })),
          });
    const reportingAccounts = filteredAccounts.map((account) => ({
        accountId: account.accountId,
        balanceCents: account.balanceCents ?? 0,
        ledgerAccountId: account.ledgerAccountId,
    }));
    const reportingTransactions = visibleTransactions.map((transaction) => ({
        displayAmountCents: transaction.displayAmountCents,
        periodId: transaction.periodId,
        postings: transaction.postings ?? [],
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

    return {
        accountHealth: buildAccountHealthSnapshot(
            filteredAccounts.map((account) => ({
                accountId: account.accountId,
                balanceCents: account.balanceCents ?? 0,
            })),
        ),
        accounts: snapshot.accounts,
        attentionStates: summary.attentionStates,
        carryForwardDetails: budgetSignals.carryForwardDetails,
        carryForwardSummaries: budgetSignals.carryForwardSummaries,
        categoryTotals: summary.categoryTotals,
        endDate: query.endDate,
        hasReportableActivity: hasReportableActivity({
            accounts: reportingAccounts,
            attentionStates: summary.attentionStates,
            carryForwardSummaries: budgetSignals.carryForwardSummaries,
            categoryTotals: summary.categoryTotals,
            transactions: reportingTransactions,
        }),
        inflowCents: summary.inflowCents,
        netWorthCents: summary.netWorthCents,
        outflowCents: summary.outflowCents,
        periodComparisons: summary.periodComparisons,
        selectedAccountId: selectedAccount?.accountId,
        startDate: query.startDate,
    };
}
