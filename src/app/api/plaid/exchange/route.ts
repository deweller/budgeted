import { plaidExchangeRequestSchema } from "@/features/plaid/models/plaid-requests";
import { exchangePlaidPublicTokenAndSync } from "@/features/plaid/server/plaid-service";
import {
    handleWorkspaceRoute,
    workspaceCommittedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(request, plaidExchangeRequestSchema);
        return workspaceCommittedMutationJson(context, () =>
            exchangePlaidPublicTokenAndSync(
                {
                    ledgerId: context.ledgerId,
                },
                payload,
            ),
        );
    });
}
