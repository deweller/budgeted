// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    accountsDeleteGo: vi.fn(),
    accountsDelete: vi.fn(() => ({ go: mocks.accountsDeleteGo })),
    accountsGetGo: vi.fn(),
    accountsGet: vi.fn(() => ({ go: mocks.accountsGetGo })),
    accountsByAccountGo: vi.fn(),
    accountsByAccount: vi.fn(() => ({ go: mocks.accountsByAccountGo })),
    accountsPutGo: vi.fn(),
    accountsPut: vi.fn(() => ({ go: mocks.accountsPutGo })),
    budgetCategoriesByCategoryGo: vi.fn(),
    budgetCategoriesByCategory: vi.fn(() => ({
        go: mocks.budgetCategoriesByCategoryGo,
    })),
    createLedgerPostingRecords: vi.fn(
        (input: {
            createdAt?: string;
            occurredAt: string;
            periodId: string;
            postings: Array<Record<string, unknown>>;
            transactionId: string;
            ledgerId: string;
        }) =>
            input.postings.map((posting, index) => ({
                ...posting,
                createdAt: input.createdAt ?? "2026-05-26T00:00:00.000Z",
                occurredAt: input.occurredAt,
                periodId: input.periodId,
                postingId: `generated-posting-${index + 1}`,
                transactionId: input.transactionId,
                ledgerId: input.ledgerId,
            })),
    ),
    createTransactionLineRecords: vi.fn(
        (input: {
            lines: Array<Record<string, unknown>>;
            transactionId: string;
            ledgerId: string;
        }) =>
            input.lines.map((line, index) => ({
                ...line,
                createdAt: "2026-05-26T00:00:00.000Z",
                lineId: `generated-line-${index + 1}`,
                sortOrder: index,
                transactionId: input.transactionId,
                updatedAt: "2026-05-26T00:00:00.000Z",
                ledgerId: input.ledgerId,
            })),
    ),
    hydrateAccountsWithBalances: vi.fn(),
    ledgerPostingsByLedgerAccountGo: vi.fn(),
    ledgerPostingsByLedgerAccount: vi.fn(() => ({
        go: mocks.ledgerPostingsByLedgerAccountGo,
    })),
    ledgerPostingsDeleteGo: vi.fn(),
    ledgerPostingsDelete: vi.fn(() => ({ go: mocks.ledgerPostingsDeleteGo })),
    ledgerPostingsPutGo: vi.fn(),
    ledgerPostingsPut: vi.fn(() => ({ go: mocks.ledgerPostingsPutGo })),
    listLedgerPostingsForTransaction: vi.fn(),
    listStoredTransactionsByIds: vi.fn(
        async (_ledgerId: string, transactionIds: Iterable<string>) => {
            const ids = new Set(transactionIds);
            const result = await mocks.transactionsByTransactionGo();

            return (result.data as Array<{ transactionId: string }>).filter(
                (transaction) => ids.has(transaction.transactionId),
            );
        },
    ),
    listTransactionLinesForTransaction: vi.fn(),
    plaidAccountLinksByAccountGo: vi.fn(),
    plaidAccountLinksByAccount: vi.fn(() => ({
        go: mocks.plaidAccountLinksByAccountGo,
    })),
    plaidAccountLinksDeleteGo: vi.fn(),
    plaidAccountLinksDelete: vi.fn(() => ({
        go: mocks.plaidAccountLinksDeleteGo,
    })),
    plaidAccountLinksPutGo: vi.fn(),
    plaidAccountLinksPut: vi.fn(() => ({ go: mocks.plaidAccountLinksPutGo })),
    plaidAccountLinksByPlaidAccountGo: vi.fn(),
    plaidAccountLinksByPlaidAccount: vi.fn(() => ({
        go: mocks.plaidAccountLinksByPlaidAccountGo,
    })),
    plaidItemSyncStatesDeleteGo: vi.fn(),
    plaidItemSyncStatesDelete: vi.fn(() => ({
        go: mocks.plaidItemSyncStatesDeleteGo,
    })),
    plaidItemSyncStatesGetGo: vi.fn(),
    plaidItemSyncStatesGet: vi.fn(() => ({
        go: mocks.plaidItemSyncStatesGetGo,
    })),
    plaidItemSyncStatesPutGo: vi.fn(),
    plaidItemSyncStatesPut: vi.fn(() => ({
        go: mocks.plaidItemSyncStatesPutGo,
    })),
    plaidTransactionSyncsBySyncGo: vi.fn(),
    plaidTransactionSyncsBySync: vi.fn(() => ({
        go: mocks.plaidTransactionSyncsBySyncGo,
    })),
    plaidTransactionSyncsDeleteGo: vi.fn(),
    plaidTransactionSyncsDelete: vi.fn(() => ({
        go: mocks.plaidTransactionSyncsDeleteGo,
    })),
    plaidTransactionSyncsPutGo: vi.fn(),
    plaidTransactionSyncsPut: vi.fn(() => ({
        go: mocks.plaidTransactionSyncsPutGo,
    })),
    removeTransactionLines: vi.fn(),
    removeLedgerPostings: vi.fn(),
    resolveTransactionReferences: vi.fn(),
    syncAffectedBudgetPeriodActivity: vi.fn(),
    syncAffectedBudgetPeriods: vi.fn(),
    syncBudgetPeriodActivity: vi.fn(),
    transactionsByAccountGo: vi.fn(),
    transactionsByAccount: vi.fn(() => ({ go: mocks.transactionsByAccountGo })),
    transactionsByTransactionGo: vi.fn(),
    transactionsByTransaction: vi.fn(() => ({
        go: mocks.transactionsByTransactionGo,
    })),
    transactionsDeleteGo: vi.fn(),
    transactionsDelete: vi.fn(() => ({ go: mocks.transactionsDeleteGo })),
    transactionsPutGo: vi.fn(),
    transactionsPut: vi.fn(() => ({ go: mocks.transactionsPutGo })),
    transactionLinesPutGo: vi.fn(),
    transactionLinesPut: vi.fn(() => ({ go: mocks.transactionLinesPutGo })),
    upsertTransaction: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: {
                get: mocks.accountsGet,
                put: mocks.accountsPut,
                delete: mocks.accountsDelete,
                query: {
                    byAccount: mocks.accountsByAccount,
                    byStatus: vi.fn(() => ({
                        go: vi.fn().mockResolvedValue({ data: [] }),
                    })),
                },
            },
            budgetCategories: {
                query: {
                    byCategory: mocks.budgetCategoriesByCategory,
                },
            },
            transactions: {
                put: mocks.transactionsPut,
                delete: mocks.transactionsDelete,
                query: {
                    byAccount: mocks.transactionsByAccount,
                    byTransaction: mocks.transactionsByTransaction,
                },
            },
            transactionLines: {
                put: mocks.transactionLinesPut,
            },
            ledgerPostings: {
                put: mocks.ledgerPostingsPut,
                delete: mocks.ledgerPostingsDelete,
                query: {
                    byLedgerAccount: mocks.ledgerPostingsByLedgerAccount,
                },
            },
            plaidAccountLinks: {
                put: mocks.plaidAccountLinksPut,
                delete: mocks.plaidAccountLinksDelete,
                query: {
                    byAccount: mocks.plaidAccountLinksByAccount,
                    byPlaidAccount: mocks.plaidAccountLinksByPlaidAccount,
                },
            },
            plaidItemSyncStates: {
                get: mocks.plaidItemSyncStatesGet,
                put: mocks.plaidItemSyncStatesPut,
                delete: mocks.plaidItemSyncStatesDelete,
            },
            plaidTransactionSyncs: {
                put: mocks.plaidTransactionSyncsPut,
                delete: mocks.plaidTransactionSyncsDelete,
                query: {
                    bySync: mocks.plaidTransactionSyncsBySync,
                },
            },
        },
    }),
}));

