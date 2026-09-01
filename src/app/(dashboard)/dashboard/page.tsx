import { DashboardWorkspace } from "@/components/workspace/workspace-views";
import {
    resolveBudgetPeriodQuery,
    type BudgetPageSearchParams,
} from "@/features/budget/models/budget-period-query";

type DashboardPageProps = {
    searchParams?: BudgetPageSearchParams;
};

export default async function DashboardPage({
    searchParams,
}: DashboardPageProps) {
    const periodQuery = await resolveBudgetPeriodQuery(searchParams);

    return (
        <DashboardWorkspace initialPeriodId={periodQuery.normalizedPeriodId} />
    );
}
