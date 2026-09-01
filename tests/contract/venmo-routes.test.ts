import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence"),
    buildCommittedWorkspaceKnowledge: vi.fn().mockResolvedValue({ activeLedgerId: "ledger-1", changeCursor: "cursor", entityCounts: {}, entityDigests: {}, entityRevisions: {}, generatedAt: "2026-08-07T00:00:00.000Z", oldestRetainedWorkspaceRevision: 0, retainedChangesAfter: "2026-07-01T00:00:00.000Z", revision: "r1", workspaceGeneration: 1, workspaceRevision: 1 }),
    completeWorkspaceExplicitMutation: vi.fn(), deleteVenmoAccountMapping: vi.fn(), deleteVenmoActivity: vi.fn(), manuallyMatchVenmoActivity: vi.fn(),
    persistWorkspaceChanges: vi.fn().mockResolvedValue([]), reconcileVenmoActivities: vi.fn(), recoverWorkspaceExplicitMutation: vi.fn(),
    requireCurrentUserAccount: vi.fn(), saveVenmoAccountMapping: vi.fn(), saveVenmoSettings: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUserAccount: mocks.requireCurrentUserAccount }));
vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation, buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation, persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
}));
vi.mock("@/features/venmo/server/venmo-service", () => ({
    deleteVenmoAccountMapping: mocks.deleteVenmoAccountMapping, deleteVenmoActivity: mocks.deleteVenmoActivity, manuallyMatchVenmoActivity: mocks.manuallyMatchVenmoActivity,
    reconcileVenmoActivities: mocks.reconcileVenmoActivities, saveVenmoAccountMapping: mocks.saveVenmoAccountMapping, saveVenmoSettings: mocks.saveVenmoSettings,
}));

import { PUT as PUT_SETTINGS } from "@/app/api/utilities/venmo/settings/route";
import { PUT as PUT_MAPPING } from "@/app/api/utilities/venmo/account-mappings/route";
import { DELETE as DELETE_MAPPING } from "@/app/api/utilities/venmo/account-mappings/[mappingId]/route";
import { DELETE as DELETE_ACTIVITY } from "@/app/api/utilities/venmo/activities/[activityId]/route";
import { POST as POST_MATCH } from "@/app/api/utilities/venmo/activities/[activityId]/match/route";
import { POST as POST_REPROCESS } from "@/app/api/utilities/venmo/reprocess/route";

describe("Venmo utility routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireCurrentUserAccount.mockResolvedValue({ activeLedgerId: "ledger-1", activeLedgerName: "Household", userId: "user-1" });
        for (const mock of [mocks.saveVenmoSettings, mocks.saveVenmoAccountMapping, mocks.deleteVenmoAccountMapping, mocks.deleteVenmoActivity, mocks.manuallyMatchVenmoActivity, mocks.reconcileVenmoActivities]) mock.mockResolvedValue({ workspaceChanges: [] });
    });

    it("saves settings for the authenticated ledger", async () => {
        const response = await PUT_SETTINGS(new Request("http://test/api/utilities/venmo/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inboxEnabled: true, venmoAccountId: "account-1" }) }));
        expect(response.status).toBe(200);
        expect(mocks.saveVenmoSettings).toHaveBeenCalledWith({ inboxEnabled: true, ledgerId: "ledger-1", venmoAccountId: "account-1" });
    });

    it("saves and deletes account mappings", async () => {
        expect((await PUT_MAPPING(new Request("http://test/api/utilities/venmo/account-mappings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: "account-1", externalAccountKey: "sample bank:1234" }) }))).status).toBe(200);
        await DELETE_MAPPING(new Request("http://test"), { params: Promise.resolve({ mappingId: "mapping-1" }) });
        expect(mocks.saveVenmoAccountMapping).toHaveBeenCalledWith({ accountId: "account-1", externalAccountKey: "sample bank:1234", ledgerId: "ledger-1" });
        expect(mocks.deleteVenmoAccountMapping).toHaveBeenCalledWith({ ledgerId: "ledger-1", mappingId: "mapping-1" });
    });

    it("matches a conflict and reprocesses pending activities", async () => {
        await POST_MATCH(new Request("http://test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: "transaction-1" }) }), { params: Promise.resolve({ activityId: "paymentSent:provider-1" }) });
        await POST_REPROCESS();
        expect(mocks.manuallyMatchVenmoActivity).toHaveBeenCalledWith({ activityId: "paymentSent:provider-1", ledgerId: "ledger-1", transactionId: "transaction-1" });
        expect(mocks.reconcileVenmoActivities).toHaveBeenCalledWith("ledger-1");
    });

    it("deletes an unlinked Venmo activity from the authenticated ledger", async () => {
        const response = await DELETE_ACTIVITY(new Request("http://test"), {
            params: Promise.resolve({ activityId: "paymentSent:provider-1" }),
        });

        expect(response.status).toBe(200);
        expect(mocks.deleteVenmoActivity).toHaveBeenCalledWith({
            activityId: "paymentSent:provider-1",
            ledgerId: "ledger-1",
        });
    });
});
