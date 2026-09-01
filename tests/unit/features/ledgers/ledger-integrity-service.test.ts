import { describe, expect, it } from "vitest";

import {
    checkLedgerIntegrityRecords,
    type LedgerIntegrityRecords,
} from "@/features/ledgers/server/ledger-integrity-service";

const timestamp = "2026-01-15T00:00:00.000Z";

function createRecords(
    overrides: Partial<LedgerIntegrityRecords> = {},
): LedgerIntegrityRecords {
    const base: LedgerIntegrityRecords = {
        accounts: [
            {
                accountId: "checking",
                accountType: "checking",
                ledgerAccountId: "acct_checking",
                ledgerId: "ledger-1",
                name: "Checking",
                openedOn: "2026-01-01",
                openingBalanceCents: 10_000,
            },
        ],
        budgetAllocations: [
            {
                allocationId: "2026-01:food",
                assignedCents: 10_000,
                categoryId: "food",
                ledgerId: "ledger-1",
                periodId: "2026-01",
            },
        ],
        budgetCategories: [
            {
                categoryId: "food",
                defaultAssignedCents: 5_000,
                groupId: "monthly",
                isIncomeCategory: false,
                ledgerAccountId: "cat_food",
                ledgerId: "ledger-1",
                name: "Food",
                sortOrder: 0,
                status: "active",
            },
        ],
        budgetPeriods: [
            {
                availableToBudgetCents: 0,
                endsOn: "2026-01-31",
                ledgerId: "ledger-1",
                periodId: "2026-01",
                startsOn: "2026-01-01",
                status: "open",
            },
        ],
        ledger: {
            ledgerId: "ledger-1",
            name: "Ledger",
            status: "active",
            workspaceId: "global",
        },
        ledgerPostings: [
            {
                amountCents: 2_500,
                direction: "credit",
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial",
                ledgerId: "ledger-1",
                occurredAt: timestamp,
                periodId: "2026-01",
                postingId: "posting-checking",
                transactionId: "transaction-1",
            },
            {
                amountCents: 2_500,
                direction: "debit",
                ledgerAccountId: "cat_food",
                ledgerAccountKind: "category",
                ledgerId: "ledger-1",
                occurredAt: timestamp,
                periodId: "2026-01",
                postingId: "posting-food",
                transactionId: "transaction-1",
            },
        ],
        transactionLines: [
            {
                amountCents: 2_500,
                categoryId: "food",
                fromAccountId: "checking",
                ledgerId: "ledger-1",
                lineId: "line-1",
                sortOrder: 0,
                transactionId: "transaction-1",
            },
        ],
        transactions: [
            {
                displayAmountCents: -2_500,
                kind: "standard",
                ledgerId: "ledger-1",
                occurredAt: timestamp,
                periodId: "2026-01",
                referenceAccountId: "checking",
                referenceCategoryId: "food",
                status: "entered",
                transactionId: "transaction-1",
            },
        ],
    };

    return {
        ...base,
        ...overrides,
    };
}

