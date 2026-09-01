import { z } from "zod";

import {
    formatMonthlyPeriodLabel,
    getMonthlyPeriodId,
    isMonthlyPeriodId,
} from "@/modules/ledger/monthly-period";

type BudgetSearchParamRecord = Record<string, string | string[] | undefined>;

export type BudgetPageSearchParams =
    | Promise<BudgetSearchParamRecord>
    | BudgetSearchParamRecord;

export type BudgetPeriodQuery = {
    isFallback: boolean;
    label: string;
    month?: string;
    normalizedPeriodId: string;
    source: "default" | "query";
};

const budgetPeriodQuerySchema = z.object({
    month: z.string().trim().optional(),
});

function toSingleValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export async function resolveBudgetPeriodQuery(
    searchParams?: BudgetPageSearchParams,
    anchor = new Date(),
): Promise<BudgetPeriodQuery> {
    const rawValues = searchParams ? await Promise.resolve(searchParams) : {};
    const fallbackPeriodId = getMonthlyPeriodId(anchor);
    const result = budgetPeriodQuerySchema.safeParse({
        month: toSingleValue(rawValues.month),
    });

    const month = result.success ? result.data.month || undefined : undefined;

    if (month && isMonthlyPeriodId(month)) {
        return {
            isFallback: false,
            label: formatMonthlyPeriodLabel(month),
            month,
            normalizedPeriodId: month,
            source: "query",
        };
    }

    return {
        isFallback: Boolean(month),
        label: formatMonthlyPeriodLabel(fallbackPeriodId),
        month,
        normalizedPeriodId: fallbackPeriodId,
        source: "default",
    };
}
