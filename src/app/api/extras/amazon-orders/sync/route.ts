import { amazonOrderSyncInputSchema } from "@/features/amazon/models/amazon-api";
import {
    launchAmazonOrderSync,
    syncLatestAmazonOrders,
} from "@/features/amazon/server/amazon-order-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, amazonOrderSyncInputSchema);

        return workspacePublishedMutationJson(context, async () => {
            if (input.mode === "launch") {
                return launchAmazonOrderSync(context.ledgerId);
            }

            return syncLatestAmazonOrders(context.ledgerId);
        });
    });
}
