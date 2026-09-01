import { importLedgerExport } from "@/features/utilities/server/ledger-transfer-service";
import { ledgerImportRequestSchema } from "@/features/utilities/models/ledger-transfer";
import {
    handleWorkspaceRoute,
    workspaceTrackedMutationJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(request, ledgerImportRequestSchema);
        return workspaceTrackedMutationJson(context, () =>
            importLedgerExport(context.user, input),
        );
    });
}
