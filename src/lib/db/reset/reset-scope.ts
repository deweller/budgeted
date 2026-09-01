export const RESETTABLE_ENTITY_LABELS = {
    userAccount: "User accounts",
    account: "Accounts",
    automationSchedule: "Automation schedule",
    automationTaskRun: "Automation task runs",
    budgetPeriod: "Budget periods",
    budgetGroup: "Budget groups",
    budgetCategory: "Budget categories",
    categoryAllocation: "Category allocations",
    allocationFundingSource: "Allocation funding sources",
    amazonOrderIntegration: "Amazon order settings",
    amazonOrder: "Amazon orders",
    amazonOrderSyncRun: "Amazon sync runs",
    venmoIntegration: "Venmo settings",
    venmoAccountMapping: "Venmo account mappings",
    transaction: "Transactions",
    transactionImportActivity: "Transaction importer activities",
    transactionAutoMatchRejection: "Transaction auto-match rejections",
    transactionAuditLog: "Transaction audit logs",
    transactionClassificationEmbedding:
        "Transaction classification embeddings",
    transactionClassificationInteraction:
        "Transaction classification interactions",
    transactionClassificationPending: "Pending transaction classifications",
    transactionClassificationSettings: "Transaction classification settings",
    transactionClassificationSource: "Transaction classification sources",
    transactionLine: "Transaction lines",
    transactionTemplate: "Transaction templates",
    ledgerPosting: "Ledger postings",
    ledger: "Ledgers",
    workspaceChange: "Workspace changes",
    workspaceMutationBatch: "Workspace mutation batches",
    workspaceMutationReceipt: "Workspace mutation receipts",
    workspaceMutationOperation: "Workspace mutation operations",
} as const;

export const RESET_WARNING_LABELS = [
    RESETTABLE_ENTITY_LABELS.account,
    RESETTABLE_ENTITY_LABELS.automationSchedule,
    RESETTABLE_ENTITY_LABELS.automationTaskRun,
    RESETTABLE_ENTITY_LABELS.budgetPeriod,
    RESETTABLE_ENTITY_LABELS.budgetGroup,
    RESETTABLE_ENTITY_LABELS.budgetCategory,
    RESETTABLE_ENTITY_LABELS.categoryAllocation,
    RESETTABLE_ENTITY_LABELS.allocationFundingSource,
    RESETTABLE_ENTITY_LABELS.amazonOrderIntegration,
    RESETTABLE_ENTITY_LABELS.amazonOrder,
    RESETTABLE_ENTITY_LABELS.amazonOrderSyncRun,
    RESETTABLE_ENTITY_LABELS.venmoIntegration,
    RESETTABLE_ENTITY_LABELS.venmoAccountMapping,
    RESETTABLE_ENTITY_LABELS.transaction,
    RESETTABLE_ENTITY_LABELS.transactionImportActivity,
    RESETTABLE_ENTITY_LABELS.transactionAutoMatchRejection,
    RESETTABLE_ENTITY_LABELS.transactionAuditLog,
    RESETTABLE_ENTITY_LABELS.transactionClassificationEmbedding,
    RESETTABLE_ENTITY_LABELS.transactionClassificationInteraction,
    RESETTABLE_ENTITY_LABELS.transactionClassificationPending,
    RESETTABLE_ENTITY_LABELS.transactionClassificationSettings,
    RESETTABLE_ENTITY_LABELS.transactionClassificationSource,
    RESETTABLE_ENTITY_LABELS.transactionLine,
    RESETTABLE_ENTITY_LABELS.transactionTemplate,
    RESETTABLE_ENTITY_LABELS.ledgerPosting,
    RESETTABLE_ENTITY_LABELS.ledger,
    RESETTABLE_ENTITY_LABELS.workspaceChange,
    RESETTABLE_ENTITY_LABELS.workspaceMutationBatch,
    RESETTABLE_ENTITY_LABELS.workspaceMutationReceipt,
    RESETTABLE_ENTITY_LABELS.workspaceMutationOperation,
];

export type ResettableEntityType = keyof typeof RESETTABLE_ENTITY_LABELS;

export type ResetScanItem = {
    pk?: string;
    sk?: string;
    __edb_e__?: string;
    userId?: string;
    email?: string;
    [key: string]: unknown;
};

export type ResetDeleteKey = {
    pk: string;
    sk: string;
};

export type ResetItemClassification =
    | {
          action: "clear";
          entityType: ResettableEntityType;
          label: string;
      }
    | {
          action: "preserve";
          entityType: "userAccount";
          label: "User accounts";
      }
    | {
          action: "ignore";
      };

const RESETTABLE_ENTITY_TYPES = new Set<ResettableEntityType>([
    "userAccount",
    "account",
    "automationSchedule",
    "automationTaskRun",
    "budgetPeriod",
    "budgetGroup",
    "budgetCategory",
    "categoryAllocation",
    "allocationFundingSource",
    "amazonOrderIntegration",
    "amazonOrder",
    "amazonOrderSyncRun",
    "venmoIntegration",
    "venmoAccountMapping",
    "transaction",
    "transactionImportActivity",
    "transactionAutoMatchRejection",
    "transactionAuditLog",
    "transactionClassificationEmbedding",
    "transactionClassificationInteraction",
    "transactionClassificationPending",
    "transactionClassificationSettings",
    "transactionClassificationSource",
    "transactionLine",
    "transactionTemplate",
    "ledgerPosting",
    "ledger",
    "workspaceChange",
    "workspaceMutationBatch",
    "workspaceMutationReceipt",
    "workspaceMutationOperation",
]);

export function isResetLockItem(item: ResetScanItem) {
    return (
        typeof item.pk === "string" &&
        item.pk.startsWith("reset-lock#") &&
        item.sk === "reset-lock"
    );
}

export function getResetEntityType(item: ResetScanItem) {
    const entityType = item.__edb_e__;

    if (
        typeof entityType === "string" &&
        RESETTABLE_ENTITY_TYPES.has(entityType as ResettableEntityType)
    ) {
        return entityType as ResettableEntityType;
    }

    return undefined;
}

export function classifyResetItem(item: ResetScanItem): ResetItemClassification {
    if (isResetLockItem(item)) {
        return { action: "ignore" };
    }

    const entityType = getResetEntityType(item);

    if (!entityType) {
        return { action: "ignore" };
    }

    if (entityType === "userAccount") {
        return {
            action: "preserve",
            entityType,
            label: "User accounts",
        };
    }

    return {
        action: "clear",
        entityType,
        label: RESETTABLE_ENTITY_LABELS[entityType],
    };
}

export function getResetDeleteKey(item: ResetScanItem): ResetDeleteKey | null {
    if (typeof item.pk !== "string" || typeof item.sk !== "string") {
        return null;
    }

    return {
        pk: item.pk,
        sk: item.sk,
    };
}
