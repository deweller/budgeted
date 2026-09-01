// @vitest-environment node

import { describe, expect, it } from "vitest";

import { parseYnabPlanCsv, parseYnabRegisterCsv } from "@/features/import/ynab/csv";
import {
    createYnabImportPlan,
    inferYnabAccountMapping,
    ynabImportTestInternals,
} from "@/features/import/ynab/planner";
import { buildBudgetPeriodSummaryFromSnapshot } from "@/lib/workspace/budget-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import { calculateAccountBalanceCents } from "@/modules/ledger/account-balance";

function buildExport(input: { planCsv: string; registerCsv: string }) {
    return {
        exportDir: "/tmp/ynab-export",
        exportName: "YNAB Export - Test Budget",
        planRecords: parseYnabPlanCsv(input.planCsv),
        registerRecords: parseYnabRegisterCsv(input.registerCsv),
    };
}

function buildWorkspaceSnapshot(
    plan: ReturnType<typeof createYnabImportPlan>,
): WorkspaceSnapshot {
    return {
        activeLedgerId: "owner#ledger#import",
        activeLedgerName: "Imported Budget",
        accounts: plan.records.accounts.map((account) => ({
            ...account,
            balanceCents: calculateAccountBalanceCents(
                account,
                plan.records.ledgerPostings,
            ),
        })),
        allocationFundingSources: [],
        budgetAllocations: plan.records.budgetAllocations,
        budgetCategories: plan.records.budgetCategories,
        budgetGroups: plan.records.budgetGroups,
        budgetPeriods: plan.records.budgetPeriods,
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: "owner#ledger#import",
            changeCursor: "",
            entityCounts: {
                account: plan.records.accounts.length,
                allocationFundingSource: 0,
                budgetCategory: plan.records.budgetCategories.length,
                budgetGroup: plan.records.budgetGroups.length,
                budgetPeriod: plan.records.budgetPeriods.length,
                categoryAllocation: plan.records.budgetAllocations.length,
                ledger: 0,
                ledgerPosting: plan.records.ledgerPostings.length,
                plaidAccountLink: 0,
                plaidTransactionSync: 0,
                transaction: plan.records.transactions.length,
                transactionLine: plan.records.transactionLines.length,
            },
            generatedAt: "2026-06-23T00:00:00.000Z",
            retainedChangesAfter: "2026-06-23T00:00:00.000Z",
            revision: "",
        },
        ledgerPostings: plan.records.ledgerPostings,
        ledgers: [],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: plan.records.transactionLines,
        transactions: plan.records.transactions.map((transaction) => ({
            ...transaction,
            lines: plan.records.transactionLines.filter(
                (line) => line.transactionId === transaction.transactionId,
            ),
            postings: plan.records.ledgerPostings.filter(
                (posting) => posting.transactionId === transaction.transactionId,
            ),
        })),
    };
}

