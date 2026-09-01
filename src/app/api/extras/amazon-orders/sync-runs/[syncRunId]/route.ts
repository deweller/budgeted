import { pollAmazonOrderSyncRun } from "@/features/amazon/server/amazon-order-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ syncRunId: string }> },
) {
    return handleWorkspaceRoute(async (context) => {
        const { syncRunId } = await params;

        return workspacePublishedMutationJson(context, () =>
            pollAmazonOrderSyncRun({
                ledgerId: context.ledgerId,
                syncRunId,
            }),
        );
    });
}
