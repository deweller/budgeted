import { NextResponse } from "next/server";

import { getTransactionClassificationDebugPage } from "@/features/transaction-classification/server/transaction-classification-debug-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";

export async function GET(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const { searchParams } = new URL(request.url);

        return NextResponse.json(
            await getTransactionClassificationDebugPage({
                accountId: searchParams.get("accountId"),
                ledgerId: context.ledgerId,
            }),
        );
    });
}
