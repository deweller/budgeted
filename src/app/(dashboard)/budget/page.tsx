import { BudgetWorkspace } from "@/components/workspace/workspace-views";
import {
    resolveBudgetPeriodQuery,
    type BudgetPageSearchParams,
} from "@/features/budget/models/budget-period-query";

type BudgetPageProps = {
    searchParams?: BudgetPageSearchParams;
};

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
    const periodQuery = await resolveBudgetPeriodQuery(searchParams);

    return (
        <BudgetWorkspace initialPeriodId={periodQuery.normalizedPeriodId} />
    );
}
