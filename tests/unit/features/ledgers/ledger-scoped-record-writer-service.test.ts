// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LedgerScopedRecordWriteSet } from "@/features/ledgers/server/ledger-scoped-record-writer-service";

const mocks = vi.hoisted(() => ({
    accountsGo: vi.fn(),
    accountsUpsert: vi.fn(),
    allocationFundingSourcesGo: vi.fn(),
    allocationFundingSourcesUpsert: vi.fn(),
    budgetCategoriesGo: vi.fn(),
    budgetCategoriesUpsert: vi.fn(),
    budgetGroupsGo: vi.fn(),
    budgetGroupsUpsert: vi.fn(),
    budgetPeriodsGo: vi.fn(),
    budgetPeriodsUpsert: vi.fn(),
    categoryAllocationsGo: vi.fn(),
    categoryAllocationsUpsert: vi.fn(),
    ledgerPostingsGo: vi.fn(),
    ledgerPostingsPut: vi.fn(),
    plaidAccountLinksGo: vi.fn(),
    plaidAccountLinksUpsert: vi.fn(),
    plaidTransactionSyncsGo: vi.fn(),
    plaidTransactionSyncsPut: vi.fn(),
    toStoredTransactionLineRecord: vi.fn(),
    transactionLinesGo: vi.fn(),
    transactionLinesPut: vi.fn(),
    transactionsGo: vi.fn(),
    transactionsPut: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: { upsert: mocks.accountsUpsert },
            allocationFundingSources: {
                upsert: mocks.allocationFundingSourcesUpsert,
            },
            budgetCategories: { upsert: mocks.budgetCategoriesUpsert },
            budgetGroups: { upsert: mocks.budgetGroupsUpsert },
            budgetPeriods: { upsert: mocks.budgetPeriodsUpsert },
            categoryAllocations: { upsert: mocks.categoryAllocationsUpsert },
            ledgerPostings: { put: mocks.ledgerPostingsPut },
            plaidAccountLinks: { upsert: mocks.plaidAccountLinksUpsert },
            plaidTransactionSyncs: { put: mocks.plaidTransactionSyncsPut },
            transactionLines: { put: mocks.transactionLinesPut },
            transactions: { put: mocks.transactionsPut },
        },
    }),
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    toStoredTransactionLineRecord: mocks.toStoredTransactionLineRecord,
}));

import {
    countLedgerScopedRecords,
    writeLedgerScopedRecords,
} from "@/features/ledgers/server/ledger-scoped-record-writer-service";

function createWriteSet(): LedgerScopedRecordWriteSet {
    const timestamp = "2026-06-25T00:00:00.000Z";

    return {
        accounts: [
            {
                accountId: "account-1",
                accountType: "checking",
                createdAt: timestamp,
                ledgerAccountId: "ledger-account-1",
                ledgerId: "ledger-1",
                name: "Checking",
                openedOn: "2026-06-25",
                openingBalanceCents: 0,
                updatedAt: timestamp,
            },
        ],
        allocationFundingSources: [
            {
                allocationId: "allocation-1",
                amountCents: 1000,
                categoryId: "category-1",
                createdAt: timestamp,
                fundingSourceId: "funding-source-1",
                ledgerId: "ledger-1",
                periodId: "2026-06",
                sourceId: "account-1",
                sourceType: "account",
                updatedAt: timestamp,
            },
        ],
        budgetAllocations: [
            {
                allocationId: "allocation-1",
                assignedCents: 1000,
                categoryId: "category-1",
                ledgerId: "ledger-1",
                periodId: "2026-06",
                updatedAt: timestamp,
            },
        ],
        budgetCategories: [
            {
                categoryId: "category-1",
                createdAt: timestamp,
                defaultAssignedCents: 0,
                groupId: "group-1",
                isIncomeCategory: false,
                ledgerAccountId: "category-ledger-account-1",
                ledgerId: "ledger-1",
                name: "Groceries",
                sortOrder: 0,
                status: "active",
                updatedAt: timestamp,
            },
        ],
        budgetGroups: [
            {
                createdAt: timestamp,
                groupId: "group-1",
                ledgerId: "ledger-1",
                name: "Monthly",
                sortOrder: 0,
                status: "active",
                updatedAt: timestamp,
            },
        ],
        budgetPeriods: [
            {
                availableToBudgetCents: 0,
                createdAt: timestamp,
                currency: "USD",
                endsOn: "2026-06-30",
                ledgerId: "ledger-1",
                periodId: "2026-06",
                startsOn: "2026-06-01",
                status: "open",
                updatedAt: timestamp,
            },
        ],
        ledgerPostings: [
            {
                amountCents: 1000,
                createdAt: timestamp,
                direction: "credit",
                ledgerAccountId: "ledger-account-1",
                ledgerAccountKind: "financial",
                ledgerId: "ledger-1",
                occurredAt: "2026-06-25T00:00:00.000Z",
                periodId: "2026-06",
                postingId: "posting-1",
                transactionId: "transaction-1",
            },
        ],
        plaidAccountLinks: [
            {
                accountId: "account-1",
                createdAt: timestamp,
                lastSyncStatus: "never",
                ledgerId: "ledger-1",
                plaidAccountId: "plaid-account-1",
                plaidAccountLinkId: "link-1",
                plaidItemId: "item-1",
                status: "disabled",
                syncStartDate: "2026-06-25",
                updatedAt: timestamp,
            },
        ],
        plaidTransactionSyncs: [
            {
                accountId: "account-1",
                firstSyncedAt: timestamp,
                lastSyncedAt: timestamp,
                ledgerId: "ledger-1",
                name: "Plaid transaction",
                pending: false,
                plaidAccountId: "plaid-account-1",
                plaidAccountLinkId: "link-1",
                plaidAmountCents: 1000,
                plaidDate: "2026-06-25",
                plaidItemId: "item-1",
                plaidPayloadJson: "{}",
                plaidTransactionId: "plaid-transaction-1",
                plaidTransactionSyncId: "sync-1",
                status: "active",
                transactionId: "transaction-1",
                updatedAt: timestamp,
            },
        ],
        transactionLines: [
            {
                amountCents: 1000,
                createdAt: timestamp,
                fromAccountId: "account-1",
                ledgerId: "ledger-1",
                lineId: "line-1",
                sortOrder: 0,
                toAccountId: "__no_to_account__",
                transactionId: "transaction-1",
                updatedAt: timestamp,
            },
        ],
        transactions: [
            {
                displayAmountCents: -1000,
                enteredAt: timestamp,
                kind: "standard",
                ledgerId: "ledger-1",
                occurredAt: "2026-06-25T00:00:00.000Z",
                periodId: "2026-06",
                referenceAccountId: "account-1",
                source: "manual",
                status: "entered",
                transactionId: "transaction-1",
                updatedAt: timestamp,
            },
        ],
    };
}

