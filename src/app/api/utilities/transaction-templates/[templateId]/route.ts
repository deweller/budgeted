import { transactionTemplateInputSchema } from "@/features/transaction-templates/models/transaction-template";
import {
    deleteTransactionTemplateWithWorkspaceChanges,
    updateTransactionTemplateWithWorkspaceChanges,
} from "@/features/transaction-templates/server/transaction-template-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function PATCH(
    request: Request,
    context: { params: Promise<{ templateId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { templateId } = await context.params;
        const input = await parseJsonBody(request, transactionTemplateInputSchema);

        return workspacePublishedMutationJson(workspaceContext, async () => {
            const result = await updateTransactionTemplateWithWorkspaceChanges(
                workspaceContext.ledgerId,
                templateId,
                input,
            );

            return {
                ...result.template,
                workspaceChanges: result.workspaceChanges,
            };
        });
    });
}

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ templateId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { templateId } = await context.params;

        return workspacePublishedMutationJson(workspaceContext, () =>
            deleteTransactionTemplateWithWorkspaceChanges(
                workspaceContext.ledgerId,
                templateId,
            ),
        );
    });
}
