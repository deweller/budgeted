import { getPlaidTransactionReference } from "@/features/plaid/server/plaid-transaction-reference-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET(
    _request: Request,
    context: { params: Promise<{ transactionId: string }> },
) {
    return workspaceReadJson(async (workspaceContext) => {
        const { transactionId } = await context.params;

        return {
            reference: await getPlaidTransactionReference(
                workspaceContext.ledgerId,
                transactionId,
            ),
        };
    });
}
