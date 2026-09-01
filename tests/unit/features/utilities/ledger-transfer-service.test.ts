// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { LedgerExportFile } from "@/features/utilities/models/ledger-transfer";
import { ledgerTransferTestInternals } from "@/features/utilities/server/ledger-transfer-service";

function buildExportFile(): LedgerExportFile {
    return {
        exportedAt: "2026-06-24T12:00:00.000Z",
        format: "budgeted-ledger-export",
        plaidPolicy: "references-only-disabled-on-import",
        sourceLedger: {
            createdAt: "2026-01-01T00:00:00.000Z",
            ledgerId: "source-ledger",
            name: "Source Ledger",
            updatedAt: "2026-06-24T00:00:00.000Z",
        },
        version: 2,
        records: {
            accounts: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    balanceCents: 1_000,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    ledgerAccountId: "acct_account-1",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 500,
                    plaidAccountLinkId: "link-1",
                    plaidInstitutionName: "First Platypus",
                    plaidLinkStatus: "linked",
                    updatedAt: "2026-06-24T00:00:00.000Z",
                    ledgerId: "source-ledger",
                    accessToken: "secret-token",
                },
            ],
            allocationFundingSources: [
                {
                    allocationId: "allocation-1",
                    amountCents: 2_500,
                    categoryId: "category-1",
                    createdAt: "2026-06-01T00:00:00.000Z",
                    fundingSourceId: "funding-1",
                    periodId: "2026-06",
                    sourceId: "account-1",
                    sourceType: "account",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
            amazonOrderIntegrations: [],
            amazonOrderSyncRuns: [],
            amazonOrders: [],
            budgetAllocations: [
                {
                    activityCents: 0,
                    allocationId: "allocation-1",
                    assignedCents: 2_500,
                    availableCents: 2_500,
                    carriedForwardCents: 0,
                    categoryId: "category-1",
                    periodId: "2026-06",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "category-1",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    defaultAssignedCents: 2_500,
                    groupId: "group-1",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_category-1",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-06-24T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
            budgetGroups: [
                {
                    createdAt: "2026-01-01T00:00:00.000Z",
                    groupId: "group-1",
                    name: "Monthly",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-06-24T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
            budgetPeriods: [
                {
                    availableToBudgetCents: 0,
                    createdAt: "2026-06-01T00:00:00.000Z",
                    currency: "USD",
                    endsOn: "2026-06-30",
                    periodId: "2026-06",
                    startsOn: "2026-06-01",
                    status: "open",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
            ledgerPostings: [
                {
                    amountCents: 2_500,
                    createdAt: "2026-06-10T00:00:00.000Z",
                    direction: "credit",
                    ledgerAccountId: "acct_account-1",
                    ledgerAccountKind: "financial",
                    occurredAt: "2026-06-10T12:00:00.000Z",
                    periodId: "2026-06",
                    postingId: "posting-1",
                    transactionId: "transaction-1",
                    ledgerId: "source-ledger",
                },
            ],
            plaidAccountLinks: [
                {
                    accountId: "account-1",
                    createdAt: "2026-06-01T00:00:00.000Z",
                    lastSyncStatus: "succeeded",
                    plaidAccountId: "plaid-account-1",
                    plaidAccountLinkId: "link-1",
                    plaidItemId: "item-1",
                    status: "linked",
                    syncStartDate: "2026-01-01",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
            plaidTransactionSyncs: [
                {
                    accountId: "account-1",
                    firstSyncedAt: "2026-06-01T00:00:00.000Z",
                    lastSyncedAt: "2026-06-01T00:00:00.000Z",
                    ledgerId: "source-ledger",
                    name: "Market",
                    pending: false,
                    plaidAccountId: "plaid-account-1",
                    plaidAccountLinkId: "link-1",
                    plaidAmountCents: 2_500,
                    plaidDate: "2026-06-10",
                    plaidItemId: "item-1",
                    plaidPayloadJson: "{}",
                    plaidTransactionId: "plaid-transaction-1",
                    plaidTransactionSyncId: "sync-1",
                    status: "active",
                    transactionId: "transaction-1",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
            transactionImportActivities: [],
            transactionTemplates: [],
            venmoAccountMappings: [],
            venmoIntegrations: [],
            transactionLines: [
                {
                    amountCents: 2_500,
                    categoryId: "category-1",
                    createdAt: "2026-06-10T00:00:00.000Z",
                    fromAccountId: "account-1",
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: "2026-06-10T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
            transactions: [
                {
                    displayAmountCents: -2_500,
                    enteredAt: "2026-06-10T00:00:00.000Z",
                    kind: "standard",
                    occurredAt: "2026-06-10T12:00:00.000Z",
                    payee: "Market",
                    periodId: "2026-06",
                    plaidTransactionSyncId: "sync-1",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "category-1",
                    source: "plaid",
                    status: "entered",
                    transactionId: "transaction-1",
                    updatedAt: "2026-06-10T00:00:00.000Z",
                    ledgerId: "source-ledger",
                },
            ],
        },
    };
}

describe("ledger transfer service", () => {
    it("counts every portable record family from one shared family list", () => {
        const counts = ledgerTransferTestInternals.countLedgerTransferRecords(
            buildExportFile().records,
        );

        expect(counts).toEqual({
            accounts: 1,
            allocationFundingSources: 1,
            amazonOrderIntegrations: 0,
            amazonOrderSyncRuns: 0,
            amazonOrders: 0,
            budgetAllocations: 1,
            budgetCategories: 1,
            budgetGroups: 1,
            budgetPeriods: 1,
            ledgerPostings: 1,
            plaidAccountLinks: 1,
            plaidTransactionSyncs: 1,
            transactionImportActivities: 0,
            transactionTemplates: 0,
            transactionLines: 1,
            transactions: 1,
            venmoAccountMappings: 0,
            venmoIntegrations: 0,
        });
    });

    it("remaps records and disables live Plaid links on import", () => {
        const records = ledgerTransferTestInternals.remapImportedRecords({
            exportFile: buildExportFile(),
            targetLedgerId: "target-ledger",
        });

        expect(records.accounts[0]).toMatchObject({
            accountId: "account-1",
            plaidInstitutionName: "First Platypus",
            plaidLinkStatus: "disabled",
            ledgerId: "target-ledger",
        });
        expect(records.accounts[0]).not.toHaveProperty("balanceCents");
        expect(records.accounts[0]).not.toHaveProperty("plaidAccountLinkId");
        expect(records.accounts[0]).not.toHaveProperty("accessToken");
        expect(records.plaidAccountLinks[0]).toMatchObject({
            status: "disabled",
            ledgerId: "target-ledger",
        });
        expect(records.plaidTransactionSyncs[0]).toMatchObject({
            ledgerId: "target-ledger",
            plaidTransactionSyncId: "sync-1",
        });
    });

    it("remaps only groups and categories for budget plan imports", () => {
        const records = ledgerTransferTestInternals.remapImportedRecords({
            exportFile: buildExportFile(),
            importScope: "budgetPlan",
            targetLedgerId: "target-ledger",
        });

        expect(records.accounts).toEqual([]);
        expect(records.budgetAllocations).toEqual([]);
        expect(records.budgetGroups).toEqual([
            expect.objectContaining({
                groupId: "group-1",
                ledgerId: "target-ledger",
            }),
        ]);
        expect(records.budgetCategories).toEqual([
            expect.objectContaining({
                categoryId: "category-1",
                ledgerId: "target-ledger",
            }),
        ]);
        expect(records.transactions).toEqual([]);
        expect(records.transactionLines).toEqual([]);
        expect(records.ledgerPostings).toEqual([]);
    });

    it("rejects duplicate ids for every configured record family", () => {
        const records = ledgerTransferTestInternals.remapImportedRecords({
            exportFile: buildExportFile(),
            targetLedgerId: "target-ledger",
        });

        expect(() =>
            ledgerTransferTestInternals.validateLedgerTransferRecords({
                ...records,
                transactionLines: [
                    ...records.transactionLines,
                    {
                        ...records.transactionLines[0],
                    },
                ],
            }),
        ).toThrow("duplicate transaction line id");
    });

    it("merges imported records by configured family ids", () => {
        const existing = ledgerTransferTestInternals.remapImportedRecords({
            exportFile: buildExportFile(),
            targetLedgerId: "target-ledger",
        });
        const imported = {
            ...existing,
            accounts: [
                {
                    ...existing.accounts[0],
                    name: "Renamed checking",
                },
            ],
            budgetGroups: [
                {
                    ...existing.budgetGroups[0],
                    name: "Renamed group",
                },
                {
                    ...existing.budgetGroups[0],
                    groupId: "group-2",
                    name: "New group",
                },
            ],
            transactions: [
                {
                    ...existing.transactions[0],
                    payee: "Updated payee",
                },
            ],
        };
        const merged = ledgerTransferTestInternals.mergeTransferRecords({
            existing,
            imported,
        });

        expect(merged.accounts).toHaveLength(1);
        expect(merged.accounts[0].name).toBe("Renamed checking");
        expect(merged.budgetGroups).toHaveLength(2);
        expect(merged.budgetGroups.map((group) => group.name)).toEqual([
            "Renamed group",
            "New group",
        ]);
        expect(merged.transactions[0].payee).toBe("Updated payee");
    });

    it("rejects duplicate account names across different account ids", () => {
        const records = ledgerTransferTestInternals.remapImportedRecords({
            exportFile: buildExportFile(),
            targetLedgerId: "target-ledger",
        });

        expect(() =>
            ledgerTransferTestInternals.validateLedgerTransferRecords({
                ...records,
                accounts: [
                    ...records.accounts,
                    {
                        ...records.accounts[0],
                        accountId: "account-2",
                        ledgerAccountId: "acct_account-2",
                    },
                ],
            }),
        ).toThrow("duplicate account names");
    });

    it("restores internal reference category sentinels for persisted imports", () => {
        expect(
            ledgerTransferTestInternals.inferReferenceCategoryId({
                displayAmountCents: 0,
                kind: "standard",
                lines: [
                    {
                        amountCents: 500,
                        createdAt: "2026-06-10T00:00:00.000Z",
                        fromAccountId: "account-1",
                        lineId: "line-1",
                        sortOrder: 0,
                        toAccountId: "account-2",
                        transactionId: "transaction-1",
                        updatedAt: "2026-06-10T00:00:00.000Z",
                        ledgerId: "target-ledger",
                    },
                    {
                        amountCents: 500,
                        categoryId: "category-1",
                        createdAt: "2026-06-10T00:00:00.000Z",
                        fromAccountId: "account-2",
                        lineId: "line-2",
                        sortOrder: 1,
                        transactionId: "transaction-1",
                        updatedAt: "2026-06-10T00:00:00.000Z",
                        ledgerId: "target-ledger",
                    },
                ],
            }),
        ).toBe("__zero_net__");
        expect(
            ledgerTransferTestInternals.inferReferenceCategoryId({
                displayAmountCents: 500,
                kind: "adjustment",
                lines: [],
            }),
        ).toBe("__adjustment__");
    });

    it("uses the requested local timezone and gzip extension in export filenames", () => {
        expect(
            ledgerTransferTestInternals.createLedgerExportFilename(
                buildExportFile(),
                "America/Chicago",
            ),
        ).toBe("budgeted-ledger-source-ledger-2026-06-24-070000.json.gz");
    });
});
