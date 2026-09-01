import { getTransactionClassificationEmbeddingStatus } from "@/features/transaction-classification/server/transaction-classification-embedding-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET() {
    return workspaceReadJson((context) =>
        getTransactionClassificationEmbeddingStatus(context.ledgerId),
    );
}
