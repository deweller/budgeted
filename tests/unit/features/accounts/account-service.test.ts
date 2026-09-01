// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    accountsByStatusGo: vi.fn(),
    accountsByStatus: vi.fn(() => ({ go: mocks.accountsByStatusGo })),
    accountsGetGo: vi.fn(),
    accountsGet: vi.fn(() => ({ go: mocks.accountsGetGo })),
    accountsUpsertGo: vi.fn(),
    accountsUpsert: vi.fn(() => ({ go: mocks.accountsUpsertGo })),
    hydrateAccountsWithBalances: vi.fn(),
    ledgerPostingsByLedgerAccountGo: vi.fn(),
    ledgerPostingsByLedgerAccount: vi.fn(() => ({
        go: mocks.ledgerPostingsByLedgerAccountGo,
    })),
    listStoredTransactionsByIds: vi.fn(),
    plaidAccountLinksByAccountGo: vi.fn(),
    plaidAccountLinksByAccount: vi.fn(() => ({
        go: mocks.plaidAccountLinksByAccountGo,
    })),
    plaidTransactionSyncsByPlaidTransactionGo: vi.fn(),
    plaidTransactionSyncsByPlaidTransaction: vi.fn(() => ({
        go: mocks.plaidTransactionSyncsByPlaidTransactionGo,
    })),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: {
                get: mocks.accountsGet,
                query: {
                    byAccount: mocks.accountsByStatus,
                    byStatus: mocks.accountsByStatus,
                },
                upsert: mocks.accountsUpsert,
            },
            plaidAccountLinks: {
                query: {
                    byAccount: mocks.plaidAccountLinksByAccount,
                },
            },
            plaidTransactionSyncs: {
                query: {
                    byPlaidTransaction: mocks.plaidTransactionSyncsByPlaidTransaction,
                },
            },
            ledgerPostings: {
                query: {
                    byLedgerAccount: mocks.ledgerPostingsByLedgerAccount,
                },
            },
        },
    }),
}));

vi.mock("@/features/accounts/server/account-balance-service", () => ({
    hydrateAccountsWithBalances: mocks.hydrateAccountsWithBalances,
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    listStoredTransactionsByIds: mocks.listStoredTransactionsByIds,
}));

import { upsertAccount } from "@/features/accounts/server/account-service";

