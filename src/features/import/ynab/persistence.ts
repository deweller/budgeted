import type { LedgerRecord } from "@/features/ledgers/server/ledger-service";
import type { YnabImportPlan } from "@/features/import/ynab/planner";
import {
    countLedgerScopedRecords,
    writeLedgerScopedRecords,
} from "@/features/ledgers/server/ledger-scoped-record-writer-service";
import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";
import {
    rebuildWorkspaceStateForGeneration,
    toWorkspaceStateRecord,
} from "@/features/workspace/server/workspace-sync-service";

export type YnabImportPersistenceResult = {
    ledger: LedgerRecord;
    scopedRecordCount: number;
};

function createImportLedger(input: {
    ledgerId: string;
    ledgerName: string;
    now: string;
}) {
    return {
        ledgerId: input.ledgerId,
        workspaceId: GLOBAL_WORKSPACE_ID,
        name: input.ledgerName,
        isDefault: false,
        status: "active",
        createdAt: input.now,
        updatedAt: input.now,
        workspaceGeneration: 1,
        workspaceRevision: 0,
        workspaceSyncProtocolVersion: 2,
    } satisfies LedgerRecord;
}

async function finalizeImportLedger(ledger: LedgerRecord) {
    const { service } = getBudgetedSchema();
    const workspaceState = await rebuildWorkspaceStateForGeneration({
        ledger,
        ledgerId: ledger.ledgerId,
        workspaceGeneration: ledger.workspaceGeneration,
        workspaceRevision: ledger.workspaceRevision,
    });

    await service.transaction
        .write((entities) => [
            entities.ledgers.put(ledger).commit(),
            entities.workspaceStates
                .put(toWorkspaceStateRecord(workspaceState))
                .commit(),
        ])
        .go();

    return ledger;
}

export async function persistYnabImport(input: {
    ledgerId: string;
    ledgerName: string;
    plan: YnabImportPlan;
}) {
    const now = new Date().toISOString();
    const ledger = createImportLedger({
        ledgerId: input.ledgerId,
        ledgerName: input.ledgerName,
        now,
    });

    await writeLedgerScopedRecords(input.plan.records);
    await finalizeImportLedger(ledger);

    return {
        ledger,
        scopedRecordCount: countLedgerScopedRecords(input.plan.records),
    } satisfies YnabImportPersistenceResult;
}
