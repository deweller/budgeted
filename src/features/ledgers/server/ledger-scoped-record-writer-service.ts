import { writeChunkedRecords } from "@/lib/db/chunked-write";
import { getBudgetedSchema } from "@/lib/db/schema";
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
import { toStoredTransactionLineRecord } from "@/features/transactions/server/transaction-line-service";

export type LedgerScopedRecordWriteSet = {
    accounts: Array<Omit<WorkspaceAccountRecord, "balanceCents">>;
    allocationFundingSources?: WorkspaceAllocationFundingSourceRecord[];
    amazonOrderIntegrations?: WorkspaceAmazonOrderIntegrationRecord[];
    amazonOrderSyncRuns?: WorkspaceAmazonOrderSyncRunRecord[];
    amazonOrders?: WorkspaceAmazonOrderRecord[];
    budgetAllocations: WorkspaceCategoryAllocationRecord[];
    budgetCategories: WorkspaceBudgetCategoryRecord[];
    budgetGroups: WorkspaceBudgetGroupRecord[];
    budgetPeriods: WorkspaceBudgetPeriodRecord[];
    ledgerPostings: WorkspaceLedgerPostingRecord[];
    plaidAccountLinks?: WorkspacePlaidAccountLinkRecord[];
    plaidTransactionSyncs?: WorkspacePlaidTransactionSyncRecord[];
    transactionTemplates?: WorkspaceTransactionTemplateRecord[];
    transactionImportActivities?: WorkspaceTransactionImportActivityRecord[];
    transactionLines: WorkspaceTransactionLineRecord[];
    transactions: WorkspaceTransactionRecord[];
    venmoAccountMappings?: WorkspaceVenmoAccountMappingRecord[];
    venmoIntegrations?: WorkspaceVenmoIntegrationRecord[];
};

export async function writeLedgerScopedRecords(
    records: LedgerScopedRecordWriteSet,
) {
    const { entities } = getBudgetedSchema();

    await writeChunkedRecords(records.budgetPeriods, (record) =>
        entities.budgetPeriods.upsert(record).go(),
    );
    await writeChunkedRecords(records.budgetGroups, (record) =>
        entities.budgetGroups.upsert(record).go(),
    );
    await writeChunkedRecords(records.budgetCategories, (record) =>
        entities.budgetCategories.upsert(record).go(),
    );
    await writeChunkedRecords(records.accounts, (record) =>
        entities.accounts.upsert(record).go(),
    );
    await writeChunkedRecords(records.transactions, (record) =>
        entities.transactions.put(record).go(),
    );
    await writeChunkedRecords(records.transactionLines, (record) =>
        entities.transactionLines.put(toStoredTransactionLineRecord(record)).go(),
    );
    await writeChunkedRecords(records.ledgerPostings, (record) =>
        entities.ledgerPostings.put(record).go(),
    );
    await writeChunkedRecords(records.budgetAllocations, (record) =>
        entities.categoryAllocations.upsert(record).go(),
    );
    await writeChunkedRecords(records.allocationFundingSources ?? [], (record) =>
        entities.allocationFundingSources.upsert(record).go(),
    );
    await writeChunkedRecords(records.amazonOrderIntegrations ?? [], (record) =>
        entities.amazonOrderIntegrations.upsert(record).go(),
    );
    await writeChunkedRecords(records.amazonOrders ?? [], (record) =>
        entities.amazonOrders.upsert(record).go(),
    );
    await writeChunkedRecords(records.amazonOrderSyncRuns ?? [], (record) =>
        entities.amazonOrderSyncRuns.upsert(record).go(),
    );
    await writeChunkedRecords(records.plaidAccountLinks ?? [], (record) =>
        entities.plaidAccountLinks.upsert(record).go(),
    );
    await writeChunkedRecords(records.plaidTransactionSyncs ?? [], (record) =>
        entities.plaidTransactionSyncs.put(record).go(),
    );
    await writeChunkedRecords(records.transactionTemplates ?? [], (record) =>
        entities.transactionTemplates.upsert(record).go(),
    );
    await writeChunkedRecords(
        records.transactionImportActivities ?? [],
        (record) => entities.transactionImportActivities.put(record).go(),
    );
    await writeChunkedRecords(records.venmoAccountMappings ?? [], (record) => entities.venmoAccountMappings.upsert(record).go());
    await writeChunkedRecords(records.venmoIntegrations ?? [], (record) => entities.venmoIntegrations.upsert(record).go());
}

export function countLedgerScopedRecords(records: LedgerScopedRecordWriteSet) {
    return (
        records.accounts.length +
        (records.allocationFundingSources?.length ?? 0) +
        (records.amazonOrderIntegrations?.length ?? 0) +
        (records.amazonOrderSyncRuns?.length ?? 0) +
        (records.amazonOrders?.length ?? 0) +
        records.budgetAllocations.length +
        records.budgetCategories.length +
        records.budgetGroups.length +
        records.budgetPeriods.length +
        records.ledgerPostings.length +
        (records.plaidAccountLinks?.length ?? 0) +
        (records.plaidTransactionSyncs?.length ?? 0) +
        (records.transactionTemplates?.length ?? 0) +
        (records.transactionImportActivities?.length ?? 0) +
        records.transactionLines.length +
        records.transactions.length
        + (records.venmoAccountMappings?.length ?? 0)
        + (records.venmoIntegrations?.length ?? 0)
    );
}
