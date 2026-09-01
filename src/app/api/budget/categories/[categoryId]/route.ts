import { deletionConfirmationSchema } from "@/features/shared/models/delete-request";
import {
    deleteBudgetCategory,
    getBudgetCategoryDeletionImpact,
} from "@/features/budget/server/category-service";
import {
    handleWorkspaceRoute,
    workspaceTrackedMutationNoContent,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET(
    _request: Request,
    context: { params: Promise<{ categoryId: string }> },
) {
    return workspaceReadJson(async (workspaceContext) => {
        const { categoryId } = await context.params;
        return getBudgetCategoryDeletionImpact(
            workspaceContext.ledgerId,
            categoryId,
        );
    });
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ categoryId: string }> },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { categoryId } = await context.params;
        const payload = await parseJsonBody(
            request,
            deletionConfirmationSchema,
        );

        return workspaceTrackedMutationNoContent(workspaceContext, () =>
            deleteBudgetCategory(
                workspaceContext.ledgerId,
                categoryId,
                payload.previewRevision,
            ),
        );
    });
}
