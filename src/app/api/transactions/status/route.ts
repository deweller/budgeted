import { transactionBulkStatusSchema } from "@/features/transactions/models/transaction-form";
import { updateTransactionsStatusWithWorkspaceChanges } from "@/features/transactions/server/transaction-status-mutation-service";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        return workspaceCommittedMutationJson(context, async () => {
            const payload = await parseJsonBody(
                request,
                transactionBulkStatusSchema,
            );

            return updateTransactionsStatusWithWorkspaceChanges({
                actorUserId: context.user.userId,
                ledgerId: context.ledgerId,
                mutationId: payload.mutationId ?? createWorkspaceMutationId(),
                status: payload.status,
                transactionIds: payload.transactionIds,
            });
        });
    });
}
