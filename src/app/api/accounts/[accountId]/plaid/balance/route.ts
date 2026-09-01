import { syncPlaidAccountBalanceWithWorkspaceChanges } from "@/features/plaid/server/plaid-service";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
} from "@/lib/api/workspace-route";

export async function POST(
    _request: Request,
    context: { params: Promise<{ accountId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { accountId } = await context.params;
        return workspaceCommittedMutationJson(workspaceContext, () =>
            syncPlaidAccountBalanceWithWorkspaceChanges(
                {
                    ledgerId: workspaceContext.ledgerId,
                },
                accountId,
            ),
        );
    });
}
