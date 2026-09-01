import { NextResponse } from "next/server";

import { transactionClassificationClassifyNowRequestSchema } from "@/features/transaction-classification/models/transaction-classification";
import { classifyAccountNow } from "@/features/transaction-classification/server/transaction-classification-pending-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationClassifyNowRequestSchema,
        );

        return NextResponse.json(
            await classifyAccountNow({
                accountId: payload.accountId,
                ledgerId: context.ledgerId,
                source: "manual",
            }),
        );
    });
}
