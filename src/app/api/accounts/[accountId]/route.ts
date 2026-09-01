import { accountUpdateSchema } from "@/features/accounts/models/account-form";
import { deletionConfirmationSchema } from "@/features/shared/models/delete-request";
import {
    deleteAccountWithWorkspaceChanges,
    getAccountDeletionImpact,
    upsertAccountWithWorkspaceChanges,
} from "@/features/accounts/server/account-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET(
    _request: Request,
    context: { params: Promise<{ accountId: string }> },
) {
    return workspaceReadJson(async (workspaceContext) => {
        const { accountId } = await context.params;
        return getAccountDeletionImpact(
            workspaceContext.ledgerId,
            accountId,
        );
    });
}

export async function PATCH(
    request: Request,
    context: { params: Promise<{ accountId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { accountId } = await context.params;
        const payload = await parseJsonBody(request, accountUpdateSchema);
        return workspacePublishedMutationJson(workspaceContext, async () => {
            const result = await upsertAccountWithWorkspaceChanges(
                workspaceContext.ledgerId,
                {
                    accountId,
                    ...payload,
                },
            );

            return {
                ...result.account,
                workspaceChanges: result.workspaceChanges,
            };
        });
    });
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ accountId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { accountId } = await context.params;
        const payload = await parseJsonBody(
            request,
            deletionConfirmationSchema,
        );

        return workspacePublishedMutationJson(workspaceContext, () =>
            deleteAccountWithWorkspaceChanges(
                workspaceContext.ledgerId,
                accountId,
                payload.previewRevision,
            ),
        );
    });
}
