// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    accountEntityGet: vi.fn(),
    accountEntityGetGo: vi.fn(),
    accountsGet: vi.fn(),
    accountsPut: vi.fn(),
    accountsPutGo: vi.fn(),
    accountsBalanceGet: vi.fn(),
    getAccountRecord: vi.fn(),
    institutionsGetById: vi.fn(),
    ledgersGet: vi.fn(),
    ledgersGetGo: vi.fn(),
    ledgersUpdate: vi.fn(),
    listTransactionChildren: vi.fn(),
    linkTokenCreate: vi.fn(),
    plaidAccountLinksGet: vi.fn(),
    plaidAccountLinksGetGo: vi.fn(),
    plaidAccountLinksByAccount: vi.fn(),
    plaidAccountLinksByAccountGo: vi.fn(),
    plaidAccountLinksByPlaidAccount: vi.fn(),
    plaidAccountLinksByPlaidAccountGo: vi.fn(),
    plaidAccountLinksPut: vi.fn(),
    plaidAccountLinksPutGo: vi.fn(),
    plaidItemSyncStatesGet: vi.fn(),
    plaidItemSyncStatesGetGo: vi.fn(),
    plaidItemSyncStatesPut: vi.fn(),
    plaidItemSyncStatesPutGo: vi.fn(),
    plaidSharedItemsGet: vi.fn(),
    plaidSharedItemsGetGo: vi.fn(),
    plaidSharedItemsByItem: vi.fn(),
    plaidSharedItemsByItemGo: vi.fn(),
    plaidSharedItemsPut: vi.fn(),
    plaidSharedItemsPutGo: vi.fn(),
    plaidTransactionSyncsBegins: vi.fn(),
    plaidTransactionSyncsByPlaidTransaction: vi.fn(),
    plaidTransactionSyncsByPlaidTransactionGo: vi.fn(),
    plaidTransactionSyncsGet: vi.fn(),
    plaidTransactionSyncsGetGo: vi.fn(),
    plaidTransactionSyncsPut: vi.fn(),
    plaidTransactionSyncsPutGo: vi.fn(),
    publicTokenExchange: vi.fn(),
    reconcileVenmoActivities: vi.fn(),
    transactionsByTransaction: vi.fn(),
    transactionsByTransactionGo: vi.fn(),
    transactionsSync: vi.fn(),
    upsertTransaction: vi.fn(),
    voidTransaction: vi.fn(),
    workspaceTransactionWrite: vi.fn(),
    workspaceMutationBatchesPut: vi.fn(),
    workspaceMutationReceiptsGet: vi.fn(),
    workspaceMutationReceiptsGetGo: vi.fn(),
    workspaceMutationReceiptsPut: vi.fn(),
    workspaceStatesGet: vi.fn(),
    workspaceStatesGetGo: vi.fn(),
    workspaceStatesPut: vi.fn(),
}));

function createAtomicTransactionEntities() {
    const commit = () => ({});
    const conditionalPut =
        (put: (record: unknown) => unknown) => (record: unknown) => {
            put(record);

            return {
                where: () => ({ commit }),
            };
        };

    return {
        accounts: { put: mocks.accountsPut },
        ledgers: {
            update: (key: unknown) => ({
                set: () => ({
                    where: () => ({
                        commit: () => {
                            mocks.ledgersUpdate(key);
                            return {};
                        },
                    }),
                }),
            }),
        },
        plaidAccountLinks: { put: mocks.plaidAccountLinksPut },
        plaidItemSyncStates: { put: mocks.plaidItemSyncStatesPut },
        plaidSharedItems: { put: mocks.plaidSharedItemsPut },
        plaidTransactionSyncs: { put: mocks.plaidTransactionSyncsPut },
        workspaceMutationBatches: {
            put: conditionalPut(mocks.workspaceMutationBatchesPut),
        },
        workspaceMutationReceipts: {
            put: conditionalPut(mocks.workspaceMutationReceiptsPut),
        },
        workspaceStates: { put: mocks.workspaceStatesPut },
    };
}

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: {
                get: mocks.accountEntityGet,
                put: mocks.accountsPut,
            },
            plaidAccountLinks: {
                get: mocks.plaidAccountLinksGet,
                put: mocks.plaidAccountLinksPut,
                query: {
                    byAccount: mocks.plaidAccountLinksByAccount,
                    byPlaidAccount: mocks.plaidAccountLinksByPlaidAccount,
                },
            },
            plaidItemSyncStates: {
                get: mocks.plaidItemSyncStatesGet,
                put: mocks.plaidItemSyncStatesPut,
            },
            plaidSharedItems: {
                get: mocks.plaidSharedItemsGet,
                put: mocks.plaidSharedItemsPut,
                query: {
                    byItem: mocks.plaidSharedItemsByItem,
                },
            },
            plaidTransactionSyncs: {
                get: mocks.plaidTransactionSyncsGet,
                query: {
                    byPlaidTransaction: mocks.plaidTransactionSyncsByPlaidTransaction,
                },
                put: mocks.plaidTransactionSyncsPut,
            },
            workspaceStates: {
                get: mocks.workspaceStatesGet,
                put: mocks.workspaceStatesPut,
            },
            workspaceMutationReceipts: {
                get: mocks.workspaceMutationReceiptsGet,
            },
            transactions: {
                query: {
                    byTransaction: mocks.transactionsByTransaction,
                },
            },
            ledgers: {
                get: mocks.ledgersGet,
            },
        },
        service: {
            transaction: {
                write: mocks.workspaceTransactionWrite,
            },
        },
    }),
}));

vi.mock("@/features/accounts/server/account-service", () => ({
    getAccountRecord: mocks.getAccountRecord,
}));

vi.mock("@/features/transactions/server/transaction-save-service", () => ({
    upsertTransaction: mocks.upsertTransaction,
    upsertTransactionWithWorkspaceChanges: mocks.upsertTransaction,
    voidTransaction: mocks.voidTransaction,
    voidTransactionWithWorkspaceChanges: mocks.voidTransaction,
}));

vi.mock("@/features/transactions/server/transaction-child-service", () => ({
    listTransactionChildren: mocks.listTransactionChildren,
}));

vi.mock("@/features/plaid/server/plaid-client", () => ({
    getPlaidClient: () => ({
        accountsGet: mocks.accountsGet,
        accountsBalanceGet: mocks.accountsBalanceGet,
        institutionsGetById: mocks.institutionsGetById,
        itemPublicTokenExchange: mocks.publicTokenExchange,
        linkTokenCreate: mocks.linkTokenCreate,
        transactionsSync: mocks.transactionsSync,
    }),
    plaidCountryCodes: ["US"],
    plaidProducts: ["transactions"],
}));

vi.mock("@/features/venmo/server/venmo-service", () => ({
    reconcileVenmoActivities: mocks.reconcileVenmoActivities,
}));

import {
    createPlaidLinkToken,
    exchangePlaidPublicTokenAndSync,
    listReusablePlaidInstitutions,
    syncPlaidAccount,
    syncPlaidAccountBalance,
    syncPlaidAccountLink,
    unlinkPlaidAccountWithWorkspaceChanges,
} from "@/features/plaid/server/plaid-service";
import { createStoredWorkspaceStateFixture } from "../../helpers/workspace-mutation-fixture";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import * as workspaceSyncService from "@/features/workspace/server/workspace-sync-service";

