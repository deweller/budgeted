import type {
    WorkspaceEntityType,
    WorkspaceSnapshotRecords,
} from "@/lib/workspace/sync-types";

export type WorkspaceArrayKey = keyof WorkspaceSnapshotRecords;

type WorkspaceEntityConfig = {
    arrayKey: WorkspaceArrayKey;
    entityType: WorkspaceEntityType;
    idKey: string;
};

export const WORKSPACE_ENTITY_CONFIGS = [
    { entityType: "account", arrayKey: "accounts", idKey: "accountId" },
    {
        entityType: "allocationFundingSource",
        arrayKey: "allocationFundingSources",
        idKey: "fundingSourceId",
    },
    {
        entityType: "amazonOrderIntegration",
        arrayKey: "amazonOrderIntegrations",
        idKey: "integrationId",
    },
    {
        entityType: "amazonOrder",
        arrayKey: "amazonOrders",
        idKey: "amazonOrderId",
    },
    {
        entityType: "amazonOrderSyncRun",
        arrayKey: "amazonOrderSyncRuns",
        idKey: "syncRunId",
    },
    {
        entityType: "budgetCategory",
        arrayKey: "budgetCategories",
        idKey: "categoryId",
    },
    { entityType: "budgetGroup", arrayKey: "budgetGroups", idKey: "groupId" },
    {
        entityType: "budgetPeriod",
        arrayKey: "budgetPeriods",
        idKey: "periodId",
    },
    {
        entityType: "categoryAllocation",
        arrayKey: "budgetAllocations",
        idKey: "allocationId",
    },
    { entityType: "ledger", arrayKey: "ledgers", idKey: "ledgerId" },
    {
        entityType: "ledgerPosting",
        arrayKey: "ledgerPostings",
        idKey: "postingId",
    },
    {
        entityType: "plaidAccountLink",
        arrayKey: "plaidAccountLinks",
        idKey: "plaidAccountLinkId",
    },
    {
        entityType: "plaidTransactionSync",
        arrayKey: "plaidTransactionSyncs",
        idKey: "plaidTransactionSyncId",
    },
    {
        entityType: "transaction",
        arrayKey: "transactions",
        idKey: "transactionId",
    },
    {
        entityType: "transactionImportActivity",
        arrayKey: "transactionImportActivities",
        idKey: "activityId",
    },
    {
        entityType: "transactionAutoMatchRejection",
        arrayKey: "transactionAutoMatchRejections",
        idKey: "matchDecisionId",
    },
    {
        entityType: "transactionLine",
        arrayKey: "transactionLines",
        idKey: "lineId",
    },
    {
        entityType: "transactionTemplate",
        arrayKey: "transactionTemplates",
        idKey: "templateId",
    },
    {
        entityType: "venmoAccountMapping",
        arrayKey: "venmoAccountMappings",
        idKey: "mappingId",
    },
    {
        entityType: "venmoIntegration",
        arrayKey: "venmoIntegrations",
        idKey: "integrationId",
    },
] as const satisfies readonly WorkspaceEntityConfig[];

export const WORKSPACE_ENTITY_TYPES = WORKSPACE_ENTITY_CONFIGS.map(
    (config) => config.entityType,
) as WorkspaceEntityType[];

const WORKSPACE_TRANSACTION_ENTITY_TYPES = new Set<WorkspaceEntityType>([
    "transaction",
    "transactionImportActivity",
    "transactionLine",
    "ledgerPosting",
    "plaidTransactionSync",
]);

export function isWorkspaceTransactionEntityType(
    entityType: WorkspaceEntityType,
) {
    return WORKSPACE_TRANSACTION_ENTITY_TYPES.has(entityType);
}

const configByEntityType = new Map<WorkspaceEntityType, WorkspaceEntityConfig>(
    WORKSPACE_ENTITY_CONFIGS.map((config) => [config.entityType, config]),
);

function getWorkspaceEntityConfig(entityType: WorkspaceEntityType) {
    const config = configByEntityType.get(entityType);

    if (!config) {
        throw new Error(`Unsupported workspace entity type: ${entityType}`);
    }

    return config;
}

export function getWorkspaceEntityArrayKey(entityType: WorkspaceEntityType) {
    return getWorkspaceEntityConfig(entityType).arrayKey;
}

export function getWorkspaceEntityId(
    entityType: WorkspaceEntityType,
    record: unknown,
) {
    const typedRecord = record as Record<string, unknown>;
    const idValue = typedRecord[getWorkspaceEntityConfig(entityType).idKey];

    return String(idValue);
}

export function createWorkspaceRecordReference(
    entityType: WorkspaceEntityType,
    record: unknown,
) {
    return {
        entityId: getWorkspaceEntityId(entityType, record),
        entityType,
        record,
    };
}

export function createWorkspaceRecordReferences(
    entityType: WorkspaceEntityType,
    records: readonly unknown[],
    mapRecord: (entityType: WorkspaceEntityType, record: unknown) => unknown = (
        _entityType,
        record,
    ) => record,
) {
    return records.map((record) =>
        createWorkspaceRecordReference(
            entityType,
            mapRecord(entityType, record),
        ),
    );
}
