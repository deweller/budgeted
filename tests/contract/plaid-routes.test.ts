import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    buildCommittedWorkspaceKnowledge: vi.fn(),
    createPlaidLinkToken: vi.fn(),
    exchangePlaidPublicTokenAndSync: vi.fn(),
    listReusablePlaidInstitutions: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    requireCurrentUserAccount: vi.fn(),
    syncPlaidAccount: vi.fn(),
    syncPlaidAccountBalance: vi.fn(),
    syncPlaidAccountBalanceWithWorkspaceChanges: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
    unlinkPlaidAccountWithWorkspaceChanges: vi.fn(),
}));

const fakeKnowledge = {
    activeLedgerId: "ledger-1",
    changeCursor: "01HZ0000000000000000000000",
    entityCounts: {
        account: 1,
        allocationFundingSource: 0,
        budgetCategory: 0,
        budgetPeriod: 0,
        categoryAllocation: 0,
        ledger: 1,
        ledgerPosting: 0,
        plaidAccountLink: 1,
        plaidTransactionSync: 1,
        transaction: 1,
        transactionLine: 0,
        userAccount: 1,
    },
    generatedAt: "2026-06-05T12:00:00.000Z",
    retainedChangesAfter: "2026-05-06T12:00:00.000Z",
    revision: "revision",
};

function persistedWorkspaceChange(change: Record<string, unknown>) {
    return {
        ...change,
        batchId: "batch-1",
        changedAt: "2026-06-05T12:00:00.000Z",
        changeId: "change-1",
        expiresAt: 1_780_000_000,
        workspaceGeneration: 1,
        workspaceRevision: 1,
    };
}

