import { describe, expect, it } from "vitest";

import {
    LEDGER_TRANSFER_RECORD_FAMILIES,
    countLedgerTransferRecords,
    ledgerImportRequestSchema,
    selectLedgerTransferRecordsForImportScope,
    type LedgerExportFile,
} from "@/features/utilities/models/ledger-transfer";
import { WORKSPACE_ENTITY_CONFIGS } from "@/lib/workspace/entity-config";

function emptyRecords(): LedgerExportFile["records"] {
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
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionImportActivities: [],
        transactionTemplates: [],
        transactionLines: [],
        transactions: [],
        venmoAccountMappings: [],
        venmoIntegrations: [],
    };
}

describe("ledger transfer model", () => {
    it("derives transfer record ids from workspace entity config", () => {
        const workspaceConfigByArrayKey = new Map(
            WORKSPACE_ENTITY_CONFIGS.map((config) => [
                config.arrayKey,
                config,
            ]),
        );

        expect(
            LEDGER_TRANSFER_RECORD_FAMILIES.map((family) => family.key),
        ).not.toContain("ledgers");

        for (const family of LEDGER_TRANSFER_RECORD_FAMILIES) {
            expect(family.idKey).toBe(
                workspaceConfigByArrayKey.get(family.key)?.idKey,
            );
        }
    });

    it("counts every portable ledger record family", () => {
        const records = emptyRecords();
        records.accounts.push({ accountId: "account-1" } as never);
        records.transactions.push({ transactionId: "transaction-1" } as never);
        records.transactions.push({ transactionId: "transaction-2" } as never);

        expect(countLedgerTransferRecords(records)).toEqual({
            accounts: 1,
            allocationFundingSources: 0,
            amazonOrderIntegrations: 0,
            amazonOrderSyncRuns: 0,
            amazonOrders: 0,
            budgetAllocations: 0,
            budgetCategories: 0,
            budgetGroups: 0,
            budgetPeriods: 0,
            ledgerPostings: 0,
            plaidAccountLinks: 0,
            plaidTransactionSyncs: 0,
            transactionImportActivities: 0,
            transactionTemplates: 0,
            transactionLines: 0,
            transactions: 2,
            venmoAccountMappings: 0,
            venmoIntegrations: 0,
        });
    });

    it("defaults import requests to full import", () => {
        const exportFile: LedgerExportFile = {
            exportedAt: "2026-06-24T12:00:00.000Z",
            format: "budgeted-ledger-export",
            plaidPolicy: "references-only-disabled-on-import",
            records: emptyRecords(),
            sourceLedger: {
                createdAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
                name: "Household",
                updatedAt: "2026-06-24T00:00:00.000Z",
            },
            version: 2,
        };

        expect(
            ledgerImportRequestSchema.parse({
                exportFile,
                mode: "create",
                targetLedgerName: "Imported",
            }),
        ).toMatchObject({
            importScope: "full",
            mode: "create",
        });
    });

    it("validates and retains canonical transaction importer activities", () => {
        const exportFile: LedgerExportFile = {
            exportedAt: "2026-06-24T12:00:00.000Z",
            format: "budgeted-ledger-export",
            plaidPolicy: "references-only-disabled-on-import",
            records: {
                ...emptyRecords(),
                transactions: [
                    {
                        displayAmountCents: -2500,
                        enteredAt: "2026-06-24T12:00:00.000Z",
                        kind: "standard",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-06-24T12:00:00.000Z",
                        periodId: "2026-06",
                        referenceAccountId: "account-1",
                        status: "entered",
                        transactionId: "transaction-1",
                        updatedAt: "2026-06-24T12:00:00.000Z",
                    },
                ],
            },
            sourceLedger: {
                createdAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
                name: "Household",
                updatedAt: "2026-06-24T00:00:00.000Z",
            },
            version: 2,
        };

        const parsed = ledgerImportRequestSchema.parse({
            exportFile,
            mode: "create",
            targetLedgerName: "Imported",
        });

        expect(parsed.exportFile.records.transactionImportActivities).toEqual(
            exportFile.records.transactionImportActivities,
        );
    });

    it("selects only budget groups and categories for budget plan imports", () => {
        const records = emptyRecords();
        records.accounts.push({ accountId: "account-1" } as never);
        records.budgetGroups.push({ groupId: "group-1" } as never);
        records.budgetCategories.push({ categoryId: "category-1" } as never);
        records.transactions.push({ transactionId: "transaction-1" } as never);

        expect(
            countLedgerTransferRecords(
                selectLedgerTransferRecordsForImportScope(
                    records,
                    "budgetPlan",
                ),
            ),
        ).toEqual({
            accounts: 0,
            allocationFundingSources: 0,
            amazonOrderIntegrations: 0,
            amazonOrderSyncRuns: 0,
            amazonOrders: 0,
            budgetAllocations: 0,
            budgetCategories: 1,
            budgetGroups: 1,
            budgetPeriods: 0,
            ledgerPostings: 0,
            plaidAccountLinks: 0,
            plaidTransactionSyncs: 0,
            transactionImportActivities: 0,
            transactionTemplates: 0,
            transactionLines: 0,
            transactions: 0,
            venmoAccountMappings: 0,
            venmoIntegrations: 0,
        });
    });
});
