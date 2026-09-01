import { syncPlaidAccount } from "@/features/plaid/server/plaid-service";
import { plaidSyncRequestSchema } from "@/features/plaid/models/plaid-requests";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
} from "@/lib/api/workspace-route";

export async function POST(
    request: Request,
    context: { params: Promise<{ accountId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { accountId } = await context.params;
        const text = await request.text();
        const payload = plaidSyncRequestSchema.parse(
            text ? JSON.parse(text) : {},
        );
        return workspaceCommittedMutationJson(workspaceContext, () =>
            syncPlaidAccount(
                {
                    ledgerId: workspaceContext.ledgerId,
                },
                accountId,
                payload,
            ),
        );
    });
}
