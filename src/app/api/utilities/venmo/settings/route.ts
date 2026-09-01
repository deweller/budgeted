import { venmoSettingsInputSchema } from "@/features/venmo/models/venmo-api";
import { saveVenmoSettings } from "@/features/venmo/server/venmo-service";
import { handleWorkspaceRoute, workspacePublishedMutationJson } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function PUT(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, venmoSettingsInputSchema);
        return workspacePublishedMutationJson(context, () => saveVenmoSettings({ ...input, ledgerId: context.ledgerId }));
    });
}
