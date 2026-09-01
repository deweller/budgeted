import { describe, expect, it } from "vitest";

import {
    buildCategoryTrackingReportView,
    getDefaultCategoryTrackingYear,
} from "@/lib/workspace/category-tracking-report-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

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
        budgetPeriods: [],
        knowledge: {
            activeLedgerId: ledgerId,
            changeCursor: "",
            entityCounts: {},
            entityDigests: {},
            entityRevisions: {},
            generatedAt: timestamp,
            oldestRetainedWorkspaceRevision: 0,
            retainedChangesAfter: timestamp,
            revision: "",
            workspaceGeneration: 1,
            workspaceRevision: 0,
        },
        ledgerPostings: [],
        ledgers: [],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [],
        ...overrides,
    };
}

describe("category tracking report projector", () => {
    it("applies carry-forward, monthly allocations, and each transaction in date order", () => {
        const januaryLine = {
            amountCents: 2_000,
            categoryId: "food",
            createdAt: timestamp,
            fromAccountId: "checking",
            lineId: "line-january",
            sortOrder: 0,
            transactionId: "transaction-january",
            updatedAt: timestamp,
            ledgerId,
        };
        const voidedLine = {
            amountCents: 900,
            categoryId: "food",
            createdAt: timestamp,
            fromAccountId: "checking",
            lineId: "line-voided",
            sortOrder: 0,
            transactionId: "transaction-voided",
            updatedAt: timestamp,
            ledgerId,
        };
        const snapshot = createSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 0,
                    createdAt: timestamp,
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2025-01-01",
                    openingBalanceCents: 0,
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "allocation-december",
                    assignedCents: 1_000,
                    categoryId: "food",
                    periodId: "2025-12",
                    updatedAt: timestamp,
                    ledgerId,
                },
                {
                    allocationId: "allocation-january",
                    assignedCents: 500,
                    categoryId: "food",
                    periodId: "2026-01",
                    updatedAt: timestamp,
                    ledgerId,
                },
                {
                    allocationId: "allocation-february",
                    assignedCents: 1_000,
                    categoryId: "food",
                    periodId: "2026-02",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            budgetPeriods: [
                {
                    createdAt: timestamp,
                    currency: "USD",
                    endsOn: "2025-12-31",
                    periodId: "2025-12",
                    startsOn: "2025-12-01",
                    status: "closed",
                    updatedAt: timestamp,
                    ledgerId,
                },
                {
                    createdAt: timestamp,
                    currency: "USD",
                    endsOn: "2026-12-31",
                    periodId: "2026-12",
                    startsOn: "2026-12-01",
                    status: "open",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            transactionLines: [januaryLine, voidedLine],
            transactions: [
                {
                    displayAmountCents: -2_000,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [januaryLine],
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    status: "entered",
                    transactionId: "transaction-january",
                    updatedAt: timestamp,
                },
                {
                    displayAmountCents: -900,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [voidedLine],
                    occurredAt: "2026-01-20T00:00:00.000Z",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    status: "voided",
                    transactionId: "transaction-voided",
                    updatedAt: timestamp,
                },
            ],
        });

        const view = buildCategoryTrackingReportView({
            categoryId: "food",
            snapshot,
            year: "2026",
        });

        expect(view.yearOptions).toEqual(["2025", "2026"]);
        expect(view.openingAvailableCents).toBe(1_000);
        expect(view.allocationTotalCents).toBe(1_500);
        expect(view.transactionTotalCents).toBe(-2_000);
        expect(view.endingAvailableCents).toBe(500);
        expect(view.points).toEqual([
            expect.objectContaining({
                availableCents: 1_000,
                date: "2026-01-01",
                type: "opening",
            }),
            expect.objectContaining({
                amountCents: 500,
                availableCents: 1_500,
                date: "2026-01-01",
                type: "allocation",
            }),
            expect.objectContaining({
                amountCents: -2_000,
                availableCents: -500,
                date: "2026-01-15",
                type: "transaction",
            }),
            expect.objectContaining({
                amountCents: 1_000,
                availableCents: 500,
                date: "2026-02-01",
                type: "allocation",
            }),
        ]);
    });

    it("excludes synthetic categories and defaults to the latest recorded year", () => {
        const snapshot = createSnapshot({
            budgetPeriods: [
                {
                    createdAt: timestamp,
                    currency: "USD",
                    endsOn: "2024-12-31",
                    periodId: "2024-12",
                    startsOn: "2024-12-01",
                    status: "closed",
                    updatedAt: timestamp,
                    ledgerId,
                },
                {
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
        });

        const view = buildCategoryTrackingReportView({ snapshot });

        expect(getDefaultCategoryTrackingYear(snapshot)).toBe("2026");
        expect(view.categoryOptions.map((category) => category.name)).toEqual([
            "Food",
        ]);
        expect(view.selectedCategoryId).toBe("food");
    });
});
