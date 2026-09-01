import { plaidLinkTokenRequestSchema } from "@/features/plaid/models/plaid-requests";
import { createPlaidLinkToken } from "@/features/plaid/server/plaid-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(
            request,
            plaidLinkTokenRequestSchema,
        );

        return Response.json(
            await createPlaidLinkToken(
                {
                    ledgerId: context.ledgerId,
                },
                payload.accountId,
                {
                    accountSelectionEnabled: payload.accountSelectionEnabled,
                    plaidItemId: payload.plaidItemId,
                },
            ),
        );
    });
}
