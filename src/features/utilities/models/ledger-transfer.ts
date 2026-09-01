import { z } from "zod";

import { accountTypeValues } from "@/modules/accounts/account-types";
import type {
    WorkspaceAccountRecord,
    WorkspaceAllocationFundingSourceRecord,
    WorkspaceAmazonOrderIntegrationRecord,
    WorkspaceAmazonOrderRecord,
    WorkspaceAmazonOrderSyncRunRecord,
    WorkspaceBudgetCategoryRecord,
    WorkspaceBudgetGroupRecord,
    WorkspaceBudgetPeriodRecord,
    WorkspaceCategoryAllocationRecord,
    WorkspaceLedgerPostingRecord,
    WorkspacePlaidAccountLinkRecord,
    WorkspacePlaidTransactionSyncRecord,
    WorkspaceTransactionLineRecord,
    WorkspaceTransactionImportActivityRecord,
    WorkspaceTransactionRecord,
    WorkspaceTransactionTemplateRecord,
    WorkspaceVenmoAccountMappingRecord,
    WorkspaceVenmoIntegrationRecord,
} from "@/lib/workspace/sync-types";
import {
    TRANSACTION_IMPORT_DIRECTIONS,
    TRANSACTION_IMPORTER_IDS,
    TRANSACTION_IMPORT_STATES,
} from "@/features/transaction-importers/models/transaction-importer-contract";
import { WORKSPACE_ENTITY_CONFIGS } from "@/lib/workspace/entity-config";

export const LEDGER_EXPORT_FORMAT = "budgeted-ledger-export";
export const LEDGER_EXPORT_VERSION = 2;
export const LEDGER_EXPORT_PLAID_POLICY =
    "references-only-disabled-on-import";
export const ledgerImportScopeValues = ["full", "budgetPlan"] as const;

const ledgerImportScopeSchema = z.enum(ledgerImportScopeValues).default("full");