vi.mock("@/features/accounts/server/account-balance-service", () => ({
    hydrateAccountsWithBalances: mocks.hydrateAccountsWithBalances,
}));

vi.mock("@/features/transactions/server/posting-service", () => ({
    createLedgerPostingRecords: mocks.createLedgerPostingRecords,
    listLedgerPostingsForTransaction: mocks.listLedgerPostingsForTransaction,
    removeLedgerPostings: mocks.removeLedgerPostings,
    resolveTransactionReferences: mocks.resolveTransactionReferences,
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    createTransactionLineRecords: mocks.createTransactionLineRecords,
    listTransactionLinesForTransaction:
        mocks.listTransactionLinesForTransaction,
    removeTransactionLines: mocks.removeTransactionLines,
    toStoredTransactionLineRecord: (line: unknown) => line,
    toTransactionLineInputs: (lines: Array<Record<string, unknown>>) => lines,
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    listStoredTransactionsByIds: mocks.listStoredTransactionsByIds,
}));

vi.mock("@/features/transactions/server/transaction-save-service", () => ({
    upsertTransactionWithinWorkspaceMutation: mocks.upsertTransaction,
}));

vi.mock("@/features/shared/server/post-delete-consistency-service", () => ({
    syncAffectedBudgetPeriods: mocks.syncAffectedBudgetPeriods,
}));