describe("account service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.accountsGetGo.mockResolvedValue({ data: undefined });
        mocks.accountsByStatusGo.mockResolvedValue({ data: [] });
        mocks.accountsUpsertGo.mockResolvedValue(undefined);
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [] });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [],
        });
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({ data: [] });
        mocks.listStoredTransactionsByIds.mockResolvedValue([]);
    });

    it("returns the committed account record when balance hydration fails after save", async () => {
        mocks.hydrateAccountsWithBalances.mockRejectedValue(
            new Error("balance read failed"),
        );

        await expect(
            upsertAccount("ledger-1", {
                name: "Checking",
                accountType: "checking",
                openingBalanceCents: 12_500,
                openedOn: "2026-05-22",
            }),
        ).resolves.toMatchObject({
            name: "Checking",
            openingBalanceCents: 12_500,
            balanceCents: 12_500,
            ledgerId: "ledger-1",
        });

        expect(mocks.accountsUpsert).toHaveBeenCalledTimes(1);
        expect(mocks.hydrateAccountsWithBalances).toHaveBeenCalledTimes(1);
    });

    it("stores opening balances as account state only", async () => {
        mocks.hydrateAccountsWithBalances.mockResolvedValue([
            {
                accountId: "account-1",
                name: "Checking",
                accountType: "checking",
                openingBalanceCents: 12_500,
                ledgerId: "ledger-1",
                balanceCents: 12_500,
            },
        ]);

        await upsertAccount("ledger-1", {
            name: "Checking",
            accountType: "checking",
            openingBalanceCents: 12_500,
            openedOn: "2026-05-22",
        });

        expect(mocks.accountsUpsert).toHaveBeenCalledTimes(1);
    });

    it("forces transfer account opening balances to zero", async () => {
        mocks.hydrateAccountsWithBalances.mockRejectedValue(
            new Error("balance read failed"),
        );

        await expect(
            upsertAccount("ledger-1", {
                name: "Transfers",
                accountType: "transfers",
                openingBalanceCents: 12_500,
                openedOn: "2026-05-22",
            }),
        ).resolves.toMatchObject({
            name: "Transfers",
            accountType: "transfers",
            openingBalanceCents: 0,
            balanceCents: 0,
        });

        expect(mocks.accountsUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                accountType: "transfers",
                openingBalanceCents: 0,
            }),
        );
    });

    it("rejects changing an active Plaid-linked account to transfers", async () => {
        mocks.accountsByStatusGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_account-1",
                    ledgerId: "ledger-1",
                    name: "Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 0,
                    plaidAccountLinkId: "link-1",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
        });
        mocks.accountsGetGo.mockResolvedValue({
            data: {
                accountId: "account-1",
                accountType: "checking",
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_account-1",
                ledgerId: "ledger-1",
                name: "Checking",
                openedOn: "2026-05-22",
                openingBalanceCents: 0,
                plaidAccountLinkId: "link-1",
                updatedAt: "2026-05-22T00:00:00.000Z",
            },
        });
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({
            data: [
                {
                    plaidAccountLinkId: "link-1",
                    status: "linked",
                },
            ],
        });

        await expect(
            upsertAccount("ledger-1", {
                accountId: "account-1",
                accountType: "transfers",
                openingBalanceCents: 0,
            }),
        ).rejects.toMatchObject({
            code: "plaid_account_type_unsupported",
            status: 422,
        });

        expect(mocks.accountsUpsert).not.toHaveBeenCalled();
    });

    it("rejects changing an account with Plaid-synced transactions to transfers", async () => {
        mocks.accountsByStatusGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_account-1",
                    ledgerId: "ledger-1",
                    name: "Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 0,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
        });
        mocks.accountsGetGo.mockResolvedValue({
            data: {
                accountId: "account-1",
                accountType: "checking",
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_account-1",
                ledgerId: "ledger-1",
                name: "Checking",
                openedOn: "2026-05-22",
                openingBalanceCents: 0,
                updatedAt: "2026-05-22T00:00:00.000Z",
            },
        });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [
                {
                    plaidTransactionSyncId: "sync-1",
                },
            ],
        });

        await expect(
            upsertAccount("ledger-1", {
                accountId: "account-1",
                accountType: "transfers",
                openingBalanceCents: 0,
            }),
        ).rejects.toMatchObject({
            code: "plaid_account_type_unsupported",
            status: 422,
        });

        expect(mocks.accountsUpsert).not.toHaveBeenCalled();
    });

    it("rejects opening balance changes when the account has reconciled transactions", async () => {
        const existingAccount = {
            accountId: "account-1",
            accountType: "checking" as const,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_account-1",
            ledgerId: "ledger-1",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 0,
            updatedAt: "2026-05-22T00:00:00.000Z",
        };
        mocks.accountsByStatusGo.mockResolvedValue({
            data: [existingAccount],
        });
        mocks.accountsGetGo.mockResolvedValue({ data: existingAccount });
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({
            data: [{ transactionId: "transaction-1" }],
        });
        mocks.listStoredTransactionsByIds.mockResolvedValue([
            {
                occurredAt: "2026-05-23T00:00:00.000Z",
                status: "reconciled",
                transactionId: "transaction-1",
            },
        ]);

        await expect(
            upsertAccount("ledger-1", {
                accountId: "account-1",
                openingBalanceCents: 5_000,
            }),
        ).rejects.toMatchObject({
            code: "account_has_locked_transactions",
            status: 409,
        });
        expect(mocks.accountsUpsert).not.toHaveBeenCalled();
    });
});
