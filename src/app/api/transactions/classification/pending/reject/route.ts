import { NextResponse } from "next/server";

import { transactionClassificationPendingRejectRequestSchema } from "@/features/transaction-classification/models/transaction-classification";
import { rejectTransactionClassificationPending } from "@/features/transaction-classification/server/transaction-classification-pending-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationPendingRejectRequestSchema,
        );

        return NextResponse.json(
            await rejectTransactionClassificationPending({
                ledgerId: context.ledgerId,
                transactionId: payload.transactionId,
            }),
        );
    });
}
