import { Service } from "electrodb";

import { documentClient } from "@/lib/db/client";
import type { EntityOptions } from "@/lib/db/entity-options";
import { createAccountEntity } from "@/lib/db/entities/account.entity";
import { createAutomationScheduleEntity } from "@/lib/db/entities/automation-schedule.entity";
import { createAutomationTaskRunEntity } from "@/lib/db/entities/automation-task-run.entity";
import { createAllocationFundingSourceEntity } from "@/lib/db/entities/allocation-funding-source.entity";
import { createAmazonOrderEntity } from "@/lib/db/entities/amazon-order.entity";
import { createAmazonOrderIntegrationEntity } from "@/lib/db/entities/amazon-order-integration.entity";
import { createAmazonOrderSyncRunEntity } from "@/lib/db/entities/amazon-order-sync-run.entity";
import { createBudgetCategoryEntity } from "@/lib/db/entities/budget-category.entity";
import { createBudgetGroupEntity } from "@/lib/db/entities/budget-group.entity";
import { createBudgetPeriodEntity } from "@/lib/db/entities/budget-period.entity";
import { createCategoryAllocationEntity } from "@/lib/db/entities/category-allocation.entity";
import { createLedgerPostingEntity } from "@/lib/db/entities/ledger-posting.entity";
import { createLedgerEntity } from "@/lib/db/entities/ledger.entity";
import { createPlaidAccountLinkEntity } from "@/lib/db/entities/plaid-account-link.entity";
import { createPlaidItemSyncStateEntity } from "@/lib/db/entities/plaid-item-sync-state.entity";
import { createPlaidSharedItemEntity } from "@/lib/db/entities/plaid-shared-item.entity";
import { createPlaidTransactionSyncEntity } from "@/lib/db/entities/plaid-transaction-sync.entity";
import { createTransactionAuditLogEntity } from "@/lib/db/entities/transaction-audit-log.entity";
import { createTransactionAutoMatchRejectionEntity } from "@/lib/db/entities/transaction-auto-match-rejection.entity";
import { createTransactionClassificationEmbeddingEntity } from "@/lib/db/entities/transaction-classification-embedding.entity";
import { createTransactionClassificationInteractionEntity } from "@/lib/db/entities/transaction-classification-interaction.entity";
import { createTransactionClassificationPendingEntity } from "@/lib/db/entities/transaction-classification-pending.entity";
import { createTransactionClassificationSettingsEntity } from "@/lib/db/entities/transaction-classification-settings.entity";
import { createTransactionClassificationSourceEntity } from "@/lib/db/entities/transaction-classification-source.entity";
import { createTransactionLineEntity } from "@/lib/db/entities/transaction-line.entity";
import { createTransactionTemplateEntity } from "@/lib/db/entities/transaction-template.entity";
import { createTransactionEntity } from "@/lib/db/entities/transaction.entity";
import { createTransactionImportActivityEntity } from "@/lib/db/entities/transaction-import-activity.entity";
import { createUserAccountEntity } from "@/lib/db/entities/user-account.entity";
import { createVenmoAccountMappingEntity } from "@/lib/db/entities/venmo-account-mapping.entity";
import { createVenmoIntegrationEntity } from "@/lib/db/entities/venmo-integration.entity";
import { createWorkspaceMutationBatchEntity } from "@/lib/db/entities/workspace-mutation-batch.entity";
import { createWorkspaceMutationReceiptEntity } from "@/lib/db/entities/workspace-mutation-receipt.entity";
import { createWorkspaceMutationOperationEntity } from "@/lib/db/entities/workspace-mutation-operation.entity";
import { createWorkspaceStateEntity } from "@/lib/db/entities/workspace-state.entity";
import { createYnabImportJobEntity } from "@/lib/db/entities/ynab-import-job.entity";
import { requireLedgerTableName } from "@/lib/db/resource";

export function createEntityOptions(
    table = requireLedgerTableName(),
): EntityOptions {
    return {
        client: documentClient,
        table,
    };
}

