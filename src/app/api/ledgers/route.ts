import { ledgerInputSchema } from "@/features/ledgers/models/ledger-form";
import {
    createLedger,
    listLedgers,
} from "@/features/ledgers/server/ledger-service";
import {
    handleWorkspaceRoute,
    workspaceTrackedMutationJson,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return workspaceReadJson(async (context) => {
        const ledgers = await listLedgers();

        return {
            activeLedgerId: context.user.activeLedgerId,
            ledgers,
        };
    });
}

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, ledgerInputSchema);
        return workspaceTrackedMutationJson(
            context,
            () => createLedger(context.user.userId, input),
            { status: 201 },
        );
    });
}
