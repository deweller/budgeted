// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listBudgetCategories: vi.fn(),
    listBudgetGroups: vi.fn(),
    updateBudgetCategoryPlanMetadata: vi.fn(),
    upsertBudgetGroup: vi.fn(),
}));

vi.mock("@/features/budget/server/category-service", () => ({
    isUserVisibleBudgetCategory: (category: { systemCategoryKey?: string }) =>
        category.systemCategoryKey !== "startingBalances",
    listBudgetCategories: mocks.listBudgetCategories,
    updateBudgetCategoryPlanMetadata: mocks.updateBudgetCategoryPlanMetadata,
}));

vi.mock("@/features/budget/server/group-service", () => ({
    listBudgetGroups: mocks.listBudgetGroups,
    upsertBudgetGroup: mocks.upsertBudgetGroup,
}));

import {
    listGlobalPlan,
    updateGlobalPlan,
} from "@/features/budget/server/global-plan-service";
import { HttpError } from "@/lib/api/errors";

const livingGroup = {
    groupId: "living",
    name: "Living",
    status: "active" as const,
    sortOrder: 1,
};
const incomeGroup = {
    groupId: "income",
    name: "Income",
    status: "active" as const,
    sortOrder: 0,
};

describe("budget plan service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("lists active groups and user-managed budget plan categories", async () => {
        mocks.listBudgetGroups.mockResolvedValue([
            livingGroup,
            { ...incomeGroup, status: "archived" },
        ]);
        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "archived",
                name: "Archived",
                groupId: "living",
                status: "archived",
                sortOrder: 99,
                defaultAssignedCents: 125,
                isIncomeCategory: true,
                systemCategoryKey: undefined,
            },
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
            {
                categoryId: "starting-balances",
                name: "Starting Balances",
                groupId: "income",
                status: "active",
                sortOrder: 2,
                defaultAssignedCents: 0,
                isIncomeCategory: true,
                systemCategoryKey: "startingBalances",
            },
        ]);

        await expect(listGlobalPlan("owner-1")).resolves.toEqual({
            groups: [livingGroup],
            categories: [
                {
                    allocationCadence: "monthly",
                    allocationStartMonth: 1,
                    categoryId: "groceries",
                    categoryType: "spending",
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
    });

    it("normalizes group and per-group category sort order when saving", async () => {
        mocks.listBudgetGroups
            .mockResolvedValueOnce([livingGroup, incomeGroup])
            .mockResolvedValueOnce([
                { ...incomeGroup, sortOrder: 0 },
                { ...livingGroup, name: "Household", sortOrder: 1 },
            ]);
        mocks.listBudgetCategories
            .mockResolvedValueOnce([
                {
                    categoryId: "groceries",
                    name: "Groceries",
                    groupId: "living",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 10_000,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
                {
                    categoryId: "paycheck",
                    name: "Paycheck",
                    groupId: "income",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 0,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
            ])
            .mockResolvedValueOnce([
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
                {
                    categoryId: "groceries",
                    name: "Groceries Updated",
                    groupId: "living",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 45_000,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
            ]);

        const result = await updateGlobalPlan("owner-1", {
            groups: [
                {
                    groupId: "income",
                    name: "Income",
                    sortOrder: 99,
                    status: "active",
                },
                {
                    groupId: "living",
                    name: "Household",
                    sortOrder: 42,
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
                    sortOrder: 50,
                    systemCategoryKey: undefined,
                },
                {
                    categoryId: "groceries",
                    defaultAssignedCents: 45_000,
                    groupId: "living",
                    isIncomeCategory: false,
                    name: "Groceries Updated",
                    sortOrder: 30,
                    systemCategoryKey: undefined,
                },
            ],
        });

        expect(mocks.upsertBudgetGroup).toHaveBeenCalledWith("owner-1", {
            groupId: "income",
            name: "Income",
            sortOrder: 0,
            status: "active",
        });
        expect(mocks.upsertBudgetGroup).toHaveBeenCalledWith("owner-1", {
            groupId: "living",
            name: "Household",
            sortOrder: 1,
            status: "active",
        });
        expect(mocks.updateBudgetCategoryPlanMetadata).toHaveBeenCalledWith(
            "owner-1",
            {
                allocationCadence: "monthly",
                allocationStartMonth: 1,
                categoryId: "paycheck",
                categoryType: "spending",
                defaultAssignedCents: 0,
                groupId: "income",
                isIncomeCategory: true,
                name: "Paycheck",
                sortOrder: 0,
                systemCategoryKey: undefined,
            },
        );
        expect(mocks.updateBudgetCategoryPlanMetadata).toHaveBeenCalledWith(
            "owner-1",
            {
                allocationCadence: "monthly",
                allocationStartMonth: 1,
                categoryId: "groceries",
                categoryType: "spending",
                defaultAssignedCents: 45_000,
                groupId: "living",
                isIncomeCategory: false,
                name: "Groceries Updated",
                sortOrder: 0,
                systemCategoryKey: undefined,
            },
        );
        expect(result).toEqual({
            groups: [
                { ...incomeGroup, sortOrder: 0 },
                { ...livingGroup, name: "Household", sortOrder: 1 },
            ],
            categories: [
                {
                    allocationCadence: "monthly",
                    allocationStartMonth: 1,
                    categoryId: "paycheck",
                    categoryType: "spending",
                    name: "Paycheck",
                    groupId: "income",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 0,
                    isIncomeCategory: true,
                    systemCategoryKey: undefined,
                },
                {
                    allocationCadence: "monthly",
                    allocationStartMonth: 1,
                    categoryId: "groceries",
                    categoryType: "spending",
                    name: "Groceries Updated",
                    groupId: "living",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 45_000,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
            ],
        });
    });

    it("saves yearly category schedule metadata", async () => {
        mocks.listBudgetGroups
            .mockResolvedValueOnce([livingGroup])
            .mockResolvedValueOnce([livingGroup]);
        mocks.listBudgetCategories
            .mockResolvedValueOnce([
                {
                    categoryId: "insurance",
                    name: "Insurance",
                    groupId: "living",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 120_000,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
            ])
            .mockResolvedValueOnce([
                {
                    allocationCadence: "yearly",
                    allocationStartMonth: 6,
                    categoryId: "insurance",
                    categoryType: "spending",
                    name: "Insurance",
                    groupId: "living",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 120_000,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
            ]);

        await expect(
            updateGlobalPlan("owner-1", {
                groups: [livingGroup],
                categories: [
                    {
                        allocationCadence: "yearly",
                        allocationStartMonth: 6,
                        categoryId: "insurance",
                        defaultAssignedCents: 120_000,
                        groupId: "living",
                        isIncomeCategory: false,
                        name: "Insurance",
                        sortOrder: 0,
                        systemCategoryKey: undefined,
                    },
                ],
            }),
        ).resolves.toEqual({
            groups: [livingGroup],
            categories: [
                {
                    allocationCadence: "yearly",
                    allocationStartMonth: 6,
                    categoryId: "insurance",
                    categoryType: "spending",
                    name: "Insurance",
                    groupId: "living",
                    status: "active",
                    sortOrder: 0,
                    defaultAssignedCents: 120_000,
                    isIncomeCategory: false,
                    systemCategoryKey: undefined,
                },
            ],
        });
        expect(mocks.updateBudgetCategoryPlanMetadata).toHaveBeenCalledWith(
            "owner-1",
            {
                allocationCadence: "yearly",
                allocationStartMonth: 6,
                categoryId: "insurance",
                categoryType: "spending",
                defaultAssignedCents: 120_000,
                groupId: "living",
                isIncomeCategory: false,
                name: "Insurance",
                sortOrder: 0,
                systemCategoryKey: undefined,
            },
        );
    });

    it("rejects edits to retired system-managed starting balances metadata", async () => {
        mocks.listBudgetGroups.mockResolvedValue([incomeGroup]);
        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "starting-balances",
                name: "Starting Balances",
                groupId: "income",
                status: "active",
                sortOrder: 1,
                defaultAssignedCents: 0,
                isIncomeCategory: true,
                systemCategoryKey: "startingBalances",
            },
        ]);

        await expect(
            updateGlobalPlan("owner-1", {
                groups: [incomeGroup],
                categories: [
                    {
                        categoryId: "starting-balances",
                        defaultAssignedCents: 1_000,
                        groupId: "income",
                        isIncomeCategory: false,
                        name: "Starting Balances",
                        sortOrder: 0,
                        systemCategoryKey: "startingBalances",
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(HttpError);

        expect(mocks.updateBudgetCategoryPlanMetadata).not.toHaveBeenCalled();
    });

    it("rejects updates for unknown category groups", async () => {
        mocks.listBudgetGroups.mockResolvedValue([livingGroup]);
        mocks.listBudgetCategories.mockResolvedValue([
            {
                categoryId: "groceries",
                name: "Groceries",
                groupId: "living",
                status: "active",
                sortOrder: 1,
                defaultAssignedCents: 0,
                isIncomeCategory: false,
                systemCategoryKey: undefined,
            },
        ]);

        await expect(
            updateGlobalPlan("owner-1", {
                groups: [livingGroup],
                categories: [
                    {
                        categoryId: "groceries",
                        defaultAssignedCents: 5_000,
                        groupId: "missing",
                        isIncomeCategory: false,
                        name: "Groceries",
                        sortOrder: 0,
                        systemCategoryKey: undefined,
                    },
                ],
            }),
        ).rejects.toBeInstanceOf(HttpError);
    });
});