describe("ledger integrity checker", () => {
    it("passes a balanced ledger with matching transaction, posting, and allocation state", () => {
        const result = checkLedgerIntegrityRecords(createRecords());

        expect(result.status).toBe("passed");
        expect(result.findings).toEqual([]);
        expect(result.reconciliation).toMatchObject({
            accounts: [
                {
                    accountId: "checking",
                    accountName: "Checking",
                    accountType: "checking",
                    currentBalanceCents: 7_500,
                    ledgerAccountId: "acct_checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 10_000,
                    postingDeltaCents: -2_500,
                },
            ],
            periods: [
                {
                    accountBalances: [
                        {
                            accountId: "checking",
                            accountName: "Checking",
                            balanceCents: 7_500,
                        },
                    ],
                    assetBalanceCents: 7_500,
                    liabilityBalanceCents: 0,
                    netBalanceCents: 7_500,
                    periodId: "2026-01",
                },
            ],
            totals: {
                assetBalanceCents: 7_500,
                currentBalanceCents: 7_500,
                liabilityBalanceCents: 0,
                openingBalanceCents: 10_000,
                postingDeltaCents: -2_500,
            },
        });
    });

    it("warns when assignments do not reconcile to opening-balance funding", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                budgetAllocations: [
                    {
                        allocationId: "2026-01:food",
                        assignedCents: 5_000,
                        categoryId: "food",
                        ledgerId: "ledger-1",
                        periodId: "2026-01",
                    },
                ],
            }),
        );

        expect(result.status).toBe("warning");
        expect(result.findings).toEqual([
            expect.objectContaining({
                actualCents: 5_000,
                code: "budget_allocation_source_mismatch",
                entityId: "2026-01",
                entityType: "budgetPeriod",
                expectedCents: 10_000,
                severity: "warning",
            }),
        ]);
    });

    it("accepts uncategorized account activity balanced by equity postings", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                ledgerPostings: [
                    {
                        amountCents: 2_500,
                        direction: "credit",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-checking",
                        transactionId: "transaction-1",
                    },
                    {
                        amountCents: 2_500,
                        direction: "debit",
                        ledgerAccountId: "equity_uncategorized",
                        ledgerAccountKind: "equity",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-uncategorized",
                        transactionId: "transaction-1",
                    },
                ],
                transactionLines: [
                    {
                        amountCents: 2_500,
                        fromAccountId: "checking",
                        ledgerId: "ledger-1",
                        lineId: "line-1",
                        sortOrder: 0,
                        transactionId: "transaction-1",
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: -2_500,
                        kind: "standard",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        referenceAccountId: "checking",
                        status: "entered",
                        transactionId: "transaction-1",
                    },
                ],
            }),
        );

        expect(result.status).toBe("passed");
        expect(result.findings).toEqual([]);
    });

    it("reports stray equity postings when the transaction is categorized", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                ledgerPostings: [
                    {
                        amountCents: 2_500,
                        direction: "credit",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-checking",
                        transactionId: "transaction-1",
                    },
                    {
                        amountCents: 2_500,
                        direction: "debit",
                        ledgerAccountId: "equity_uncategorized",
                        ledgerAccountKind: "equity",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-equity",
                        transactionId: "transaction-1",
                    },
                ],
            }),
        );

        expect(result.status).toBe("failed");
        expect(result.findings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "ledger_posting_unknown_equity_account",
                    entityId: "posting-equity",
                    entityType: "ledgerPosting",
                }),
                expect.objectContaining({
                    code: "transaction_line_posting_mismatch",
                    entityId: "transaction-1",
                    entityType: "transaction",
                }),
            ]),
        );
    });

    it("does not require a category on transfer lines", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                accounts: [
                    ...createRecords().accounts,
                    {
                        accountId: "savings",
                        accountType: "savings",
                        ledgerAccountId: "acct_savings",
                        ledgerId: "ledger-1",
                        name: "Savings",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 0,
                    },
                ],
                ledgerPostings: [
                    {
                        amountCents: 1_000,
                        direction: "credit",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-checking",
                        transactionId: "transaction-1",
                    },
                    {
                        amountCents: 1_000,
                        direction: "debit",
                        ledgerAccountId: "acct_savings",
                        ledgerAccountKind: "financial",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-savings",
                        transactionId: "transaction-1",
                    },
                ],
                transactionLines: [
                    {
                        amountCents: 1_000,
                        fromAccountId: "checking",
                        ledgerId: "ledger-1",
                        lineId: "line-1",
                        sortOrder: 0,
                        toAccountId: "savings",
                        transactionId: "transaction-1",
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: -1_000,
                        kind: "standard",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        referenceAccountId: "checking",
                        status: "entered",
                        transactionId: "transaction-1",
                    },
                ],
            }),
        );

        expect(result.status).toBe("passed");
        expect(result.findings).toEqual([]);
    });

    it("treats stored transaction line sentinels as blank values", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                transactionLines: [
                    {
                        amountCents: 2_500,
                        categoryId: "food",
                        fromAccountId: "checking",
                        ledgerId: "ledger-1",
                        lineId: "line-1",
                        sortOrder: 0,
                        toAccountId: "__no_to_account__",
                        transactionId: "transaction-1",
                    },
                ],
            }),
        );

        expect(result.status).toBe("passed");
        expect(result.findings).toEqual([]);
    });

    it("treats system reference categories as display metadata", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                transactions: [
                    {
                        displayAmountCents: -2_500,
                        kind: "standard",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        referenceAccountId: "checking",
                        referenceCategoryId: "__mixed__",
                        status: "entered",
                        transactionId: "transaction-1",
                    },
                ],
            }),
        );

        expect(result.status).toBe("passed");
        expect(result.findings).toEqual([]);
    });

    it("computes period-end balances and excludes unopened accounts before their open date", () => {
        const records = createRecords();
        const result = checkLedgerIntegrityRecords({
            ...records,
            accounts: [
                ...records.accounts,
                {
                    accountId: "future-savings",
                    accountType: "savings",
                    ledgerAccountId: "acct_future_savings",
                    ledgerId: "ledger-1",
                    name: "Future Savings",
                    openedOn: "2026-02-01",
                    openingBalanceCents: 5_000,
                },
            ],
            budgetPeriods: [
                ...records.budgetPeriods,
                {
                    availableToBudgetCents: 0,
                    endsOn: "2026-02-28",
                    ledgerId: "ledger-1",
                    periodId: "2026-02",
                    startsOn: "2026-02-01",
                    status: "open",
                },
            ],
            budgetAllocations: [
                ...records.budgetAllocations,
                {
                    allocationId: "2026-02:food",
                    assignedCents: 5_000,
                    categoryId: "food",
                    ledgerId: "ledger-1",
                    periodId: "2026-02",
                },
            ],
            ledgerPostings: [
                ...records.ledgerPostings,
                {
                    amountCents: 1_000,
                    direction: "credit",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-02-10T00:00:00.000Z",
                    periodId: "2026-02",
                    postingId: "posting-checking-february",
                    transactionId: "transaction-2",
                },
                {
                    amountCents: 1_000,
                    direction: "debit",
                    ledgerAccountId: "cat_food",
                    ledgerAccountKind: "category",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-02-10T00:00:00.000Z",
                    periodId: "2026-02",
                    postingId: "posting-food-february",
                    transactionId: "transaction-2",
                },
            ],
            transactionLines: [
                ...records.transactionLines,
                {
                    amountCents: 1_000,
                    categoryId: "food",
                    fromAccountId: "checking",
                    ledgerId: "ledger-1",
                    lineId: "line-2",
                    sortOrder: 0,
                    transactionId: "transaction-2",
                },
            ],
            transactions: [
                ...records.transactions,
                {
                    displayAmountCents: -1_000,
                    kind: "standard",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-02-10T00:00:00.000Z",
                    periodId: "2026-02",
                    referenceAccountId: "checking",
                    referenceCategoryId: "food",
                    status: "entered",
                    transactionId: "transaction-2",
                },
            ],
        });

        expect(result.status).toBe("passed");
        expect(result.reconciliation.periods).toMatchObject([
            {
                accountBalances: [
                    { accountId: "checking", balanceCents: 7_500 },
                    { accountId: "future-savings", balanceCents: 0 },
                ],
                netBalanceCents: 7_500,
                periodId: "2026-01",
            },
            {
                accountBalances: [
                    { accountId: "checking", balanceCents: 6_500 },
                    { accountId: "future-savings", balanceCents: 5_000 },
                ],
                netBalanceCents: 11_500,
                periodId: "2026-02",
            },
        ]);
        expect(result.reconciliation.totals).toMatchObject({
            currentBalanceCents: 11_500,
            openingBalanceCents: 15_000,
            postingDeltaCents: -3_500,
        });
    });

    it("reports invalid account open dates", () => {
        const records = createRecords();
        const result = checkLedgerIntegrityRecords({
            ...records,
            accounts: [
                {
                    ...records.accounts[0]!,
                    openedOn: "bad-date",
                },
            ],
        });

        expect(result.status).toBe("failed");
        expect(result.findings).toEqual([
            expect.objectContaining({
                code: "account_opened_on_invalid",
                entityId: "checking",
                entityType: "account",
            }),
        ]);
    });

    it("reports transaction accounting and budget allocation errors", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                budgetAllocations: [
                    {
                        allocationId: "2026-01:food",
                        assignedCents: 5_000,
                        categoryId: "food",
                        ledgerId: "ledger-1",
                        periodId: "2026-01",
                    },
                ],
                ledgerPostings: [
                    {
                        amountCents: 2_500,
                        direction: "credit",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-checking",
                        transactionId: "transaction-1",
                    },
                    {
                        amountCents: 2_000,
                        direction: "debit",
                        ledgerAccountId: "cat_food",
                        ledgerAccountKind: "category",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        postingId: "posting-food",
                        transactionId: "transaction-1",
                    },
                ],
                transactions: [
                    {
                        displayAmountCents: 2_500,
                        kind: "standard",
                        ledgerId: "ledger-1",
                        occurredAt: timestamp,
                        periodId: "2026-01",
                        referenceAccountId: "checking",
                        referenceCategoryId: "food",
                        status: "entered",
                        transactionId: "transaction-1",
                    },
                ],
            }),
        );

        expect(result.status).toBe("failed");
        expect(result.findings.map((finding) => finding.code)).toEqual(
            expect.arrayContaining([
                "transaction_display_amount_mismatch",
                "transaction_line_posting_mismatch",
                "transaction_postings_invalid",
            ]),
        );
    });

    it("ignores stored budget period available-to-budget compatibility cache drift", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                budgetPeriods: [
                    {
                        availableToBudgetCents: 0,
                        endsOn: "2026-01-31",
                        ledgerId: "ledger-1",
                        periodId: "2026-01",
                        startsOn: "2026-01-01",
                        status: "open",
                    },
                ],
            }),
        );

        expect(result.status).toBe("passed");
        expect(result.findings).toEqual([]);
    });

    it("accepts assignment-only budget allocation records", () => {
        const result = checkLedgerIntegrityRecords(
            createRecords({
                budgetAllocations: [
                    {
                        allocationId: "2026-01:food",
                        assignedCents: 10_000,
                        categoryId: "food",
                        ledgerId: "ledger-1",
                        periodId: "2026-01",
                    },
                ],
            }),
        );

        expect(result.status).toBe("passed");
        expect(result.findings).toEqual([]);
    });
});
