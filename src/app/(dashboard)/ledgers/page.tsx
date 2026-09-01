import { LedgersWorkspace } from "@/components/workspace/workspace-views";
import { listLedgers } from "@/features/ledgers/server/ledger-service";

export default async function LedgersPage() {
    return <LedgersWorkspace ledgers={await listLedgers()} />;
}
