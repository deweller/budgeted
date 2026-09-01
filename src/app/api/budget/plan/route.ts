import { globalPlanFormSchema } from "@/features/budget/models/global-plan-form";
import {
    listGlobalPlan,
    updateGlobalPlanWithWorkspaceChanges,
} from "@/features/budget/server/global-plan-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return workspaceReadJson((context) => listGlobalPlan(context.ledgerId));
}

export async function PUT(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, globalPlanFormSchema);
        return workspacePublishedMutationJson(context, async () => {
            const result = await updateGlobalPlanWithWorkspaceChanges(
                context.ledgerId,
                input,
            );

            return {
                ...result.plan,
                workspaceChanges: result.workspaceChanges,
            };
        });
    });
}
