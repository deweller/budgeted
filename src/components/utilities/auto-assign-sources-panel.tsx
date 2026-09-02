"use client";

import { useMemo, useState } from "react";
import {
    faArrowDown,
    faArrowUp,
    faPlus,
    faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { buildGroupedCategoryComboboxOptions } from "@/features/budget/models/category-combobox-options";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";
import {
    createOptimisticWorkspaceUpsert,
    type OptimisticWorkspaceChange,
} from "@/lib/workspace/optimistic-changes";
import type {
    WorkspaceBudgetCategoryRecord,
} from "@/lib/workspace/sync-types";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";

function buildConfiguredSourceIds(categories: WorkspaceBudgetCategoryRecord[]) {
    return categories
        .filter(
            (category) =>
                category.status === "active" &&
                isUserVisibleBudgetCategory(category) &&
                category.autoAssignSourceEnabled === true,
        )
        .sort(
            (a, b) =>
                (a.autoAssignSourceSortOrder ?? Number.MAX_SAFE_INTEGER) -
                    (b.autoAssignSourceSortOrder ?? Number.MAX_SAFE_INTEGER) ||
                a.sortOrder - b.sortOrder ||
                a.name.localeCompare(b.name),
        )
        .map((category) => category.categoryId);
}

function buildSourceKey(sourceIds: string[]) {
    return sourceIds.join("\u001f");
}

function moveItem(sourceIds: string[], fromIndex: number, toIndex: number) {
    const nextSourceIds = [...sourceIds];
    const [sourceId] = nextSourceIds.splice(fromIndex, 1);
    nextSourceIds.splice(toIndex, 0, sourceId);

    return nextSourceIds;
}

function createOptimisticSourceChanges(input: {
    categories: WorkspaceBudgetCategoryRecord[];
    sourceIds: string[];
}): OptimisticWorkspaceChange[] {
    const changedAtDate = new Date();
    const updatedAt = changedAtDate.toISOString();
    const batchId = `optimistic:auto-assign-sources:${updatedAt}`;
    const sourceOrderByCategoryId = new Map(
        input.sourceIds.map((categoryId, index) => [categoryId, index]),
    );

    return input.categories.filter(isUserVisibleBudgetCategory).map((category) => {
        const sourceSortOrder = sourceOrderByCategoryId.get(category.categoryId);

        return createOptimisticWorkspaceUpsert({
            batchId,
            changedAt: changedAtDate,
            entityId: category.categoryId,
            entityType: "budgetCategory",
            record: {
                ...category,
                autoAssignSourceEnabled: sourceSortOrder !== undefined,
                autoAssignSourceSortOrder: sourceSortOrder,
                updatedAt,
            },
        });
    });
}

export function AutoAssignSourcesPanel() {
    const { snapshot } = useWorkspaceStore();
    const configuredSourceIds = useMemo(
        () => buildConfiguredSourceIds(snapshot.budgetCategories),
        [snapshot.budgetCategories],
    );
    const configuredSourceKey = buildSourceKey(configuredSourceIds);

    return (
        <AutoAssignSourcesEditor
            key={configuredSourceKey}
            configuredSourceIds={configuredSourceIds}
            configuredSourceKey={configuredSourceKey}
        />
    );
}

function AutoAssignSourcesEditor({
    configuredSourceIds,
    configuredSourceKey,
}: {
    configuredSourceIds: string[];
    configuredSourceKey: string;
}) {
    const { executeWorkspaceCommand, snapshot } = useWorkspaceStore();
    const { notifyError } = useFeedbackToasts();
    const categories = useMemo(
        () =>
            snapshot.budgetCategories.filter(
                (category) =>
                    category.status === "active" &&
                    isUserVisibleBudgetCategory(category),
            ),
        [snapshot.budgetCategories],
    );
    const categoryById = useMemo(
        () =>
            new Map(categories.map((category) => [category.categoryId, category])),
        [categories],
    );
    const [sourceIds, setSourceIds] = useState(configuredSourceIds);
    const [selectedCategoryId, setSelectedCategoryId] = useState("");
    const draftSourceKey = buildSourceKey(sourceIds);
    const hasChanges = draftSourceKey !== configuredSourceKey;
    const sourceOptions = useMemo<ComboboxSelectOption[]>(
        () =>
            buildGroupedCategoryComboboxOptions({
                categories: categories.filter(
                    (category) => !sourceIds.includes(category.categoryId),
                ),
                getValue: (category) => category.categoryId,
                groups: snapshot.budgetGroups,
            }),
        [categories, snapshot.budgetGroups, sourceIds],
    );

    function addSelectedSource() {
        if (!selectedCategoryId || sourceIds.includes(selectedCategoryId)) {
            return;
        }

        setSourceIds([...sourceIds, selectedCategoryId]);
        setSelectedCategoryId("");
    }

    function removeSource(categoryId: string) {
        setSourceIds(sourceIds.filter((sourceId) => sourceId !== categoryId));
    }

    function saveSources() {
        const sources = sourceIds.map((categoryId, index) => ({
            categoryId,
            sortOrder: index,
        }));

        void executeWorkspaceCommand({
            activity: {
                completedLabel: "Monthly budget funding sources saved.",
                pendingLabel: "Saving monthly budget funding sources…",
            },
            optimisticChanges: createOptimisticSourceChanges({
                categories: snapshot.budgetCategories,
                sourceIds,
            }),
            request: () =>
                fetch("/api/utilities/auto-assign-sources", {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ sources }),
                }),
            onError: () => {
                notifyError({
                    message:
                        "Save failed. The latest saved data has been restored.",
                    title: "Monthly budget funding sources could not be saved.",
                });
            },
        });
    }

    return (
        <div className="grid gap-6">
            <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                    Monthly budget funding sources
                </h1>
                <p className={`mt-3 max-w-3xl text-sm ${typographyClassNames.mutedBody}`}>
                    Choose the categories to use, in order, when you select
                    Auto assign for a monthly budget. Available money moves
                    from these categories to the categories being funded.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <ComboboxSelect
                    emptyOption={{
                        label: "Choose category",
                        value: "",
                    }}
                    optionVariant="category"
                    inputClassName="w-full"
                    label="Add source category"
                    noResultsLabel="No source categories found"
                    onChange={setSelectedCategoryId}
                    options={sourceOptions}
                    value={selectedCategoryId}
                />
                <button
                    type="button"
                    onClick={addSelectedSource}
                    disabled={!selectedCategoryId}
                    className={`${controlClassNames.secondaryAction} inline-flex cursor-pointer items-center justify-center gap-2 disabled:cursor-not-allowed`}
                >
                    <FontAwesomeIcon aria-hidden="true" icon={faPlus} />
                    Add source
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                            <th className="w-20 px-4 py-3 font-medium">
                                Order
                            </th>
                            <th className="px-4 py-3 font-medium">
                                Category
                            </th>
                            <th className="px-4 py-3 text-right font-medium">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sourceIds.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={3}
                                    className={`px-4 py-6 text-center text-sm ${typographyClassNames.mutedBody}`}
                                >
                                    No category sources selected.
                                </td>
                            </tr>
                        ) : (
                            sourceIds.map((sourceId, index) => {
                                const category = categoryById.get(sourceId);

                                if (!category) {
                                    return null;
                                }

                                return (
                                    <tr
                                        key={sourceId}
                                        className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                    >
                                        <td className="px-4 py-3 align-middle font-[family:var(--font-mono)] text-xs text-[var(--color-muted)]">
                                            {index + 1}
                                        </td>
                                        <td className="px-4 py-3 align-middle font-medium text-[var(--color-ink)]">
                                            {category.name}
                                        </td>
                                        <td className="px-4 py-3 align-middle">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    aria-label={`Move ${category.name} up`}
                                                    onClick={() =>
                                                        setSourceIds(
                                                            moveItem(
                                                                sourceIds,
                                                                index,
                                                                index - 1,
                                                            ),
                                                        )
                                                    }
                                                    disabled={index === 0}
                                                    className={controlClassNames.secondaryActionSmall}
                                                >
                                                    <FontAwesomeIcon
                                                        aria-hidden="true"
                                                        icon={faArrowUp}
                                                    />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Move ${category.name} down`}
                                                    onClick={() =>
                                                        setSourceIds(
                                                            moveItem(
                                                                sourceIds,
                                                                index,
                                                                index + 1,
                                                            ),
                                                        )
                                                    }
                                                    disabled={
                                                        index ===
                                                        sourceIds.length - 1
                                                    }
                                                    className={controlClassNames.secondaryActionSmall}
                                                >
                                                    <FontAwesomeIcon
                                                        aria-hidden="true"
                                                        icon={faArrowDown}
                                                    />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${category.name}`}
                                                    onClick={() =>
                                                        removeSource(sourceId)
                                                    }
                                                    className={controlClassNames.secondaryActionSmall}
                                                >
                                                    <FontAwesomeIcon
                                                        aria-hidden="true"
                                                        icon={faTrashCan}
                                                    />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    onClick={() => {
                        setSourceIds(configuredSourceIds);
                        setSelectedCategoryId("");
                    }}
                    disabled={!hasChanges}
                    className={controlClassNames.secondaryAction}
                >
                    Reset changes
                </button>
                <button
                    type="button"
                    onClick={saveSources}
                    disabled={!hasChanges}
                    className={controlClassNames.primaryAction}
                >
                    Save sources
                </button>
            </div>
        </div>
    );
}