vi.mock("@/lib/auth/current-user", () => ({
    getActiveLedgerId: (user: {
        activeLedgerId?: string;
        userId: string;
    }) => user.activeLedgerId ?? user.userId,
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/plaid/server/plaid-service", () => ({
    createPlaidLinkToken: mocks.createPlaidLinkToken,
    exchangePlaidPublicTokenAndSync: mocks.exchangePlaidPublicTokenAndSync,
    listReusablePlaidInstitutions: mocks.listReusablePlaidInstitutions,
    syncPlaidAccount: mocks.syncPlaidAccount,
    syncPlaidAccountBalance: mocks.syncPlaidAccountBalance,
    syncPlaidAccountBalanceWithWorkspaceChanges:
        mocks.syncPlaidAccountBalanceWithWorkspaceChanges,
    unlinkPlaidAccountWithWorkspaceChanges:
        mocks.unlinkPlaidAccountWithWorkspaceChanges,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    partitionWorkspaceChangesForPersistence: (changes: Record<string, unknown>[]) => ({
        persistedChanges: changes.filter((change) => "batchId" in change),
        unpublishedChanges: changes.filter((change) => !("batchId" in change)),
    }),
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

import { POST as POST_SYNC } from "@/app/api/accounts/[accountId]/plaid/sync/route";
import { POST as POST_BALANCE_SYNC } from "@/app/api/accounts/[accountId]/plaid/balance/route";
import { DELETE as DELETE_PLAID_LINK } from "@/app/api/accounts/[accountId]/plaid/route";
import { POST as POST_EXCHANGE } from "@/app/api/plaid/exchange/route";
import { POST as POST_LINK_TOKEN } from "@/app/api/plaid/link-token/route";
import { GET as GET_SHARED_INSTITUTIONS } from "@/app/api/plaid/shared-institutions/route";

describe("Plaid routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.buildCommittedWorkspaceKnowledge.mockResolvedValue(fakeKnowledge);
        mocks.requireCurrentUserAccount.mockResolvedValue({
            activeLedgerId: "ledger-1",
            userId: "owner-1",
        });
        mocks.trackWorkspaceMutation.mockImplementation(
            async (_user, mutate) => ({
                knowledge: fakeKnowledge,
                result: await mutate(),
            }),
        );
        mocks.persistWorkspaceChanges.mockImplementation(({ changes }) =>
            changes.map((change: Record<string, unknown>, index: number) => ({
                ...change,
                batchId: "batch-1",
                changedAt: "2026-06-05T12:00:00.000Z",
                changeId: `change-${index}`,
                expiresAt: 1_780_000_000,
            })),
        );
    });

    it("creates a Plaid Link token for an existing account", async () => {
        mocks.createPlaidLinkToken.mockResolvedValue({
            linkToken: "link-sandbox-token",
        });

        const response = await POST_LINK_TOKEN(
            new Request("http://budgeted.test/api/plaid/link-token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ accountId: "account-1" }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            linkToken: "link-sandbox-token",
        });
        expect(mocks.createPlaidLinkToken).toHaveBeenCalledWith(
            {
                ledgerId: "ledger-1",
            },
            "account-1",
            {
                accountSelectionEnabled: undefined,
                plaidItemId: undefined,
            },
        );
    });

    it("creates a Plaid Link token using a reusable shared institution item", async () => {
        mocks.createPlaidLinkToken.mockResolvedValue({
            linkToken: "link-sandbox-token",
            mode: "update",
            plaidItemId: "item-1",
        });

        const response = await POST_LINK_TOKEN(
            new Request("http://budgeted.test/api/plaid/link-token", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    accountId: "account-1",
                    plaidItemId: "item-1",
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            linkToken: "link-sandbox-token",
            mode: "update",
            plaidItemId: "item-1",
        });
        expect(mocks.createPlaidLinkToken).toHaveBeenCalledWith(
            {
                ledgerId: "ledger-1",
            },
            "account-1",
            { plaidItemId: "item-1" },
        );
    });

    it("lists reusable Plaid institutions without exposing tokens", async () => {
        mocks.listReusablePlaidInstitutions.mockResolvedValue([
            {
                institutionId: "ins_1",
                institutionName: "Test Bank",
                plaidItemId: "item-1",
                status: "active",
                updatedAt: "2026-06-05T12:00:00.000Z",
            },
        ]);

        const response = await GET_SHARED_INSTITUTIONS();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            institutions: [
                {
                    institutionId: "ins_1",
                    institutionName: "Test Bank",
                    plaidItemId: "item-1",
                    status: "active",
                    updatedAt: "2026-06-05T12:00:00.000Z",
                },
            ],
        });
    });

    it("exchanges a public token, links the selected account, and returns workspace knowledge", async () => {
        mocks.exchangePlaidPublicTokenAndSync.mockResolvedValue({
            addedCount: 2,
            modifiedCount: 0,
            plaidAccountLinkId: "link-1",
            removedCount: 0,
            syncedAt: "2026-06-05T12:00:00.000Z",
            workspaceChanges: [
                persistedWorkspaceChange({
                    entityId: "link-1",
                    entityType: "plaidAccountLink",
                    operation: "upsert",
                    record: { plaidAccountLinkId: "link-1" },
                }),
            ],
        });

        const response = await POST_EXCHANGE(
            new Request("http://budgeted.test/api/plaid/exchange", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    accountId: "account-1",
                    accounts: [
                        {
                            id: "plaid-account-1",
                            mask: "1234",
                            name: "Checking",
                            subtype: "checking",
                            type: "depository",
                        },
                    ],
                    institution: {
                        institution_id: "ins_1",
                        name: "Test Bank",
                    },
                    plaidAccountId: "plaid-account-1",
                    publicToken: "public-sandbox-token",
                    syncStartDate: "2026-05-01",
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            addedCount: 2,
            plaidAccountLinkId: "link-1",
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "link-1",
                                entityType: "plaidAccountLink",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(mocks.exchangePlaidPublicTokenAndSync).toHaveBeenCalledWith(
            {
                ledgerId: "ledger-1",
            },
            expect.objectContaining({
                accountId: "account-1",
                plaidAccountId: "plaid-account-1",
                syncStartDate: "2026-05-01",
            }),
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("manually syncs a linked Plaid account and accepts a sync start date", async () => {
        mocks.syncPlaidAccount.mockResolvedValue({
            addedCount: 1,
            modifiedCount: 1,
            removedCount: 0,
            syncedAt: "2026-06-05T12:00:00.000Z",
            workspaceChanges: [
                persistedWorkspaceChange({
                    entityId: "transaction-1",
                    entityType: "transaction",
                    operation: "upsert",
                    record: { transactionId: "transaction-1" },
                }),
            ],
        });

        const response = await POST_SYNC(
            new Request("http://budgeted.test/api/accounts/account-1/plaid/sync", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ syncStartDate: "2026-05-01" }),
            }),
            { params: Promise.resolve({ accountId: "account-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            addedCount: 1,
            modifiedCount: 1,
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "transaction-1",
                                entityType: "transaction",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(mocks.syncPlaidAccount).toHaveBeenCalledWith(
            {
                ledgerId: "ledger-1",
            },
            "account-1",
            { syncStartDate: "2026-05-01" },
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("unlinks a Plaid account without removing the shared Plaid item", async () => {
        mocks.unlinkPlaidAccountWithWorkspaceChanges.mockResolvedValue({
            account: { accountId: "account-1" },
            plaidAccountLinkId: "link-1",
            workspaceChanges: [
                persistedWorkspaceChange({
                    entityId: "link-1",
                    entityType: "plaidAccountLink",
                    operation: "upsert",
                    record: { plaidAccountLinkId: "link-1", status: "disabled" },
                }),
                persistedWorkspaceChange({
                    entityId: "account-1",
                    entityType: "account",
                    operation: "upsert",
                    record: { accountId: "account-1" },
                }),
            ],
        });

        const response = await DELETE_PLAID_LINK(
            new Request("http://budgeted.test/api/accounts/account-1/plaid", {
                method: "DELETE",
            }),
            { params: Promise.resolve({ accountId: "account-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            plaidAccountLinkId: "link-1",
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "link-1",
                                entityType: "plaidAccountLink",
                            }),
                            expect.objectContaining({
                                entityId: "account-1",
                                entityType: "account",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(mocks.unlinkPlaidAccountWithWorkspaceChanges).toHaveBeenCalledWith(
            {
                ledgerId: "ledger-1",
            },
            "account-1",
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("syncs a linked Plaid account balance and returns workspace knowledge", async () => {
        mocks.syncPlaidAccountBalanceWithWorkspaceChanges.mockResolvedValue({
            accountId: "account-1",
            plaidAccountLinkId: "link-1",
            plaidBalanceCurrentCents: 10025,
            plaidBalanceLastSyncedAt: "2026-06-05T12:00:00.000Z",
            plaidBalanceSyncStatus: "succeeded",
            workspaceChanges: [
                persistedWorkspaceChange({
                    entityId: "account-1",
                    entityType: "account",
                    operation: "upsert",
                    record: { accountId: "account-1" },
                }),
            ],
        });

        const response = await POST_BALANCE_SYNC(
            new Request(
                "http://budgeted.test/api/accounts/account-1/plaid/balance",
                {
                    method: "POST",
                },
            ),
            { params: Promise.resolve({ accountId: "account-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            plaidBalanceCurrentCents: 10025,
            plaidBalanceSyncStatus: "succeeded",
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "account-1",
                                entityType: "account",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(mocks.syncPlaidAccountBalanceWithWorkspaceChanges).toHaveBeenCalledWith(
            {
                ledgerId: "ledger-1",
            },
            "account-1",
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
    });

});
