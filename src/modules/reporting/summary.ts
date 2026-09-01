import {
    getPostingDelta,
    sumFinancialPostingDeltas,
} from "@/modules/ledger";
import type { AttentionState, CarryForwardSummary } from "@/modules/budgeting";
import { getOrCreateMapValue } from "@/lib/collections";

type ReportingAccount = {
    accountId: string;
    balanceCents: number;
    ledgerAccountId?: string;
};

type ReportingCategory = {
    categoryId: string;
    ledgerAccountId: string;
    name: string;
};

type ReportingPosting = {
    amountCents: number;
    direction: "debit" | "credit";
    ledgerAccountId: string;
    ledgerAccountKind: "financial" | "category" | "equity";
};

type ReportingTransaction = {
    displayAmountCents: number;
    periodId: string;
    postings: ReportingPosting[];
};

export type CategoryReportTotal = {
    categoryId: string;
    name: string;
    reducedByOverspending: boolean;
    spentCents: number;
};

export type PeriodComparison = {
    inflowCents: number;
    netChangeCents: number;
    outflowCents: number;
    periodId: string;
};

export type ReportingSummarySnapshot = {
    attentionStates: AttentionState[];
    carryForwardSummaries: CarryForwardSummary[];
    categoryTotals: CategoryReportTotal[];
    inflowCents: number;
    netWorthCents: number;
    outflowCents: number;
    periodComparisons: PeriodComparison[];
};

export type ReportableActivityInput = Pick<
    ReportingSummarySnapshot,
    "attentionStates" | "categoryTotals" | "carryForwardSummaries"
> & {
    accounts: ReportingAccount[];
    transactions: ReportingTransaction[];
};

export type AccountHealthSnapshot = {
    accountCount: number;
    assetBalanceCents: number;
    liabilityBalanceCents: number;
    netWorthCents: number;
};

function comparePeriod(
    left: { periodId: string },
    right: { periodId: string },
) {
    return left.periodId.localeCompare(right.periodId);
}

export function buildAccountHealthSnapshot(
    accounts: ReportingAccount[],
): AccountHealthSnapshot {
    return accounts.reduce<AccountHealthSnapshot>(
        (snapshot, account) => ({
            accountCount: snapshot.accountCount + 1,
            assetBalanceCents:
                snapshot.assetBalanceCents +
                (account.balanceCents > 0 ? account.balanceCents : 0),
            liabilityBalanceCents:
                snapshot.liabilityBalanceCents +
                (account.balanceCents < 0 ? Math.abs(account.balanceCents) : 0),
            netWorthCents: snapshot.netWorthCents + account.balanceCents,
        }),
        {
            accountCount: 0,
            assetBalanceCents: 0,
            liabilityBalanceCents: 0,
            netWorthCents: 0,
        },
    );
}

export function buildReportingSummary(input: {
    accounts: ReportingAccount[];
    attentionStates: AttentionState[];
    carryForwardSummaries: CarryForwardSummary[];
    categories: ReportingCategory[];
    transactions: ReportingTransaction[];
}): ReportingSummarySnapshot {
    const categoryByLedgerAccountId = new Map(
        input.categories.map((category) => [
            category.ledgerAccountId,
            category,
        ]),
    );
    const reducedCarryForwardCategoryIds = new Set(
        input.carryForwardSummaries
            .filter((summary) => summary.reducedByOverspending)
            .map((summary) => summary.categoryId),
    );
    const categoryTotals = new Map<string, CategoryReportTotal>();
    const periodComparisons = new Map<string, PeriodComparison>();
    const financialLedgerAccountIds = new Set(
        input.accounts
            .map((account) => account.ledgerAccountId)
            .filter((ledgerAccountId): ledgerAccountId is string =>
                Boolean(ledgerAccountId),
            ),
    );

    let inflowCents = 0;
    let outflowCents = 0;

    for (const transaction of input.transactions) {
        const periodComparison = getOrCreateMapValue(
            periodComparisons,
            transaction.periodId,
            () => ({
                periodId: transaction.periodId,
                inflowCents: 0,
                outflowCents: 0,
                netChangeCents: 0,
            }),
        );

        const financialNetCents = sumFinancialPostingDeltas({
            ledgerAccountIds: financialLedgerAccountIds,
            postings: transaction.postings,
        });

        if (financialNetCents > 0) {
            periodComparison.inflowCents += financialNetCents;
            inflowCents += financialNetCents;
        }

        if (financialNetCents < 0) {
            periodComparison.outflowCents += Math.abs(financialNetCents);
            outflowCents += Math.abs(financialNetCents);
        }

        periodComparison.netChangeCents += financialNetCents;

        for (const posting of transaction.postings) {
            if (posting.ledgerAccountKind !== "category") {
                continue;
            }

            const category = categoryByLedgerAccountId.get(
                posting.ledgerAccountId,
            );

            if (!category) {
                continue;
            }

            const categoryTotal = getOrCreateMapValue(
                categoryTotals,
                category.categoryId,
                () => ({
                    categoryId: category.categoryId,
                    name: category.name,
                    spentCents: 0,
                    reducedByOverspending: reducedCarryForwardCategoryIds.has(
                        category.categoryId,
                    ),
                }),
            );

            categoryTotal.spentCents += getPostingDelta(posting);
        }
    }

    return {
        attentionStates: input.attentionStates,
        carryForwardSummaries: input.carryForwardSummaries,
        categoryTotals: [...categoryTotals.values()].sort(
            (left, right) =>
                Math.abs(right.spentCents) - Math.abs(left.spentCents) ||
                left.name.localeCompare(right.name),
        ),
        inflowCents,
        outflowCents,
        netWorthCents: buildAccountHealthSnapshot(input.accounts).netWorthCents,
        periodComparisons: [...periodComparisons.values()].sort(comparePeriod),
    };
}

export function hasReportableActivity(input: ReportableActivityInput) {
    return (
        input.transactions.length > 0 ||
        input.accounts.some((account) => account.balanceCents !== 0) ||
        input.categoryTotals.some((total) => total.spentCents !== 0) ||
        input.carryForwardSummaries.length > 0 ||
        input.attentionStates.length > 0
    );
}
