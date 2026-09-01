import { listRecentTransactionClassificationInteractions } from "@/features/transaction-classification/server/transaction-classification-interaction-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET() {
    return workspaceReadJson(async (context) => ({
        interactions: await listRecentTransactionClassificationInteractions(
            context.ledgerId,
        ),
    }));
}
