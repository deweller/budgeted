import { WORKSPACE_STATE_ID } from "@/lib/db/entities/workspace-state.entity";
import {
    calculateWorkspaceEntityCounts,
    calculateWorkspaceEntityDigestAccumulators,
    calculateWorkspaceEntityDigests,
    createWorkspaceEntityRevisionTokens,
} from "@/lib/workspace/revision";
import type { WorkspaceSnapshotRecords } from "@/lib/workspace/sync-types";

export function createWorkspaceMutationFixtureRecords(
    overrides: Partial<WorkspaceSnapshotRecords> = {},
): WorkspaceSnapshotRecords {
    return {
        accounts: [],
        allocationFundingSources: [],
        amazonOrderIntegrations: [],
        amazonOrderSyncRuns: [],
        amazonOrders: [],
        budgetAllocations: [],
        budgetCategories: [],
        budgetGroups: [],
        budgetPeriods: [],
        ledgerPostings: [],
        ledgers: [],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionAutoMatchRejections: [],
        transactionImportActivities: [],
        transactionTemplates: [],
        transactionLines: [],
        transactions: [],
        venmoAccountMappings: [],
        venmoIntegrations: [],
        ...overrides,
    };
}

export function createStoredWorkspaceStateFixture(input: {
    ledgerId: string;
    records?: Partial<WorkspaceSnapshotRecords>;
    workspaceGeneration?: number;
    workspaceRevision?: number;
}) {
    const records = createWorkspaceMutationFixtureRecords(input.records);
    const workspaceGeneration = input.workspaceGeneration ?? 1;
    const workspaceRevision = input.workspaceRevision ?? 1;
    const cursor = { generation: workspaceGeneration, revision: workspaceRevision };
    const now = "2026-07-16T00:00:00.000Z";

    return {
        createdAt: now,
        entityDigestAccumulatorsJson: JSON.stringify(
            calculateWorkspaceEntityDigestAccumulators(records),
        ),
        entityDigestsJson: JSON.stringify(
            calculateWorkspaceEntityDigests(records),
        ),
        entityCountsJson: JSON.stringify(
            calculateWorkspaceEntityCounts(records),
        ),
        entityRevisionsJson: JSON.stringify(
            createWorkspaceEntityRevisionTokens(cursor),
        ),
        ledgerId: input.ledgerId,
        oldestRetainedWorkspaceRevision: 0,
        stateId: WORKSPACE_STATE_ID,
        updatedAt: now,
        workspaceGeneration,
        workspaceId: "global",
        workspaceRevision,
    };
}
