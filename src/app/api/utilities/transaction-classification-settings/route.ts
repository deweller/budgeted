import { NextResponse } from "next/server";

import { transactionClassificationSettingsInputSchema } from "@/features/transaction-classification/models/transaction-classification";
import {
    getTransactionClassificationSettings,
    updateTransactionClassificationSettings,
} from "@/features/transaction-classification/server/transaction-classification-settings-service";
import {
    handleWorkspaceRoute,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return workspaceReadJson((context) =>
        getTransactionClassificationSettings(context.ledgerId),
    );
}

export async function PATCH(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionClassificationSettingsInputSchema,
        );

        return NextResponse.json(
            await updateTransactionClassificationSettings(
                context.ledgerId,
                payload,
            ),
        );
    });
}
