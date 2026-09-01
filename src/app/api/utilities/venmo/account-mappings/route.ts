import { venmoAccountMappingInputSchema } from "@/features/venmo/models/venmo-api";
import { saveVenmoAccountMapping } from "@/features/venmo/server/venmo-service";
import { handleWorkspaceRoute, workspacePublishedMutationJson } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function PUT(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, venmoAccountMappingInputSchema);
        return workspacePublishedMutationJson(context, () => saveVenmoAccountMapping({ ...input, ledgerId: context.ledgerId }));
    });
}
