import { deleteVenmoAccountMapping } from "@/features/venmo/server/venmo-service";
import { handleWorkspaceRoute, workspacePublishedMutationJson } from "@/lib/api/workspace-route";

export async function DELETE(_request: Request, { params }: { params: Promise<{ mappingId: string }> }) {
    return handleWorkspaceRoute(async (context) => {
        const { mappingId } = await params;
        return workspacePublishedMutationJson(context, () => deleteVenmoAccountMapping({ ledgerId: context.ledgerId, mappingId }));
    });
}
