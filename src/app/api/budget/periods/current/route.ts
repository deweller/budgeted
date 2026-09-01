import { buildBudgetPeriodSummary } from "@/features/budget/server/budget-period-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET() {
    return workspaceReadJson((context) =>
        buildBudgetPeriodSummary(context.ledgerId),
    );
}
