import { isUnassignedCategoryId } from "@/modules/budgeting/unassigned";
import {
    createAllocationFundingSourceId,
    type AllocationFundingSourceInput,
} from "@/features/budget/models/allocation-funding";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";

import { buildBudgetPeriodSummary } from "./budget-period-service";
import {
    isUserVisibleBudgetCategory,
    listBudgetCategories,
} from "./category-service";

export type AllocationUpdate = {
    assignedCents: number;
    categoryId: string;
    fundingSources?: AllocationFundingSourceInput[];
};

type PersistedFundingSourceRecord = {
    allocationId: string;
    amountCents: number;
    categoryId: string;
    createdAt: string;
    fundingSourceId: string;
    periodId: string;
    sourceId: string;
    sourceType: "account" | "incomeCategory" | "budgetCategory";
    updatedAt: string;
    ledgerId: string;
};

type PersistedCategoryAllocationRecord = {
    allocationId: string;
    assignedCents: number;
    categoryId: string;
    periodId: string;
    updatedAt: string;
    ledgerId: string;
};

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

function createPeriodAllocationWorkspaceChanges(input: {
    afterAllocations?: PersistedCategoryAllocationRecord[];
    afterFundingSources?: PersistedFundingSourceRecord[];
    beforeAllocations: PersistedCategoryAllocationRecord[];
    beforeFundingSources: PersistedFundingSourceRecord[];
}) {
    const afterAllocationIds = new Set(
        (input.afterAllocations ?? []).map((allocation) => allocation.allocationId),
    );
    const afterFundingSourceIds = new Set(
        (input.afterFundingSources ?? []).map(
            (source) => source.fundingSourceId,
        ),
    );
    const beforeAllocationsById = new Map(
        input.beforeAllocations.map((record) => [record.allocationId, record]),
    );
    const beforeFundingSourcesById = new Map(
        input.beforeFundingSources.map((record) => [record.fundingSourceId, record]),
    );

    return [
        ...input.beforeAllocations
            .filter(
                (allocation) => !afterAllocationIds.has(allocation.allocationId),
            )
            .map((allocation) =>
                createWorkspaceDeleteChange(
                    "categoryAllocation",
                    allocation.allocationId,
                    allocation,
                ),
            ),
        ...(input.afterAllocations ?? []).map((allocation) =>
            createWorkspaceUpsertChange(
                "categoryAllocation",
                allocation.allocationId,
                allocation,
                beforeAllocationsById.get(allocation.allocationId),
            ),
        ),
        ...input.beforeFundingSources
            .filter(
                (source) => !afterFundingSourceIds.has(source.fundingSourceId),
            )
            .map((source) =>
                createWorkspaceDeleteChange(
                    "allocationFundingSource",
                    source.fundingSourceId,
                    source,
                ),
            ),
        ...(input.afterFundingSources ?? []).map((source) =>
            createWorkspaceUpsertChange(
                "allocationFundingSource",
                source.fundingSourceId,
                source,
                beforeFundingSourcesById.get(source.fundingSourceId),
            ),
        ),
    ];
}

function toAllocationRecord(input: {
    assignedCents: number;
    categoryId: string;
    periodId: string;
    updatedAt: string;
    ledgerId: string;
}) {
    return {
        allocationId: `${input.periodId}:${input.categoryId}`,
        ledgerId: input.ledgerId,
        periodId: input.periodId,
        categoryId: input.categoryId,
        assignedCents: input.assignedCents,
        updatedAt: input.updatedAt,
    };
}

async function restorePeriodAllocationRecords(input: {
    afterRecords: PersistedCategoryAllocationRecord[];
    beforeRecords: PersistedCategoryAllocationRecord[];
    ledgerId: string;
    periodId: string;
    restoredAt: string;
}) {
    const { entities } = getBudgetedSchema();
    const beforeIds = new Set(
        input.beforeRecords.map((record) => record.allocationId),
    );

    await Promise.allSettled([
        ...input.afterRecords
            .filter((record) => !beforeIds.has(record.allocationId))
            .map((record) =>
                entities.categoryAllocations
                    .delete({
                        ledgerId: input.ledgerId,
                        periodId: input.periodId,
                        categoryId: record.categoryId,
                    })
                    .go(),
            ),
        ...input.beforeRecords.map((record) =>
            entities.categoryAllocations
                .upsert({ ...record, updatedAt: input.restoredAt })
                .go(),
        ),
    ]);
}

