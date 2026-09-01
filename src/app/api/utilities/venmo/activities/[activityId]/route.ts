import { deleteVenmoActivity } from "@/features/venmo/server/venmo-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ activityId: string }> },
) {
    return handleWorkspaceRoute(async (context) => {
        const { activityId } = await params;

        return workspacePublishedMutationJson(context, () =>
            deleteVenmoActivity({
                activityId,
                ledgerId: context.ledgerId,
            }),
        );
    });
}
