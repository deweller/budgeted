import { deletionConfirmationSchema } from "@/features/shared/models/delete-request";
import { transactionInputSchema } from "@/features/transactions/models/transaction-form";
import {
    deleteTransactionWithWorkspaceChanges,
    getTransactionDeletionImpact,
} from "@/features/transactions/server/transaction-delete-service";
import { upsertTransactionWithWorkspaceChanges } from "@/features/transactions/server/transaction-save-service";
import {
    executeWorkspaceMutationWithReplay,
} from "@/features/workspace/server/workspace-sync-service";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";

export async function GET(
    _request: Request,
    context: { params: Promise<{ transactionId: string }> },
) {
    return workspaceReadJson(async (workspaceContext) => {
        const { transactionId } = await context.params;
        return getTransactionDeletionImpact(
            workspaceContext.ledgerId,
            transactionId,
        );
    });
}

export async function PATCH(
    request: Request,
    context: { params: Promise<{ transactionId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        return workspaceCommittedMutationJson(workspaceContext, async () => {
            const { transactionId } = await context.params;
            const payload = await parseJsonBody(request, transactionInputSchema);
            const mutationId = payload.mutationId ?? createWorkspaceMutationId();
            const mutationType = `transaction.update:${transactionId}`;
            const execution = await executeWorkspaceMutationWithReplay({
                execute: () =>
                    upsertTransactionWithWorkspaceChanges(workspaceContext.ledgerId, {
                        transactionId,
                        ...payload,
                        audit: {
                            actorUserId: workspaceContext.user.userId,
                            source: "manual",
                        },
                        workspaceMutation: {
                            mutationId,
                            mutationType,
                        },
                    }),
                ledgerId: workspaceContext.ledgerId,
                mutationId,
                mutationType,
            });

            if (execution.batch) {
                return {
                    ...(execution.batch.response as { transaction: unknown }),
                    workspaceChanges: execution.batch.changes,
                };
            }

            return {
                transaction: execution.result.transaction,
                workspaceChanges: execution.result.workspaceChanges,
            };
        });
    });
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ transactionId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        return workspaceCommittedMutationJson(workspaceContext, async () => {
            const { transactionId } = await context.params;
            const payload = await parseJsonBody(
                request,
                deletionConfirmationSchema,
            );
            const mutationId = payload.mutationId ?? createWorkspaceMutationId();
            const mutationType = `transaction.delete:${transactionId}`;
            const execution = await executeWorkspaceMutationWithReplay({
                execute: () =>
                    deleteTransactionWithWorkspaceChanges(
                        workspaceContext.ledgerId,
                        transactionId,
                        payload.previewRevision,
                        {
                            actorUserId: workspaceContext.user.userId,
                            source: "manual",
                        },
                        { mutationId, mutationType },
                    ),
                ledgerId: workspaceContext.ledgerId,
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