async function listPeriodFundingSourceRecords(
    ledgerId: string,
    periodId: string,
): Promise<PersistedFundingSourceRecord[]> {
    const { entities } = getBudgetedSchema() as ReturnType<
        typeof getBudgetedSchema
    > & {
        entities: ReturnType<typeof getBudgetedSchema>["entities"] & {
            allocationFundingSources?: {
                query: {
                    byPeriod: (input: { periodId: string; ledgerId: string }) => {
                        go: (options?: Record<string, unknown>) => Promise<{
                            data: PersistedFundingSourceRecord[];
                        }>;
                    };
                };
                delete: (input: {
                    fundingSourceId: string;
                    ledgerId: string;
                }) => { go: () => Promise<unknown> };
                upsert: (input: PersistedFundingSourceRecord) => {
                    go: () => Promise<unknown>;
                };
            };
        };
    };

    if (!entities.allocationFundingSources) {
        return [];
    }

    const fundingSources = await queryAllPages(
        entities.allocationFundingSources.query.byPeriod({
            ledgerId,
            periodId,
        }),
    );

    return fundingSources;
}

async function listPeriodAllocationRecords(
    ledgerId: string,
    periodId: string,
): Promise<PersistedCategoryAllocationRecord[]> {
    const { entities } = getBudgetedSchema();
    const allocations = await queryAllPages(
        entities.categoryAllocations.query.byPeriod({ ledgerId, periodId }),
    );

    return allocations;
}

function isAssignableCategory(
    category: Awaited<ReturnType<typeof buildBudgetPeriodSummary>>["categories"][number],
) {
    return !isUnassignedCategoryId(category.categoryId);
}

function listUpdateFundingSources(updates: AllocationUpdate[]) {
    return updates.flatMap((update) =>
        (update.fundingSources ?? []).map((source) => ({
            ...source,
            destinationCategoryId: update.categoryId,
        })),
    );
}

function assertNoDuplicateFundingSourceRecords(input: {
    periodId: string;
    updates: AllocationUpdate[];
}) {
    const seenIds = new Set<string>();

    for (const source of listUpdateFundingSources(input.updates)) {
        const fundingSourceId = createAllocationFundingSourceId({
            categoryId: source.destinationCategoryId,
            periodId: input.periodId,
            sourceId: source.sourceId,
            sourceType: source.sourceType,
        });

        if (seenIds.has(fundingSourceId)) {
            throw new HttpError(
                422,
                "duplicate_funding_source",
                "Each auto-assign source can only appear once per destination category.",
            );
        }

        seenIds.add(fundingSourceId);
    }
}

async function validateFundingSources(input: {
    assignableCategories: Awaited<
        ReturnType<typeof buildBudgetPeriodSummary>
    >["categories"];
    ledgerId: string;
    nextCategories: Awaited<
        ReturnType<typeof buildBudgetPeriodSummary>
    >["categories"];
    updates: AllocationUpdate[];
}) {
    const fundingSources = listUpdateFundingSources(input.updates);

    if (fundingSources.length === 0) {
        return;
    }

    const budgetCategories = await listBudgetCategories(input.ledgerId);
    const eligibleSourceCategoryIds = new Set(
        budgetCategories
            .filter(
                (category) =>
                    category.status === "active" &&
                    isUserVisibleBudgetCategory(category) &&
                    category.autoAssignSourceEnabled === true,
            )
            .map((category) => category.categoryId),
    );
    const currentCategoryById = new Map(
        input.assignableCategories.map((category) => [
            category.categoryId,
            category,
        ]),
    );
    const nextCategoryById = new Map(
        input.nextCategories.map((category) => [category.categoryId, category]),
    );
    const sourceDrawsByCategoryId = new Map<string, number>();

    for (const source of fundingSources) {
        if (!eligibleSourceCategoryIds.has(source.sourceId)) {
            throw new HttpError(
                422,
                "funding_source_ineligible",
                "One or more monthly budget funding sources are not enabled source categories.",
            );
        }

        if (!currentCategoryById.has(source.destinationCategoryId)) {
            throw new HttpError(
                404,
                "category_missing",
                "One or more categories were not found.",
            );
        }

        sourceDrawsByCategoryId.set(
            source.sourceId,
            (sourceDrawsByCategoryId.get(source.sourceId) ?? 0) +
                source.amountCents,
        );
    }

    for (const [sourceId, drawCents] of sourceDrawsByCategoryId.entries()) {
        const sourceCategory = currentCategoryById.get(sourceId);
        const availableCents = Math.max(0, sourceCategory?.availableCents ?? 0);

        if (drawCents > availableCents) {
            throw new HttpError(
                422,
                "funding_source_unavailable",
                "Monthly budget funding sources do not have enough available funds in this month.",
            );
        }
    }

    const totalFundingSourceCents = fundingSources.reduce(
        (total, source) => total + source.amountCents,
        0,
    );
    const netAssignmentChangeCents = input.assignableCategories.reduce(
        (total, currentCategory) => {
            const nextCategory = nextCategoryById.get(
                currentCategory.categoryId,
            );

            return (
                total +
                (nextCategory?.assignedCents ?? currentCategory.assignedCents) -
                    currentCategory.assignedCents
            );
        },
        0,
    );

    if (netAssignmentChangeCents !== 0) {
        throw new HttpError(
            422,
            "funding_source_mismatch",
            "Auto assign source records must balance category assignment movement.",
        );
    }

    const positiveAssignmentIncreaseCents = input.assignableCategories.reduce(
        (total, currentCategory) => {
            if (eligibleSourceCategoryIds.has(currentCategory.categoryId)) {
                return total;
            }

            const nextCategory = nextCategoryById.get(
                currentCategory.categoryId,
            );

            return (
                total +
                Math.max(
                    0,
                    (nextCategory?.assignedCents ?? currentCategory.assignedCents) -
                        currentCategory.assignedCents,
                )
            );
        },
        0,
    );
    const expectedFundingSourceCents = positiveAssignmentIncreaseCents;

    if (totalFundingSourceCents !== expectedFundingSourceCents) {
        throw new HttpError(
            422,
            "funding_source_mismatch",
            "Auto assign source records must match the category assignment movement.",
        );
    }
}