const ledgerId = "ledger-1";
const ledgerScope = {
    ledgerId,
};

const account = {
    accountId: "account-1",
    accountType: "checking" as const,
    balanceCents: 0,
    createdAt: "2026-05-01T00:00:00.000Z",
    ledgerAccountId: "acct_checking",
    ledgerId,
    name: "Checking",
    openedOn: "2026-05-01",
    openingBalanceCents: 0,
    updatedAt: "2026-05-01T00:00:00.000Z",
};

const link = {
    accountId: "account-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    lastSyncStatus: "never" as const,
    plaidAccountId: "plaid-account-1",
    plaidAccountLinkId: "link-1",
    plaidItemId: "item-1",
    status: "linked" as const,
    syncStartDate: "2026-05-01",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ledgerId,
};

const syncState = {
    createdAt: "2026-05-01T00:00:00.000Z",
    plaidItemId: "item-1",
    status: "active" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
    ledgerId,
};

const sharedItem = {
    accessToken: "access-token",
    createdAt: "2026-05-01T00:00:00.000Z",
    plaidItemId: "item-1",
    sharedScope: "global",
    status: "active" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
};

const ledger = {
    createdAt: "2026-05-01T00:00:00.000Z",
    isDefault: false,
    ledgerId,
    name: "Ledger",
    status: "active" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
    workspaceId: "global",
};

const plaidTransaction = {
    account_id: "plaid-account-1",
    amount: 12.34,
    authorized_date: "2026-05-09",
    date: "2026-05-10",
    iso_currency_code: "USD",
    merchant_name: "Coffee Shop",
    name: "Coffee Shop",
    original_description: "SQ *COFFEE SHOP",
    pending: false,
    transaction_id: "plaid-transaction-1",
};

let storedPlaidLinks = new Map<string, typeof link>();
let storedPlaidTransactionSyncs = new Map<string, Record<string, unknown>>();

