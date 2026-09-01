import type { GlobalPlanFormInput } from "@/features/budget/models/global-plan-form";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { HttpError } from "@/lib/api/errors";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import {
    normalizeBudgetCategoryAllocationCadence,
    normalizeBudgetCategoryAllocationStartMonth,
    type BudgetCategoryAllocationCadence,
} from "@/modules/budgeting/allocation-schedule";
import {
    normalizeBudgetCategoryType,
    type BudgetCategoryType,
} from "@/modules/budgeting/category-type";

import {
    isUserVisibleBudgetCategory,
    listBudgetCategories,
    updateBudgetCategoryPlanMetadata,
} from "./category-service";
import { listBudgetGroups, upsertBudgetGroup } from "./group-service";

export type GlobalPlanGroupRecord = {
    groupId: string;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
};

export type GlobalPlanCategoryRecord = {
    allocationCadence: BudgetCategoryAllocationCadence;
    allocationStartMonth: number;
    categoryId: string;
    categoryType: BudgetCategoryType;
    defaultAssignedCents: number;
    groupId: string;
    isIncomeCategory: boolean;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
    systemCategoryKey?: "startingBalances";
};

export type GlobalPlanPayload = {
    categories: GlobalPlanCategoryRecord[];
    groups: GlobalPlanGroupRecord[];
};

function toGlobalPlanGroupRecord(input: {
    groupId: string;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
}) {
    return {
        groupId: input.groupId,
        name: input.name,
        sortOrder: input.sortOrder,
        status: input.status,
    } satisfies GlobalPlanGroupRecord;
}

function toGlobalPlanCategoryRecord(input: {
    allocationCadence?: string;
    allocationStartMonth?: number;
    categoryId: string;
    categoryType?: string;
    defaultAssignedCents?: number;
    groupId: string;
    isIncomeCategory?: boolean;
    name: string;
    sortOrder: number;
    status: "active" | "archived";
    systemCategoryKey?: "startingBalances";
}) {
    return {
        allocationCadence: normalizeBudgetCategoryAllocationCadence(
            input.allocationCadence,
        ),
        allocationStartMonth: normalizeBudgetCategoryAllocationStartMonth(
            input.allocationStartMonth,
        ),
        categoryId: input.categoryId,
        categoryType: normalizeBudgetCategoryType(input.categoryType),
        name: input.name,
        groupId: input.groupId,
        status: input.status,
        sortOrder: input.sortOrder,
        defaultAssignedCents: input.defaultAssignedCents ?? 0,
        isIncomeCategory: input.isIncomeCategory ?? false,
        systemCategoryKey: input.systemCategoryKey,
    } satisfies GlobalPlanCategoryRecord;
}

function normalizeGroups(groups: GlobalPlanFormInput["groups"]) {
    return groups.map((group, index) => ({
        ...group,
        name: group.name.trim(),
        sortOrder: index,
        status: group.status ?? "active",
    }));
}

function normalizeCategories(categories: GlobalPlanFormInput["categories"]) {
    const nextOrderByGroupId = new Map<string, number>();

    return categories.map((category) => {
        const nextSortOrder = nextOrderByGroupId.get(category.groupId) ?? 0;
        nextOrderByGroupId.set(category.groupId, nextSortOrder + 1);

        return {
            ...category,
            allocationCadence: normalizeBudgetCategoryAllocationCadence(
                category.allocationCadence,
            ),
            allocationStartMonth: normalizeBudgetCategoryAllocationStartMonth(
                category.allocationStartMonth,
            ),
            categoryType: normalizeBudgetCategoryType(category.categoryType),
            name: category.name.trim(),
            sortOrder: nextSortOrder,
        };
    });
}

function assertNoDuplicateIds(input: {
    ids: string[];
    code: string;
    message: string;
}) {
    const seenIds = new Set<string>();

    for (const id of input.ids) {
        if (seenIds.has(id)) {
            throw new HttpError(422, input.code, input.message);
        }

        seenIds.add(id);
    }
}

export async function listGlobalPlan(ledgerId: string): Promise<GlobalPlanPayload> {
    const [groups, categories] = await Promise.all([
        listBudgetGroups(ledgerId),
        listBudgetCategories(ledgerId),
    ]);

    return {
        groups: groups
            .filter((group) => group.status === "active")
            .map(toGlobalPlanGroupRecord),
        categories: categories
            .filter(
                (category) =>
                    category.status === "active" &&
                    isUserVisibleBudgetCategory(category),
            )
            .map(toGlobalPlanCategoryRecord),
    };
}