describe("ledger scoped record writer service", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        for (const [methodName, goName] of [
            ["accountsUpsert", "accountsGo"],
            ["allocationFundingSourcesUpsert", "allocationFundingSourcesGo"],
            ["budgetCategoriesUpsert", "budgetCategoriesGo"],
            ["budgetGroupsUpsert", "budgetGroupsGo"],
            ["budgetPeriodsUpsert", "budgetPeriodsGo"],
            ["categoryAllocationsUpsert", "categoryAllocationsGo"],
            ["ledgerPostingsPut", "ledgerPostingsGo"],
            ["plaidAccountLinksUpsert", "plaidAccountLinksGo"],
            ["plaidTransactionSyncsPut", "plaidTransactionSyncsGo"],
            ["transactionLinesPut", "transactionLinesGo"],
            ["transactionsPut", "transactionsGo"],
        ] as const) {
            mocks[methodName].mockReturnValue({ go: mocks[goName] });
            mocks[goName].mockResolvedValue(undefined);
        }

        mocks.toStoredTransactionLineRecord.mockImplementation((line) => ({
            ...line,
            stored: true,
        }));
    });

    it("writes ledger-scoped records through the expected entity methods", async () => {
        const records = createWriteSet();

        await writeLedgerScopedRecords(records);

        expect(mocks.budgetPeriodsUpsert).toHaveBeenCalledWith(
            records.budgetPeriods[0],
        );
        expect(mocks.budgetGroupsUpsert).toHaveBeenCalledWith(
            records.budgetGroups[0],
        );
        expect(mocks.budgetCategoriesUpsert).toHaveBeenCalledWith(
            records.budgetCategories[0],
        );
        expect(mocks.accountsUpsert).toHaveBeenCalledWith(records.accounts[0]);
        expect(mocks.transactionsPut).toHaveBeenCalledWith(
            records.transactions[0],
        );
        expect(mocks.toStoredTransactionLineRecord).toHaveBeenCalledWith(
            records.transactionLines[0],
        );
        expect(mocks.transactionLinesPut).toHaveBeenCalledWith({
            ...records.transactionLines[0],
            stored: true,
        });
        expect(mocks.ledgerPostingsPut).toHaveBeenCalledWith(
            records.ledgerPostings[0],
        );
        expect(mocks.categoryAllocationsUpsert).toHaveBeenCalledWith(
            records.budgetAllocations[0],
        );
        expect(mocks.allocationFundingSourcesUpsert).toHaveBeenCalledWith(
            records.allocationFundingSources?.[0],
        );
        expect(mocks.plaidAccountLinksUpsert).toHaveBeenCalledWith(
            records.plaidAccountLinks?.[0],
        );
        expect(mocks.plaidTransactionSyncsPut).toHaveBeenCalledWith(
            records.plaidTransactionSyncs?.[0],
        );
    });

    it("counts optional and required ledger-scoped record families", () => {
        const records = createWriteSet();

        expect(countLedgerScopedRecords(records)).toBe(11);
        expect(
            countLedgerScopedRecords({
                ...records,
                allocationFundingSources: undefined,
                plaidAccountLinks: undefined,
                plaidTransactionSyncs: undefined,
            }),
        ).toBe(8);
    });
});
