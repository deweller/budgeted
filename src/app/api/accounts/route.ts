import { accountInputSchema } from "@/features/accounts/models/account-form";
import {
    listAccounts,
    upsertAccountWithWorkspaceChanges,
} from "@/features/accounts/server/account-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return workspaceReadJson((context) => listAccounts(context.ledgerId));
}

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const payload = await parseJsonBody(request, accountInputSchema);
        return workspacePublishedMutationJson(
            context,
            () => upsertAccountWithWorkspaceChanges(context.ledgerId, payload),
            { status: 201 },
        );
    });
}
