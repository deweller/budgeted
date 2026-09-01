import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence-token"),
    buildCommittedWorkspaceKnowledge: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    listGlobalPlan: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    requireCurrentUserAccount: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
    upsertBudgetCategoryWithWorkspaceChanges: vi.fn(),
    upsertBudgetGroupWithWorkspaceChanges: vi.fn(),
    updateGlobalPlan: vi.fn(),
    updateGlobalPlanWithWorkspaceChanges: vi.fn(),
}));

const fakeKnowledge = {
    activeLedgerId: "default",
    changeCursor: "01HZ0000000000000000000000",
    entityCounts: {
        account: 0,
        allocationFundingSource: 0,
        budgetCategory: 0,
        budgetGroup: 0,
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
    getActiveLedgerId: (user: {
        activeLedgerId?: string;
        userId: string;
    }) => user.activeLedgerId ?? user.userId,
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/budget/server/global-plan-service", () => ({
    listGlobalPlan: mocks.listGlobalPlan,
    updateGlobalPlan: mocks.updateGlobalPlan,
    updateGlobalPlanWithWorkspaceChanges:
        mocks.updateGlobalPlanWithWorkspaceChanges,
}));

vi.mock("@/features/budget/server/category-service", () => ({
    upsertBudgetCategoryWithWorkspaceChanges:
        mocks.upsertBudgetCategoryWithWorkspaceChanges,
}));

vi.mock("@/features/budget/server/group-service", () => ({
    upsertBudgetGroupWithWorkspaceChanges:
        mocks.upsertBudgetGroupWithWorkspaceChanges,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

import { POST as postCategory } from "@/app/api/budget/categories/route";
import { POST as postGroup } from "@/app/api/budget/groups/route";
import { GET, PUT } from "@/app/api/budget/plan/route";

describe("budget plan route contract", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.buildCommittedWorkspaceKnowledge.mockResolvedValue(fakeKnowledge);
        mocks.requireCurrentUserAccount.mockResolvedValue({
            activeLedgerId: "owner-1",
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
        mocks.updateGlobalPlanWithWorkspaceChanges.mockImplementation(
            async (...args) => ({
                plan: await mocks.updateGlobalPlan(...args),
                workspaceChanges: [],
            }),
        );
    });

    it("returns the budget plan groups and categories", async () => {
        mocks.listGlobalPlan.mockResolvedValue({
            groups: [
                {
                    groupId: "living",
                    name: "Living",
                    status: "active",
                    sortOrder: 0,
                },
            ],
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    groupId: "living",
                    status: "active",
                    sortOrder: 1,
                    defaultAssignedCents: 45_000,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
            ],
        });

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            groups: [
                {
                    groupId: "living",
                    name: "Living",
                    status: "active",
                    sortOrder: 0,
                },
            ],
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    groupId: "living",
                    status: "active",
                    sortOrder: 1,
                    defaultAssignedCents: 45_000,
                    isIncomeCategory: false,
                },
            ],
        });
        expect(mocks.listGlobalPlan).toHaveBeenCalledWith("owner-1");
    });

    it("updates the budget plan and returns the refreshed payload", async () => {
        mocks.updateGlobalPlan.mockResolvedValue({
            groups: [
                {
                    groupId: "income",
                    name: "Income",
                    status: "active",
                    sortOrder: 0,
                },
            ],
            categories: [
                {
                    categoryId: "paycheck",
                    name: "Paycheck",
                    groupId: "income",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 0,
                    isIncomeCategory: true,
                    systemCategoryKey: undefined,
                },
            ],
        });

        const payload = {
            groups: [
                {
                    groupId: "income",
                    name: "Income",
                    sortOrder: 0,
                    status: "active",
                },
            ],
            categories: [
                {
                    categoryId: "paycheck",
                    defaultAssignedCents: 0,
                    groupId: "income",
                    isIncomeCategory: true,
                    name: "Paycheck",
                    sortOrder: 0,
                    systemCategoryKey: undefined,
                },
            ],
        };

        const response = await PUT(
            new Request("http://localhost/api/budget/plan", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            groups: [
                {
                    groupId: "income",
                    name: "Income",
                    status: "active",
                    sortOrder: 0,
                },
            ],
            categories: [
                {
                    categoryId: "paycheck",
                    name: "Paycheck",
                    groupId: "income",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 0,
                    isIncomeCategory: true,
                },
            ],
            workspaceSync: { commits: [] },
        });
        expect(mocks.updateGlobalPlan).toHaveBeenCalledWith("owner-1", {
            groups: payload.groups,
            categories: [
                {
                    allocationCadence: "monthly",
                    allocationStartMonth: 1,
                    categoryType: "spending",
                    ...payload.categories[0],
                },
            ],
        });
    });

    it("creates reusable categories through the canonical category route", async () => {
        mocks.upsertBudgetCategoryWithWorkspaceChanges.mockResolvedValue({
            category: {
                categoryId: "groceries",
                name: "Groceries",
                groupId: "living",
                status: "active",
            },
            workspaceChanges: [],
        });

        const response = await postCategory(
            new Request("http://localhost/api/budget/categories", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    groupId: "living",
                    name: "Groceries",
                    status: "active",
                }),
            }),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            category: {
                categoryId: "groceries",
                name: "Groceries",
                groupId: "living",
                status: "active",
            },
            workspaceSync: { commits: [] },
        });
        expect(
            mocks.upsertBudgetCategoryWithWorkspaceChanges,
        ).toHaveBeenCalledWith("owner-1", {
            categoryType: "spending",
            groupId: "living",
            name: "Groceries",
            status: "active",
        });
    });

    it("creates budget groups through the canonical group route", async () => {
        mocks.upsertBudgetGroupWithWorkspaceChanges.mockResolvedValue({
            group: {
                groupId: "living",
                name: "Living",
                status: "active",
            },
            workspaceChanges: [],
        });

        const response = await postGroup(
            new Request("http://localhost/api/budget/groups", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: "Living",
                    status: "active",
                }),
            }),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            group: {
                groupId: "living",
                name: "Living",
                status: "active",
            },
            workspaceSync: { commits: [] },
        });
        expect(mocks.upsertBudgetGroupWithWorkspaceChanges).toHaveBeenCalledWith("owner-1", {
            name: "Living",
            status: "active",
        });
    });
});
