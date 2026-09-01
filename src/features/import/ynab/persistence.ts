import {
    bumpLedgerWorkspaceGeneration,
    deleteLedgerScopedRecords,
    type LedgerRecord,
} from "@/features/ledgers/server/ledger-service";
import type { YnabImportPlan } from "@/features/import/ynab/planner";
import {
    countLedgerScopedRecords,
    writeLedgerScopedRecords,
} from "@/features/ledgers/server/ledger-scoped-record-writer-service";
import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

export type YnabImportPersistenceResult = {
    ledger: LedgerRecord;
    scopedRecordCount: number;
};

async function upsertImportLedger(input: {
    ledgerId: string;
    ledgerName: string;
    now: string;
}) {
    const { entities } = getBudgetedSchema();
    const existing = await entities.ledgers
        .get({
            workspaceId: GLOBAL_WORKSPACE_ID,
            ledgerId: input.ledgerId,
        })
        .go({ consistent: true });
    const ledger = {
        ledgerId: input.ledgerId,
        workspaceId: GLOBAL_WORKSPACE_ID,
        name: input.ledgerName,
        isDefault: false,
        status: "active",
        createdAt: existing.data?.createdAt ?? input.now,
        updatedAt: input.now,
        workspaceGeneration: existing.data?.workspaceGeneration ?? 1,
        workspaceRevision: existing.data?.workspaceRevision ?? 0,
        workspaceSyncProtocolVersion: existing.data
            ? (existing.data.workspaceSyncProtocolVersion ?? 1)
            : 2,
    } satisfies LedgerRecord;

    await entities.ledgers.upsert(ledger).go();

    return ledger;
}

export async function persistYnabImport(input: {
    ledgerId: string;
    ledgerName: string;
    plan: YnabImportPlan;
}) {
    const now = new Date().toISOString();
    const ledger = await upsertImportLedger({
        ledgerId: input.ledgerId,
        ledgerName: input.ledgerName,
        now,
    });

    await deleteLedgerScopedRecords({ ledgerId: input.ledgerId });
    await writeLedgerScopedRecords(input.plan.records);

    const updatedLedger = await bumpLedgerWorkspaceGeneration(ledger.ledgerId);

    return {
        ledger: updatedLedger,
        scopedRecordCount: countLedgerScopedRecords(input.plan.records),
    } satisfies YnabImportPersistenceResult;
}