function createNextFundingSourceRecords(input: {
    currentFundingSourceRecords: PersistedFundingSourceRecord[];
    ledgerId: string;
    now: string;
    periodId: string;
    updates: AllocationUpdate[];
}) {
    const currentFundingSourceById = new Map(
        input.currentFundingSourceRecords.map((record) => [
            record.fundingSourceId,
            record,
        ]),
    );

    return listUpdateFundingSources(input.updates).map((source) => {
        const allocationId = `${input.periodId}:${source.destinationCategoryId}`;
        const fundingSourceId = createAllocationFundingSourceId({
            categoryId: source.destinationCategoryId,
            periodId: input.periodId,
            sourceId: source.sourceId,
            sourceType: source.sourceType,
        });
        const currentFundingSource =
            currentFundingSourceById.get(fundingSourceId);

        return {
            allocationId,
            amountCents: source.amountCents,
            categoryId: source.destinationCategoryId,
            createdAt: currentFundingSource?.createdAt ?? input.now,
            fundingSourceId,
            ledgerId: input.ledgerId,
            periodId: input.periodId,
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            updatedAt: input.now,
        } satisfies PersistedFundingSourceRecord;
    });
}

export async function resetBudgetAllocations(ledgerId: string, periodId: string) {
    const { entities } = getBudgetedSchema();
    const [currentAllocations, currentFundingSourceRecords] = await Promise.all([
        listPeriodAllocationRecords(ledgerId, periodId),
        listPeriodFundingSourceRecords(ledgerId, periodId),
    ]);
    const fundingSourceEntity = (
        entities as typeof entities & {
            allocationFundingSources?: {
                delete: (input: {
                    fundingSourceId: string;
                    ledgerId: string;
                }) => { go: () => Promise<unknown> };
                upsert: (input: PersistedFundingSourceRecord) => {
                    go: () => Promise<unknown>;
                };
            };
        }
    ).allocationFundingSources;

    try {
        await Promise.all([
            ...currentAllocations.map((allocation) =>
                entities.categoryAllocations
                    .delete({
                        ledgerId,
                        periodId: allocation.periodId,
                        categoryId: allocation.categoryId,
                    })
                    .go(),
            ),
            ...(fundingSourceEntity
                ? currentFundingSourceRecords.map((record) =>
                      fundingSourceEntity
                          .delete({
                              ledgerId,
                              fundingSourceId: record.fundingSourceId,
                          })
                          .go(),
                  )
                : []),
        ]);

        return await buildBudgetPeriodSummary(ledgerId, periodId);
    } catch (error) {
        const rollbackAt = new Date().toISOString();

        await Promise.allSettled([
            ...currentAllocations.map((allocation) =>
                entities.categoryAllocations
                    .upsert({ ...allocation, updatedAt: rollbackAt })
                    .go(),
            ),
            ...(fundingSourceEntity
                ? currentFundingSourceRecords.map((record) =>
                      fundingSourceEntity
                          .upsert({ ...record, updatedAt: rollbackAt })
                          .go(),
                  )
                : []),
        ]);

        throw error;
    }
}

export async function resetBudgetAllocationsWithWorkspaceChanges(
    ledgerId: string,
    periodId: string,
) {
    const [beforeAllocations, beforeFundingSources] = await Promise.all([
        listPeriodAllocationRecords(ledgerId, periodId),
        listPeriodFundingSourceRecords(ledgerId, periodId),
    ]);
    const summary = await resetBudgetAllocations(ledgerId, periodId);

    return {
        summary,
        workspaceChanges: createPeriodAllocationWorkspaceChanges({
            beforeAllocations,
            beforeFundingSources,
        }),
    };
}

