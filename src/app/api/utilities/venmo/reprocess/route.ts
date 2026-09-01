import { reconcileVenmoActivities } from "@/features/venmo/server/venmo-service";
import { handleWorkspaceRoute, workspacePublishedMutationJson } from "@/lib/api/workspace-route";

export async function POST() {
    return handleWorkspaceRoute((context) =>
        workspacePublishedMutationJson(context, async () => ({
            ...(await reconcileVenmoActivities(context.ledgerId)),
            reprocessedAt: new Date().toISOString(),
        })),
    );
}
