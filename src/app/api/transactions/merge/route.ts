import { transactionMergeSchema } from "@/features/transactions/models/transaction-form";
import { mergeTransactionsWithWorkspaceChanges } from "@/features/transactions/server/transaction-merge-service";
import { executeWorkspaceMutationWithReplay } from "@/features/workspace/server/workspace-sync-service";
import { parseJsonBody } from "@/lib/api/validation";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
} from "@/lib/api/workspace-route";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        return workspaceCommittedMutationJson(context, async () => {
            const payload = await parseJsonBody(request, transactionMergeSchema);
            const mutationId = payload.mutationId ?? createWorkspaceMutationId();
            const mutationType = "transaction.merge";
            const execution = await executeWorkspaceMutationWithReplay({
                execute: () =>
                    mergeTransactionsWithWorkspaceChanges(
                        context.ledgerId,
                        payload.transactionIds,
                        {
                            actorUserId: context.user.userId,
                            source: "manual",
                        },
                        { mutationId, mutationType },
                        payload.expectedMatchType,
                    ),
                ledgerId: context.ledgerId,
                mutationId,
                mutationType,
            });

            return execution.batch
                ? {
                      ...(execution.batch.response as object),
                      workspaceChanges: execution.batch.changes,
                  }
                : { workspaceChanges: execution.result.workspaceChanges };
        });
    });
}