export async function replaceBudgetAllocations(
    ledgerId: string,
    periodId: string,
    updates: AllocationUpdate[],
) {
    const { entities } = getBudgetedSchema();
    const [summary, currentAllocationRecords, currentFundingSourceRecords] =
        await Promise.all([
            buildBudgetPeriodSummary(ledgerId, periodId),
            listPeriodAllocationRecords(ledgerId, periodId),
            listPeriodFundingSourceRecords(ledgerId, periodId),
        ]);
    const assignableCategories = summary.categories.filter(isAssignableCategory);
    const updatesMap = new Map(
        updates.map((update) => [update.categoryId, update]),
    );

    assertNoDuplicateFundingSourceRecords({ periodId, updates });

    for (const update of updates) {
        if (
            !assignableCategories.some(
                (category) => category.categoryId === update.categoryId,
            )
        ) {
            throw new HttpError(
                404,
                "category_missing",
                "One or more categories were not found.",
            );
        }
    }

    const nextCategories = assignableCategories.map((category) => {
        const assignedCents =
            updatesMap.get(category.categoryId)?.assignedCents ??
            category.assignedCents;

        return {
            ...category,
            assignedCents,
        };
    });

    await validateFundingSources({
        assignableCategories,
        ledgerId,
        nextCategories,
        updates,
    });

    const now = new Date().toISOString();
    const nextFundingSourceRecords = createNextFundingSourceRecords({
        currentFundingSourceRecords,
        ledgerId,
        now,
        periodId,
        updates,
    });
    const fundingSourceEntity = (
        entities as typeof entities & {
            allocationFundingSources?: {
                delete: (input: {
                    fundingSourceId: string;
                    ledgerId: string;
                }) => { go: () => Promise<unknown> };
                upsert: (input: PersistedFundingSourceRecord) => {
                    go: () => Promise<unknown>;
                };
            };
        }
    ).allocationFundingSources;

    try {
        await Promise.all(
            nextCategories.map((category) =>
                entities.categoryAllocations
                    .upsert(
                        toAllocationRecord({
                            ledgerId,
                            periodId,
                            categoryId: category.categoryId,
                            assignedCents: category.assignedCents,
                            updatedAt: now,
                        }),
                    )
                    .go(),
            ),
        );

        if (fundingSourceEntity) {
            await Promise.all(
                currentFundingSourceRecords.map((record) =>
                    fundingSourceEntity
                        .delete({
                            ledgerId,
                            fundingSourceId: record.fundingSourceId,
                        })
                        .go(),
                ),
            );
            await Promise.all(
                nextFundingSourceRecords.map((record) =>
                    fundingSourceEntity.upsert(record).go(),
                ),
            );
        }

        return await buildBudgetPeriodSummary(ledgerId, periodId);
    } catch (error) {
        const rollbackAt = new Date().toISOString();
        const afterAllocationRecords = await listPeriodAllocationRecords(
            ledgerId,
            periodId,
        );

        await restorePeriodAllocationRecords({
            afterRecords: afterAllocationRecords,
            beforeRecords: currentAllocationRecords,
            ledgerId,
            periodId,
            restoredAt: rollbackAt,
        });

        if (fundingSourceEntity) {
            const currentRecords = await listPeriodFundingSourceRecords(
                ledgerId,
                periodId,
            );

            await Promise.allSettled(
                currentRecords.map((record) =>
                    fundingSourceEntity
                        .delete({
                            ledgerId,
                            fundingSourceId: record.fundingSourceId,
                        })
                        .go(),
                ),
            );
            await Promise.allSettled(
                currentFundingSourceRecords.map((record) =>
                    fundingSourceEntity
                        .upsert({ ...record, updatedAt: rollbackAt })
                        .go(),
                ),
            );
        }

        throw error;
    }
}

export async function replaceBudgetAllocationsWithWorkspaceChanges(
    ledgerId: string,
    periodId: string,
    updates: AllocationUpdate[],
) {
    const [beforeAllocations, beforeFundingSources] = await Promise.all([
        listPeriodAllocationRecords(ledgerId, periodId),
        listPeriodFundingSourceRecords(ledgerId, periodId),
    ]);
    const summary = await replaceBudgetAllocations(ledgerId, periodId, updates);
    const [afterAllocations, afterFundingSources] = await Promise.all([
        listPeriodAllocationRecords(ledgerId, periodId),
        listPeriodFundingSourceRecords(ledgerId, periodId),
    ]);

    return {
        summary,
        workspaceChanges: createPeriodAllocationWorkspaceChanges({
            afterAllocations,
            afterFundingSources,
            beforeAllocations,
            beforeFundingSources,
        }),
    };
}
