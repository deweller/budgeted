import { describe, expect, it } from "vitest";

import { buildBudgetPeriodSummaryFromSnapshot } from "@/lib/workspace/budget-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import { UNCATEGORIZED_CATEGORY_ID } from "@/modules/budgeting/uncategorized";

const timestamp = "2026-01-01T00:00:00.000Z";
const ledgerId = "ledger-1";

function createSnapshot(
    overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
    return {
        accounts: [],
        activeLedgerId: "ledger-1",
        activeLedgerName: "Ledger",
        allocationFundingSources: [],
        budgetAllocations: [],
        budgetCategories: [
            {
                categoryId: "food",
                createdAt: timestamp,
                defaultAssignedCents: 0,
                groupId: "monthly",
                isIncomeCategory: false,
                ledgerAccountId: "cat_food",
                name: "Food",
                sortOrder: 0,
                status: "active",
                updatedAt: timestamp,
                ledgerId: ledgerId,
            },
        ],
        budgetGroups: [
            {
                createdAt: timestamp,
                groupId: "monthly",
                name: "Monthly",
                sortOrder: 0,
                status: "active",
                updatedAt: timestamp,
                ledgerId: ledgerId,
            },
        ],
        budgetPeriods: [
            {
                availableToBudgetCents: 0,
                createdAt: timestamp,
                currency: "USD",
                endsOn: "2026-01-31",
                periodId: "2026-01",
                startsOn: "2026-01-01",
                status: "open",
                updatedAt: timestamp,
                ledgerId: ledgerId,
            },
        ],
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: "ledger-1",
            changeCursor: "",
            entityCounts: {
                account: 0,
                allocationFundingSource: 0,
                budgetCategory: 1,
                budgetGroup: 1,
                budgetPeriod: 1,
                categoryAllocation: 0,
                ledger: 1,
                ledgerPosting: 0,
                plaidAccountLink: 0,
                plaidTransactionSync: 0,
                transaction: 0,
                transactionLine: 0,
            },
            generatedAt: timestamp,
            retainedChangesAfter: timestamp,
            revision: "",
        },
        ledgerPostings: [],
        ledgers: [
            {
                createdAt: timestamp,
                isDefault: false,
                ledgerId: "ledger-1",
                workspaceId: "global",
                name: "Ledger",
                status: "active",
                updatedAt: timestamp,
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [],
        ...overrides,
    };
}

describe("budget projector funding accounts", () => {
    it("excludes liability and tracking account balances from available budget funds", () => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            createSnapshot({
                accounts: [
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 10_000,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                    {
                        accountId: "credit-card",
                        accountType: "creditCard",
                        balanceCents: -3_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_credit_card",
                        name: "Credit Card",
                        openedOn: "2026-01-01",
                        openingBalanceCents: -3_000,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                    {
                        accountId: "transfers",
                        accountType: "transfers",
                        balanceCents: -50_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_transfers",
                        name: "Transfers",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 0,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                    {
                        accountId: "brokerage",
                        accountType: "tracking",
                        balanceCents: 500_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_brokerage",
                        name: "Brokerage",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 500_000,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
            }),
            "2026-01",
        );

        expect(summary.activeAccountCount).toBe(1);
        expect(summary.allocationFundingCents).toBe(10_000);
        expect(summary.assignedAllocationTotalCents).toBe(0);
        expect(summary.allocationDifferenceCents).toBe(10_000);
        expect(summary.availableToBudgetCents).toBe(10_000);
    });

    it("excludes tracking account category postings from budget activity", () => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            createSnapshot({
                accounts: [
                    {
                        accountId: "brokerage",
                        accountType: "tracking",
                        balanceCents: 500_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_brokerage",
                        name: "Brokerage",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 500_000,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
                ledgerPostings: [
                    {
                        amountCents: 10_000,
                        createdAt: timestamp,
                        direction: "credit",
                        ledgerAccountId: "acct_brokerage",
                        ledgerAccountKind: "financial",
                        occurredAt: "2026-01-15T12:00:00.000Z",
                        periodId: "2026-01",
                        postingId: "posting-financial",
                        transactionId: "tracking-transaction",
                        ledgerId: ledgerId,
                    },
                    {
                        amountCents: 10_000,
                        createdAt: timestamp,
                        direction: "debit",
                        ledgerAccountId: "cat_food",
                        ledgerAccountKind: "category",
                        occurredAt: "2026-01-15T12:00:00.000Z",
                        periodId: "2026-01",
                        postingId: "posting-category",
                        transactionId: "tracking-transaction",
                        ledgerId: ledgerId,
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: -10_000,
                        enteredAt: timestamp,
                        occurredAt: "2026-01-15T12:00:00.000Z",
                        periodId: "2026-01",
                        postings: [],
                        referenceAccountId: "brokerage",
                        referenceCategoryId: "food",
                        status: "entered",
                        lines: [],
                        transactionId: "tracking-transaction",
                        kind: "standard",
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
            }),
            "2026-01",
        );
        const foodCategory = summary.categories.find(
            (category) => category.categoryId === "food",
        );

        expect(summary.availableToBudgetCents).toBe(0);
        expect(foodCategory?.activityCents).toBe(0);
        expect(foodCategory?.availableCents).toBe(0);
    });

    it("counts credit card category transactions as budget activity", () => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            createSnapshot({
                accounts: [
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 10_000,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                    {
                        accountId: "credit-card",
                        accountType: "creditCard",
                        balanceCents: -2_500,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_credit_card",
                        name: "Credit Card",
                        openedOn: "2026-01-01",
                        openingBalanceCents: -2_500,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
                transactionLines: [
                    {
                        amountCents: 2_500,
                        categoryId: "food",
                        createdAt: timestamp,
                        fromAccountId: "credit-card",
                        lineId: "credit-card-line",
                        sortOrder: 0,
                        transactionId: "credit-card-transaction",
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: -2_500,
                        enteredAt: timestamp,
                        occurredAt: "2026-01-15T00:00:00.000Z",
                        periodId: "2026-01",
                        postings: [],
                        referenceAccountId: "credit-card",
                        referenceCategoryId: "food",
                        status: "entered",
                        lines: [],
                        transactionId: "credit-card-transaction",
                        kind: "standard",
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
            }),
            "2026-01",
        );
        const foodCategory = summary.categories.find(
            (category) => category.categoryId === "food",
        );

        expect(summary.activeAccountCount).toBe(1);
        expect(summary.allocationFundingCents).toBe(10_000);
        expect(summary.availableToBudgetCents).toBe(10_000);
        expect(foodCategory?.activityCents).toBe(-2_500);
        expect(foodCategory?.availableCents).toBe(-2_500);
    });

    it("counts transfer account category entries as budget activity", () => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            createSnapshot({
                accounts: [
                    {
                        accountId: "transfers",
                        accountType: "transfers",
                        balanceCents: 0,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_transfers",
                        name: "Transfers",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 0,
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                budgetCategories: [
                    {
                        categoryId: "food",
                        createdAt: timestamp,
                        defaultAssignedCents: 0,
                        groupId: "monthly",
                        isIncomeCategory: false,
                        ledgerAccountId: "cat_food",
                        name: "Food",
                        sortOrder: 0,
                        status: "active",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                    {
                        categoryId: "rent",
                        createdAt: timestamp,
                        defaultAssignedCents: 0,
                        groupId: "monthly",
                        isIncomeCategory: false,
                        ledgerAccountId: "cat_rent",
                        name: "Rent",
                        sortOrder: 1,
                        status: "active",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                transactionLines: [
                    {
                        amountCents: 2_500,
                        categoryId: "food",
                        createdAt: timestamp,
                        fromAccountId: "transfers",
                        lineId: "transfer-food-line",
                        sortOrder: 0,
                        transactionId: "category-transfer",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                    {
                        amountCents: 2_500,
                        categoryId: "rent",
                        createdAt: timestamp,
                        lineId: "transfer-rent-line",
                        sortOrder: 1,
                        toAccountId: "transfers",
                        transactionId: "category-transfer",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: 0,
                        enteredAt: timestamp,
                        kind: "standard",
                        ledgerId,
                        lines: [],
                        occurredAt: "2026-01-15T00:00:00.000Z",
                        periodId: "2026-01",
                        postings: [],
                        referenceAccountId: "transfers",
                        status: "entered",
                        transactionId: "category-transfer",
                        updatedAt: timestamp,
                    },
                ],
            }),
            "2026-01",
        );
        const foodCategory = summary.categories.find(
            (category) => category.categoryId === "food",
        );
        const rentCategory = summary.categories.find(
            (category) => category.categoryId === "rent",
        );

        expect(foodCategory?.activityCents).toBe(-2_500);
        expect(foodCategory?.availableCents).toBe(-2_500);
        expect(rentCategory?.activityCents).toBe(2_500);
        expect(rentCategory?.availableCents).toBe(2_500);
    });

    it("uses transaction line accounts instead of parent reference accounts for tracking activity", () => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            createSnapshot({
                accounts: [
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 10_000,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                    {
                        accountId: "brokerage",
                        accountType: "tracking",
                        balanceCents: 500_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_brokerage",
                        name: "Brokerage",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 500_000,
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
                transactionLines: [
                    {
                        amountCents: 5_000,
                        categoryId: "food",
                        createdAt: timestamp,
                        fromAccountId: "checking",
                        lineId: "checking-line",
                        sortOrder: 0,
                        transactionId: "mixed-transaction",
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                    {
                        amountCents: 10_000,
                        categoryId: "food",
                        createdAt: timestamp,
                        fromAccountId: "brokerage",
                        lineId: "tracking-line",
                        sortOrder: 1,
                        transactionId: "mixed-transaction",
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: -15_000,
                        enteredAt: timestamp,
                        occurredAt: "2026-01-15T12:00:00.000Z",
                        periodId: "2026-01",
                        postings: [],
                        referenceAccountId: "checking",
                        referenceCategoryId: "food",
                        status: "entered",
                        lines: [],
                        transactionId: "mixed-transaction",
                        kind: "standard",
                        updatedAt: timestamp,
                        ledgerId: ledgerId,
                    },
                ],
            }),
            "2026-01",
        );
        const foodCategory = summary.categories.find(
            (category) => category.categoryId === "food",
        );

        expect(foodCategory?.activityCents).toBe(-5_000);
        expect(foodCategory?.availableCents).toBe(-5_000);
    });

    it("projects uncategorized account activity as a synthetic budget category", () => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            createSnapshot({
                accounts: [
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 8_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 10_000,
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                budgetAllocations: [
                    {
                        allocationId: "2026-01:food",
                        assignedCents: 0,
                        categoryId: "food",
                        periodId: "2026-01",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                    {
                        allocationId: "2026-02:food",
                        assignedCents: 0,
                        categoryId: "food",
                        periodId: "2026-02",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                budgetPeriods: [
                    {
                        availableToBudgetCents: 0,
                        createdAt: timestamp,
                        currency: "USD",
                        endsOn: "2026-01-31",
                        periodId: "2026-01",
                        startsOn: "2026-01-01",
                        status: "open",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                    {
                        availableToBudgetCents: 0,
                        createdAt: timestamp,
                        currency: "USD",
                        endsOn: "2026-02-28",
                        periodId: "2026-02",
                        startsOn: "2026-02-01",
                        status: "open",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                ledgerPostings: [
                    {
                        amountCents: 2_000,
                        createdAt: timestamp,
                        direction: "credit",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        occurredAt: "2026-02-15T00:00:00.000Z",
                        periodId: "2026-02",
                        postingId: "posting-checking-outflow",
                        transactionId: "unbudgeted-outflow",
                        ledgerId,
                    },
                    {
                        amountCents: 2_000,
                        createdAt: timestamp,
                        direction: "debit",
                        ledgerAccountId: "equity",
                        ledgerAccountKind: "equity",
                        occurredAt: "2026-02-15T00:00:00.000Z",
                        periodId: "2026-02",
                        postingId: "posting-equity-offset",
                        transactionId: "unbudgeted-outflow",
                        ledgerId,
                    },
                ],
                transactionLines: [
                    {
                        amountCents: 2_000,
                        createdAt: timestamp,
                        fromAccountId: "checking",
                        lineId: "line-unbudgeted-outflow",
                        sortOrder: 0,
                        transactionId: "unbudgeted-outflow",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: -2_000,
                        enteredAt: timestamp,
                        occurredAt: "2026-02-15T00:00:00.000Z",
                        periodId: "2026-02",
                        postings: [],
                        referenceAccountId: "checking",
                        referenceCategoryId: UNCATEGORIZED_CATEGORY_ID,
                        status: "entered",
                        lines: [],
                        transactionId: "unbudgeted-outflow",
                        kind: "standard",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
            }),
            "2026-02",
        );
        const foodCategory = summary.categories.find(
            (category) => category.categoryId === "food",
        );
        const uncategorizedCategory = summary.categories.find(
            (category) => category.categoryId === UNCATEGORIZED_CATEGORY_ID,
        );

        expect(summary.availableToBudgetCents).toBe(0);
        expect(summary.assignedAllocationTotalCents).toBe(0);
        expect(uncategorizedCategory).toEqual(
            expect.objectContaining({
                activityCents: -2_000,
                assignedCents: 0,
                availableCents: -2_000,
                carriedForwardCents: 0,
                name: "Uncategorized",
            }),
        );
        expect(foodCategory?.carriedForwardCents).toBe(0);
        expect(foodCategory?.availableCents).toBe(0);
    });

    it("ignores stale saved activity when no matching transaction activity exists", () => {
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            createSnapshot({
                accounts: [
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: timestamp,
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 10_000,
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
                budgetAllocations: [
                    {
                        allocationId: "2026-01:food",
                        assignedCents: 0,
                        categoryId: "food",
                        periodId: "2026-01",
                        updatedAt: timestamp,
                        ledgerId,
                    },
                ],
            }),
            "2026-01",
        );
        const foodCategory = summary.categories.find(
            (category) => category.categoryId === "food",
        );

        expect(foodCategory?.activityCents).toBe(0);
        expect(foodCategory?.availableCents).toBe(0);
        expect(summary.allocationFundingCents).toBe(10_000);
        expect(summary.allocationDifferenceCents).toBe(10_000);
        expect(summary.availableToBudgetCents).toBe(10_000);
    });
});
