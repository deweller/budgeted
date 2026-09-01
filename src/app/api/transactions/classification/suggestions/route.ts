import { NextResponse } from "next/server";

import { transactionClassificationSuggestionsRequestSchema } from "@/features/transaction-classification/models/transaction-classification";
import { generateTransactionClassificationSuggestions } from "@/features/transaction-classification/server/transaction-classification-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationSuggestionsRequestSchema,
        );

        return NextResponse.json(
            await generateTransactionClassificationSuggestions(
                context.ledgerId,
                payload,
            ),
        );
    });
}
