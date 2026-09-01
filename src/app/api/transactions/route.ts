import {
    transactionBulkDeleteSchema,
    transactionInputSchema,
    transactionQuerySchema,
} from "@/features/transactions/models/transaction-form";
import {
    deleteTransactionsWithWorkspaceChanges,
    validateDeleteWorkspaceMutation,
} from "@/features/transactions/server/transaction-delete-service";
import { listTransactions } from "@/features/transactions/server/transaction-query-service";
import { upsertTransactionWithWorkspaceChanges } from "@/features/transactions/server/transaction-save-service";
import {
    executeWorkspaceMutationWithReplay,
} from "@/features/workspace/server/workspace-sync-service";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody, parseSearchParams } from "@/lib/api/validation";
import { createWorkspaceMutationId } from "@/lib/workspace/mutation-id";

export async function GET(request: Request) {
    return workspaceReadJson((context) => {
        const filters = parseSearchParams(
            new URL(request.url),
            transactionQuerySchema,
        );
        return listTransactions(context.ledgerId, filters);
    });
}

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        return workspaceCommittedMutationJson(
            context,
            async () => {
                const payload = await parseJsonBody(
                    request,
                    transactionInputSchema,
                );
                const mutationId =
                    payload.mutationId ?? createWorkspaceMutationId();
                const mutationType = "transaction.create";
                const execution = await executeWorkspaceMutationWithReplay({
                    execute: () =>
                        upsertTransactionWithWorkspaceChanges(context.ledgerId, {
                            ...payload,
                            audit: {
                                actorUserId: context.user.userId,
                                source: "manual",
                            },
                            workspaceMutation: { mutationId, mutationType },
                        }),
                    ledgerId: context.ledgerId,
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
            },
            { status: 201 },
        );
    });
}

export async function DELETE(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        return workspaceCommittedMutationJson(context, async () => {
            const payload = await parseJsonBody(
                request,
                transactionBulkDeleteSchema,
            );
            const mutationId = payload.mutationId ?? createWorkspaceMutationId();
            const mutationType = "transaction.bulkDelete";
            const execution = await executeWorkspaceMutationWithReplay({
                execute: () =>
                    deleteTransactionsWithWorkspaceChanges(
                        context.ledgerId,
                        payload.transactionIds,
                        payload.previewRevision,
                        {
                            actorUserId: context.user.userId,
                            source: "manual",
                        },
                        { mutationId, mutationType },
                    ),
                ledgerId: context.ledgerId,
                mutationId,
                mutationType,
                validateExistingMutation: () =>
                    validateDeleteWorkspaceMutation({
                        ledgerId: context.ledgerId,
                        previewRevision: payload.previewRevision,
                        transactionIds: payload.transactionIds,
                        workspaceMutation: { mutationId, mutationType },
                    }),
            });

            if (execution.batch) {
                return {
                    ...(execution.batch.response as { deletedCount: number }),
                    workspaceChanges: execution.batch.changes,
                };
            }

            return {
                deletedCount: execution.result.deletedCount,
                workspaceChanges: execution.result.workspaceChanges,
            };
        });
    });
}
