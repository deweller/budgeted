import {
    buildCategoryAttentionStates,
    type AttentionState,
    type CarryForwardSummary,
} from "@/modules/budgeting";
import { getMonthlyPeriodId, shiftMonthlyPeriod } from "@/modules/ledger";
import { isUncategorizedAccountMovementLine } from "@/features/transactions/models/transaction-line-normalization";

export type CarryForwardDetail = CarryForwardSummary & {
    periodId: string;
};

export type BudgetReportingSignals = {
    attentionStates: AttentionState[];
    carryForwardDetails: CarryForwardDetail[];
    carryForwardSummaries: CarryForwardSummary[];
};

export type BudgetReportingCategory = {
    categoryId: string;
    name: string;
};

export type BudgetReportingPeriodSummary = {
    availableToBudgetCents: number;
    categories: Array<{
        availableCents: number;
        carriedForwardCents: number;
        categoryId: string;
    }>;
};

export type UncategorizedAttentionTransaction = {
    kind: "standard" | "adjustment";
    lines: Array<{
        categoryId?: string | null;
        fromAccountId?: string | null;
        toAccountId?: string | null;
    }>;
    periodId: string;
    status: string;
    transactionId: string;
};

export function listMonthlyPeriodIdsInRange(
    startDate: string,
    endDate: string,
) {
    const periodIds: string[] = [];
    let currentPeriodId = getMonthlyPeriodId(startDate);
    const endPeriodId = getMonthlyPeriodId(endDate);

    while (currentPeriodId <= endPeriodId) {
        periodIds.push(currentPeriodId);
        currentPeriodId = shiftMonthlyPeriod(currentPeriodId, 1).periodId;
    }

    return periodIds;
}

export function createEmptyBudgetReportingSignals(): BudgetReportingSignals {
    return {
        attentionStates: [],
        carryForwardDetails: [],
        carryForwardSummaries: [],
    };
}

export function buildBudgetReportingSignals(input: {
    categories: BudgetReportingCategory[];
    periods: Array<{
        periodId: string;
        summary?: BudgetReportingPeriodSummary | null;
    }>;
}): BudgetReportingSignals {
    const categoriesById = new Map(
        input.categories.map((category) => [category.categoryId, category]),
    );
    const attentionStates: AttentionState[] = [];
    const carryForwardDetails: CarryForwardDetail[] = [];

    for (const { periodId, summary } of input.periods) {
        if (!summary) {
            continue;
        }

        if (summary.availableToBudgetCents < 0) {
            attentionStates.push({
                code: "validationWarning",
                severity: "critical",
                message: `${periodId} is over-assigned against available funds.`,
                categoryId: null,
                transactionId: null,
            });
        }

        for (const allocation of summary.categories) {
            const category = categoriesById.get(allocation.categoryId);

            if (!category) {
                continue;
            }

            attentionStates.push(
                ...buildBudgetAttentionStatesForPeriod({
                    periodId,
                    categoryId: category.categoryId,
                    categoryName: category.name,
                    availableCents: allocation.availableCents,
                    carriedForwardCents: allocation.carriedForwardCents,
                }),
            );

            if (allocation.carriedForwardCents !== 0) {
                carryForwardDetails.push({
                    periodId,
                    categoryId: category.categoryId,
                    categoryName: category.name,
                    carryForwardCents: allocation.carriedForwardCents,
                    reducedByOverspending: allocation.carriedForwardCents < 0,
                });
            }
        }
    }

    return {
        attentionStates,
        carryForwardDetails,
        carryForwardSummaries:
            mapCarryForwardDetailsToSummaries(carryForwardDetails),
    };
}

export function buildUncategorizedActivityAttentionStates(
    transactions: UncategorizedAttentionTransaction[],
) {
    return transactions
        .filter(
            (transaction) =>
                transaction.status !== "voided" &&
                transaction.kind === "standard" &&
                transaction.lines.some(isUncategorizedAccountMovementLine),
        )
        .map<AttentionState>((transaction) => ({
            code: "uncategorizedActivity",
            severity: "warning",
            message: `Uncategorized activity was recorded in ${transaction.periodId}.`,
            categoryId: null,
            transactionId: transaction.transactionId,
        }));
}

function buildBudgetAttentionStatesForPeriod(input: {
    availableCents: number;
    carriedForwardCents: number;
    categoryId: string;
    categoryName: string;
    periodId: string;
}) {
    const states = buildCategoryAttentionStates({
        availableCents: input.availableCents,
        carriedForwardCents: input.carriedForwardCents,
        categoryId: input.categoryId,
        name: input.categoryName,
    });

    return states.map((state) => ({
        ...state,
        message:
            state.code === "overspending"
                ? `${input.categoryName} ended ${input.periodId} overspent.`
                : `${input.categoryName} started ${input.periodId} reduced by overspending.`,
    }));
}

function mapCarryForwardDetailsToSummaries(
    details: CarryForwardDetail[],
): CarryForwardSummary[] {
    return details.map((detail) => ({
        categoryId: detail.categoryId,
        categoryName: detail.categoryName,
        carryForwardCents: detail.carryForwardCents,
        reducedByOverspending: detail.reducedByOverspending,
    }));
}
