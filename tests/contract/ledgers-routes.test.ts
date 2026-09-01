import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence-token"),
    buildCommittedWorkspaceKnowledge: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    createLedger: vi.fn(),
    deleteLedger: vi.fn(),
    listLedgers: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    requireCurrentUserAccount: vi.fn(),
    setActiveLedger: vi.fn(),
    setLedgerArchiveStatusWithWorkspaceChanges: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
    updateLedgerWithWorkspaceChanges: vi.fn(),
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
        ledger: 1,
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
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/ledgers/server/ledger-service", () => ({
    createLedger: mocks.createLedger,
    deleteLedger: mocks.deleteLedger,
    listLedgers: mocks.listLedgers,
    setActiveLedger: mocks.setActiveLedger,
    setLedgerArchiveStatusWithWorkspaceChanges:
        mocks.setLedgerArchiveStatusWithWorkspaceChanges,
    updateLedgerWithWorkspaceChanges:
        mocks.updateLedgerWithWorkspaceChanges,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

import { GET, POST } from "@/app/api/ledgers/route";
import {
    DELETE,
    PATCH,
    POST as POST_LEDGER_ACTION,
    PUT,
} from "@/app/api/ledgers/[ledgerId]/route";

describe("ledgers routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireCurrentUserAccount.mockResolvedValue({
            userId: "owner-1",
            activeLedgerId: "default",
        });
        mocks.trackWorkspaceMutation.mockImplementation(
            async (_user, mutate) => ({
                knowledge: fakeKnowledge,
                result: await mutate(),
            }),
        );
        mocks.buildCommittedWorkspaceKnowledge.mockResolvedValue(fakeKnowledge);
        mocks.persistWorkspaceChanges.mockImplementation(({ changes }) => changes);
    });

    it("lists global ledgers", async () => {
        mocks.listLedgers.mockResolvedValue([
            {
                ledgerId: "default",
                workspaceId: "global",
                name: "Initial ledger",
                isDefault: false,
                status: "active",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            },
        ]);

        const response = await GET();

        expect(response.status).toBe(200);
        expect(mocks.listLedgers).toHaveBeenCalledWith();
        await expect(response.json()).resolves.toMatchObject({
            activeLedgerId: "default",
            ledgers: [
                {
                    ledgerId: "default",
                    workspaceId: "global",
                },
            ],
        });
    });

    it("creates a ledger and makes it active", async () => {
        mocks.createLedger.mockResolvedValue({
            ledgerId: "ledger-2027",
            workspaceId: "global",
            name: "2027 ledger",
            isDefault: false,
            status: "active",
            createdAt: "2026-06-02T12:00:00.000Z",
            updatedAt: "2026-06-02T12:00:00.000Z",
        });

        const response = await POST(
            new Request("http://localhost/api/ledgers", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: "2027 ledger" }),
            }),
        );

        expect(response.status).toBe(201);
        expect(mocks.createLedger).toHaveBeenCalledWith("owner-1", {
            name: "2027 ledger",
        });
        await expect(response.json()).resolves.toMatchObject({
            ledgerId: "ledger-2027",
            workspaceId: "global",
        });
    });

    it("switches the active ledger", async () => {
        mocks.setActiveLedger.mockResolvedValue({
            ledgerId: "ledger-2027",
            workspaceId: "global",
            name: "2027 ledger",
            isDefault: false,
            status: "active",
            createdAt: "2026-06-02T12:00:00.000Z",
            updatedAt: "2026-06-02T12:00:00.000Z",
        });

        const response = await PATCH(
            new Request("http://localhost/api/ledgers/ledger-2027", {
                method: "PATCH",
            }),
            { params: Promise.resolve({ ledgerId: "ledger-2027" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.setActiveLedger).toHaveBeenCalledWith(
            "owner-1",
            "ledger-2027",
        );
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            ledger: { ledgerId: "ledger-2027" },
        });
    });

    it("renames a ledger", async () => {
        mocks.updateLedgerWithWorkspaceChanges.mockResolvedValue({
            ledger: {
                ledgerId: "ledger-2027",
                workspaceId: "global",
                name: "Renamed ledger",
                isDefault: false,
                status: "active",
                createdAt: "2026-06-02T12:00:00.000Z",
                updatedAt: "2026-06-03T12:00:00.000Z",
            },
            workspaceChanges: [],
        });

        const response = await PUT(
            new Request("http://localhost/api/ledgers/ledger-2027", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: "Renamed ledger" }),
            }),
            { params: Promise.resolve({ ledgerId: "ledger-2027" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.updateLedgerWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-2027",
            { name: "Renamed ledger" },
        );
        await expect(response.json()).resolves.toMatchObject({
            workspaceSync: { commits: [] },
        });
    });

    it("archives a ledger without changing the current user selection", async () => {
        mocks.setLedgerArchiveStatusWithWorkspaceChanges.mockResolvedValue({
            ledger: {
                ledgerId: "ledger-2027",
                name: "2027 ledger",
                status: "archived",
            },
            workspaceChanges: [],
        });

        const response = await POST_LEDGER_ACTION(
            new Request(
                "http://localhost/api/ledgers/ledger-2027?action=archive",
                { method: "POST" },
            ),
            { params: Promise.resolve({ ledgerId: "ledger-2027" }) },
        );

        expect(response.status).toBe(200);
        expect(
            mocks.setLedgerArchiveStatusWithWorkspaceChanges,
        ).toHaveBeenCalledWith({
            action: "archive",
            ledgerId: "ledger-2027",
        });
        expect(mocks.setActiveLedger).not.toHaveBeenCalled();
    });

    it("deletes a ledger after name confirmation", async () => {
        mocks.deleteLedger.mockResolvedValue({
            deletedRecordCount: 4,
            ledger: {
                ledgerId: "ledger-2027",
                workspaceId: "global",
                name: "2027 ledger",
                isDefault: false,
                status: "active",
                createdAt: "2026-06-02T12:00:00.000Z",
                updatedAt: "2026-06-02T12:00:00.000Z",
            },
        });

        const response = await DELETE(
            new Request("http://localhost/api/ledgers/ledger-2027", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ confirmationName: "2027 ledger" }),
            }),
            { params: Promise.resolve({ ledgerId: "ledger-2027" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.deleteLedger).toHaveBeenCalledWith(
            "owner-1",
            "ledger-2027",
            { confirmationName: "2027 ledger" },
        );
    });
});
