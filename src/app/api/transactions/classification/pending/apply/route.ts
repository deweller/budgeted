import { transactionClassificationPendingApplyRequestSchema } from "@/features/transaction-classification/models/transaction-classification";
import { applyTransactionClassificationPending } from "@/features/transaction-classification/server/transaction-classification-pending-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationPendingApplyRequestSchema,
        );
        return workspacePublishedMutationJson(context, () =>
            applyTransactionClassificationPending({
                actorUserId: context.user.userId,
                fieldSelection: payload.fieldSelection,
                ledgerId: context.ledgerId,
                mutationId: payload.mutationId,
                transactionId: payload.transactionId,
            }),
        );
    });
}
