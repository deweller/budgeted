import { transactionReferencesRequestSchema } from "@/features/transactions/models/transaction-reference";
import { listTransactionReferences } from "@/features/transactions/server/transaction-reference-read-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return workspaceReadJson(async (context) => {
        const payload = await parseJsonBody(
            request,
            transactionReferencesRequestSchema,
        );

        return {
            references: await listTransactionReferences(
                context.ledgerId,
                payload.transactionIds,
            ),
        };
    });
}
