import { NextResponse } from "next/server";

import { transactionBulkDeletePreviewSchema } from "@/features/transactions/models/transaction-form";
import { getTransactionsDeletionImpact } from "@/features/transactions/server/transaction-delete-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionBulkDeletePreviewSchema,
        );

        return NextResponse.json(
            await getTransactionsDeletionImpact(
                context.ledgerId,
                payload.transactionIds,
            ),
        );
    });
}
