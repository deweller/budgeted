import { venmoManualMatchInputSchema } from "@/features/venmo/models/venmo-api";
import { manuallyMatchVenmoActivity } from "@/features/venmo/server/venmo-service";
import { handleWorkspaceRoute, workspacePublishedMutationJson } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
    return handleWorkspaceRoute(async (context) => {
        const [{ activityId }, input] = await Promise.all([params, parseJsonBody(request, venmoManualMatchInputSchema)]);
        return workspacePublishedMutationJson(context, () => manuallyMatchVenmoActivity({ activityId, ledgerId: context.ledgerId, transactionId: input.transactionId }));
    });
}