vi.mock("@/features/budget/server/activity-sync-service", () => ({
    syncAffectedBudgetPeriodActivity:
        mocks.syncAffectedBudgetPeriodActivity,
    syncBudgetPeriodActivity: mocks.syncBudgetPeriodActivity,
}));

import {
    deleteAccount,
    getAccountDeletionImpact,
} from "@/features/accounts/server/account-service";

describe("account deletion", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.accountsGetGo.mockResolvedValue({
            data: {
                accountId: "account-1",
                ledgerId: "ledger-1",
                name: "Checking",
                accountType: "checking",
                ledgerAccountId: "acct_account-1",
                openingBalanceCents: 12_500,
                openedOn: "2026-05-01",
                createdAt: "2026-05-01T00:00:00.000Z",
                updatedAt: "2026-05-25T12:00:00.000Z",
            },
        });
        mocks.accountsByAccountGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    ledgerId: "ledger-1",
                    name: "Checking",
                    accountType: "checking",
                    ledgerAccountId: "acct_account-1",
                    openingBalanceCents: 12_500,
                    openedOn: "2026-05-01",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    updatedAt: "2026-05-25T12:00:00.000Z",
                },
                {
                    accountId: "source-account",
                    ledgerId: "ledger-1",
                    name: "Savings",
                    accountType: "savings",
                    ledgerAccountId: "acct_source",
                    openingBalanceCents: 0,
                    openedOn: "2026-05-01",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    updatedAt: "2026-05-25T12:00:00.000Z",
                },
                {
                    accountId: "destination-account",
                    ledgerId: "ledger-1",
                    name: "Credit Card",
                    accountType: "creditCard",
                    ledgerAccountId: "acct_destination",
                    openingBalanceCents: 0,
                    openedOn: "2026-05-01",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    updatedAt: "2026-05-25T12:00:00.000Z",
                },
            ],
        });
        mocks.budgetCategoriesByCategoryGo.mockResolvedValue({ data: [] });
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({
            data: [
                {
                    postingId: "posting-1",
                    transactionId: "transaction-1",
                    ledgerId: "ledger-1",
                    ledgerAccountId: "acct_account-1",
                    ledgerAccountKind: "financial",
                    direction: "credit",
                    amountCents: 6500,
                    occurredAt: "2026-05-08T12:00:00.000Z",
                    periodId: "2026-05",
                    createdAt: "2026-05-08T12:00:00.000Z",
                },
            ],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transaction-1",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-05-08T12:00:00.000Z",
                    enteredAt: "2026-05-08T12:00:00.000Z",
                    kind: "standard",
                    payee: "Grocer",
                    memo: "Weekly groceries",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "category-1",
                    displayAmountCents: -6500,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-08T12:00:00.000Z",
                },
            ],
        });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([
            {
                postingId: "posting-1",
                transactionId: "transaction-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "acct_account-1",
                ledgerAccountKind: "financial",
                direction: "credit",
                amountCents: 6500,
                occurredAt: "2026-05-08T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-08T12:00:00.000Z",
            },
            {
                postingId: "posting-2",
                transactionId: "transaction-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "cat_category-1",
                ledgerAccountKind: "category",
                direction: "debit",
                amountCents: 6500,
                occurredAt: "2026-05-08T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-08T12:00:00.000Z",
            },
        ]);
        mocks.listTransactionLinesForTransaction.mockResolvedValue([]);
        mocks.removeLedgerPostings.mockResolvedValue([]);
        mocks.removeTransactionLines.mockResolvedValue([]);
        mocks.resolveTransactionReferences.mockResolvedValue({
            referenceAccountId: "account-1",
            referenceCategoryId: "__uncategorized__",
        });
        mocks.accountsDeleteGo.mockResolvedValue(undefined);
        mocks.accountsPutGo.mockResolvedValue(undefined);
        mocks.transactionsDeleteGo.mockResolvedValue(undefined);
        mocks.transactionsPutGo.mockResolvedValue(undefined);
        mocks.transactionLinesPutGo.mockResolvedValue(undefined);
        mocks.upsertTransaction.mockResolvedValue({});
        mocks.ledgerPostingsDeleteGo.mockResolvedValue(undefined);
        mocks.ledgerPostingsPutGo.mockResolvedValue(undefined);
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [] });
        mocks.plaidAccountLinksByPlaidAccountGo.mockResolvedValue({
            data: [],
        });
        mocks.plaidAccountLinksDeleteGo.mockResolvedValue(undefined);
        mocks.plaidAccountLinksPutGo.mockResolvedValue(undefined);
        mocks.plaidItemSyncStatesGetGo.mockResolvedValue({ data: undefined });
        mocks.plaidItemSyncStatesDeleteGo.mockResolvedValue(undefined);
        mocks.plaidItemSyncStatesPutGo.mockResolvedValue(undefined);
        mocks.plaidTransactionSyncsBySyncGo.mockResolvedValue({ data: [] });
        mocks.plaidTransactionSyncsDeleteGo.mockResolvedValue(undefined);
        mocks.plaidTransactionSyncsPutGo.mockResolvedValue(undefined);
        mocks.syncAffectedBudgetPeriodActivity.mockResolvedValue(["2026-05"]);
    });

    it("summarizes dependent transactions and postings for the account preview", async () => {
        const preview = await getAccountDeletionImpact(
            "ledger-1",
            "account-1",
        );

        expect(preview).toMatchObject({
            target: {
                targetType: "account",
                targetId: "account-1",
                displayName: "Checking",
            },
            affectedPeriods: ["2026-05"],
        });
        expect(preview.dependentCounts).toEqual(
            expect.arrayContaining([
                { label: "Ledger postings", count: 2 },
                { label: "Transactions", count: 1 },
            ]),
        );
    });

    it("deletes the account after preview confirmation and synchronizes affected periods", async () => {
        const preview = await getAccountDeletionImpact(
            "ledger-1",
            "account-1",
        );

        await expect(
            deleteAccount(
                "ledger-1",
                "account-1",
                preview.previewRevision,
            ),
        ).resolves.toMatchObject({
            target: {
                targetId: "account-1",
            },
        });

        expect(mocks.removeLedgerPostings).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
        expect(mocks.transactionsDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            occurredAt: "2026-05-08T12:00:00.000Z",
            transactionId: "transaction-1",
        });
        expect(mocks.accountsDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            accountId: "account-1",
        });
        expect(mocks.syncAffectedBudgetPeriodActivity).toHaveBeenCalledTimes(1);
    });

    it("deletes Plaid records associated with the account", async () => {
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    lastSyncStatus: "succeeded",
                    plaidAccountId: "plaid-account-1",
                    plaidAccountLinkId: "link-1",
                    plaidItemId: "item-1",
                    status: "linked",
                    syncStartDate: "2026-05-01",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
        });
        mocks.plaidAccountLinksByPlaidAccountGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    lastSyncStatus: "succeeded",
                    plaidAccountId: "plaid-account-1",
                    plaidAccountLinkId: "link-1",
                    plaidItemId: "item-1",
                    status: "linked",
                    syncStartDate: "2026-05-01",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
        });
        mocks.plaidTransactionSyncsBySyncGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    ledgerId: "ledger-1",
                    plaidTransactionSyncId: "sync-1",
                    transactionId: "transaction-1",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                },
                {
                    accountId: "other-account",
                    ledgerId: "ledger-1",
                    plaidTransactionSyncId: "sync-other-same-transaction",
                    transactionId: "transaction-1",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                },
                {
                    accountId: "other-account",
                    ledgerId: "ledger-1",
                    plaidTransactionSyncId: "sync-other",
                    transactionId: "transaction-other",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                },
            ],
        });
        mocks.plaidItemSyncStatesGetGo.mockResolvedValue({
            data: {
                createdAt: "2026-05-01T00:00:00.000Z",
                plaidItemId: "item-1",
                status: "active",
                syncCursor: "cursor-1",
                updatedAt: "2026-05-20T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        });
        const preview = await getAccountDeletionImpact(
            "ledger-1",
            "account-1",
        );

        expect(preview.dependentCounts).toContainEqual({
            label: "Plaid account links",
            count: 1,
        });
        expect(preview.dependentCounts).toContainEqual({
            label: "Plaid transaction sync records",
            count: 2,
        });
        expect(mocks.plaidTransactionSyncsBySync).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
        });

        await deleteAccount(
            "ledger-1",
            "account-1",
            preview.previewRevision,
        );

        expect(mocks.plaidTransactionSyncsDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "sync-1",
        });
        expect(mocks.plaidTransactionSyncsDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "sync-other-same-transaction",
        });
        expect(mocks.plaidTransactionSyncsDelete).not.toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "sync-other",
        });
        expect(mocks.plaidAccountLinksDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidAccountLinkId: "link-1",
        });
        expect(mocks.plaidItemSyncStatesDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidItemId: "item-1",
        });
    });

    it("converts transfers where the deleted account is the destination into uncategorized outflows", async () => {
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({
            data: [
                {
                    postingId: "posting-transfer-destination",
                    transactionId: "transfer-1",
                    ledgerId: "ledger-1",
                    ledgerAccountId: "acct_account-1",
                    ledgerAccountKind: "financial",
                    direction: "debit",
                    amountCents: 2500,
                    occurredAt: "2026-05-09T12:00:00.000Z",
                    periodId: "2026-05",
                    createdAt: "2026-05-09T12:00:00.000Z",
                },
            ],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transfer-1",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-05-09T12:00:00.000Z",
                    enteredAt: "2026-05-09T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "source-account",
                    displayAmountCents: 2500,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-09T12:00:00.000Z",
                },
            ],
        });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([
            {
                postingId: "posting-transfer-source",
                transactionId: "transfer-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "acct_source",
                ledgerAccountKind: "financial",
                direction: "credit",
                amountCents: 2500,
                occurredAt: "2026-05-09T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-09T12:00:00.000Z",
            },
            {
                postingId: "posting-transfer-destination",
                transactionId: "transfer-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "acct_account-1",
                ledgerAccountKind: "financial",
                direction: "debit",
                amountCents: 2500,
                occurredAt: "2026-05-09T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-09T12:00:00.000Z",
            },
        ]);
        mocks.listTransactionLinesForTransaction.mockResolvedValue([
            {
                amountCents: 2500,
                createdAt: "2026-05-09T12:00:00.000Z",
                fromAccountId: "source-account",
                lineId: "transfer-line-1",
                sortOrder: 0,
                toAccountId: "account-1",
                transactionId: "transfer-1",
                updatedAt: "2026-05-09T12:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ]);

        const preview = await getAccountDeletionImpact(
            "ledger-1",
            "account-1",
        );

        expect(preview.dependentCounts).toContainEqual({
            label: "Transactions",
            count: 1,
        });

        await deleteAccount(
            "ledger-1",
            "account-1",
            preview.previewRevision,
        );

        expect(mocks.transactionsDelete).not.toHaveBeenCalled();
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            "ledger-1",
            expect.objectContaining({
                accountId: "source-account",
                lines: [
                    expect.objectContaining({
                        amountCents: 2500,
                        fromAccountId: "source-account",
                        toAccountId: undefined,
                    }),
                ],
                source: "manual",
                kind: "standard",
                transactionId: "transfer-1",
            }),
        );
    });

    it("converts transfers where the deleted account is the source into uncategorized inflows", async () => {
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({
            data: [
                {
                    postingId: "posting-transfer-source",
                    transactionId: "transfer-1",
                    ledgerId: "ledger-1",
                    ledgerAccountId: "acct_account-1",
                    ledgerAccountKind: "financial",
                    direction: "credit",
                    amountCents: 2500,
                    occurredAt: "2026-05-09T12:00:00.000Z",
                    periodId: "2026-05",
                    createdAt: "2026-05-09T12:00:00.000Z",
                },
            ],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transfer-1",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-05-09T12:00:00.000Z",
                    enteredAt: "2026-05-09T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "account-1",
                    displayAmountCents: -2500,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-09T12:00:00.000Z",
                },
            ],
        });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([
            {
                postingId: "posting-transfer-source",
                transactionId: "transfer-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "acct_account-1",
                ledgerAccountKind: "financial",
                direction: "credit",
                amountCents: 2500,
                occurredAt: "2026-05-09T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-09T12:00:00.000Z",
            },
            {
                postingId: "posting-transfer-destination",
                transactionId: "transfer-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "acct_destination",
                ledgerAccountKind: "financial",
                direction: "debit",
                amountCents: 2500,
                occurredAt: "2026-05-09T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-09T12:00:00.000Z",
            },
        ]);
        mocks.listTransactionLinesForTransaction.mockResolvedValue([
            {
                amountCents: 2500,
                createdAt: "2026-05-09T12:00:00.000Z",
                fromAccountId: "account-1",
                lineId: "transfer-line-1",
                sortOrder: 0,
                toAccountId: "destination-account",
                transactionId: "transfer-1",
                updatedAt: "2026-05-09T12:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ]);

        const preview = await getAccountDeletionImpact(
            "ledger-1",
            "account-1",
        );

        await deleteAccount(
            "ledger-1",
            "account-1",
            preview.previewRevision,
        );

        expect(mocks.transactionsDelete).not.toHaveBeenCalled();
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            "ledger-1",
            expect.objectContaining({
                accountId: "destination-account",
                lines: [
                    expect.objectContaining({
                        amountCents: 2500,
                        fromAccountId: undefined,
                        toAccountId: "destination-account",
                    }),
                ],
                source: "manual",
                kind: "standard",
                transactionId: "transfer-1",
            }),
        );
    });

    it("preserves a surviving Plaid sync record when converting a transfer", async () => {
        mocks.ledgerPostingsByLedgerAccountGo.mockResolvedValue({
            data: [
                {
                    postingId: "posting-transfer-destination",
                    transactionId: "transfer-1",
                    ledgerId: "ledger-1",
                    ledgerAccountId: "acct_account-1",
                    ledgerAccountKind: "financial",
                    direction: "debit",
                    amountCents: 2500,
                    occurredAt: "2026-05-09T12:00:00.000Z",
                    periodId: "2026-05",
                    createdAt: "2026-05-09T12:00:00.000Z",
                },
            ],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    transactionId: "transfer-1",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-05-09T12:00:00.000Z",
                    enteredAt: "2026-05-09T12:00:00.000Z",
                    kind: "standard",
                    referenceAccountId: "source-account",
                    displayAmountCents: 2500,
                    plaidTransactionSyncId: "deleted-sync",
                    source: "plaid",
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-09T12:00:00.000Z",
                },
            ],
        });
        mocks.listLedgerPostingsForTransaction.mockResolvedValue([
            {
                postingId: "posting-transfer-source",
                transactionId: "transfer-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "acct_source",
                ledgerAccountKind: "financial",
                direction: "credit",
                amountCents: 2500,
                occurredAt: "2026-05-09T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-09T12:00:00.000Z",
            },
            {
                postingId: "posting-transfer-destination",
                transactionId: "transfer-1",
                ledgerId: "ledger-1",
                ledgerAccountId: "acct_account-1",
                ledgerAccountKind: "financial",
                direction: "debit",
                amountCents: 2500,
                occurredAt: "2026-05-09T12:00:00.000Z",
                periodId: "2026-05",
                createdAt: "2026-05-09T12:00:00.000Z",
            },
        ]);
        mocks.listTransactionLinesForTransaction.mockResolvedValue([
            {
                amountCents: 2500,
                createdAt: "2026-05-09T12:00:00.000Z",
                fromAccountId: "source-account",
                lineId: "transfer-line-1",
                sortOrder: 0,
                toAccountId: "account-1",
                transactionId: "transfer-1",
                updatedAt: "2026-05-09T12:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ]);
        mocks.plaidTransactionSyncsBySyncGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    ledgerId: "ledger-1",
                    plaidTransactionSyncId: "deleted-sync",
                    transactionId: "transfer-1",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                },
                {
                    accountId: "source-account",
                    ledgerId: "ledger-1",
                    plaidTransactionSyncId: "survivor-sync",
                    transactionId: "transfer-1",
                    updatedAt: "2026-05-20T00:00:00.000Z",
                },
            ],
        });
        const preview = await getAccountDeletionImpact(
            "ledger-1",
            "account-1",
        );

        await deleteAccount(
            "ledger-1",
            "account-1",
            preview.previewRevision,
        );

        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            "ledger-1",
            expect.objectContaining({
                plaidTransactionSyncId: "survivor-sync",
                source: "plaid",
                transactionId: "transfer-1",
            }),
        );
        expect(mocks.plaidTransactionSyncsDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "deleted-sync",
        });
        expect(mocks.plaidTransactionSyncsDelete).not.toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "survivor-sync",
        });
    });

    it("rejects stale preview confirmations before deleting anything", async () => {
        await expect(
            deleteAccount("ledger-1", "account-1", "stale-preview"),
        ).rejects.toThrow(/stale/i);

        expect(mocks.removeLedgerPostings).not.toHaveBeenCalled();
        expect(mocks.accountsDelete).not.toHaveBeenCalled();
    });
});
