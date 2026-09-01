import { z } from "zod";

import { allocationWithFundingSchema } from "@/features/budget/models/allocation-funding";
import {
    replaceBudgetAllocationsWithWorkspaceChanges,
    resetBudgetAllocationsWithWorkspaceChanges,
} from "@/features/budget/server/allocation-service";
import { HttpError } from "@/lib/api/errors";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";
import { isMonthlyPeriodId } from "@/modules/ledger";

const allocationUpdateSchema = z.object({
    allocations: z.array(allocationWithFundingSchema),
});

export async function PUT(
    request: Request,
    context: { params: Promise<{ periodId: string }> | { periodId: string } },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { allocations } = await parseJsonBody(
            request,
            allocationUpdateSchema,
        );
        const { periodId } = await Promise.resolve(context.params);

        if (!isMonthlyPeriodId(periodId)) {
            throw new HttpError(
                422,
                "validation_error",
                "Budget period identifiers must use YYYY-MM format.",
            );
        }

        return workspacePublishedMutationJson(workspaceContext, async () => {
            const result = await replaceBudgetAllocationsWithWorkspaceChanges(
                workspaceContext.ledgerId,
                periodId,
                allocations,
            );

            return {
                ...result.summary,
                workspaceChanges: result.workspaceChanges,
            };
        });
    });
}

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ periodId: string }> | { periodId: string } },
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { periodId } = await Promise.resolve(context.params);

        if (!isMonthlyPeriodId(periodId)) {
            throw new HttpError(
                422,
                "validation_error",
                "Budget period identifiers must use YYYY-MM format.",
            );
        }

        return workspacePublishedMutationJson(workspaceContext, async () => {
            const result = await resetBudgetAllocationsWithWorkspaceChanges(
                workspaceContext.ledgerId,
                periodId,
            );

            return {
                ...result.summary,
                workspaceChanges: result.workspaceChanges,
            };
        });
    });
}