export function createBudgetedSchema(table = requireLedgerTableName()) {
    const options = createEntityOptions(table);

    const userAccounts = createUserAccountEntity(options);
    const accounts = createAccountEntity(options);
    const automationSchedules = createAutomationScheduleEntity(options);
    const automationTaskRuns = createAutomationTaskRunEntity(options);
    const amazonOrderIntegrations =
        createAmazonOrderIntegrationEntity(options);
    const amazonOrders = createAmazonOrderEntity(options);
    const amazonOrderSyncRuns = createAmazonOrderSyncRunEntity(options);
    const budgetPeriods = createBudgetPeriodEntity(options);
    const budgetGroups = createBudgetGroupEntity(options);
    const budgetCategories = createBudgetCategoryEntity(options);
    const categoryAllocations = createCategoryAllocationEntity(options);
    const allocationFundingSources =
        createAllocationFundingSourceEntity(options);
    const transactionAuditLogs = createTransactionAuditLogEntity(options);
    const transactionAutoMatchRejections =
        createTransactionAutoMatchRejectionEntity(options);
    const transactionClassificationEmbeddings =
        createTransactionClassificationEmbeddingEntity(options);
    const transactionClassificationInteractions =
        createTransactionClassificationInteractionEntity(options);
    const transactionClassificationPending =
        createTransactionClassificationPendingEntity(options);
    const transactionClassificationSettings =
        createTransactionClassificationSettingsEntity(options);
    const transactionClassificationSources =
        createTransactionClassificationSourceEntity(options);
    const transactions = createTransactionEntity(options);
    const transactionImportActivities =
        createTransactionImportActivityEntity(options);
    const transactionLines = createTransactionLineEntity(options);
    const transactionTemplates = createTransactionTemplateEntity(options);
    const ledgerPostings = createLedgerPostingEntity(options);
    const ledgers = createLedgerEntity(options);
    const plaidAccountLinks = createPlaidAccountLinkEntity(options);
    const plaidItemSyncStates = createPlaidItemSyncStateEntity(options);
    const plaidSharedItems = createPlaidSharedItemEntity(options);
    const plaidTransactionSyncs = createPlaidTransactionSyncEntity(options);
    const workspaceMutationBatches = createWorkspaceMutationBatchEntity(options);
    const workspaceMutationReceipts = createWorkspaceMutationReceiptEntity(options);
    const workspaceMutationOperations =
        createWorkspaceMutationOperationEntity(options);
    const workspaceStates = createWorkspaceStateEntity(options);
    const venmoIntegrations = createVenmoIntegrationEntity(options);
    const venmoAccountMappings = createVenmoAccountMappingEntity(options);
    const ynabImportJobs = createYnabImportJobEntity(options);

    const service = new Service(
        {
            userAccounts,
            ledgers,
            accounts,
            automationSchedules,
            automationTaskRuns,
            amazonOrderIntegrations,
            amazonOrders,
            amazonOrderSyncRuns,
            budgetPeriods,
            budgetGroups,
            budgetCategories,
            categoryAllocations,
            allocationFundingSources,
            transactionAuditLogs,
            transactionAutoMatchRejections,
            transactionClassificationEmbeddings,
            transactionClassificationInteractions,
            transactionClassificationPending,
            transactionClassificationSettings,
            transactionClassificationSources,
            transactions,
            transactionImportActivities,
            transactionLines,
            transactionTemplates,
            ledgerPostings,
            workspaceMutationBatches,
            workspaceMutationReceipts,
            workspaceMutationOperations,
            workspaceStates,
            plaidAccountLinks,
            plaidItemSyncStates,
            plaidSharedItems,
            plaidTransactionSyncs,
            venmoIntegrations,
            venmoAccountMappings,
            ynabImportJobs,
        },
        options,
    );

    return {
        service,
        entities: {
            userAccounts,
            ledgers,
            accounts,
            automationSchedules,
            automationTaskRuns,
            amazonOrderIntegrations,
            amazonOrders,
            amazonOrderSyncRuns,
            budgetPeriods,
            budgetGroups,
            budgetCategories,
            categoryAllocations,
            allocationFundingSources,
            transactionAuditLogs,
            transactionAutoMatchRejections,
            transactionClassificationEmbeddings,
            transactionClassificationInteractions,
            transactionClassificationPending,
            transactionClassificationSettings,
            transactionClassificationSources,
            transactions,
            transactionImportActivities,
            transactionLines,
            transactionTemplates,
            ledgerPostings,
            plaidAccountLinks,
            plaidItemSyncStates,
            plaidSharedItems,
            plaidTransactionSyncs,
            workspaceMutationBatches,
            workspaceMutationReceipts,
            workspaceMutationOperations,
            workspaceStates,
            venmoIntegrations,
            venmoAccountMappings,
            ynabImportJobs,
        },
    };
}

const cachedSchemas = new Map<
    string,
    ReturnType<typeof createBudgetedSchema>
>();

export function getBudgetedSchema(table = requireLedgerTableName()) {
    const cachedSchema = cachedSchemas.get(table);

    if (cachedSchema) {
        return cachedSchema;
    }

    const schema = createBudgetedSchema(table);
    cachedSchemas.set(table, schema);

    return schema;
}
