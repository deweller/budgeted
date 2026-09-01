import { runLedgerIntegrityCheck } from "@/features/ledgers/server/ledger-integrity-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function POST() {
    return workspaceReadJson((context) =>
        runLedgerIntegrityCheck({ ledgerId: context.ledgerId }),
    );
}
