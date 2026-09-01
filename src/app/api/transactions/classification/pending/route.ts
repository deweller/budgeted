import { NextResponse } from "next/server";

import { transactionClassificationPendingFetchRequestSchema } from "@/features/transaction-classification/models/transaction-classification";
import {
    listTransactionClassificationPending,
    listTransactionClassificationPendingForAccount,
} from "@/features/transaction-classification/server/transaction-classification-pending-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationPendingFetchRequestSchema,
        );

        const result =
            "accountId" in payload
                ? await listTransactionClassificationPendingForAccount(
                      context.ledgerId,
                      payload.accountId,
                  )
                : await listTransactionClassificationPending(
                      context.ledgerId,
                      payload.transactionIds,
                  );

        return NextResponse.json(result);
    });
}
