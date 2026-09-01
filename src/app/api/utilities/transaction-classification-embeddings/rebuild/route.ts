import { NextResponse } from "next/server";

import { rebuildTransactionClassificationEmbeddings } from "@/features/transaction-classification/server/transaction-classification-embedding-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";

export async function POST() {
    return handleWorkspaceRoute(async (context) =>
        NextResponse.json(
            await rebuildTransactionClassificationEmbeddings(context.ledgerId),
        ),
    );
}