export async function updateGlobalPlan(
    ledgerId: string,
    input: GlobalPlanFormInput,
): Promise<GlobalPlanPayload> {
    const [existingGroups, categories] = await Promise.all([
        listBudgetGroups(ledgerId),
        listBudgetCategories(ledgerId),
    ]);
    const existingGroupIds = new Set(
        existingGroups
            .filter((group) => group.status === "active")
            .map((group) => group.groupId),
    );
    const categoriesById = new Map(
        categories
            .filter(
                (category) =>
                    category.status === "active" &&
                    isUserVisibleBudgetCategory(category),
            )
            .map((category) => [category.categoryId, category]),
    );
    const normalizedGroups = normalizeGroups(input.groups);
    const normalizedCategories = normalizeCategories(input.categories);
    const inputGroupIds = new Set(
        normalizedGroups.map((group) => group.groupId),
    );

    assertNoDuplicateIds({
        ids: normalizedGroups.map((group) => group.groupId),
        code: "duplicate_group",
        message: "A group can only appear once in the budget plan update.",
    });
    assertNoDuplicateIds({
        ids: normalizedCategories.map((category) => category.categoryId),
        code: "duplicate_category",
        message: "A category can only appear once in the budget plan update.",
    });

    for (const group of normalizedGroups) {
        if (!existingGroupIds.has(group.groupId)) {
            throw new HttpError(
                404,
                "group_missing",
                "One or more groups were not found.",
            );
        }
    }

    await Promise.all(
        normalizedGroups.map((group) =>
            upsertBudgetGroup(ledgerId, {
                groupId: group.groupId,
                name: group.name,
                sortOrder: group.sortOrder,
                status: group.status,
            }),
        ),
    );

    await Promise.all(
        normalizedCategories.map(async (category) => {
            if (!categoriesById.has(category.categoryId)) {
                throw new HttpError(
                    404,
                    "category_missing",
                    "One or more categories were not found.",
                );
            }

            if (!inputGroupIds.has(category.groupId)) {
                throw new HttpError(
                    422,
                    "category_group_missing",
                    "Each category must belong to a saved budget group.",
                );
            }

            const existing = categoriesById.get(category.categoryId)!;

            if (existing.systemCategoryKey === "startingBalances") {
                if (
                    category.defaultAssignedCents !==
                        existing.defaultAssignedCents ||
                    category.allocationCadence !==
                        normalizeBudgetCategoryAllocationCadence(
                            existing.allocationCadence,
                        ) ||
                    category.allocationStartMonth !==
                        normalizeBudgetCategoryAllocationStartMonth(
                            existing.allocationStartMonth,
                        ) ||
                    category.groupId !== existing.groupId ||
                    category.name !== existing.name ||
                    category.categoryType !==
                        normalizeBudgetCategoryType(existing.categoryType) ||
                    category.isIncomeCategory !== true
                ) {
                    throw new HttpError(
                        422,
                        "system_category_locked",
                        "System-managed categories cannot be edited from the budget plan.",
                    );
                }
            }

            await updateBudgetCategoryPlanMetadata(ledgerId, category);
        }),
    );

    return listGlobalPlan(ledgerId);
}

function createWorkspaceUpsertChange(
    entityType: WorkspaceMutationChangeInput["entityType"],
    entityId: string,
    record: unknown,
    previousRecord?: unknown,
): WorkspaceMutationChangeInput {
    return {
        entityId,
        entityType,
        operation: "upsert",
        previousRecordDigest: previousRecord
            ? calculateWorkspaceRecordDigest({ entityType, record: previousRecord })
            : null,
        record,
    };
}

function createWorkspaceDeleteChange(
    entityType: WorkspaceMutationChangeInput["entityType"],
    entityId: string,
    previousRecord: unknown,
): WorkspaceMutationChangeInput {
    return {
        entityId,
        entityType,
        operation: "delete",
        previousRecordDigest: calculateWorkspaceRecordDigest({
            entityType,
            record: previousRecord,
        }),
        record: null,
    };
}

export async function updateGlobalPlanWithWorkspaceChanges(
    ledgerId: string,
    input: GlobalPlanFormInput,
) {
    const [beforeGroups, beforeCategories] = await Promise.all([
        listBudgetGroups(ledgerId),
        listBudgetCategories(ledgerId),
    ]);
    const plan = await updateGlobalPlan(ledgerId, input);
    const [groups, categories] = await Promise.all([
        listBudgetGroups(ledgerId),
        listBudgetCategories(ledgerId),
    ]);
    const groupIds = new Set(plan.groups.map((group) => group.groupId));
    const categoryIds = new Set(
        plan.categories.map((category) => category.categoryId),
    );
    const beforeGroupsById = new Map(
        beforeGroups.map((group) => [group.groupId, group]),
    );
    const beforeCategoriesById = new Map(
        beforeCategories.map((category) => [category.categoryId, category]),
    );

    return {
        plan,
        workspaceChanges: [
            ...groups
                .filter((group) => groupIds.has(group.groupId))
                .map((group) =>
                    createWorkspaceUpsertChange(
                        "budgetGroup",
                        group.groupId,
                        group,
                        beforeGroupsById.get(group.groupId),
                    ),
                ),
            ...categories
                .filter((category) => categoryIds.has(category.categoryId))
                .map((category) =>
                    createWorkspaceUpsertChange(
                        "budgetCategory",
                        category.categoryId,
                        category,
                        beforeCategoriesById.get(category.categoryId),
                    ),
                ),
            ...beforeGroups
                .filter((group) => !groupIds.has(group.groupId))
                .map((group) =>
                    createWorkspaceDeleteChange(
                        "budgetGroup",
                        group.groupId,
                        group,
                    ),
                ),
            ...beforeCategories
                .filter((category) => !categoryIds.has(category.categoryId))
                .map((category) =>
                    createWorkspaceDeleteChange(
                        "budgetCategory",
                        category.categoryId,
                        category,
                    ),
                ),
        ],
    };
}
