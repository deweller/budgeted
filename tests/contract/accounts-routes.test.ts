import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence-token"),
    buildCommittedWorkspaceKnowledge: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    commitAccountReconciliationWithWorkspaceChanges: vi.fn(),
    getAccountReconciliationPreview: vi.fn(),
    listAccounts: vi.fn(),
    partitionWorkspaceChangesForPersistence: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    requireCurrentUserAccount: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
    upsertAccountWithWorkspaceChanges: vi.fn(),
}));

const fakeKnowledge = {
    activeLedgerId: "default",
    changeCursor: "01HZ0000000000000000000000",
    entityCounts: {
        account: 0,
        allocationFundingSource: 0,
        budgetCategory: 0,
        budgetPeriod: 0,
        categoryAllocation: 0,
        ledger: 0,
        ledgerPosting: 0,
        plaidAccountLink: 0,
        plaidTransactionSync: 0,
        transaction: 0,
        transactionLine: 0,
        userAccount: 1,
    },
    generatedAt: "2026-06-05T12:00:00.000Z",
    retainedChangesAfter: "2026-05-06T12:00:00.000Z",
    revision: "revision",
};

vi.mock("@/lib/auth/current-user", () => ({
    getActiveLedgerId: (user: { activeLedgerId?: string; userId: string }) =>
        user.activeLedgerId ?? user.userId,
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/accounts/server/account-service", () => ({
    listAccounts: mocks.listAccounts,
    upsertAccountWithWorkspaceChanges: mocks.upsertAccountWithWorkspaceChanges,
}));

