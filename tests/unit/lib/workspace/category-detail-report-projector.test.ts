import { describe, expect, it } from "vitest";

import { buildCategoryDetailReportView } from "@/lib/workspace/category-detail-report-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import { UNCATEGORIZED_CATEGORY_ID } from "@/modules/budgeting/uncategorized";
import { UNASSIGNED_CATEGORY_ID } from "@/modules/budgeting/unassigned";

const timestamp = "2026-01-01T00:00:00.000Z";
const ledgerId = "ledger-1";

function createSnapshot(
    overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
    return {
        accounts: [],
        activeLedgerId: ledgerId,
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
                ledgerId,
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
        ],
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: ledgerId,
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
                isDefault: true,
                ledgerId,
                name: "Ledger",
                status: "active",
                updatedAt: timestamp,
                workspaceId: "global",
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [],
        ...overrides,
    };
}

describe("category detail report projector", () => {
    it("defaults to all periods instead of the latest month", () => {
        const snapshot = createSnapshot({
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
                    allocationId: "allocation-food-jan",
                    assignedCents: 5_000,
                    categoryId: "food",
                    periodId: "2026-01",
                    updatedAt: timestamp,
                    ledgerId,
                },
                {
                    allocationId: "allocation-food-feb",
                    assignedCents: 1_000,
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
            transactions: [
                {
                    displayAmountCents: -1_200,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [
                        {
                            amountCents: 1_200,
                            categoryId: "food",
                            createdAt: timestamp,
                            fromAccountId: "checking",
                            lineId: "line-food-jan",
                            memo: "January",
                            payee: "Market",
                            sortOrder: 0,
                            transactionId: "transaction-food-jan",
                            updatedAt: timestamp,
                            ledgerId,
                        },
                    ],
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-food-jan",
                    updatedAt: timestamp,
                },
                {
                    displayAmountCents: -300,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [
                        {
                            amountCents: 300,
                            categoryId: "food",
                            createdAt: timestamp,
                            fromAccountId: "checking",
                            lineId: "line-food-feb",
                            memo: "February",
                            payee: "Market",
                            sortOrder: 0,
                            transactionId: "transaction-food-feb",
                            updatedAt: timestamp,
                            ledgerId,
                        },
                    ],
                    occurredAt: "2026-02-10T00:00:00.000Z",
                    periodId: "2026-02",
                    postings: [],
                    referenceAccountId: "checking",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-food-feb",
                    updatedAt: timestamp,
                },
            ],
        });

        const view = buildCategoryDetailReportView({
            categoryId: "food",
            snapshot,
        });

        expect(view.filterMode).toBe("all");
        expect(view.events).toHaveLength(4);
        expect(view.events.map((event) => event.periodId)).toEqual([
            "2026-01",
            "2026-01",
            "2026-02",
            "2026-02",
        ]);
        expect(view.totalCents).toBe(4_500);
    });

    it("projects category allocation and transaction rows with running totals", () => {
        const snapshot = createSnapshot({
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
                    allocationId: "allocation-food",
                    assignedCents: 5_000,
                    categoryId: "food",
                    periodId: "2026-01",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            transactions: [
                {
                    displayAmountCents: -1_200,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [
                        {
                            amountCents: 1_200,
                            categoryId: "food",
                            createdAt: timestamp,
                            fromAccountId: "checking",
                            lineId: "line-food",
                            memo: "Weekly run",
                            payee: "Market",
                            sortOrder: 0,
                            transactionId: "transaction-food",
                            updatedAt: timestamp,
                            ledgerId,
                        },
                    ],
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    payee: "Market",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-food",
                    updatedAt: timestamp,
                },
            ],
        });

        const view = buildCategoryDetailReportView({
            categoryId: "food",
            periodId: "2026-01",
            snapshot,
        });

        expect(view.selectedCategoryName).toBe("Food");
        expect(view.openingCents).toBe(0);
        expect(view.totalCents).toBe(3_800);
        expect(view.events).toEqual([
            expect.objectContaining({
                amountCents: 5_000,
                runningCents: 5_000,
                type: "allocation",
            }),
            expect.objectContaining({
                amountCents: -1_200,
                memo: "Weekly run",
                payee: "Market",
                runningCents: 3_800,
                transactionId: "transaction-food",
                type: "transaction",
            }),
        ]);
    });

    it("includes credit card transactions in category activity reports", () => {
        const snapshot = createSnapshot({
            accounts: [
                {
                    accountId: "credit-card",
                    accountType: "creditCard",
                    balanceCents: -1_200,
                    createdAt: timestamp,
                    ledgerAccountId: "acct_credit_card",
                    name: "Credit Card",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 0,
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            transactions: [
                {
                    displayAmountCents: -1_200,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [
                        {
                            amountCents: 1_200,
                            categoryId: "food",
                            createdAt: timestamp,
                            fromAccountId: "credit-card",
                            lineId: "line-food-credit-card",
                            memo: "Card groceries",
                            payee: "Market",
                            sortOrder: 0,
                            transactionId: "transaction-food-credit-card",
                            updatedAt: timestamp,
                            ledgerId,
                        },
                    ],
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    payee: "Market",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "credit-card",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-food-credit-card",
                    updatedAt: timestamp,
                },
            ],
        });

        const view = buildCategoryDetailReportView({
            categoryId: "food",
            eventScope: "transactions",
            filterMode: "month",
            periodId: "2026-01",
            snapshot,
        });

        expect(view.events).toEqual([
            expect.objectContaining({
                amountCents: -1_200,
                memo: "Card groceries",
                payee: "Market",
                runningCents: -1_200,
                type: "transaction",
            }),
        ]);
    });

    it("projects uncategorized transaction rows for the synthetic category", () => {
        const snapshot = createSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 9_300,
                    createdAt: timestamp,
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 10_000,
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            transactions: [
                {
                    displayAmountCents: -700,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [
                        {
                            amountCents: 700,
                            createdAt: timestamp,
                            fromAccountId: "checking",
                            lineId: "line-uncategorized",
                            memo: "No category",
                            payee: "Hardware",
                            sortOrder: 0,
                            transactionId: "transaction-uncategorized",
                            updatedAt: timestamp,
                            ledgerId,
                        },
                    ],
                    occurredAt: "2026-01-20T00:00:00.000Z",
                    payee: "Hardware",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-uncategorized",
                    updatedAt: timestamp,
                },
            ],
        });

        const view = buildCategoryDetailReportView({
            categoryId: UNCATEGORIZED_CATEGORY_ID,
            eventScope: "transactions",
            filterMode: "month",
            periodId: "2026-01",
            snapshot,
        });

        expect(view.categoryOptions).toEqual(
            expect.arrayContaining([
                {
                    categoryId: UNCATEGORIZED_CATEGORY_ID,
                    name: "Uncategorized",
                },
            ]),
        );
        expect(view.selectedCategoryName).toBe("Uncategorized");
        expect(view.events).toEqual([
            expect.objectContaining({
                amountCents: -700,
                memo: "No category",
                payee: "Hardware",
                runningCents: -700,
                type: "transaction",
            }),
        ]);
    });

    it("projects Unassigned as net assigned allocation values", () => {
        const snapshot = createSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 9_300,
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
                    allocationId: "allocation-food",
                    assignedCents: 5_000,
                    categoryId: "food",
                    periodId: "2026-01",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            ledgerPostings: [
                {
                    amountCents: 700,
                    createdAt: timestamp,
                    direction: "credit",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                    occurredAt: "2026-01-20T00:00:00.000Z",
                    periodId: "2026-01",
                    postingId: "posting-uncategorized",
                    transactionId: "transaction-uncategorized",
                    ledgerId,
                },
            ],
            transactions: [
                {
                    displayAmountCents: -700,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [
                        {
                            amountCents: 700,
                            createdAt: timestamp,
                            fromAccountId: "checking",
                            lineId: "line-uncategorized",
                            memo: "No category",
                            payee: "Hardware",
                            sortOrder: 0,
                            transactionId: "transaction-uncategorized",
                            updatedAt: timestamp,
                            ledgerId,
                        },
                    ],
                    occurredAt: "2026-01-20T00:00:00.000Z",
                    payee: "Hardware",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-uncategorized",
                    updatedAt: timestamp,
                },
            ],
        });

        const view = buildCategoryDetailReportView({
            categoryId: UNASSIGNED_CATEGORY_ID,
            periodId: "2026-01",
            snapshot,
        });

        expect(view.selectedCategoryName).toBe("Unassigned");
        expect(view.openingCents).toBe(0);
        expect(view.totalCents).toBe(5_000);
        expect(view.events).toEqual([
            expect.objectContaining({
                amountCents: 5_000,
                memo: "Net assigned allocations",
                runningCents: 5_000,
                type: "allocation",
            }),
        ]);
    });
});