describe("Plaid sync service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storedPlaidLinks = new Map([[link.plaidAccountLinkId, link]]);
        storedPlaidTransactionSyncs = new Map();
        mocks.reconcileVenmoActivities.mockResolvedValue({
            workspaceChanges: [],
        });

        mocks.accountEntityGet.mockImplementation(
            (input: { accountId: string; ledgerId: string }) => ({
                go: () => mocks.accountEntityGetGo(input),
            }),
        );
        mocks.accountEntityGetGo.mockImplementation(
            async ({ accountId, ledgerId: accountLedgerId }) => ({
                data: await mocks.getAccountRecord(accountLedgerId, accountId),
            }),
        );

        mocks.accountsGet.mockResolvedValue({
            data: {
                accounts: [
                    {
                        account_id: "plaid-account-1",
                        balances: {
                            available: 1200.12,
                            current: 1234.56,
                            iso_currency_code: "USD",
                            limit: 5000,
                            unofficial_currency_code: null,
                        },
                        mask: "1234",
                        name: "Plaid Checking",
                        official_name: null,
                        subtype: "checking",
                        type: "depository",
                    },
                ],
            },
        });
        mocks.accountsPut.mockReturnValue({
            commit: () => ({}),
            go: mocks.accountsPutGo,
        });
        mocks.accountsPutGo.mockResolvedValue(undefined);
        mocks.accountsBalanceGet.mockResolvedValue({
            data: {
                accounts: [
                    {
                        account_id: "plaid-account-1",
                        balances: {
                            available: 1200.12,
                            current: 1234.56,
                            iso_currency_code: "USD",
                            limit: 5000,
                            unofficial_currency_code: null,
                        },
                    },
                ],
            },
        });
        mocks.getAccountRecord.mockResolvedValue(account);
        mocks.plaidAccountLinksGet.mockImplementation(
            (input: { plaidAccountLinkId: string }) => ({
                go: () => mocks.plaidAccountLinksGetGo(input),
            }),
        );
        mocks.plaidAccountLinksGetGo.mockImplementation(
            async ({ plaidAccountLinkId }: { plaidAccountLinkId: string }) => {
                const queriedLinks = await mocks.plaidAccountLinksByPlaidAccountGo();

                return {
                    data:
                        storedPlaidLinks.get(plaidAccountLinkId) ??
                        queriedLinks.data.find(
                            (candidate: typeof link) =>
                                candidate.plaidAccountLinkId === plaidAccountLinkId,
                        ) ??
                        null,
                };
            },
        );
        mocks.plaidAccountLinksByAccount.mockReturnValue({
            go: mocks.plaidAccountLinksByAccountGo,
        });
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [link] });
        mocks.plaidAccountLinksByPlaidAccount.mockReturnValue({
            go: mocks.plaidAccountLinksByPlaidAccountGo,
        });
        mocks.plaidAccountLinksByPlaidAccountGo.mockResolvedValue({
            data: [link],
        });
        mocks.plaidAccountLinksPut.mockImplementation((record: typeof link) => {
            storedPlaidLinks.set(record.plaidAccountLinkId, record);

            return {
                commit: () => ({}),
                go: mocks.plaidAccountLinksPutGo,
            };
        });
        mocks.plaidAccountLinksPutGo.mockResolvedValue(undefined);
        mocks.plaidItemSyncStatesGet.mockReturnValue({
            go: mocks.plaidItemSyncStatesGetGo,
        });
        mocks.plaidItemSyncStatesGetGo.mockResolvedValue({ data: syncState });
        mocks.plaidItemSyncStatesPut.mockReturnValue({
            commit: () => ({}),
            go: mocks.plaidItemSyncStatesPutGo,
        });
        mocks.plaidItemSyncStatesPutGo.mockResolvedValue(undefined);
        mocks.plaidSharedItemsGet.mockReturnValue({
            go: mocks.plaidSharedItemsGetGo,
        });
        mocks.plaidSharedItemsGetGo.mockResolvedValue({ data: sharedItem });
        mocks.plaidSharedItemsByItem.mockReturnValue({
            go: mocks.plaidSharedItemsByItemGo,
        });
        mocks.plaidSharedItemsByItemGo.mockResolvedValue({
            data: [sharedItem],
        });
        mocks.plaidSharedItemsPut.mockReturnValue({
            commit: () => ({}),
            go: mocks.plaidSharedItemsPutGo,
        });
        mocks.plaidSharedItemsPutGo.mockResolvedValue(undefined);
        mocks.plaidTransactionSyncsBegins.mockReturnValue({
            go: mocks.plaidTransactionSyncsByPlaidTransactionGo,
        });
        mocks.plaidTransactionSyncsByPlaidTransaction.mockReturnValue({
            begins: mocks.plaidTransactionSyncsBegins,
        });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [],
        });
        mocks.plaidTransactionSyncsGet.mockImplementation(
            (input: { plaidTransactionSyncId: string }) => ({
                go: () => mocks.plaidTransactionSyncsGetGo(input),
            }),
        );
        mocks.plaidTransactionSyncsGetGo.mockImplementation(
            async ({
                plaidTransactionSyncId,
            }: {
                plaidTransactionSyncId: string;
            }) => {
                const queriedRecords =
                    await mocks.plaidTransactionSyncsByPlaidTransactionGo();

                return {
                    data:
                        storedPlaidTransactionSyncs.get(plaidTransactionSyncId) ??
                        queriedRecords.data.find(
                            (candidate: { plaidTransactionSyncId: string }) =>
                                candidate.plaidTransactionSyncId === plaidTransactionSyncId,
                        ) ??
                        null,
                };
            },
        );
        mocks.plaidTransactionSyncsPut.mockImplementation(
            (record: { plaidTransactionSyncId: string }) => {
                storedPlaidTransactionSyncs.set(record.plaidTransactionSyncId, record);

                return {
                    commit: () => ({}),
                    go: mocks.plaidTransactionSyncsPutGo,
                };
            },
        );
        mocks.plaidTransactionSyncsPutGo.mockResolvedValue(undefined);
        mocks.transactionsByTransaction.mockReturnValue({
            go: mocks.transactionsByTransactionGo,
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({ data: [] });
        mocks.ledgersGet.mockReturnValue({ go: mocks.ledgersGetGo });
        mocks.ledgersGetGo.mockResolvedValue({
            data: {
                ...ledger,
                ledgerId,
                workspaceGeneration: 1,
                workspaceRevision: 1,
            },
        });
        mocks.workspaceStatesGet.mockReturnValue({
            go: mocks.workspaceStatesGetGo,
        });
        mocks.workspaceStatesGetGo.mockResolvedValue({
            data: createStoredWorkspaceStateFixture({
                ledgerId,
                records: {
                    accounts: [account],
                    ledgers: [ledger],
                    plaidAccountLinks: [link],
                },
            }),
        });
        mocks.workspaceMutationReceiptsGet.mockReturnValue({
            go: mocks.workspaceMutationReceiptsGetGo,
        });
        mocks.workspaceMutationReceiptsGetGo.mockResolvedValue({
            data: null,
        });
        mocks.workspaceStatesPut.mockReturnValue({
            commit: () => ({}),
        });
        mocks.workspaceTransactionWrite.mockImplementation(
            (
                write: (
                    entities: ReturnType<typeof createAtomicTransactionEntities>,
                ) => unknown,
            ) => ({
                go: async () => write(createAtomicTransactionEntities()),
            }),
        );
        mocks.listTransactionChildren.mockResolvedValue({
            lines: [
                {
                    amountCents: 1234,
                    fromAccountId: "account-1",
                    ledgerId,
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "created-transaction",
                },
            ],
            postings: [],
        });
        mocks.transactionsSync.mockResolvedValue({
            data: {
                added: [plaidTransaction],
                has_more: false,
                modified: [],
                next_cursor: "cursor-1",
                removed: [],
            },
        });
        mocks.upsertTransaction.mockResolvedValue({
            transaction: {
                transactionId: "created-transaction",
            },
            workspaceChanges: [],
        });
        mocks.voidTransaction.mockResolvedValue({
            transaction: {
                transactionId: "voided",
            },
            workspaceChanges: [],
        });
        mocks.publicTokenExchange.mockResolvedValue({
            data: {
                access_token: "new-access-token",
                item_id: "new-item",
            },
        });
        mocks.institutionsGetById.mockResolvedValue({
            data: {
                institution: {
                    logo: "base64-logo",
                    name: "Test Bank",
                    primary_color: "#123456",
                    url: "https://test-bank.example",
                },
            },
        });
        mocks.linkTokenCreate.mockResolvedValue({
            data: {
                link_token: "link-token",
            },
        });
    });

    it("creates Plaid Link tokens in update mode when the account already has an item", async () => {
        await createPlaidLinkToken(ledgerScope, "account-1");

        expect(mocks.linkTokenCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                access_token: "access-token",
                user: {
                    client_user_id: "ledger-1",
                },
            }),
        );
        expect(mocks.linkTokenCreate).toHaveBeenCalledWith(
            expect.not.objectContaining({
                products: expect.anything(),
            }),
        );
    });

    it("enables account selection when repairing a linked Plaid account", async () => {
        await createPlaidLinkToken(ledgerScope, "account-1", {
            accountSelectionEnabled: true,
        });

        expect(mocks.linkTokenCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                access_token: "access-token",
                update: {
                    account_selection_enabled: true,
                },
            }),
        );
    });

    it("creates new Plaid Link tokens with product history when the account is not linked", async () => {
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [] });

        await createPlaidLinkToken(ledgerScope, "account-1");

        expect(mocks.linkTokenCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                country_codes: ["US"],
                products: ["transactions"],
                transactions: {
                    days_requested: 730,
                },
                user: {
                    client_user_id: "ledger-1",
                },
            }),
        );
    });

    it("rejects Plaid Link tokens for transfer accounts", async () => {
        mocks.getAccountRecord.mockResolvedValue({
            accountId: "account-1",
            accountType: "transfers",
            ledgerAccountId: "acct_transfers",
            ledgerId,
        });

        await expect(
            createPlaidLinkToken(ledgerScope, "account-1"),
        ).rejects.toMatchObject({
            code: "plaid_account_type_unsupported",
            status: 422,
        });
        expect(mocks.linkTokenCreate).not.toHaveBeenCalled();
    });

    it("creates Plaid Link tokens in update mode for a selected reusable institution", async () => {
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [] });

        const result = await createPlaidLinkToken(ledgerScope, "account-1", {
            plaidItemId: "item-1",
        });

        expect(result).toMatchObject({
            linkToken: "link-token",
            mode: "update",
            plaidItemId: "item-1",
        });
        expect(mocks.linkTokenCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                access_token: "access-token",
                update: {
                    account_selection_enabled: true,
                },
            }),
        );
        expect(mocks.linkTokenCreate).toHaveBeenCalledWith(
            expect.not.objectContaining({
                products: expect.anything(),
            }),
        );
    });

    it("lists reusable Plaid institutions without access tokens", async () => {
        mocks.plaidSharedItemsByItemGo.mockResolvedValue({
            data: [
                {
                    ...sharedItem,
                    institutionId: "ins_1",
                    institutionName: "Test Bank",
                },
            ],
        });

        await expect(listReusablePlaidInstitutions()).resolves.toEqual([
            {
                institutionId: "ins_1",
                institutionName: "Test Bank",
                plaidItemId: "item-1",
                status: "active",
                updatedAt: "2026-05-01T00:00:00.000Z",
            },
        ]);
    });

    it("fails clearly when a linked Plaid item has no shared access token", async () => {
        mocks.plaidSharedItemsGetGo.mockResolvedValue({ data: undefined });

        await expect(
            syncPlaidAccountLink(ledgerScope, "link-1"),
        ).rejects.toMatchObject({
            code: "plaid_item_missing",
        });
        expect(mocks.transactionsSync).not.toHaveBeenCalled();
    });

    it("rejects Plaid transaction sync for transfer accounts", async () => {
        mocks.getAccountRecord.mockResolvedValue({
            accountId: "account-1",
            accountType: "transfers",
            ledgerAccountId: "acct_transfers",
            ledgerId,
        });

        await expect(
            syncPlaidAccountLink(ledgerScope, "link-1"),
        ).rejects.toMatchObject({
            code: "plaid_account_type_unsupported",
            status: 422,
        });
        expect(mocks.transactionsSync).not.toHaveBeenCalled();
        expect(mocks.upsertTransaction).not.toHaveBeenCalled();
    });

    it("attaches a Plaid account using a reusable shared item without exchanging a public token", async () => {
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [] });

        const result = await exchangePlaidPublicTokenAndSync(ledgerScope, {
            accountId: "account-1",
            accounts: [
                {
                    id: "plaid-account-1",
                    mask: "1234",
                    name: "Plaid Checking",
                    subtype: "checking",
                    type: "depository",
                },
            ],
            institution: {
                institution_id: "ins_1",
                name: "Test Bank",
            },
            plaidAccountId: "plaid-account-1",
            plaidItemId: "item-1",
            syncStartDate: "2026-05-01",
        });

        expect(result).toMatchObject({
            accountId: "account-1",
            addedCount: 1,
        });
        expect(mocks.publicTokenExchange).not.toHaveBeenCalled();
        expect(mocks.plaidAccountLinksPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidAccountId: "plaid-account-1",
                plaidItemId: "item-1",
                plaidInstitutionName: "Test Bank",
            }),
        );
        expect(mocks.plaidItemSyncStatesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                ledgerId,
                plaidItemId: "item-1",
                syncCursor: undefined,
            }),
        );
        expect(mocks.plaidSharedItemsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accessToken: "access-token",
                institutionId: "ins_1",
                institutionName: "Test Bank",
                plaidItemId: "item-1",
            }),
        );
        expect(mocks.workspaceTransactionWrite).toHaveBeenCalled();
        expect(mocks.workspaceStatesPut).toHaveBeenCalled();
        expect(mocks.workspaceMutationReceiptsPut).toHaveBeenCalled();
        expect(mocks.ledgersUpdate).toHaveBeenCalledWith({
            ledgerId,
            workspaceId: "global",
        });

        for (const [batchRecord] of mocks.workspaceMutationBatchesPut.mock.calls) {
            const changes = JSON.parse(
                (batchRecord as { changesJson: string }).changesJson,
            ) as Array<{ previousRecordDigest?: string | null }>;

            expect(changes.length).toBeGreaterThan(0);
            expect(
                changes.every((change) => change.previousRecordDigest !== undefined),
            ).toBe(true);
        }
    });

    it("rejects Plaid exchange for transfer accounts", async () => {
        mocks.getAccountRecord.mockResolvedValue({
            accountId: "account-1",
            accountType: "transfers",
            ledgerAccountId: "acct_transfers",
            ledgerId,
        });

        await expect(
            exchangePlaidPublicTokenAndSync(ledgerScope, {
                accountId: "account-1",
                accounts: [
                    {
                        id: "plaid-account-1",
                        mask: "1234",
                        name: "Plaid Checking",
                        subtype: "checking",
                        type: "depository",
                    },
                ],
                institution: {
                    institution_id: "ins_1",
                    name: "Test Bank",
                },
                plaidAccountId: "plaid-account-1",
                plaidItemId: "item-1",
                syncStartDate: "2026-05-01",
            }),
        ).rejects.toMatchObject({
            code: "plaid_account_type_unsupported",
            status: 422,
        });
        expect(mocks.plaidAccountLinksPut).not.toHaveBeenCalled();
        expect(mocks.publicTokenExchange).not.toHaveBeenCalled();
    });

    it("rejects a reusable Plaid account that does not belong to the shared item", async () => {
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [] });
        mocks.accountsGet.mockResolvedValue({
            data: {
                accounts: [
                    {
                        account_id: "different-plaid-account",
                        balances: {},
                        name: "Different Checking",
                        subtype: "checking",
                        type: "depository",
                    },
                ],
            },
        });

        await expect(
            exchangePlaidPublicTokenAndSync(ledgerScope, {
                accountId: "account-1",
                accounts: [
                    {
                        id: "plaid-account-1",
                        name: "Plaid Checking",
                    },
                ],
                plaidAccountId: "plaid-account-1",
                plaidItemId: "item-1",
                syncStartDate: "2026-05-01",
            }),
        ).rejects.toMatchObject({
            code: "plaid_account_not_found",
        });
        expect(mocks.plaidAccountLinksPut).not.toHaveBeenCalled();
    });

    it("rejects linking a Plaid account already linked to another account in the ledger", async () => {
        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({ data: [] });
        mocks.getAccountRecord.mockResolvedValueOnce({
            accountId: "account-2",
            accountType: "checking",
            ledgerAccountId: "acct_checking_2",
            ledgerId,
        });

        await expect(
            exchangePlaidPublicTokenAndSync(ledgerScope, {
                accountId: "account-2",
                accounts: [
                    {
                        id: "plaid-account-1",
                        name: "Plaid Checking",
                    },
                ],
                plaidAccountId: "plaid-account-1",
                plaidItemId: "item-1",
                syncStartDate: "2026-05-01",
            }),
        ).rejects.toMatchObject({
            code: "plaid_account_already_linked",
        });
        expect(mocks.plaidAccountLinksPut).not.toHaveBeenCalled();
    });

    it("includes the Plaid sync record in the atomic transaction create", async () => {
        const result = await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(result.addedCount).toBe(1);
        expect(mocks.plaidTransactionSyncsByPlaidTransaction).toHaveBeenCalledWith({
            accountId: "account-1",
            ledgerId,
        });
        expect(mocks.upsertTransaction).toHaveBeenCalledTimes(1);

        const [, transactionInput] = mocks.upsertTransaction.mock.calls[0];

        expect(transactionInput).toMatchObject({
            allowCreateWithTransactionId: true,
            plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
            plaidTransactionSyncRecordsToPut: [
                expect.objectContaining({
                    ledgerId,
                    plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
                }),
            ],
            source: "plaid",
            transactionId: expect.any(String),
        });
        expect(mocks.plaidTransactionSyncsPut).not.toHaveBeenCalled();
    });

    it("keeps a completed Plaid sync successful when Venmo reconciliation fails", async () => {
        const reconciliationError = new Error("Venmo reconciliation failed.");
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        mocks.reconcileVenmoActivities.mockRejectedValue(reconciliationError);

        try {
            const result = await syncPlaidAccountLink(ledgerScope, "link-1");

            expect(result.addedCount).toBe(1);
            expect(storedPlaidLinks.get("link-1")).toMatchObject({
                lastSyncStatus: "succeeded",
                status: "linked",
            });
            expect(consoleError).toHaveBeenCalledWith(
                "Plaid sync completed, but Venmo activity reconciliation failed.",
                reconciliationError,
            );
        } finally {
            consoleError.mockRestore();
        }
    });

    it("persists Venmo reconciliation changes before returning a Plaid sync response", async () => {
        const venmoChange = createWorkspaceUpsertChange({
            entityId: "venmo-activity-1",
            entityType: "transactionImportActivity",
            previousRecord: null,
            record: { activityId: "venmo-activity-1" },
        });
        const persistedVenmoChange = {
            ...venmoChange,
            batchId: "batch-1",
            changedAt: "2026-05-23T12:30:00.000Z",
            changeCount: 1,
            changeId: "change-1",
            changeIndex: 0,
            expiresAt: 1_780_000_000,
            workspaceGeneration: 1,
            workspaceRevision: 2,
        };
        const persistWorkspaceChanges = vi
            .spyOn(workspaceSyncService, "persistWorkspaceChanges")
            .mockResolvedValue([persistedVenmoChange]);
        mocks.reconcileVenmoActivities.mockResolvedValue({
            workspaceChanges: [venmoChange],
        });

        try {
            const result = await syncPlaidAccountLink(ledgerScope, "link-1");

            expect(persistWorkspaceChanges).toHaveBeenCalledWith({
                activeLedgerId: ledgerId,
                changes: [venmoChange],
            });
            expect(result.workspaceChanges).toContainEqual(persistedVenmoChange);
        } finally {
            persistWorkspaceChanges.mockRestore();
        }
    });

    it("syncs every linked account for the same Plaid item with one shared cursor", async () => {
        const secondLink = {
            ...link,
            accountId: "account-2",
            plaidAccountId: "plaid-account-2",
            plaidAccountLinkId: "link-2",
        };
        const secondPlaidTransaction = {
            ...plaidTransaction,
            account_id: "plaid-account-2",
            amount: 45.67,
            transaction_id: "plaid-transaction-2",
        };

        mocks.plaidAccountLinksByPlaidAccountGo.mockResolvedValue({
            data: [link, secondLink],
        });
        mocks.getAccountRecord.mockImplementation(async (_ledgerId, accountId) => ({
            accountId,
            accountType: "checking",
            ledgerAccountId: `acct_${accountId}`,
            ledgerId,
        }));
        mocks.transactionsSync.mockResolvedValue({
            data: {
                added: [secondPlaidTransaction],
                has_more: false,
                modified: [],
                next_cursor: "item-cursor-after-sync",
                removed: [],
            },
        });

        const result = await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(result.addedCount).toBe(1);
        expect(mocks.transactionsSync).toHaveBeenCalledTimes(1);
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            ledgerId,
            expect.objectContaining({
                accountId: "account-2",
                plaidTransactionSyncId: "ledger-1:account-2:plaid-transaction-2",
            }),
        );
        expect(mocks.plaidItemSyncStatesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidItemId: "item-1",
                syncCursor: "item-cursor-after-sync",
            }),
        );
    });

    it("reuses an existing ledger-scoped Plaid import when an account is relinked", async () => {
        const relinkedLink = {
            ...link,
            plaidAccountLinkId: "link-2",
            plaidItemId: "item-2",
        };
        const existingSync = {
            accountId: "account-1",
            firstSyncedAt: "2026-05-11T00:00:00.000Z",
            lastSyncedAt: "2026-05-11T00:00:00.000Z",
            ledgerId,
            name: "Coffee Shop",
            pending: false,
            plaidAccountId: "plaid-account-1",
            plaidAccountLinkId: "link-1",
            plaidAmountCents: 1234,
            plaidDate: "2026-05-10",
            plaidItemId: "item-1",
            plaidPayloadJson: "{}",
            plaidTransactionId: "plaid-transaction-1",
            plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
            status: "active" as const,
            transactionId: "existing-transaction",
            updatedAt: "2026-05-11T00:00:00.000Z",
        };

        mocks.plaidAccountLinksGetGo.mockResolvedValue({ data: relinkedLink });
        mocks.plaidSharedItemsGetGo.mockResolvedValue({
            data: {
                ...sharedItem,
                plaidItemId: "item-2",
            },
        });
        mocks.plaidItemSyncStatesGetGo.mockResolvedValue({
            data: {
                ...syncState,
                plaidItemId: "item-2",
            },
        });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [existingSync],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [{ transactionId: "existing-transaction" }],
        });

        const result = await syncPlaidAccountLink(ledgerScope, "link-2");

        expect(result.addedCount).toBe(0);
        expect(mocks.upsertTransaction).not.toHaveBeenCalled();
        expect(mocks.plaidTransactionSyncsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                ledgerId,
                plaidAccountLinkId: "link-2",
                plaidItemId: "item-2",
                plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
                transactionId: "existing-transaction",
            }),
        );
    });

    it("restarts Plaid transaction pagination when data mutates mid-sync", async () => {
        const discardedPageTransaction = {
            ...plaidTransaction,
            transaction_id: "discarded-page-transaction",
        };
        const restartedTransaction = {
            ...plaidTransaction,
            transaction_id: "restarted-transaction",
        };

        mocks.plaidItemSyncStatesGetGo.mockResolvedValue({
            data: {
                ...syncState,
                syncCursor: "cursor-before",
            },
        });
        mocks.transactionsSync
            .mockResolvedValueOnce({
                data: {
                    added: [discardedPageTransaction],
                    has_more: true,
                    modified: [],
                    next_cursor: "cursor-page-1",
                    removed: [],
                },
            })
            .mockRejectedValueOnce(
                Object.assign(new Error("Request failed with status code 400"), {
                    response: {
                        data: {
                            error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
                            error_message:
                                "Underlying transaction data changed since last page was fetched. Please restart pagination from last update.",
                            error_type: "TRANSACTIONS_ERROR",
                            request_id: "plaid-request-1",
                        },
                        status: 400,
                    },
                }),
            )
            .mockResolvedValueOnce({
                data: {
                    added: [restartedTransaction],
                    has_more: false,
                    modified: [],
                    next_cursor: "cursor-after-restart",
                    removed: [],
                },
            });

        const result = await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(result.addedCount).toBe(1);
        expect(mocks.transactionsSync).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ cursor: "cursor-before" }),
        );
        expect(mocks.transactionsSync).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ cursor: "cursor-page-1" }),
        );
        expect(mocks.transactionsSync).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ cursor: "cursor-before" }),
        );
        expect(mocks.upsertTransaction).toHaveBeenCalledTimes(1);

        const [, transactionInput] = mocks.upsertTransaction.mock.calls[0];

        expect(transactionInput).toMatchObject({
            plaidTransactionSyncId: "ledger-1:account-1:restarted-transaction",
        });
        expect(mocks.plaidItemSyncStatesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                syncCursor: "cursor-after-restart",
            }),
        );
    });

    it("syncs the current Plaid balance without running transaction sync", async () => {
        const result = await syncPlaidAccountBalance(ledgerScope, "account-1");

        expect(mocks.accountsBalanceGet).toHaveBeenCalledWith({
            access_token: "access-token",
            options: {
                account_ids: ["plaid-account-1"],
            },
        });
        expect(mocks.transactionsSync).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            accountId: "account-1",
            plaidAccountLinkId: "link-1",
            plaidBalanceAvailableCents: 120012,
            plaidBalanceCurrentCents: 123456,
            plaidBalanceIsoCurrencyCode: "USD",
            plaidBalanceLimitCents: 500000,
            plaidBalanceSyncStatus: "succeeded",
        });
        expect(mocks.plaidAccountLinksPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidBalanceAvailableCents: 120012,
                plaidBalanceCurrentCents: 123456,
                plaidBalanceLimitCents: 500000,
                plaidBalanceSyncError: undefined,
                plaidBalanceSyncStatus: "succeeded",
            }),
        );
        expect(mocks.accountsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: "account-1",
                plaidBalanceCurrentCents: 123456,
                plaidBalanceSyncStatus: "succeeded",
            }),
        );
        expect(mocks.workspaceTransactionWrite).toHaveBeenCalledTimes(1);
    });

    it("unlinks an account with one atomic workspace mutation", async () => {
        const result = await unlinkPlaidAccountWithWorkspaceChanges(
            ledgerScope,
            "account-1",
        );

        expect(result.workspaceChanges).toEqual([
            expect.objectContaining({
                entityId: "link-1",
                entityType: "plaidAccountLink",
                operation: "upsert",
            }),
            expect.objectContaining({
                entityId: "account-1",
                entityType: "account",
                operation: "upsert",
            }),
        ]);
        expect(mocks.plaidAccountLinksPut).toHaveBeenCalledWith(
            expect.objectContaining({ status: "disabled" }),
        );
        expect(mocks.plaidSharedItemsPut).not.toHaveBeenCalled();
        expect(mocks.workspaceTransactionWrite).toHaveBeenCalledTimes(1);
    });

    it("recreates a Budgeted transaction when the saved Plaid reference is stale", async () => {
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [
                {
                    accountId: "account-1",
                    firstSyncedAt: "2026-05-11T00:00:00.000Z",
                    lastSyncedAt: "2026-05-11T00:00:00.000Z",
                    ledgerId,
                    name: "Coffee Shop",
                    pending: false,
                    plaidAccountId: "plaid-account-1",
                    plaidAccountLinkId: "link-1",
                    plaidAmountCents: 1234,
                    plaidDate: "2026-05-10",
                    plaidItemId: "item-1",
                    plaidPayloadJson: "{}",
                    plaidTransactionId: "plaid-transaction-1",
                    plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
                    status: "active",
                    transactionId: "missing-transaction",
                    updatedAt: "2026-05-11T00:00:00.000Z",
                },
            ],
        });

        await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(mocks.transactionsByTransactionGo).toHaveBeenCalledTimes(1);
        expect(mocks.upsertTransaction).toHaveBeenCalledTimes(1);
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            ledgerId,
            expect.objectContaining({
                allowCreateWithTransactionId: true,
                transactionId: "missing-transaction",
            }),
        );
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            ledgerId,
            expect.objectContaining({
                plaidTransactionSyncRecordsToPut: [
                    expect.objectContaining({
                        firstSyncedAt: "2026-05-11T00:00:00.000Z",
                        transactionId: "missing-transaction",
                    }),
                ],
            }),
        );
    });

    it("updates a simple Plaid-created transaction when Plaid sends a modification", async () => {
        const existingSync = {
            accountId: "account-1",
            firstSyncedAt: "2026-05-11T00:00:00.000Z",
            lastSyncedAt: "2026-05-11T00:00:00.000Z",
            ledgerId,
            name: "Coffee Shop",
            originalDescription: "SQ *COFFEE SHOP",
            pending: false,
            plaidAccountId: "plaid-account-1",
            plaidAccountLinkId: "link-1",
            plaidAmountCents: 1234,
            plaidDate: "2026-05-10",
            plaidItemId: "item-1",
            plaidPayloadJson: "{}",
            plaidTransactionId: "plaid-transaction-1",
            plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
            status: "active" as const,
            transactionId: "existing-transaction",
            updatedAt: "2026-05-11T00:00:00.000Z",
        };

        mocks.transactionsSync.mockResolvedValue({
            data: {
                added: [],
                has_more: false,
                modified: [
                    {
                        ...plaidTransaction,
                        amount: 20,
                        merchant_name: "Coffee Shop Updated",
                        name: "Coffee Shop Updated",
                        original_description: "SQ *COFFEE UPDATED",
                    },
                ],
                next_cursor: "cursor-after-modified",
                removed: [],
            },
        });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [existingSync],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    displayAmountCents: -1234,
                    kind: "standard",
                    ledgerId,
                    memo: "SQ *COFFEE SHOP",
                    occurredAt: "2026-05-10T00:00:00.000Z",
                    payee: "Coffee Shop",
                    periodId: "2026-05",
                    referenceAccountId: "account-1",
                    source: "plaid",
                    status: "entered",
                    transactionId: "existing-transaction",
                    updatedAt: "2026-05-11T00:00:00.000Z",
                },
            ],
        });
        mocks.listTransactionChildren.mockResolvedValue({
            lines: [
                {
                    amountCents: 1234,
                    categoryId: "category-1",
                    fromAccountId: "account-1",
                    ledgerId,
                    lineId: "line-1",
                    memo: "line memo",
                    sortOrder: 0,
                    transactionId: "existing-transaction",
                },
            ],
            postings: [],
        });

        const result = await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(result.modifiedCount).toBe(1);
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            ledgerId,
            expect.objectContaining({
                accountId: "account-1",
                memo: undefined,
                payee: "Coffee Shop Updated",
                plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
                source: "plaid",
                transactionId: "existing-transaction",
                lines: [
                    expect.objectContaining({
                        amountCents: 2000,
                        categoryId: "category-1",
                        fromAccountId: "account-1",
                        lineId: "line-1",
                    }),
                ],
            }),
        );
    });

    it("keeps a reconciled transaction unchanged when Plaid changes its amount", async () => {
        const existingSync = {
            accountId: "account-1",
            firstSyncedAt: "2026-05-11T00:00:00.000Z",
            lastSyncedAt: "2026-05-11T00:00:00.000Z",
            ledgerId,
            name: "Coffee Shop",
            originalDescription: "SQ *COFFEE SHOP",
            pending: false,
            plaidAccountId: "plaid-account-1",
            plaidAccountLinkId: "link-1",
            plaidAmountCents: 1234,
            plaidDate: "2026-05-10",
            plaidItemId: "item-1",
            plaidPayloadJson: "{}",
            plaidTransactionId: "plaid-transaction-1",
            plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
            status: "active" as const,
            transactionId: "existing-transaction",
            updatedAt: "2026-05-11T00:00:00.000Z",
        };

        mocks.transactionsSync.mockResolvedValue({
            data: {
                added: [],
                has_more: false,
                modified: [{ ...plaidTransaction, amount: 20 }],
                next_cursor: "cursor-after-locked-modified",
                removed: [],
            },
        });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [existingSync],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    displayAmountCents: -1234,
                    kind: "standard",
                    ledgerId,
                    occurredAt: "2026-05-10T00:00:00.000Z",
                    periodId: "2026-05",
                    referenceAccountId: "account-1",
                    source: "plaid",
                    status: "reconciled",
                    transactionId: "existing-transaction",
                    updatedAt: "2026-05-11T00:00:00.000Z",
                },
            ],
        });
        mocks.listTransactionChildren.mockResolvedValue({
            lines: [
                {
                    amountCents: 1234,
                    fromAccountId: "account-1",
                    ledgerId,
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "existing-transaction",
                },
            ],
            postings: [],
        });

        const result = await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(result.modifiedCount).toBe(1);
        expect(mocks.upsertTransaction).not.toHaveBeenCalled();
        expect(mocks.plaidTransactionSyncsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidAmountCents: 2000,
                plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
                transactionId: "existing-transaction",
            }),
        );
        expect(mocks.plaidItemSyncStatesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                syncCursor: "cursor-after-locked-modified",
            }),
        );
    });

    it("voids a simple uncategorized Plaid-created transaction when Plaid removes it", async () => {
        const existingSync = {
            accountId: "account-1",
            firstSyncedAt: "2026-05-11T00:00:00.000Z",
            lastSyncedAt: "2026-05-11T00:00:00.000Z",
            ledgerId,
            name: "Coffee Shop",
            originalDescription: "SQ *COFFEE SHOP",
            pending: false,
            plaidAccountId: "plaid-account-1",
            plaidAccountLinkId: "link-1",
            plaidAmountCents: 1234,
            plaidDate: "2026-05-10",
            plaidItemId: "item-1",
            plaidPayloadJson: "{}",
            plaidTransactionId: "plaid-transaction-1",
            plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
            status: "active" as const,
            transactionId: "existing-transaction",
            updatedAt: "2026-05-11T00:00:00.000Z",
        };

        mocks.transactionsSync.mockResolvedValue({
            data: {
                added: [],
                has_more: false,
                modified: [],
                next_cursor: "cursor-after-removed",
                removed: [
                    {
                        account_id: "plaid-account-1",
                        transaction_id: "plaid-transaction-1",
                    },
                ],
            },
        });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [existingSync],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    displayAmountCents: -1234,
                    kind: "standard",
                    ledgerId,
                    memo: "SQ *COFFEE SHOP",
                    occurredAt: "2026-05-10T00:00:00.000Z",
                    payee: "Coffee Shop",
                    periodId: "2026-05",
                    referenceAccountId: "account-1",
                    source: "plaid",
                    status: "entered",
                    transactionId: "existing-transaction",
                    updatedAt: "2026-05-11T00:00:00.000Z",
                },
            ],
        });
        mocks.listTransactionChildren.mockResolvedValue({
            lines: [
                {
                    amountCents: 1234,
                    fromAccountId: "account-1",
                    ledgerId,
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "existing-transaction",
                },
            ],
            postings: [],
        });

        const result = await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(result.removedCount).toBe(1);
        expect(mocks.plaidTransactionSyncsPut).not.toHaveBeenCalled();
        expect(mocks.voidTransaction).toHaveBeenCalledWith(
            ledgerId,
            "existing-transaction",
            {
                action: "void",
                source: "plaidSync",
            },
            undefined,
            [
                expect.objectContaining({
                    plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
                    status: "removed",
                }),
            ],
        );
    });

    it("preserves a reconciled transaction and marks its Plaid reference removed", async () => {
        const existingSync = {
            accountId: "account-1",
            firstSyncedAt: "2026-05-11T00:00:00.000Z",
            lastSyncedAt: "2026-05-11T00:00:00.000Z",
            ledgerId,
            name: "Coffee Shop",
            originalDescription: "SQ *COFFEE SHOP",
            pending: false,
            plaidAccountId: "plaid-account-1",
            plaidAccountLinkId: "link-1",
            plaidAmountCents: 1234,
            plaidDate: "2026-05-10",
            plaidItemId: "item-1",
            plaidPayloadJson: "{}",
            plaidTransactionId: "plaid-transaction-1",
            plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
            status: "active" as const,
            transactionId: "existing-transaction",
            updatedAt: "2026-05-11T00:00:00.000Z",
        };

        mocks.transactionsSync.mockResolvedValue({
            data: {
                added: [],
                has_more: false,
                modified: [],
                next_cursor: "cursor-after-locked-removed",
                removed: [
                    {
                        account_id: "plaid-account-1",
                        transaction_id: "plaid-transaction-1",
                    },
                ],
            },
        });
        mocks.plaidTransactionSyncsByPlaidTransactionGo.mockResolvedValue({
            data: [existingSync],
        });
        mocks.transactionsByTransactionGo.mockResolvedValue({
            data: [
                {
                    displayAmountCents: -1234,
                    kind: "standard",
                    ledgerId,
                    occurredAt: "2026-05-10T00:00:00.000Z",
                    periodId: "2026-05",
                    referenceAccountId: "account-1",
                    source: "plaid",
                    status: "reconciled",
                    transactionId: "existing-transaction",
                    updatedAt: "2026-05-11T00:00:00.000Z",
                },
            ],
        });
        mocks.listTransactionChildren.mockResolvedValue({
            lines: [
                {
                    amountCents: 1234,
                    fromAccountId: "account-1",
                    ledgerId,
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "existing-transaction",
                },
            ],
            postings: [],
        });

        const result = await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(result.removedCount).toBe(1);
        expect(mocks.voidTransaction).not.toHaveBeenCalled();
        expect(mocks.plaidTransactionSyncsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidTransactionSyncId: "ledger-1:account-1:plaid-transaction-1",
                removedAt: expect.any(String),
                status: "removed",
            }),
        );
        expect(mocks.plaidItemSyncStatesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                syncCursor: "cursor-after-locked-removed",
            }),
        );
    });

    it("resets the Plaid cursor when the sync start date moves earlier", async () => {
        let storedLink = {
            ...link,
            lastSyncStatus: "succeeded" as const,
            syncStartDate: "2026-05-10",
        };
        let storedSyncState = {
            ...syncState,
            syncCursor: "cursor-after-newer-start-date",
        };
        const olderPlaidTransaction = {
            ...plaidTransaction,
            authorized_date: "2026-05-01",
            date: "2026-05-01",
            transaction_id: "older-plaid-transaction",
        };

        mocks.plaidAccountLinksByAccountGo.mockResolvedValue({
            data: [storedLink],
        });
        mocks.plaidAccountLinksGetGo.mockImplementation(async () => ({
            data: storedLink,
        }));
        mocks.plaidAccountLinksPut.mockImplementation((record) => {
            storedLink = record;

            return {
                commit: () => ({}),
                go: mocks.plaidAccountLinksPutGo,
            };
        });
        mocks.plaidItemSyncStatesGetGo.mockImplementation(async () => ({
            data: storedSyncState,
        }));
        mocks.plaidItemSyncStatesPut.mockImplementation((record) => {
            storedSyncState = record;

            return {
                commit: () => ({}),
                go: mocks.plaidItemSyncStatesPutGo,
            };
        });
        mocks.transactionsSync.mockResolvedValue({
            data: {
                added: [olderPlaidTransaction],
                has_more: false,
                modified: [],
                next_cursor: "cursor-after-replay",
                removed: [],
            },
        });

        await syncPlaidAccount(ledgerScope, "account-1", {
            syncStartDate: "2026-05-01",
        });

        expect(mocks.plaidItemSyncStatesPut).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                syncCursor: undefined,
            }),
        );
        expect(mocks.transactionsSync).toHaveBeenCalledWith(
            expect.objectContaining({
                cursor: undefined,
                options: {
                    include_original_description: true,
                },
            }),
        );
        expect(mocks.upsertTransaction).toHaveBeenCalledTimes(1);
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            ledgerId,
            expect.objectContaining({
                plaidTransactionSyncRecordsToPut: [
                    expect.objectContaining({
                        plaidTransactionId: "older-plaid-transaction",
                        transactionId: expect.any(String),
                    }),
                ],
            }),
        );
    });

    it("restarts Plaid transaction pagination when source data mutates mid-sync", async () => {
        const firstAttemptTransaction = {
            ...plaidTransaction,
            transaction_id: "first-attempt-only",
        };
        const restartedFirstTransaction = {
            ...plaidTransaction,
            transaction_id: "restarted-first",
        };
        const restartedSecondTransaction = {
            ...plaidTransaction,
            transaction_id: "restarted-second",
        };

        mocks.transactionsSync
            .mockResolvedValueOnce({
                data: {
                    added: [firstAttemptTransaction],
                    has_more: true,
                    modified: [],
                    next_cursor: "cursor-first-attempt-page-two",
                    removed: [],
                },
            })
            .mockRejectedValueOnce(
                Object.assign(new Error("Request failed with status code 400"), {
                    response: {
                        data: {
                            error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
                            error_message:
                                "Underlying transaction data changed since last page was fetched.",
                            error_type: "TRANSACTIONS_ERROR",
                            request_id: "plaid-request-1",
                        },
                        status: 400,
                    },
                }),
            )
            .mockResolvedValueOnce({
                data: {
                    added: [restartedFirstTransaction],
                    has_more: true,
                    modified: [],
                    next_cursor: "cursor-restarted-page-two",
                    removed: [],
                },
            })
            .mockResolvedValueOnce({
                data: {
                    added: [restartedSecondTransaction],
                    has_more: false,
                    modified: [],
                    next_cursor: "cursor-final",
                    removed: [],
                },
            });

        await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(mocks.transactionsSync).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ cursor: undefined }),
        );
        expect(mocks.transactionsSync).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ cursor: "cursor-first-attempt-page-two" }),
        );
        expect(mocks.transactionsSync).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ cursor: undefined }),
        );
        expect(mocks.transactionsSync).toHaveBeenNthCalledWith(
            4,
            expect.objectContaining({ cursor: "cursor-restarted-page-two" }),
        );
        expect(mocks.upsertTransaction).toHaveBeenCalledTimes(2);
        expect(mocks.plaidTransactionSyncsPut).not.toHaveBeenCalledWith(
            expect.objectContaining({
                plaidTransactionId: "first-attempt-only",
            }),
        );
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            ledgerId,
            expect.objectContaining({
                plaidTransactionSyncRecordsToPut: [
                    expect.objectContaining({
                        plaidTransactionId: "restarted-first",
                    }),
                ],
            }),
        );
        expect(mocks.upsertTransaction).toHaveBeenCalledWith(
            ledgerId,
            expect.objectContaining({
                plaidTransactionSyncRecordsToPut: [
                    expect.objectContaining({
                        plaidTransactionId: "restarted-second",
                    }),
                ],
            }),
        );
        expect(mocks.plaidItemSyncStatesPut).toHaveBeenCalledWith(
            expect.objectContaining({
                syncCursor: "cursor-final",
            }),
        );
    });

    it("updates the Budgeted account type from linked Plaid credit card metadata", async () => {
        mocks.plaidAccountLinksGetGo.mockResolvedValue({
            data: {
                ...link,
                plaidAccountSubtype: "credit card",
                plaidAccountType: "credit",
            },
        });

        await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(mocks.accountsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: "account-1",
                accountType: "creditCard",
                plaidAccountSubtype: "credit card",
            }),
        );
    });

    it("updates the Budgeted account type from linked Plaid depository metadata", async () => {
        mocks.getAccountRecord.mockResolvedValue({
            accountId: "account-1",
            accountType: "checking",
            ledgerAccountId: "acct_checking",
            ledgerId,
        });
        mocks.plaidAccountLinksGetGo.mockResolvedValue({
            data: {
                ...link,
                plaidAccountSubtype: "savings",
                plaidAccountType: "depository",
            },
        });

        await syncPlaidAccountLink(ledgerScope, "link-1");

        expect(mocks.accountsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: "account-1",
                accountType: "savings",
                plaidAccountSubtype: "savings",
            }),
        );
    });

    it("keeps the Plaid link when the initial exchange sync fails", async () => {
        mocks.plaidSharedItemsGetGo.mockResolvedValue({
            data: {
                accessToken: "new-access-token",
                createdAt: "2026-05-01T00:00:00.000Z",
                institutionName: "Test Bank",
                plaidItemId: "new-item",
                sharedScope: "global",
                status: "active" as const,
                updatedAt: "2026-05-01T00:00:00.000Z",
            },
        });
        mocks.plaidItemSyncStatesGetGo.mockResolvedValue({
            data: {
                ...syncState,
                plaidItemId: "new-item",
            },
        });
        mocks.transactionsSync.mockRejectedValue(
            Object.assign(new Error("Request failed with status code 400"), {
                response: {
                    data: {
                        error_code: "PRODUCT_NOT_READY",
                        error_message: "Transactions are not ready yet.",
                        error_type: "ITEM_ERROR",
                        request_id: "plaid-request-1",
                    },
                    status: 400,
                },
            }),
        );

        const result = await exchangePlaidPublicTokenAndSync(ledgerScope, {
            accountId: "account-1",
            accounts: [
                {
                    id: "plaid-account-1",
                    mask: "1234",
                    name: "Plaid Credit Card",
                    subtype: "credit card",
                    type: "credit",
                },
            ],
            institution: {
                institution_id: "ins_1",
                name: "Test Bank",
            },
            plaidAccountId: "plaid-account-1",
            publicToken: "public-token",
            syncStartDate: "2026-05-01",
        });

        expect(result).toMatchObject({
            accountId: "account-1",
            addedCount: 0,
            initialSyncError: "Transactions are not ready yet.",
            initialSyncStatus: "failed",
            modifiedCount: 0,
            removedCount: 0,
        });
        expect(result.plaidAccountLinkId).toEqual(expect.any(String));
        expect(mocks.plaidSharedItemsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accessToken: "new-access-token",
                institutionName: "Test Bank",
                plaidItemId: "new-item",
            }),
        );
        expect(mocks.institutionsGetById).toHaveBeenCalledWith({
            country_codes: ["US"],
            institution_id: "ins_1",
            options: {
                include_optional_metadata: true,
            },
        });
        expect(mocks.plaidAccountLinksPut).toHaveBeenCalledWith(
            expect.objectContaining({
                plaidInstitutionLogo: "base64-logo",
                plaidInstitutionPrimaryColor: "#123456",
                plaidInstitutionUrl: "https://test-bank.example",
            }),
        );
        expect(mocks.accountsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: "account-1",
                accountType: "creditCard",
                plaidInstitutionLogo: "base64-logo",
                plaidLinkStatus: "linked",
            }),
        );
        expect(mocks.accountsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: "account-1",
                accountType: "creditCard",
                plaidLastSyncStatus: "failed",
            }),
        );
    });
});
