import { amazonOrderManualMatchInputSchema } from "@/features/amazon/models/amazon-api";
import { manuallyMatchAmazonPayment } from "@/features/amazon/server/amazon-order-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ amazonPaymentId: string }> },
) {
    return handleWorkspaceRoute(async (context) => {
        const [{ amazonPaymentId }, input] = await Promise.all([
            params,
            parseJsonBody(request, amazonOrderManualMatchInputSchema),
        ]);

        return workspacePublishedMutationJson(context, () =>
            manuallyMatchAmazonPayment({
                amazonPaymentId,
                ledgerId: context.ledgerId,
                transactionId: input.transactionId,
            }),
        );
    });
}
