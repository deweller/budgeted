import type { AutoAssignSourceUpdateInput } from "@/features/budget/models/auto-assign-source";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import { HttpError } from "@/lib/api/errors";
import { getBudgetedSchema } from "@/lib/db/schema";

import {
    isUserVisibleBudgetCategory,
    listBudgetCategories,
} from "./category-service";

function normalizeSources(sources: AutoAssignSourceUpdateInput["sources"]) {
    return [...sources]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((source, index) => ({
            categoryId: source.categoryId,
            sortOrder: index,
        }));
}

function assertNoDuplicateSources(
    sources: AutoAssignSourceUpdateInput["sources"],
) {
    const seenIds = new Set<string>();

    for (const source of sources) {
        if (seenIds.has(source.categoryId)) {
            throw new HttpError(
                422,
                "duplicate_auto_assign_source",
                "A category can only appear once in the auto assign source list.",
            );
        }

        seenIds.add(source.categoryId);
    }
}

async function updateAutoAssignSourcesInternal(
    ledgerId: string,
    input: AutoAssignSourceUpdateInput,
) {
    const { entities } = getBudgetedSchema();
    const categories = await listBudgetCategories(ledgerId);
    const normalizedSources = normalizeSources(input.sources);
    const sourceOrderByCategoryId = new Map(
        normalizedSources.map((source) => [source.categoryId, source.sortOrder]),
    );
    const activeVisibleCategoryIds = new Set(
        categories
            .filter(
                (category) =>
                    category.status === "active" &&
                    isUserVisibleBudgetCategory(category),
            )
            .map((category) => category.categoryId),
    );
    const categoryById = new Map(
        categories.map((category) => [category.categoryId, category]),
    );
    const now = new Date().toISOString();

    assertNoDuplicateSources(normalizedSources);

    for (const source of normalizedSources) {
        if (!activeVisibleCategoryIds.has(source.categoryId)) {
            throw new HttpError(
                404,
                "category_missing",
                "One or more auto assign source categories were not found.",
            );
        }
    }

    const updatedCategories = await Promise.all(
        categories
            .filter(isUserVisibleBudgetCategory)
            .map((category) => {
                const sourceSortOrder = sourceOrderByCategoryId.get(
                    category.categoryId,
                );
                const updatedCategory = {
                    ...category,
                    autoAssignSourceEnabled: sourceSortOrder !== undefined,
                    autoAssignSourceSortOrder: sourceSortOrder,
                    updatedAt: now,
                };

                return entities.budgetCategories
                    .upsert(updatedCategory)
                    .go()
                    .then(() => updatedCategory);
            }),
    );

    return {
        sources: normalizedSources,
        workspaceChanges: updatedCategories.map((category) =>
            createWorkspaceUpsertChange({
                entityId: category.categoryId,
                entityType: "budgetCategory",
                previousRecord: categoryById.get(category.categoryId) ?? null,
                record: category,
            }),
        ),
    };
}

export async function updateAutoAssignSources(
    ledgerId: string,
    input: AutoAssignSourceUpdateInput,
) {
    const result = await updateAutoAssignSourcesInternal(ledgerId, input);

    return { sources: result.sources };
}

export function updateAutoAssignSourcesWithWorkspaceChanges(
    ledgerId: string,
    input: AutoAssignSourceUpdateInput,
) {
    return updateAutoAssignSourcesInternal(ledgerId, input);
}
