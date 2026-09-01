import { NextResponse } from "next/server";

import { transactionClassificationDebugSelectionSchema } from "@/features/transaction-classification/models/transaction-classification";
import { runTransactionClassificationDebugTrial } from "@/features/transaction-classification/server/transaction-classification-debug-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationDebugSelectionSchema,
        );

        return NextResponse.json(
            await runTransactionClassificationDebugTrial({
                ledgerId: context.ledgerId,
                transactionIds: payload.transactionIds,
            }),
        );
    });
}
