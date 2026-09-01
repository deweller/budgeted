import { autoAssignSourceUpdateSchema } from "@/features/budget/models/auto-assign-source";
import { updateAutoAssignSourcesWithWorkspaceChanges } from "@/features/budget/server/auto-assign-source-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function PUT(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(
            request,
            autoAssignSourceUpdateSchema,
        );

        return workspacePublishedMutationJson(context, () =>
            updateAutoAssignSourcesWithWorkspaceChanges(context.ledgerId, input),
        );
    });
}
