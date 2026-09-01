import { amazonOrderSettingsInputSchema } from "@/features/amazon/models/amazon-api";
import { saveAmazonOrderSettingsWithWorkspaceChanges } from "@/features/amazon/server/amazon-order-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function PUT(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(
            request,
            amazonOrderSettingsInputSchema,
        );

        return workspacePublishedMutationJson(context, async () => {
            const result = await saveAmazonOrderSettingsWithWorkspaceChanges({
                accountId: input.accountId,
                ledgerId: context.ledgerId,
            });

            return {
                ...result.integration,
                workspaceChanges: result.workspaceChanges,
            };
        });
    });
}
