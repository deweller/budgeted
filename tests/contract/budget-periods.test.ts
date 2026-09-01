import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence-token"),
    buildCommittedWorkspaceKnowledge: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    requireCurrentUserAccount: vi.fn(),
    buildBudgetPeriodSummary: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    replaceBudgetAllocations: vi.fn(),
    replaceBudgetAllocationsWithWorkspaceChanges: vi.fn(),
    resetBudgetAllocations: vi.fn(),
    resetBudgetAllocationsWithWorkspaceChanges: vi.fn(),
    upsertBudgetCategoryWithWorkspaceChanges: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
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
    getActiveLedgerId: (user: {
        activeLedgerId?: string;
        userId: string;
    }) => user.activeLedgerId ?? user.userId,
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/budget/server/budget-period-service", () => ({
    buildBudgetPeriodSummary: mocks.buildBudgetPeriodSummary,
}));

vi.mock("@/features/budget/server/allocation-service", () => ({
    replaceBudgetAllocations: mocks.replaceBudgetAllocations,
    replaceBudgetAllocationsWithWorkspaceChanges:
        mocks.replaceBudgetAllocationsWithWorkspaceChanges,
    resetBudgetAllocations: mocks.resetBudgetAllocations,
    resetBudgetAllocationsWithWorkspaceChanges:
        mocks.resetBudgetAllocationsWithWorkspaceChanges,
}));

