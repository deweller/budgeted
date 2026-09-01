import { transactionClassificationApplyRequestSchema } from "@/features/transaction-classification/models/transaction-classification";
import { applyTransactionClassificationSuggestions } from "@/features/transaction-classification/server/transaction-classification-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationApplyRequestSchema,
        );
        return workspacePublishedMutationJson(context, () =>
            applyTransactionClassificationSuggestions({
                actorUserId: context.user.userId,
                fieldSelections: payload.fieldSelections,
                ledgerId: context.ledgerId,
                modelId: payload.modelId,
                mutationId: payload.mutationId,
                suggestions: payload.suggestions,
            }),
        );
    });
}
