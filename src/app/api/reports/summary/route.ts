import { buildReportingRouteSummary } from "@/features/reporting/server/reporting-service";
import { reportingQuerySchema } from "@/features/reporting/models/reporting-query";
import { workspaceReadJson } from "@/lib/api/workspace-route";
import { parseSearchParams } from "@/lib/api/validation";

export async function GET(request: Request) {
    return workspaceReadJson(async (context) => {
        const query = parseSearchParams(
            new URL(request.url),
            reportingQuerySchema,
        );
        const summary = await buildReportingRouteSummary(
            context.ledgerId,
            query,
        );

        return {
            periodStart: summary.startDate,
            periodEnd: summary.endDate,
            inflowCents: summary.inflowCents,
            outflowCents: summary.outflowCents,
            netWorthCents: summary.netWorthCents,
            categoryTotals: summary.categoryTotals,
            attentionStates: summary.attentionStates,
            carryForwardSummaries: summary.carryForwardSummaries,
        };
    });
}