vi.mock("@/features/budget/server/category-service", () => ({
    upsertBudgetCategoryWithWorkspaceChanges:
        mocks.upsertBudgetCategoryWithWorkspaceChanges,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

import { POST } from "@/app/api/budget/categories/route";
import { GET } from "@/app/api/budget/periods/current/route";
import {
    DELETE,
    PUT,
} from "@/app/api/budget/periods/[periodId]/allocations/route";

describe("budget period routes", () => {
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
        mocks.replaceBudgetAllocationsWithWorkspaceChanges.mockImplementation(
            async (...args) => ({
                summary: await mocks.replaceBudgetAllocations(...args),
                workspaceChanges: [],
            }),
        );
        mocks.resetBudgetAllocationsWithWorkspaceChanges.mockImplementation(
            async (...args) => ({
                summary: await mocks.resetBudgetAllocations(...args),
                workspaceChanges: [],
            }),
        );
    });

    it("returns the current budget period summary", async () => {
        mocks.buildBudgetPeriodSummary.mockResolvedValue({
            activeAccountCount: 0,
            periodId: "2026-05",
            availableToBudgetCents: 12_500,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: false,
            categories: [],
        });

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            periodId: "2026-05",
            availableToBudgetCents: 12_500,
            hasSavedAssignments: false,
            status: "open",
        });
        expect(mocks.buildBudgetPeriodSummary).toHaveBeenCalledWith("owner-1");
    });

    it("returns archived historical category rows from the budget summary response", async () => {
        mocks.buildBudgetPeriodSummary.mockResolvedValue({
            activeAccountCount: 1,
            periodId: "2026-05",
            availableToBudgetCents: 8_000,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: true,
            categories: [
                {
                    categoryId: "archived-travel",
                    name: "Old Travel",
                    assignedCents: 4_000,
                    carriedForwardCents: 500,
                    activityCents: -250,
                    availableCents: 4_250,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            periodId: "2026-05",
            categories: [
                expect.objectContaining({
                    categoryId: "archived-travel",
                    name: "Old Travel",
                    assignedCents: 4_000,
                    availableCents: 4_250,
                }),
            ],
        });
    });

    it("replaces budget allocations for the requested period", async () => {
        mocks.replaceBudgetAllocations.mockResolvedValue({
            activeAccountCount: 1,
            periodId: "2026-05",
            availableToBudgetCents: 2_500,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: true,
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    assignedCents: 5_000,
                    carriedForwardCents: 0,
                    activityCents: 0,
                    availableCents: 5_000,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2026-05/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            { categoryId: "groceries", assignedCents: 5_000 },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2026-05" } },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            periodId: "2026-05",
            categories: [
                expect.objectContaining({
                    categoryId: "groceries",
                    assignedCents: 5_000,
                }),
            ],
        });
        expect(mocks.replaceBudgetAllocations).toHaveBeenCalledWith(
            "owner-1",
            "2026-05",
            [
                {
                    categoryId: "groceries",
                    assignedCents: 5_000,
                },
            ],
        );
    });

    it("accepts budget-category funding sources when replacing allocations", async () => {
        mocks.replaceBudgetAllocations.mockResolvedValue({
            activeAccountCount: 1,
            periodId: "2026-05",
            availableToBudgetCents: 0,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: true,
            categories: [],
        });

        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2026-05/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            {
                                categoryId: "groceries",
                                assignedCents: 6_500,
                                fundingSources: [
                                    {
                                        amountCents: 1_500,
                                        sourceId: "buffer",
                                        sourceType: "budgetCategory",
                                    },
                                ],
                            },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2026-05" } },
        );

        expect(response.status).toBe(200);
        expect(mocks.replaceBudgetAllocations).toHaveBeenCalledWith(
            "owner-1",
            "2026-05",
            [
                {
                    categoryId: "groceries",
                    assignedCents: 6_500,
                    fundingSources: [
                        {
                            amountCents: 1_500,
                            sourceId: "buffer",
                            sourceType: "budgetCategory",
                        },
                    ],
                },
            ],
        );
    });

    it("rejects unsupported funding-source types when replacing allocations", async () => {
        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2026-05/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            {
                                categoryId: "groceries",
                                assignedCents: 6_500,
                                fundingSources: [
                                    {
                                        amountCents: 1_500,
                                        sourceId: "side-income",
                                        sourceType: "incomeCategory",
                                    },
                                ],
                            },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2026-05" } },
        );

        expect(response.status).toBe(422);
        expect(mocks.replaceBudgetAllocations).not.toHaveBeenCalled();
    });

    it("resets budget allocations for the requested period", async () => {
        mocks.resetBudgetAllocations.mockResolvedValue({
            activeAccountCount: 1,
            periodId: "2026-05",
            availableToBudgetCents: 7_500,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: false,
            categories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    assignedCents: 0,
                    carriedForwardCents: 0,
                    activityCents: 0,
                    availableCents: 0,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        const response = await DELETE(
            new Request(
                "http://localhost/api/budget/periods/2026-05/allocations",
                { method: "DELETE" },
            ),
            { params: { periodId: "2026-05" } },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            periodId: "2026-05",
            hasSavedAssignments: false,
        });
        expect(mocks.resetBudgetAllocations).toHaveBeenCalledWith(
            "owner-1",
            "2026-05",
        );
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
        expect(mocks.persistWorkspaceChanges).toHaveBeenCalled();
    });

    it("rejects invalid periods when resetting allocations", async () => {
        const response = await DELETE(
            new Request(
                "http://localhost/api/budget/periods/not-a-month/allocations",
                { method: "DELETE" },
            ),
            { params: { periodId: "not-a-month" } },
        );

        expect(response.status).toBe(422);
        expect(mocks.resetBudgetAllocations).not.toHaveBeenCalled();
    });

    it("passes through a non-current requested period when replacing allocations", async () => {
        mocks.replaceBudgetAllocations.mockResolvedValue({
            activeAccountCount: 1,
            periodId: "2025-12",
            availableToBudgetCents: 7_500,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: true,
            categories: [
                {
                    categoryId: "travel",
                    name: "Travel",
                    assignedCents: 1_500,
                    carriedForwardCents: 250,
                    activityCents: 0,
                    availableCents: 1_750,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2025-12/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            { categoryId: "travel", assignedCents: 1_500 },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2025-12" } },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            periodId: "2025-12",
            categories: [
                expect.objectContaining({
                    categoryId: "travel",
                    assignedCents: 1_500,
                }),
            ],
        });
        expect(mocks.replaceBudgetAllocations).toHaveBeenCalledWith(
            "owner-1",
            "2025-12",
            [
                {
                    categoryId: "travel",
                    assignedCents: 1_500,
                },
            ],
        );
    });

    it("passes through a future requested period when replacing allocations", async () => {
        mocks.replaceBudgetAllocations.mockResolvedValue({
            activeAccountCount: 1,
            periodId: "2027-01",
            availableToBudgetCents: 9_500,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: true,
            categories: [
                {
                    categoryId: "savings",
                    name: "Savings",
                    assignedCents: 2_000,
                    carriedForwardCents: 500,
                    activityCents: 0,
                    availableCents: 2_500,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2027-01/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            { categoryId: "savings", assignedCents: 2_000 },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2027-01" } },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            periodId: "2027-01",
            categories: [
                expect.objectContaining({
                    categoryId: "savings",
                    assignedCents: 2_000,
                }),
            ],
        });
        expect(mocks.replaceBudgetAllocations).toHaveBeenCalledWith(
            "owner-1",
            "2027-01",
            [
                {
                    categoryId: "savings",
                    assignedCents: 2_000,
                },
            ],
        );
    });

    it("returns untouched assignment summaries for a future requested period", async () => {
        mocks.replaceBudgetAllocations.mockResolvedValue({
            activeAccountCount: 1,
            periodId: "2027-02",
            availableToBudgetCents: 4_500,
            status: "open",
            attentionStates: [],
            carryForwardSummaries: [],
            hasSavedAssignments: false,
            categories: [
                {
                    categoryId: "travel",
                    name: "Travel",
                    assignedCents: 0,
                    carriedForwardCents: 500,
                    activityCents: 0,
                    availableCents: 500,
                    reducedByOverspending: false,
                    attentionStates: [],
                },
            ],
        });

        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2027-02/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            { categoryId: "travel", assignedCents: 0 },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2027-02" } },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            periodId: "2027-02",
            categories: [
                expect.objectContaining({
                    categoryId: "travel",
                    assignedCents: 0,
                    carriedForwardCents: 500,
                }),
            ],
        });
    });

    it("creates a budget category with the normalized response shape", async () => {
        mocks.upsertBudgetCategoryWithWorkspaceChanges.mockResolvedValue({
            category: {
                categoryId: "cat_groceries",
                name: "Groceries",
                groupId: "everyday",
                status: "active",
            },
            workspaceChanges: [],
        });

        const response = await POST(
            new Request("http://localhost/api/budget/categories", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: "Groceries",
                    groupId: "everyday",
                    status: "active",
                }),
            }),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            category: {
                categoryId: "cat_groceries",
                name: "Groceries",
                groupId: "everyday",
            },
            workspaceSync: { commits: [] },
        });
        expect(
            mocks.upsertBudgetCategoryWithWorkspaceChanges,
        ).toHaveBeenCalledWith("owner-1", {
            categoryType: "spending",
            name: "Groceries",
            groupId: "everyday",
            status: "active",
        });
    });

    it("returns a normalized error response when the current budget read fails", async () => {
        mocks.buildBudgetPeriodSummary.mockRejectedValue(
            new HttpError(
                503,
                "budget_read_unavailable",
                "Budget summary is temporarily unavailable.",
            ),
        );

        const response = await GET();

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "budget_read_unavailable",
                details: undefined,
                message: "Budget summary is temporarily unavailable.",
            },
        });
    });

    it("returns a normalized error response when allocation replacement fails", async () => {
        mocks.replaceBudgetAllocations.mockRejectedValue(
            new HttpError(
                422,
                "allocation_save_failed",
                "Unable to save allocations.",
            ),
        );

        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2026-05/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            { categoryId: "groceries", assignedCents: 50_000 },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2026-05" } },
        );

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "allocation_save_failed",
                details: undefined,
                message: "Unable to save allocations.",
            },
        });
    });

    it("returns a normalized allocation error for an earlier requested period", async () => {
        mocks.replaceBudgetAllocations.mockRejectedValue(
            new HttpError(
                422,
                "allocation_save_failed",
                "Unable to save allocations.",
            ),
        );

        const response = await PUT(
            new Request(
                "http://localhost/api/budget/periods/2026-01/allocations",
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        allocations: [
                            { categoryId: "travel", assignedCents: 1_000 },
                        ],
                    }),
                },
            ),
            { params: { periodId: "2026-01" } },
        );

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "allocation_save_failed",
                details: undefined,
                message: "Unable to save allocations.",
            },
        });
    });

    it("returns a normalized error response when category creation fails", async () => {
        const response = await POST(
            new Request("http://localhost/api/budget/categories", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: "",
                    groupId: "everyday",
                    status: "active",
                }),
            }),
        );

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "validation_error",
                details: {
                    fieldErrors: {
                        name: ["Category name is required."],
                    },
                    formErrors: [],
                },
                message: "Request body failed validation.",
            },
        });
    });
});
