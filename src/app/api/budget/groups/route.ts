import { groupFormSchema } from "@/features/budget/models/group-form";
import { upsertBudgetGroupWithWorkspaceChanges } from "@/features/budget/server/group-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, groupFormSchema);
        return workspacePublishedMutationJson(
            context,
            () => upsertBudgetGroupWithWorkspaceChanges(context.ledgerId, input),
            { status: 201 },
        );
    });
}
