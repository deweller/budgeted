import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence-token"),
    buildCommittedWorkspaceKnowledge: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    launchAmazonOrderSync: vi.fn(),
    manuallyMatchAmazonPayment: vi.fn(),
    pollAmazonOrderSyncRun: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    readAmazonScraperManifest: vi.fn(),
    requireCurrentUserAccount: vi.fn(),
    saveAmazonOrderSettings: vi.fn(),
    saveAmazonOrderSettingsWithWorkspaceChanges: vi.fn(),
    syncLatestAmazonOrders: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
}));

const fakeKnowledge = {
    activeLedgerId: "ledger-1",
    changeCursor: "01HZ0000000000000000000000",
    entityCounts: {},
    generatedAt: "2026-06-24T12:00:00.000Z",
    retainedChangesAfter: "2026-05-25T12:00:00.000Z",
    revision: "revision",
};

vi.mock("@/lib/auth/current-user", () => ({
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

vi.mock("@/features/amazon/server/amazon-order-service", () => ({
    launchAmazonOrderSync: mocks.launchAmazonOrderSync,
    manuallyMatchAmazonPayment: mocks.manuallyMatchAmazonPayment,
    pollAmazonOrderSyncRun: mocks.pollAmazonOrderSyncRun,
    readAmazonScraperManifest: mocks.readAmazonScraperManifest,
    saveAmazonOrderSettings: mocks.saveAmazonOrderSettings,
    saveAmazonOrderSettingsWithWorkspaceChanges:
        mocks.saveAmazonOrderSettingsWithWorkspaceChanges,
    syncLatestAmazonOrders: mocks.syncLatestAmazonOrders,
}));

import { GET as GET_MANIFEST } from "@/app/api/extras/amazon-orders/manifest/route";
import { PUT as PUT_MATCH } from "@/app/api/extras/amazon-orders/payments/[amazonPaymentId]/match/route";
import { PUT as PUT_SETTINGS } from "@/app/api/extras/amazon-orders/settings/route";
import { POST as POST_SYNC } from "@/app/api/extras/amazon-orders/sync/route";
import { GET as GET_SYNC_RUN } from "@/app/api/extras/amazon-orders/sync-runs/[syncRunId]/route";
describe("Amazon orders routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.buildCommittedWorkspaceKnowledge.mockResolvedValue(fakeKnowledge);
        mocks.requireCurrentUserAccount.mockResolvedValue({
            activeLedgerId: "ledger-1",
            activeLedgerName: "Household",
            userId: "owner",
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
                changedAt: "2026-06-24T12:00:00.000Z",
                changeId: `change-${index}`,
                expiresAt: 1_780_000_000,
            })),
        );
        mocks.saveAmazonOrderSettingsWithWorkspaceChanges.mockImplementation(
            async (...args) => ({
                integration: await mocks.saveAmazonOrderSettings(...args),
                workspaceChanges: [
                    {
                        entityId: "amazon-orders",
                        entityType: "amazonOrderIntegration",
                        operation: "upsert",
                        record: { integrationId: "amazon-orders" },
                    },
                ],
            }),
        );
    });

    it("reads the scraper manifest without a workspace mutation", async () => {
        mocks.readAmazonScraperManifest.mockResolvedValue({
            state: "complete",
        });

        const response = await GET_MANIFEST();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ state: "complete" });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("saves Amazon account settings through a workspace mutation", async () => {
        mocks.saveAmazonOrderSettings.mockResolvedValue({
            accountId: "amazon-card",
            integrationId: "amazon-orders",
        });

        const response = await PUT_SETTINGS(
            new Request("https://budgeted.test/api/extras/amazon-orders/settings", {
                body: JSON.stringify({ accountId: "amazon-card" }),
                method: "PUT",
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            integrationId: "amazon-orders",
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "amazon-orders",
                                entityType: "amazonOrderIntegration",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(mocks.saveAmazonOrderSettingsWithWorkspaceChanges).toHaveBeenCalledWith({
            accountId: "amazon-card",
            ledgerId: "ledger-1",
        });
    });

    it("starts latest and launch sync modes", async () => {
        mocks.syncLatestAmazonOrders.mockResolvedValue({
            mode: "latest",
            workspaceChanges: [],
        });
        mocks.launchAmazonOrderSync.mockResolvedValue({
            mode: "launch",
            workspaceChanges: [],
        });

        await POST_SYNC(
            new Request("https://budgeted.test/api/extras/amazon-orders/sync", {
                body: JSON.stringify({ mode: "latest" }),
                method: "POST",
            }),
        );
        await POST_SYNC(
            new Request("https://budgeted.test/api/extras/amazon-orders/sync", {
                body: JSON.stringify({ mode: "launch" }),
                method: "POST",
            }),
        );

        expect(mocks.syncLatestAmazonOrders).toHaveBeenCalledWith("ledger-1");
        expect(mocks.launchAmazonOrderSync).toHaveBeenCalledWith("ledger-1");
    });

    it("polls a sync run and applies a manual payment match", async () => {
        mocks.pollAmazonOrderSyncRun.mockResolvedValue({
            syncRunId: "run-1",
            workspaceChanges: [],
        });
        mocks.manuallyMatchAmazonPayment.mockResolvedValue({
            amazonPaymentId: "payment-1",
            workspaceChanges: [],
        });

        await GET_SYNC_RUN(new Request("https://budgeted.test"), {
            params: Promise.resolve({ syncRunId: "run-1" }),
        });
        await PUT_MATCH(
            new Request("https://budgeted.test", {
                body: JSON.stringify({ transactionId: "transaction-1" }),
                method: "PUT",
            }),
            { params: Promise.resolve({ amazonPaymentId: "payment-1" }) },
        );

        expect(mocks.pollAmazonOrderSyncRun).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            syncRunId: "run-1",
        });
        expect(mocks.manuallyMatchAmazonPayment).toHaveBeenCalledWith({
            amazonPaymentId: "payment-1",
            ledgerId: "ledger-1",
            transactionId: "transaction-1",
        });
    });
});
