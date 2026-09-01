import { categoryFormSchema } from "@/features/budget/models/category-form";
import { upsertBudgetCategoryWithWorkspaceChanges } from "@/features/budget/server/category-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, categoryFormSchema);
        return workspacePublishedMutationJson(
            context,
            () =>
                upsertBudgetCategoryWithWorkspaceChanges(
                    context.ledgerId,
                    input,
                ),
            { status: 201 },
        );
    });
}
