import { accountReconciliationCommitSchema } from "@/features/accounts/models/account-reconciliation";
import { commitAccountReconciliationWithWorkspaceChanges } from "@/features/accounts/server/account-reconciliation-service";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";

export async function POST(
    request: Request,
    context: { params: Promise<{ accountId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        return workspaceCommittedMutationJson(workspaceContext, async () => {
            const { accountId } = await context.params;
            const payload = await parseJsonBody(
                request,
                accountReconciliationCommitSchema,
            );

            return commitAccountReconciliationWithWorkspaceChanges({
                accountId,
                actorUserId: workspaceContext.user.userId,
                commit: payload,
                ledgerId: workspaceContext.ledgerId,
                mutationId: payload.mutationId ?? createWorkspaceMutationId(),
            });
        });
    });
}