vi.mock("@/features/accounts/server/account-reconciliation-service", () => ({
    commitAccountReconciliationWithWorkspaceChanges:
        mocks.commitAccountReconciliationWithWorkspaceChanges,
    getAccountReconciliationPreview: mocks.getAccountReconciliationPreview,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    partitionWorkspaceChangesForPersistence:
        mocks.partitionWorkspaceChangesForPersistence,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

import { GET, POST } from "@/app/api/accounts/route";
import { PATCH } from "@/app/api/accounts/[accountId]/route";
import { POST as POST_RECONCILIATION_COMMIT } from "@/app/api/accounts/[accountId]/reconciliation/commit/route";
import { GET as GET_RECONCILIATION_PREVIEW } from "@/app/api/accounts/[accountId]/reconciliation/preview/route";

describe("accounts routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.buildCommittedWorkspaceKnowledge.mockResolvedValue(fakeKnowledge);
        mocks.requireCurrentUserAccount.mockResolvedValue({
            activeLedgerId: "owner-1",
            userId: "owner-1",
        });
        mocks.trackWorkspaceMutation.mockImplementation(async (_user, mutate) => ({
            knowledge: fakeKnowledge,
            result: await mutate(),
        }));
        mocks.persistWorkspaceChanges.mockImplementation(({ changes }) =>
            changes.map((change: Record<string, unknown>, index: number) => ({
                ...change,
                batchId: "batch-1",
                changedAt: "2026-06-05T12:00:00.000Z",
                changeId: `change-${index}`,
                expiresAt: 1_780_000_000,
            })),
        );
        mocks.partitionWorkspaceChangesForPersistence.mockImplementation(
            (changes) => ({
                persistedChanges: changes,
                unpublishedChanges: [],
            }),
        );
    });

    it("returns an account reconciliation preview without internal transaction ids", async () => {
        mocks.getAccountReconciliationPreview.mockResolvedValue({
            accountId: "account-1",
            accountName: "Checking",
            alreadyReconciledCount: 1,
            cutoffDate: "2026-07-18",
            differenceCents: 0,
            eligibleTransactionCount: 3,
            ledgerBalanceCents: 12_500,
            manualBalanceCents: 12_500,
            mismatchSuggestions: [
                {
                    confidence: "high",
                    reason: "includedActivity",
                    transactions: [
                        {
                            amountCents: -500,
                            occurredAt: "2026-07-17",
                            payee: "Coffee shop",
                            source: "manual",
                            status: "cleared",
                        },
                    ],
                },
            ],
            mode: "manual",
            previewRevision: "preview-1",
            transactionIds: ["transaction-1"],
        });

        const response = await GET_RECONCILIATION_PREVIEW(
            new Request(
                "http://localhost/api/accounts/account-1/reconciliation/preview?manualBalanceCents=12500",
            ),
            { params: Promise.resolve({ accountId: "account-1" }) },
        );

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload).toMatchObject({
            accountId: "account-1",
            manualBalanceCents: 12_500,
            mismatchSuggestions: [
                {
                    reason: "includedActivity",
                    transactions: [{ payee: "Coffee shop" }],
                },
            ],
            previewRevision: "preview-1",
        });
        expect(payload).not.toHaveProperty("transactionIds");
        expect(mocks.getAccountReconciliationPreview).toHaveBeenCalledWith(
            "owner-1",
            "account-1",
            { manualBalanceCents: 12_500 },
        );
    });

    it("accepts a signed manual balance for reconciliation preview", async () => {
        mocks.getAccountReconciliationPreview.mockResolvedValue({
            accountId: "account-1",
            accountName: "Checking",
            alreadyReconciledCount: 0,
            cutoffDate: "2026-07-18",
            differenceCents: -12_500,
            eligibleTransactionCount: 0,
            ledgerBalanceCents: 12_000,
            manualBalanceCents: -500,
            mismatchSuggestions: [],
            mode: "manual",
            previewRevision: "preview-1",
            transactionIds: [],
        });

        const response = await GET_RECONCILIATION_PREVIEW(
            new Request(
                "http://localhost/api/accounts/account-1/reconciliation/preview?manualBalanceCents=-500",
            ),
            { params: Promise.resolve({ accountId: "account-1" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.getAccountReconciliationPreview).toHaveBeenCalledWith(
            "owner-1",
            "account-1",
            { manualBalanceCents: -500 },
        );
    });

    it("commits account reconciliation with explicit workspace changes", async () => {
        mocks.commitAccountReconciliationWithWorkspaceChanges.mockResolvedValue({
            reconciledCount: 3,
            workspaceChanges: [],
        });

        const response = await POST_RECONCILIATION_COMMIT(
            new Request(
                "http://localhost/api/accounts/account-1/reconciliation/commit",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        mutationId: "mutation-1",
                        previewRevision: "preview-1",
                    }),
                },
            ),
            { params: Promise.resolve({ accountId: "account-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            reconciledCount: 3,
            workspaceSync: { commits: [] },
        });
        expect(
            mocks.commitAccountReconciliationWithWorkspaceChanges,
        ).toHaveBeenCalledWith({
            accountId: "account-1",
            actorUserId: "owner-1",
            commit: {
                mutationId: "mutation-1",
                previewRevision: "preview-1",
            },
            ledgerId: "owner-1",
            mutationId: "mutation-1",
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("lists accounts", async () => {
        mocks.listAccounts.mockResolvedValue([
            {
                accountId: "account-1",
                name: "Checking",
                accountType: "checking",
                balanceCents: 10_000,
            },
        ]);

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject([
            expect.objectContaining({
                accountId: "account-1",
                balanceCents: 10_000,
            }),
        ]);
        expect(mocks.listAccounts).toHaveBeenCalledWith("owner-1");
    });

    it("lists accounts from the active ledger scope", async () => {
        mocks.requireCurrentUserAccount.mockResolvedValue({
            userId: "owner-1",
            activeLedgerId: "owner-1#ledger#ledger-2027",
        });
        mocks.listAccounts.mockResolvedValue([]);

        const response = await GET();

        expect(response.status).toBe(200);
        expect(mocks.listAccounts).toHaveBeenCalledWith(
            "owner-1#ledger#ledger-2027",
        );
    });

    it("creates an account", async () => {
        mocks.upsertAccountWithWorkspaceChanges.mockResolvedValue({
            account: {
                accountId: "account-1",
                name: "Checking",
                accountType: "checking",
                balanceCents: 10_000,
            },
            workspaceChanges: [],
        });

        const response = await POST(
            new Request("http://localhost/api/accounts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: "Checking",
                    accountType: "checking",
                    openingBalanceCents: 10_000,
                    openedOn: "2026-05-22",
                }),
            }),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            account: { accountId: "account-1" },
            workspaceSync: { commits: [] },
        });
        expect(mocks.upsertAccountWithWorkspaceChanges).toHaveBeenCalledWith(
            "owner-1",
            {
                name: "Checking",
                accountType: "checking",
                openingBalanceCents: 10_000,
                openedOn: "2026-05-22",
            },
        );
    });

    it("rejects nonzero opening balances for transfer accounts", async () => {
        const response = await POST(
            new Request("http://localhost/api/accounts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: "Transfers",
                    accountType: "transfers",
                    openingBalanceCents: 10_000,
                    openedOn: "2026-05-22",
                }),
            }),
        );

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "validation_error",
                details: {
                    fieldErrors: {
                        openingBalanceCents: [
                            "Transfers accounts must have a zero opening balance.",
                        ],
                    },
                    formErrors: [],
                },
                message: "Request body failed validation.",
            },
        });
        expect(mocks.upsertAccountWithWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("updates an account", async () => {
        mocks.upsertAccountWithWorkspaceChanges.mockResolvedValue({
            account: {
                accountId: "account-1",
                name: "Primary Checking",
                accountType: "checking",
                balanceCents: 10_000,
            },
            workspaceChanges: [
                {
                    entityId: "account-1",
                    entityType: "account",
                    operation: "upsert",
                    record: { accountId: "account-1" },
                },
            ],
        });

        const response = await PATCH(
            new Request("http://localhost/api/accounts/account-1", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: "Primary Checking" }),
            }),
            { params: Promise.resolve({ accountId: "account-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            accountId: "account-1",
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "account-1",
                                entityType: "account",
                                operation: "upsert",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(mocks.upsertAccountWithWorkspaceChanges).toHaveBeenCalledWith(
            "owner-1",
            {
                accountId: "account-1",
                name: "Primary Checking",
            },
        );
        expect(mocks.beginWorkspaceExplicitMutation).toHaveBeenCalledWith(
            "owner-1",
        );
        expect(mocks.completeWorkspaceExplicitMutation).toHaveBeenCalledWith({
            ledgerId: "owner-1",
            token: "fence-token",
        });
        expect(mocks.recoverWorkspaceExplicitMutation).not.toHaveBeenCalled();
    });

    it("returns a normalized error response when account creation fails", async () => {
        mocks.upsertAccountWithWorkspaceChanges.mockRejectedValue(
            new HttpError(
                409,
                "account_conflict",
                "An account with this name already exists.",
            ),
        );

        const response = await POST(
            new Request("http://localhost/api/accounts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: "Checking",
                    accountType: "checking",
                    openingBalanceCents: 10_000,
                    openedOn: "2026-05-22",
                }),
            }),
        );

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "account_conflict",
                details: undefined,
                message: "An account with this name already exists.",
            },
        });
    });
});