describe("YNAB importer", () => {
    it("parses YNAB money, month, and date formats", () => {
        expect(ynabImportTestInternals.parseMoneyCents("$1,234.56")).toBe(
            123_456,
        );
        expect(ynabImportTestInternals.parseMoneyCents("-$78.50")).toBe(
            -7_850,
        );
        expect(ynabImportTestInternals.parseMoneyCents("($12.34)")).toBe(
            -1_234,
        );
        expect(ynabImportTestInternals.parseMonthLabel("Jan 2025")).toBe(
            "2025-01",
        );
        expect(
            ynabImportTestInternals
                .parseRegisterDate("01/31/2025")
                .startsWith("2025-01-31T00:00:00.000Z"),
        ).toBe(true);
    });

    it("preserves YNAB budget groups and imports tracking accounts without budget activity", () => {
        const plan = createYnabImportPlan({
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Jan 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$1000.00,-$500.00,$500.00',
                    '"Feb 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$1000.00,-$100.00,$1400.00',
                    '"Jan 2025","Escrow Accounts: Home Escrow","Escrow Accounts","Home Escrow",$200.00,$0.00,$200.00',
                    '"Feb 2025","Escrow Accounts: Home Escrow","Escrow Accounts","Home Escrow",$0.00,$0.00,$200.00',
                    '"Jan 2025","Credit Card Payments: Visa","Credit Card Payments","Visa",$0.00,$0.00,$0.00',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1000.00,"Cleared"',
                    '"Checking","","01/05/2025","Landlord","Monthly Expenses: Rent","Monthly Expenses","Rent","",$500.00,$0.00,"Cleared"',
                    '"Checking","","02/05/2025","Landlord","Monthly Expenses: Rent","Monthly Expenses","Rent","",$100.00,$0.00,"Cleared"',
                    '"Brokerage","","01/01/2025","Starting Balance","","","","",$0.00,$10000.00,"Reconciled"',
                    '"Brokerage","","01/07/2025","Dividend","Monthly Expenses: Rent","Monthly Expenses","Rent","",$0.00,$25.00,"Cleared"',
                    '"Monthly Rollovers","","01/01/2025","","Monthly Expenses: Rent","Monthly Expenses","Rent","Split (1/2)",$50.00,$0.00,"Cleared"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });

        expect(plan.records.budgetGroups.map((group) => group.name)).toEqual([
            "Monthly Expenses",
            "Escrow Accounts",
            "Credit Card Payments",
        ]);
        expect(
            plan.records.budgetCategories.map((category) => category.name),
        ).toEqual(["Rent", "Home Escrow", "Visa"]);
        expect(
            plan.records.budgetCategories.some(
                (category) => category.name === "Visa",
            ),
        ).toBe(true);

        const brokerageMapping = plan.accountMappings.find(
            (mapping) => mapping.accountName === "Brokerage",
        );
        const rolloverMapping = plan.accountMappings.find(
            (mapping) => mapping.accountName === "Monthly Rollovers",
        );
        expect(brokerageMapping?.importRole).toBe("tracking");
        expect(rolloverMapping?.importRole).toBe("exclude");

        const brokerage = plan.records.accounts.find(
            (account) => account.name === "Brokerage",
        );
        expect(brokerage?.accountType).toBe("tracking");
        expect(brokerage?.openingBalanceCents).toBe(1_000_000);

        const rent = plan.records.budgetCategories.find(
            (category) => category.name === "Rent",
        );
        const januaryRentAllocation = plan.records.budgetAllocations.find(
            (allocation) =>
                allocation.periodId === "2025-01" &&
                allocation.categoryId === rent?.categoryId,
        );
        const februaryRentAllocation = plan.records.budgetAllocations.find(
            (allocation) =>
                allocation.periodId === "2025-02" &&
                allocation.categoryId === rent?.categoryId,
        );

        expect(januaryRentAllocation).toMatchObject({
            assignedCents: 100_000,
        });
        expect(februaryRentAllocation).toMatchObject({
            assignedCents: 100_000,
        });
    });

    it("ignores plan rows and transactions after the requested end month", () => {
        const plan = createYnabImportPlan({
            endMonth: "2025-01",
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Jan 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$1000.00,-$500.00,$500.00',
                    '"Feb 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$0.00,-$100.00,$400.00',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1000.00,"Cleared"',
                    '"Checking","","01/05/2025","Landlord","Monthly Expenses: Rent","Monthly Expenses","Rent","",$500.00,$0.00,"Cleared"',
                    '"Checking","","02/05/2025","Landlord","Monthly Expenses: Rent","Monthly Expenses","Rent","",$100.00,$0.00,"Cleared"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });
        const rent = plan.records.budgetCategories.find(
            (category) => category.name === "Rent",
        );

        expect(plan.summary.firstMonth).toBe("2025-01");
        expect(plan.summary.lastMonth).toBe("2025-01");
        expect(rent?.defaultAssignedCents).toBe(100_000);
        expect(plan.records.budgetPeriods.map((period) => period.periodId)).toEqual([
            "2025-01",
        ]);
        expect(
            plan.records.budgetAllocations.map(
                (allocation) => allocation.periodId,
            ),
        ).toEqual(["2025-01"]);
        expect(
            plan.records.transactions.map((transaction) => transaction.periodId),
        ).toEqual(["2025-01"]);
    });

    it("imports first-month YNAB assignments without storing residual month-start balances", () => {
        const plan = createYnabImportPlan({
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Jan 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$750.00,-$500.00,$700.00',
                    '"Feb 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$1000.00,$0.00,$1700.00',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$2000.00,"Cleared"',
                    '"Checking","","01/05/2025","Landlord","Monthly Expenses: Rent","Monthly Expenses","Rent","",$500.00,$0.00,"Cleared"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });
        const rent = plan.records.budgetCategories.find(
            (category) => category.name === "Rent",
        );
        const januaryRentAllocation = plan.records.budgetAllocations.find(
            (allocation) =>
                allocation.periodId === "2025-01" &&
                allocation.categoryId === rent?.categoryId,
        );
        const februaryRentAllocation = plan.records.budgetAllocations.find(
            (allocation) =>
                allocation.periodId === "2025-02" &&
                allocation.categoryId === rent?.categoryId,
        );
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            buildWorkspaceSnapshot(plan),
            "2025-01",
        );
        const rentSummary = summary.categories.find(
            (category) => category.categoryId === rent?.categoryId,
        );

        expect(januaryRentAllocation).toMatchObject({
            assignedCents: 75_000,
        });
        expect(februaryRentAllocation).toMatchObject({
            assignedCents: 100_000,
        });
        expect(rentSummary).toMatchObject({
            assignedCents: 75_000,
            carriedForwardCents: 0,
            availableCents: 75_000,
        });
    });

    it("ignores YNAB rollover balancing rows and lets overspending carry forward", () => {
        const plan = createYnabImportPlan({
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Jan 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$1000.00,-$1200.00,-$200.00',
                    '"Feb 2025","Monthly Expenses: Rent","Monthly Expenses","Rent",$1000.00,-$200.00,$800.00',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$2000.00,"Cleared"',
                    '"Checking","","01/05/2025","Landlord","Monthly Expenses: Rent","Monthly Expenses","Rent","",$1200.00,$0.00,"Cleared"',
                    '"Monthly Rollovers","","01/31/2025","Overspending cleanup","Monthly Expenses: Rent","Monthly Expenses","Rent","YNAB balancing",$0.00,$200.00,"Cleared"',
                    '"Monthly Rollovers","","02/01/2025","Overspending cleanup","Monthly Expenses: Rent","Monthly Expenses","Rent","YNAB balancing",$200.00,$0.00,"Cleared"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });
        const rent = plan.records.budgetCategories.find(
            (category) => category.name === "Rent",
        );
        const januaryRentAllocation = plan.records.budgetAllocations.find(
            (allocation) =>
                allocation.periodId === "2025-01" &&
                allocation.categoryId === rent?.categoryId,
        );
        const februaryRentAllocation = plan.records.budgetAllocations.find(
            (allocation) =>
                allocation.periodId === "2025-02" &&
                allocation.categoryId === rent?.categoryId,
        );

        expect(januaryRentAllocation).toMatchObject({
            assignedCents: 100_000,
        });
        expect(februaryRentAllocation).toMatchObject({
            assignedCents: 100_000,
        });
    });

    it("imports YNAB credit card payment categories without opening reserves", () => {
        const plan = createYnabImportPlan({
            accountMappings: [
                {
                    ...inferYnabAccountMapping("Checking"),
                    accountType: "checking",
                    importRole: "budget",
                },
                {
                    ...inferYnabAccountMapping("Visa"),
                    accountType: "creditCard",
                    importRole: "budget",
                },
            ],
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Jan 2025","Savings: Buffer","Savings","Buffer",$850.00,$0.00,$850.00',
                    '"Jan 2025","Credit Card Payments: Visa","Credit Card Payments","Visa",$0.00,$150.00,$150.00',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1000.00,"Cleared"',
                    '"Visa","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$100.00,$0.00,"Cleared"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });
        const visaCategory = plan.records.budgetCategories.find(
            (category) => category.name === "Visa",
        );
        const januaryVisaAllocation = plan.records.budgetAllocations.find(
            (allocation) =>
                allocation.periodId === "2025-01" &&
                allocation.categoryId === visaCategory?.categoryId,
        );
        const summary = buildBudgetPeriodSummaryFromSnapshot(
            buildWorkspaceSnapshot(plan),
            "2025-01",
        );

        expect(visaCategory).toMatchObject({
            name: "Visa",
        });
        expect(januaryVisaAllocation).toMatchObject({
            assignedCents: 0,
        });
        expect(summary.availableToBudgetCents).toBe(15_000);
    });

    it("warns when a tracking account has a categorized starting balance", () => {
        const plan = createYnabImportPlan({
            accountMappings: [
                {
                    ...inferYnabAccountMapping("Brokerage"),
                    accountType: "tracking",
                    importRole: "tracking",
                },
            ],
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Jan 2025","Float: Start of Year","Float","Start of Year",$0.00,$0.00,$0.00',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Brokerage","","01/01/2025","Starting Balance","Float: Start of Year","Float","Start of Year","",$0.00,$10000.00,"Reconciled"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });

        expect(plan.summary.warnings).toEqual([
            expect.objectContaining({
                accountName: "Brokerage",
                amountCents: 1_000_000,
                categoryPath: "Float: Start of Year",
                code: "trackingCategorizedStartingBalance",
                rowNumber: 2,
            }),
        ]);
        expect(plan.summary.warnings[0]?.message).toContain(
            'Tracking account "Brokerage" has a categorized Starting Balance of $10,000.00 in "Float: Start of Year"',
        );
    });

    it("pairs transfers and converts split rows into parent multi-line transactions", () => {
        const plan = createYnabImportPlan({
            accountMappings: [
                {
                    ...inferYnabAccountMapping("Checking"),
                    importRole: "budget",
                    accountType: "checking",
                },
                {
                    ...inferYnabAccountMapping("Savings"),
                    importRole: "budget",
                    accountType: "savings",
                },
            ],
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Jan 2025","Monthly Expenses: Groceries","Monthly Expenses","Groceries",$100.00,-$30.00,$70.00',
                    '"Jan 2025","Monthly Expenses: Fuel","Monthly Expenses","Fuel",$100.00,-$20.00,$80.00',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1000.00,"Cleared"',
                    '"Savings","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$0.00,"Cleared"',
                    '"Checking","","01/10/2025","Transfer : Savings","","","","",$100.00,$0.00,"Cleared"',
                    '"Savings","","01/10/2025","Transfer : Checking","","","","",$0.00,$100.00,"Cleared"',
                    '"Checking","","01/12/2025","Store","Monthly Expenses: Groceries","Monthly Expenses","Groceries","Split (1/2) weekly",$30.00,$0.00,"Cleared"',
                    '"Checking","","01/12/2025","Store","Monthly Expenses: Fuel","Monthly Expenses","Fuel","Split (2/2) gas",$20.00,$0.00,"Cleared"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });

        expect(plan.summary.transactionCount).toBe(2);
        expect(plan.summary.multiLineTransactionCount).toBe(1);
        expect(plan.summary.transactionLineCount).toBe(3);

        const transferLine = plan.records.transactionLines.find(
            (line) =>
                line.fromAccountId &&
                line.toAccountId &&
                line.amountCents === 10_000 &&
                line.payee === "Transfer: Savings",
        );
        const transfer = plan.records.transactions.find(
            (transaction) =>
                transaction.transactionId === transferLine?.transactionId,
        );
        expect(transfer).toMatchObject({
            displayAmountCents: -10_000,
        });

        const split = plan.records.transactions.find(
            (transaction) => transaction.referenceCategoryId === "__mixed__",
        );
        expect(split).toMatchObject({
            displayAmountCents: -5_000,
            referenceCategoryId: "__mixed__",
            kind: "standard",
        });
        expect(
            plan.records.transactionLines.filter(
                (line) =>
                    line.transactionId === split?.transactionId,
            ),
        ).toHaveLength(2);
        expect(
            plan.records.ledgerPostings
                .filter(
                    (posting) => posting.transactionId === split?.transactionId,
                )
                .map((posting) => [
                    posting.ledgerAccountKind,
                    posting.direction,
                    posting.amountCents,
                ]),
        ).toEqual([
            ["financial", "credit", 5_000],
            ["category", "debit", 3_000],
            ["category", "debit", 2_000],
        ]);
    });

    it("imports zero-total mixed split rows as one compound transaction", () => {
        const plan = createYnabImportPlan({
            accountMappings: [
                {
                    ...inferYnabAccountMapping("Amazon Visa"),
                    importRole: "budget",
                    accountType: "creditCard",
                },
                {
                    ...inferYnabAccountMapping("Amazon Credits"),
                    importRole: "budget",
                    accountType: "cash",
                },
            ],
            export: buildExport({
                planCsv: [
                    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
                    '"Apr 2025","Yearly Expenses: School Supplies","Yearly Expenses","School Supplies",$0.00,-$29.08,-$29.08',
                ].join("\n"),
                registerCsv: [
                    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
                    '"Amazon Credits","","04/29/2025","Transfer : Amazon Visa","","","","",$29.08,$0.00,"Cleared"',
                    '"Amazon Visa","","04/29/2025","","Yearly Expenses: School Supplies","Yearly Expenses","School Supplies","Split (1/2) ",$29.08,$0.00,"Cleared"',
                    '"Amazon Visa","","04/29/2025","Transfer : Amazon Credits","","","","Split (2/2) ",$0.00,$29.08,"Cleared"',
                ].join("\n"),
            }),
            ledgerId: "owner#ledger#import",
            now: "2026-06-23T00:00:00.000Z",
        });

        expect(plan.summary.transactionCount).toBe(1);
        expect(plan.summary.multiLineTransactionCount).toBe(1);
        expect(plan.summary.transactionLineCount).toBe(2);

        const [transaction] = plan.records.transactions;
        expect(transaction).toMatchObject({
            displayAmountCents: 0,
            referenceCategoryId: "__zero_net__",
            kind: "standard",
        });
        expect(
            plan.records.transactionLines.map((line) => ({
                amountCents: line.amountCents,
                categoryId: line.categoryId,
                fromAccountId: line.fromAccountId,
                toAccountId: line.toAccountId,
            })),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    amountCents: 2_908,
                    categoryId: expect.any(String) as string,
                    fromAccountId: expect.any(String) as string,
                    toAccountId: "__no_to_account__",
                }),
                expect.objectContaining({
                    amountCents: 2_908,
                    categoryId: "__no_category__",
                    fromAccountId: expect.any(String) as string,
                    toAccountId: expect.any(String) as string,
                }),
            ]),
        );
    });
});
