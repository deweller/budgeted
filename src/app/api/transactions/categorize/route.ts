import { transactionBulkCategorizeSchema } from "@/features/transactions/models/transaction-form";
import {
    categorizeTransactionsWithWorkspaceChanges,
    validateCategorizeWorkspaceMutation,
} from "@/features/transactions/server/transaction-categorize-service";
import { executeWorkspaceMutationWithReplay } from "@/features/workspace/server/workspace-sync-service";
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
                transactionBulkCategorizeSchema,
            );
            const mutationId = payload.mutationId ?? createWorkspaceMutationId();
            const mutationType = "transaction.categorize";
            const execution = await executeWorkspaceMutationWithReplay({
                execute: () =>
                    categorizeTransactionsWithWorkspaceChanges({
                        actorUserId: context.user.userId,
                        categoryId: payload.categoryId,
                        ledgerId: context.ledgerId,
                        transactionIds: payload.transactionIds,
                        workspaceMutation: { mutationId, mutationType },
                    }),
                ledgerId: context.ledgerId,
                mutationId,
                mutationType,
                validateExistingMutation: () =>
                    validateCategorizeWorkspaceMutation({
                        categoryId: payload.categoryId,
                        ledgerId: context.ledgerId,
                        transactionIds: payload.transactionIds,
                        workspaceMutation: { mutationId, mutationType },
                    }),
            });

            if (execution.batch) {
                return {
                    ...(execution.batch.response as { updatedCount: number }),
                    workspaceChanges: execution.batch.changes,
                };
            }

            return {
                updatedCount: execution.result.updatedCount,
                workspaceChanges: execution.result.workspaceChanges,
            };
        });
    });
}
