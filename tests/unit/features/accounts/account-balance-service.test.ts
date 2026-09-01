import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    byLedgerAccountGo: vi.fn(),
    byLedgerAccount: vi.fn(() => ({ go: mocks.byLedgerAccountGo })),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            ledgerPostings: {
                query: {
                    byLedgerAccount: mocks.byLedgerAccount,
                },
            },
        },
    }),
}));

import {
    calculateAccountBalanceCents,
    hydrateAccountsWithBalances,
} from "@/features/accounts/server/account-balance-service";

describe("account balance service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("rolls opening balance and financial postings into an account balance", () => {
        const balance = calculateAccountBalanceCents(
            {
                ledgerAccountId: "acct_checking",
                openedOn: "2026-05-01",
                openingBalanceCents: 10_000,
            },
            [
                {
                    occurredAt: "2026-05-02T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                    direction: "credit",
                    amountCents: 2_500,
                },
                {
                    occurredAt: "2026-05-03T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                    direction: "debit",
                    amountCents: 1_000,
                },
                {
                    occurredAt: "2026-05-03T00:00:00.000Z",
                    ledgerAccountId: "cat_groceries",
                    ledgerAccountKind: "category",
                    direction: "debit",
                    amountCents: 2_500,
                },
            ],
        );

        expect(balance).toBe(8_500);
    });

    it("filters future postings and unopened accounts when an as-of date is provided", () => {
        const balanceAtJanuaryEnd = calculateAccountBalanceCents(
            {
                ledgerAccountId: "acct_checking",
                openedOn: "2026-01-01",
                openingBalanceCents: 10_000,
            },
            [
                {
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                    direction: "credit",
                    amountCents: 2_500,
                },
                {
                    occurredAt: "2026-02-01T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                    direction: "credit",
                    amountCents: 1_500,
                },
            ],
            "2026-01-31",
        );

        const unopenedBalanceAtJanuaryEnd = calculateAccountBalanceCents(
            {
                ledgerAccountId: "acct_future",
                openedOn: "2026-02-01",
                openingBalanceCents: 5_000,
            },
            [
                {
                    occurredAt: "2026-02-01T00:00:00.000Z",
                    ledgerAccountId: "acct_future",
                    ledgerAccountKind: "financial",
                    direction: "credit",
                    amountCents: 1_000,
                },
            ],
            "2026-01-31",
        );

        expect(balanceAtJanuaryEnd).toBe(7_500);
        expect(unopenedBalanceAtJanuaryEnd).toBe(0);
    });

    it("hydrates queried accounts with computed balances", async () => {
        mocks.byLedgerAccountGo
            .mockResolvedValueOnce({
                data: [
                    {
                        occurredAt: "2026-05-03T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 500,
                    },
                ],
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        occurredAt: "2026-05-04T00:00:00.000Z",
                        ledgerAccountId: "acct_savings",
                        ledgerAccountKind: "financial",
                        direction: "debit",
                        amountCents: 2_000,
                    },
                ],
            });

        const accounts = await hydrateAccountsWithBalances("owner-1", [
            {
                accountId: "account-1",
                accountType: "checking",
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_checking",
                name: "Checking",
                openedOn: "2026-05-01",
                openingBalanceCents: 10_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                accountId: "account-2",
                accountType: "savings",
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_savings",
                name: "Savings",
                openedOn: "2026-05-01",
                openingBalanceCents: 20_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ]);

        expect(accounts).toEqual([
            expect.objectContaining({
                accountId: "account-1",
                balanceCents: 9_500,
            }),
            expect.objectContaining({
                accountId: "account-2",
                balanceCents: 22_000,
            }),
        ]);
    });

    it("hydrates month-end balances without counting later postings or future-opened accounts", async () => {
        mocks.byLedgerAccountGo
            .mockResolvedValueOnce({
                data: [
                    {
                        occurredAt: "2026-01-15T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 500,
                    },
                    {
                        occurredAt: "2026-02-01T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 1_000,
                    },
                ],
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        occurredAt: "2026-02-01T00:00:00.000Z",
                        ledgerAccountId: "acct_future",
                        ledgerAccountKind: "financial",
                        direction: "credit",
                        amountCents: 1_000,
                    },
                ],
            });

        const accounts = await hydrateAccountsWithBalances(
            "owner-1",
            [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 10_000,
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    accountId: "account-2",
                    accountType: "savings",
                    createdAt: "2026-02-01T00:00:00.000Z",
                    ledgerAccountId: "acct_future",
                    name: "Future",
                    openedOn: "2026-02-01",
                    openingBalanceCents: 20_000,
                    updatedAt: "2026-02-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            "2026-01-31",
        );

        expect(accounts).toEqual([
            expect.objectContaining({
                accountId: "account-1",
                balanceCents: 9_500,
            }),
            expect.objectContaining({
                accountId: "account-2",
                balanceCents: 0,
            }),
        ]);
    });
});
