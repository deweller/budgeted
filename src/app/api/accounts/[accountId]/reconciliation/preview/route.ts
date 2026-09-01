import {
    accountReconciliationPreviewQuerySchema,
} from "@/features/accounts/models/account-reconciliation";
import { getAccountReconciliationPreview } from "@/features/accounts/server/account-reconciliation-service";
import { parseSearchParams } from "@/lib/api/validation";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET(
    request: Request,
    context: { params: Promise<{ accountId: string }> },
) {
    return workspaceReadJson(async (workspaceContext) => {
        const { accountId } = await context.params;
        const query = parseSearchParams(
            new URL(request.url),
            accountReconciliationPreviewQuerySchema,
        );
        const preview = await getAccountReconciliationPreview(
            workspaceContext.ledgerId,
            accountId,
            ...(query.manualBalanceCents === undefined
                ? []
                : [{ manualBalanceCents: query.manualBalanceCents }]),
        );

        return {
            accountId: preview.accountId,
            accountName: preview.accountName,
            alreadyReconciledCount: preview.alreadyReconciledCount,
            cutoffDate: preview.cutoffDate,
            differenceCents: preview.differenceCents,
            eligibleTransactionCount: preview.eligibleTransactionCount,
            institutionBalanceCents: preview.institutionBalanceCents,
            ledgerBalanceCents: preview.ledgerBalanceCents,
            manualBalanceCents: preview.manualBalanceCents,
            mismatchSuggestions: preview.mismatchSuggestions,
            mode: preview.mode,
            previewRevision: preview.previewRevision,
        };
    });
}