const accountRecordSchema = z
    .object({
        accountId: z.string().min(1),
        accountType: z.enum(accountTypeValues),
        createdAt: z.string().min(1),
        ledgerAccountId: z.string().min(1),
        name: z.string().min(1),
        openedOn: z.string().min(1),
        openingBalanceCents: z.number().int(),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const budgetGroupRecordSchema = z
    .object({
        createdAt: z.string().min(1),
        groupId: z.string().min(1),
        name: z.string().min(1),
        sortOrder: z.number().int(),
        status: z.enum(["active", "archived"]),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const budgetCategoryRecordSchema = z
    .object({
        allocationCadence: z.enum(["monthly", "yearly"]).optional(),
        allocationStartMonth: z.number().int().min(1).max(12).optional(),
        autoAssignSourceEnabled: z.boolean().optional(),
        autoAssignSourceSortOrder: z.number().int().optional(),
        categoryId: z.string().min(1),
        createdAt: z.string().min(1),
        defaultAssignedCents: z.number().int(),
        groupId: z.string().min(1),
        isIncomeCategory: z.boolean(),
        ledgerAccountId: z.string().min(1),
        name: z.string().min(1),
        sortOrder: z.number().int(),
        status: z.enum(["active", "archived"]),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const budgetPeriodRecordSchema = z
    .object({
        availableToBudgetCents: z.number().int().optional(),
        createdAt: z.string().min(1),
        currency: z.literal("USD"),
        endsOn: z.string().min(1),
        periodId: z.string().min(1),
        startsOn: z.string().min(1),
        status: z.enum(["open", "closed"]),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const categoryAllocationRecordSchema = z
    .object({
        allocationId: z.string().min(1),
        assignedCents: z.number().int(),
        categoryId: z.string().min(1),
        periodId: z.string().min(1),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const allocationFundingSourceRecordSchema = z
    .object({
        allocationId: z.string().min(1),
        amountCents: z.number().int(),
        categoryId: z.string().min(1),
        createdAt: z.string().min(1),
        fundingSourceId: z.string().min(1),
        periodId: z.string().min(1),
        sourceId: z.string().min(1),
        sourceType: z.enum(["account", "incomeCategory", "budgetCategory"]),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const amazonOrderIntegrationRecordSchema = z
    .object({
        createdAt: z.string().min(1),
        integrationId: z.string().min(1),
        latestBudgetedImportStatus: z.enum([
            "never",
            "running",
            "succeeded",
            "failed",
        ]),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const amazonOrderRecordSchema = z
    .object({
        amazonOrderId: z.string().min(1),
        firstImportedAt: z.string().min(1),
        itemSummary: z.string(),
        itemTitlesJson: z.string(),
        lastImportedAt: z.string().min(1),
        orderNumber: z.string().min(1),
        sourcePayloadJson: z.string().min(1),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const amazonOrderSyncRunRecordSchema = z
    .object({
        mode: z.enum(["latest", "launch"]),
        startedAt: z.string().min(1),
        status: z.enum([
            "running",
            "succeeded",
            "failed",
            "waitingForScraper",
        ]),
        syncRunId: z.string().min(1),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const transactionTemplateRecordSchema = z
    .object({
        createdAt: z.string().min(1),
        ledgerId: z.string().min(1),
        linesJson: z.string().min(1),
        name: z.string().min(1),
        templateId: z.string().min(1),
        updatedAt: z.string().min(1),
    })
    .passthrough();

const venmoIntegrationRecordSchema = z.object({
    createdAt: z.string().min(1), inboundRecipient: z.string().email(), inboxEnabled: z.boolean(),
    integrationId: z.string().min(1), latestProcessingStatus: z.enum(["never", "succeeded", "failed"]),
    updatedAt: z.string().min(1), ledgerId: z.string().min(1),
}).passthrough();
const venmoAccountMappingRecordSchema = z.object({
    accountId: z.string().min(1), createdAt: z.string().min(1), externalAccountKey: z.string().min(1),
    institution: z.string().min(1), last4: z.string().regex(/^\d{4}$/), mappingId: z.string().min(1),
    updatedAt: z.string().min(1), ledgerId: z.string().min(1),
}).passthrough();
const transactionRecordSchema = z
    .object({
        displayAmountCents: z.number().int(),
        enteredAt: z.string().min(1),
        kind: z.enum(["adjustment", "standard"]),
        occurredAt: z.string().min(1),
        periodId: z.string().min(1),
        referenceAccountId: z.string().min(1),
        status: z.enum(["entered", "cleared", "reconciled", "voided"]),
        transactionId: z.string().min(1),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const transactionImportActivityRecordSchema = z
    .object({
        activityId: z.string().min(1),
        createdAt: z.string().min(1),
        detailsJson: z.string(),
        detailsVersion: z.number().int().positive(),
        direction: z.enum(TRANSACTION_IMPORT_DIRECTIONS),
        financialFingerprint: z.string(),
        ledgerId: z.string().min(1),
        occurredDate: z.string().min(1),
        provider: z.enum(TRANSACTION_IMPORTER_IDS),
        providerAmountCents: z.number().int(),
        providerRecordId: z.string().min(1),
        state: z.enum(TRANSACTION_IMPORT_STATES),
        updatedAt: z.string().min(1),
    })
    .passthrough();

const transactionLineRecordSchema = z
    .object({
        amountCents: z.number().int().positive(),
        createdAt: z.string().min(1),
        lineId: z.string().min(1),
        sortOrder: z.number().int(),
        transactionId: z.string().min(1),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const ledgerPostingRecordSchema = z
    .object({
        amountCents: z.number().int().positive(),
        createdAt: z.string().min(1),
        direction: z.enum(["credit", "debit"]),
        ledgerAccountId: z.string().min(1),
        ledgerAccountKind: z.enum(["category", "equity", "financial"]),
        occurredAt: z.string().min(1),
        periodId: z.string().min(1),
        postingId: z.string().min(1),
        transactionId: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const plaidAccountLinkRecordSchema = z
    .object({
        accountId: z.string().min(1),
        createdAt: z.string().min(1),
        lastSyncStatus: z.enum(["failed", "never", "succeeded"]),
        plaidAccountId: z.string().min(1),
        plaidAccountLinkId: z.string().min(1),
        plaidItemId: z.string().min(1),
        status: z.enum(["disabled", "error", "linked"]),
        syncStartDate: z.string().min(1),
        updatedAt: z.string().min(1),
        ledgerId: z.string().min(1),
    })
    .passthrough();

const plaidTransactionSyncRecordSchema = z
    .object({
        accountId: z.string().min(1),
        firstSyncedAt: z.string().min(1),
        lastSyncedAt: z.string().min(1),
        ledgerId: z.string().min(1),
        name: z.string().min(1),
        pending: z.boolean(),
        plaidAccountId: z.string().min(1),
        plaidAccountLinkId: z.string().min(1),
        plaidAmountCents: z.number().int(),
        plaidDate: z.string().min(1),
        plaidItemId: z.string().min(1),
        plaidPayloadJson: z.string().min(1),
        plaidTransactionId: z.string().min(1),
        plaidTransactionSyncId: z.string().min(1),
        status: z.enum(["active", "removed"]),
        transactionId: z.string().min(1),
        updatedAt: z.string().min(1),
    })
    .passthrough();

export const ledgerExportFileSchema = z.object({
    exportedAt: z.string().min(1),
    format: z.literal(LEDGER_EXPORT_FORMAT),
    plaidPolicy: z.literal(LEDGER_EXPORT_PLAID_POLICY),
    records: z.object({
        accounts: z.array(accountRecordSchema),
        allocationFundingSources: z.array(allocationFundingSourceRecordSchema),
        amazonOrderIntegrations: z.array(amazonOrderIntegrationRecordSchema),
        amazonOrderSyncRuns: z.array(amazonOrderSyncRunRecordSchema),
        amazonOrders: z.array(amazonOrderRecordSchema),
        budgetAllocations: z.array(categoryAllocationRecordSchema),
        budgetCategories: z.array(budgetCategoryRecordSchema),
        budgetGroups: z.array(budgetGroupRecordSchema),
        budgetPeriods: z.array(budgetPeriodRecordSchema),
        ledgerPostings: z.array(ledgerPostingRecordSchema),
        plaidAccountLinks: z.array(plaidAccountLinkRecordSchema),
        plaidTransactionSyncs: z.array(plaidTransactionSyncRecordSchema),
        transactionTemplates: z.array(transactionTemplateRecordSchema),
        transactionImportActivities: z
            .array(transactionImportActivityRecordSchema)
            .default([]),
        transactionLines: z.array(transactionLineRecordSchema),
        transactions: z.array(transactionRecordSchema),
        venmoAccountMappings: z.array(venmoAccountMappingRecordSchema),
        venmoIntegrations: z.array(venmoIntegrationRecordSchema),
    }),
    sourceLedger: z.object({
        createdAt: z.string().min(1),
        ledgerId: z.string().min(1),
        name: z.string().min(1),
        updatedAt: z.string().min(1),
    }),
    version: z.literal(LEDGER_EXPORT_VERSION),
});

export const ledgerImportRequestSchema = z.discriminatedUnion("mode", [
    z.object({
        exportFile: ledgerExportFileSchema,
        importScope: ledgerImportScopeSchema,
        mode: z.literal("create"),
        targetLedgerName: z.string().trim().min(1, "Ledger name is required."),
    }),
    z.object({
        confirmationName: z
            .string()
            .trim()
            .min(1, "Confirmation name is required."),
        exportFile: ledgerExportFileSchema,
        importScope: ledgerImportScopeSchema,
        mode: z.literal("replace"),
        targetLedgerName: z.string().trim().optional(),
    }),
    z.object({
        exportFile: ledgerExportFileSchema,
        importScope: ledgerImportScopeSchema,
        mode: z.literal("merge"),
    }),
]);

export type LedgerExportTransactionRecord = WorkspaceTransactionRecord;
export type LedgerExportAccountRecord = Omit<
    WorkspaceAccountRecord,
    "balanceCents"
>;

export type LedgerExportFile = z.infer<typeof ledgerExportFileSchema> & {
    records: {
        accounts: LedgerExportAccountRecord[];
        allocationFundingSources: WorkspaceAllocationFundingSourceRecord[];
        amazonOrderIntegrations: WorkspaceAmazonOrderIntegrationRecord[];
        amazonOrderSyncRuns: WorkspaceAmazonOrderSyncRunRecord[];
        amazonOrders: WorkspaceAmazonOrderRecord[];
        budgetAllocations: WorkspaceCategoryAllocationRecord[];
        budgetCategories: WorkspaceBudgetCategoryRecord[];
        budgetGroups: WorkspaceBudgetGroupRecord[];
        budgetPeriods: WorkspaceBudgetPeriodRecord[];
        ledgerPostings: WorkspaceLedgerPostingRecord[];
        plaidAccountLinks: WorkspacePlaidAccountLinkRecord[];
        plaidTransactionSyncs: WorkspacePlaidTransactionSyncRecord[];
        transactionTemplates: WorkspaceTransactionTemplateRecord[];
        transactionImportActivities: WorkspaceTransactionImportActivityRecord[];
        transactionLines: WorkspaceTransactionLineRecord[];
        transactions: LedgerExportTransactionRecord[];
        venmoAccountMappings: WorkspaceVenmoAccountMappingRecord[];
        venmoIntegrations: WorkspaceVenmoIntegrationRecord[];
    };
};

const LEDGER_TRANSFER_RECORD_KEYS = [
    "accounts",
    "allocationFundingSources",
    "amazonOrderIntegrations",
    "amazonOrderSyncRuns",
    "amazonOrders",
    "budgetAllocations",
    "budgetCategories",
    "budgetGroups",
    "budgetPeriods",
    "ledgerPostings",
    "plaidAccountLinks",
    "plaidTransactionSyncs",
    "transactionTemplates",
    "transactionImportActivities",
    "transactionLines",
    "transactions",
    "venmoAccountMappings",
    "venmoIntegrations",
] as const satisfies readonly (keyof LedgerExportFile["records"])[];

export type LedgerTransferRecordKey =
    (typeof LEDGER_TRANSFER_RECORD_KEYS)[number];

export type LedgerTransferRecordCounts = Record<LedgerTransferRecordKey, number>;

type LedgerTransferRecordFamily = {
    idKey: string;
    key: LedgerTransferRecordKey;
    previewLabel: string;
    singularLabel: string;
};

const LEDGER_TRANSFER_RECORD_LABELS = {
    accounts: {
        previewLabel: "Accounts",
        singularLabel: "account",
    },
    allocationFundingSources: {
        previewLabel: "Allocation funding sources",
        singularLabel: "allocation funding source",
    },
    amazonOrderIntegrations: {
        previewLabel: "Amazon order settings",
        singularLabel: "Amazon order setting",
    },
    amazonOrderSyncRuns: {
        previewLabel: "Amazon sync runs",
        singularLabel: "Amazon sync run",
    },
    amazonOrders: {
        previewLabel: "Amazon orders",
        singularLabel: "Amazon order",
    },
    budgetAllocations: {
        previewLabel: "Budget allocations",
        singularLabel: "budget allocation",
    },
    budgetCategories: {
        previewLabel: "Budget categories",
        singularLabel: "budget category",
    },
    budgetGroups: {
        previewLabel: "Budget groups",
        singularLabel: "budget group",
    },
    budgetPeriods: {
        previewLabel: "Budget periods",
        singularLabel: "budget period",
    },
    ledgerPostings: {
        previewLabel: "Ledger postings",
        singularLabel: "ledger posting",
    },
    plaidAccountLinks: {
        previewLabel: "Plaid links",
        singularLabel: "Plaid account link",
    },
    plaidTransactionSyncs: {
        previewLabel: "Plaid references",
        singularLabel: "Plaid transaction sync",
    },
    transactionTemplates: {
        previewLabel: "Transaction templates",
        singularLabel: "transaction template",
    },
    transactionImportActivities: {
        previewLabel: "Transaction importer activities",
        singularLabel: "transaction importer activity",
    },
    transactionLines: {
        previewLabel: "Transaction lines",
        singularLabel: "transaction line",
    },
    transactions: {
        previewLabel: "Transactions",
        singularLabel: "transaction",
    },
    venmoAccountMappings: { previewLabel: "Venmo account mappings", singularLabel: "Venmo account mapping" },
    venmoIntegrations: { previewLabel: "Venmo settings", singularLabel: "Venmo setting" },
} as const satisfies Record<
    LedgerTransferRecordKey,
    Pick<LedgerTransferRecordFamily, "previewLabel" | "singularLabel">
>;

const workspaceConfigByArrayKey = new Map(
    WORKSPACE_ENTITY_CONFIGS.map((config) => [config.arrayKey, config]),
);

function requireWorkspaceRecordConfig(key: LedgerTransferRecordKey) {
    const config = workspaceConfigByArrayKey.get(key);

    if (!config) {
        throw new Error(`Unsupported ledger transfer record family: ${key}`);
    }

    return config;
}

export const LEDGER_TRANSFER_RECORD_FAMILIES =
    LEDGER_TRANSFER_RECORD_KEYS.map((key) => ({
        idKey: requireWorkspaceRecordConfig(key).idKey,
        key,
        ...LEDGER_TRANSFER_RECORD_LABELS[key],
    })) satisfies LedgerTransferRecordFamily[];

export function countLedgerTransferRecords(
    records: LedgerExportFile["records"],
): LedgerTransferRecordCounts {
    return Object.fromEntries(
        LEDGER_TRANSFER_RECORD_FAMILIES.map((family) => [
            family.key,
            records[family.key].length,
        ]),
    ) as LedgerTransferRecordCounts;
}

export type LedgerImportRequest = z.infer<typeof ledgerImportRequestSchema>;

export type LedgerImportMode = LedgerImportRequest["mode"];

export type LedgerImportScope = LedgerImportRequest["importScope"];

export type LedgerImportSummary = {
    activeLedgerId: string;
    activeLedgerName: string;
    importScope: LedgerImportScope;
    mode: LedgerImportMode;
    recordCounts: LedgerTransferRecordCounts;
};

export function selectLedgerTransferRecordsForImportScope(
    records: LedgerExportFile["records"],
    importScope: LedgerImportScope,
): LedgerExportFile["records"] {
    if (importScope === "full") {
        return records;
    }

    return {
        accounts: [],
        allocationFundingSources: [],
        amazonOrderIntegrations: [],
        amazonOrderSyncRuns: [],
        amazonOrders: [],
        budgetAllocations: [],
        budgetCategories: records.budgetCategories,
        budgetGroups: records.budgetGroups,
        budgetPeriods: [],
        ledgerPostings: [],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionTemplates: [],
        transactionImportActivities: [],
        transactionLines: [],
        transactions: [],
        venmoAccountMappings: [],
        venmoIntegrations: [],
    };
}
