import { ulid } from "ulid";

import type { CategoryFormInput } from "@/features/budget/models/category-form";
import type { DeletionImpactSummary } from "@/features/shared/models/deletion-impact";
import { createDeletionImpactSummary } from "@/features/shared/server/deletion-impact-service";
import { assertDeletionPreviewRevision } from "@/features/shared/server/deletion-policy-service";
import {
    countRecordGroups,
    createAllocationRevision,
    createLedgerPostingRevision,
    createRecordGroupRevisions,
    createTransactionLineRevision,
    createTransactionRevision,
} from "@/features/shared/server/deletion-revision-service";
import { createTransactionRewriteInput } from "@/features/transactions/models/transaction-rewrite";
import {
    replaceLedgerPostings,
    type PersistedPosting,
} from "@/features/transactions/server/posting-service";
import { listTransactionChildrenByTransactionId } from "@/features/transactions/server/transaction-child-service";
import {
    listTransactionLinesForCategory,
    replaceTransactionLines,
    toTransactionLineInputs,
    type PersistedTransactionLine,
} from "@/features/transactions/server/transaction-line-service";
import { listStoredTransactionsByIds } from "@/features/transactions/server/transaction-query-service";
import { upsertTransactionWithinWorkspaceMutation } from "@/features/transactions/server/transaction-save-service";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import { syncAffectedBudgetPeriodActivity } from "@/features/budget/server/activity-sync-service";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { compareBudgetItemsBySortOrder } from "@/modules/budgeting";
import {
    normalizeBudgetCategoryAllocationCadence,
    normalizeBudgetCategoryAllocationStartMonth,
    type BudgetCategoryAllocationCadence,
} from "@/modules/budgeting/allocation-schedule";
import { normalizeBudgetCategoryType } from "@/modules/budgeting/category-type";

import { getBudgetGroupRecord } from "./group-service";

const SYSTEM_CATEGORY_KEY_STARTING_BALANCES = "startingBalances";

function isSystemManagedCategory(input: { systemCategoryKey?: string }) {
    return input.systemCategoryKey === SYSTEM_CATEGORY_KEY_STARTING_BALANCES;
}

export function isUserVisibleBudgetCategory(input: {
    systemCategoryKey?: string;
}) {
    return !isSystemManagedCategory(input);
}

export async function listBudgetCategories(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const categories = await queryAllPages(
        entities.budgetCategories.query.byCategory({ ledgerId }),
        { consistent: true },
    );

    return categories.sort(compareBudgetItemsBySortOrder);
}

export async function getBudgetCategoryRecord(
    ledgerId: string,
    categoryId: string,
) {
    const { entities } = getBudgetedSchema();
    const result = await entities.budgetCategories
        .get({ ledgerId, categoryId })
        .go();

    if (!result.data) {
        throw new HttpError(
            404,
            "category_missing",
            "The category could not be found.",
        );
    }

    return result.data;
}

async function listCategoryAllocations(ledgerId: string, categoryId: string) {
    const { entities } = getBudgetedSchema();
    const allocations = await queryAllPages(
        entities.categoryAllocations.query.byCategory({ ledgerId, categoryId }),
    );

    return allocations;
}

async function listCategorizedTransactions(ledgerId: string, categoryId: string) {
    const { entities } = getBudgetedSchema();
    const transactions = await queryAllPages(
        entities.transactions.query.byCategory({
            ledgerId,
            referenceCategoryId: categoryId,
        }),
    );

    return transactions;
}

async function getCategoryDependencyState(ledgerId: string, categoryId: string) {
    const category = await getBudgetCategoryRecord(ledgerId, categoryId);
    const [
        allocations,
        categorizedTransactions,
        categorizedLines,
    ] =
        await Promise.all([
        listCategoryAllocations(ledgerId, categoryId),
        listCategorizedTransactions(ledgerId, categoryId),
        listTransactionLinesForCategory(ledgerId, categoryId),
    ]);
    const lineTransactions = await listStoredTransactionsByIds(
        ledgerId,
        new Set(
            categorizedLines.map((line) => line.transactionId),
        ),
    );
    const transactionsById = new Map(
        [...categorizedTransactions, ...lineTransactions].map(
            (transaction) => [transaction.transactionId, transaction],
        ),
    );
    const transactions = Array.from(transactionsById.values());
    const { linesByTransactionId, postingsByTransactionId } =
        await listTransactionChildrenByTransactionId(
            ledgerId,
            transactions.map((transaction) => transaction.transactionId),
        );

    return {
        category,
        allocations,
        transactions,
        postingsByTransactionId,
        linesByTransactionId,
    };
}

function buildCategoryDeletionImpact(input: {
    allocations: Awaited<ReturnType<typeof listCategoryAllocations>>;
    category: Awaited<ReturnType<typeof getBudgetCategoryRecord>>;
    postingsByTransactionId: Map<string, PersistedPosting[]>;
    linesByTransactionId: Map<string, PersistedTransactionLine[]>;
    transactions: Awaited<ReturnType<typeof listCategorizedTransactions>>;
}): DeletionImpactSummary {
    const postingCount = countRecordGroups(
        input.postingsByTransactionId.values(),
    );
    const lineCount = countRecordGroups(input.linesByTransactionId.values());
    const dependentRevisions = [
        ...input.allocations.map(createAllocationRevision),
        ...input.transactions.map(createTransactionRevision),
        ...createRecordGroupRevisions(
            input.postingsByTransactionId.values(),
            createLedgerPostingRevision,
        ),
        ...createRecordGroupRevisions(
            input.linesByTransactionId.values(),
            createTransactionLineRevision,
        ),
    ];

    return createDeletionImpactSummary({
        target: {
            targetType: "category",
            targetId: input.category.categoryId,
            displayName: input.category.name,
            sectionId: "budget",
        },
        targetUpdatedAt: input.category.updatedAt,
        dependentCounts: [
            { label: "Category allocations", count: input.allocations.length },
            { label: "Category ledger postings", count: postingCount },
            {
                label: "Transaction lines recategorized",
                count: lineCount,
            },
        ],
        preservedRecords:
            input.transactions.length > 0
                ? [
                      {
                          label: "Transactions kept as uncategorized activity",
                          count: input.transactions.length,
                          description:
                              "The transactions remain saved and lose only the deleted category reference.",
                      },
                  ]
                : [],
        affectedPeriods: [
            ...input.allocations.map((allocation) => allocation.periodId),
            ...input.transactions.map((transaction) => transaction.periodId),
        ],
        dependentRevisions,
        crossAreaEffects: [
            "Budget totals and readiness will be recalculated for affected periods.",
            "Preserved transactions will remain saved as uncategorized activity.",
            "Reporting summaries will refresh from the remaining saved activity.",
        ],
    });
}

function toPostingInputs(
    postings: PersistedPosting[],
) {
    return postings.map((posting) => ({
        ledgerAccountId: posting.ledgerAccountId,
        ledgerAccountKind: posting.ledgerAccountKind,
        direction: posting.direction,
        amountCents: posting.amountCents,
    }));
}

export async function getBudgetCategoryDeletionImpact(
    ledgerId: string,
    categoryId: string,
) {
    const dependencyState = await getCategoryDependencyState(
        ledgerId,
        categoryId,
    );

    return buildCategoryDeletionImpact(dependencyState);
}

export async function upsertBudgetCategory(
    ledgerId: string,
    input: CategoryFormInput,
) {
    const { entities } = getBudgetedSchema();
    const existing = input.categoryId
        ? await entities.budgetCategories
              .get({ ledgerId, categoryId: input.categoryId })
              .go()
        : { data: null };
    const categories = await listBudgetCategories(ledgerId);
    const now = new Date().toISOString();
    const categoryId = existing.data?.categoryId ?? input.categoryId ?? ulid();
    await getBudgetGroupRecord(ledgerId, input.groupId);

    const record = {
        categoryId,
        ledgerId,
        name: input.name.trim(),
        groupId: input.groupId,
        allocationCadence: normalizeBudgetCategoryAllocationCadence(
            existing.data?.allocationCadence,
        ),
        allocationStartMonth: normalizeBudgetCategoryAllocationStartMonth(
            existing.data?.allocationStartMonth,
        ),
        categoryType: normalizeBudgetCategoryType(
            existing.data?.categoryType ?? input.categoryType,
        ),
        autoAssignSourceEnabled: existing.data?.autoAssignSourceEnabled,
        autoAssignSourceSortOrder: existing.data?.autoAssignSourceSortOrder,
        defaultAssignedCents: existing.data?.defaultAssignedCents ?? 0,
        isIncomeCategory: existing.data?.isIncomeCategory ?? false,
        systemCategoryKey: existing.data?.systemCategoryKey,
        ledgerAccountId: existing.data?.ledgerAccountId ?? `cat_${categoryId}`,
        status: input.status,
        sortOrder:
            input.sortOrder ?? existing.data?.sortOrder ?? categories.length,
        createdAt: existing.data?.createdAt ?? now,
        updatedAt: now,
    };

    await entities.budgetCategories.upsert(record).go();

    return record;
}

export async function upsertBudgetCategoryWithWorkspaceChanges(
    ledgerId: string,
    input: CategoryFormInput,
) {
    const { entities } = getBudgetedSchema();
    const existing = input.categoryId
        ? (
              await entities.budgetCategories
                  .get({ ledgerId, categoryId: input.categoryId })
                  .go()
          ).data
        : null;
    const category = await upsertBudgetCategory(ledgerId, input);

    return {
        category,
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: category.categoryId,
                entityType: "budgetCategory",
                previousRecord: existing,
                record: category,
            }),
        ],
    };
}

export async function updateBudgetCategoryPlanMetadata(
    ledgerId: string,
    input: {
        allocationCadence?: BudgetCategoryAllocationCadence;
        allocationStartMonth?: number;
        categoryId: string;
        categoryType: "spending" | "savings";
        defaultAssignedCents: number;
        groupId: string;
        isIncomeCategory: boolean;
        name: string;
        sortOrder: number;
    },
) {
    const { entities } = getBudgetedSchema();
    const existing = await getBudgetCategoryRecord(ledgerId, input.categoryId);
    await getBudgetGroupRecord(ledgerId, input.groupId);

    if (isSystemManagedCategory(existing)) {
        if (
            input.defaultAssignedCents !== existing.defaultAssignedCents ||
            normalizeBudgetCategoryAllocationCadence(
                input.allocationCadence,
            ) !==
                normalizeBudgetCategoryAllocationCadence(
                    existing.allocationCadence,
                ) ||
            normalizeBudgetCategoryAllocationStartMonth(
                input.allocationStartMonth,
            ) !==
                normalizeBudgetCategoryAllocationStartMonth(
                    existing.allocationStartMonth,
                ) ||
            input.groupId !== existing.groupId ||
            input.name.trim() !== existing.name ||
            input.categoryType !==
                normalizeBudgetCategoryType(existing.categoryType) ||
            input.isIncomeCategory !== true
        ) {
            throw new HttpError(
                422,
                "system_category_locked",
                "System-managed categories cannot be edited from the budget plan.",
            );
        }
    }

    const record = {
        ...existing,
        allocationCadence: normalizeBudgetCategoryAllocationCadence(
            input.allocationCadence,
        ),
        allocationStartMonth: normalizeBudgetCategoryAllocationStartMonth(
            input.allocationStartMonth,
        ),
        categoryType: isSystemManagedCategory(existing)
            ? normalizeBudgetCategoryType(existing.categoryType)
            : input.categoryType,
        defaultAssignedCents: input.defaultAssignedCents,
        groupId: input.groupId,
        isIncomeCategory: isSystemManagedCategory(existing)
            ? true
            : input.isIncomeCategory,
        name: input.name.trim(),
        sortOrder: input.sortOrder,
        updatedAt: new Date().toISOString(),
    };

    await entities.budgetCategories.upsert(record).go();

    return record;
}

export async function deleteBudgetCategory(
    ledgerId: string,
    categoryId: string,
    previewRevision: string,
) {
    const { entities } = getBudgetedSchema();
    const dependencyState = await getCategoryDependencyState(
        ledgerId,
        categoryId,
    );

    if (isSystemManagedCategory(dependencyState.category)) {
        throw new HttpError(
            422,
            "system_category_locked",
            "System-managed categories cannot be deleted.",
        );
    }

    const impact = buildCategoryDeletionImpact(dependencyState);

    assertDeletionPreviewRevision(previewRevision, impact.previewRevision);

    try {
        for (const transaction of dependencyState.transactions) {
            const lines =
                dependencyState.linesByTransactionId.get(
                    transaction.transactionId,
                ) ?? [];

            await upsertTransactionWithinWorkspaceMutation(
                ledgerId,
                {
                    ...createTransactionRewriteInput({
                        lines: toTransactionLineInputs(
                            lines.map((line) =>
                                line.categoryId === categoryId
                                    ? {
                                          ...line,
                                          categoryId: undefined,
                                      }
                                    : line,
                            ),
                        ),
                        transaction,
                    }),
                    audit: {
                        action: "rewrite",
                        source: "categoryDeleteRewrite",
                    },
                },
            );
        }

        await Promise.all(
            dependencyState.allocations.map((allocation) =>
                entities.categoryAllocations
                    .delete({
                        ledgerId,
                        periodId: allocation.periodId,
                        categoryId: allocation.categoryId,
                    })
                    .go(),
            ),
        );
        await entities.budgetCategories.delete({ ledgerId, categoryId }).go();
        await syncAffectedBudgetPeriodActivity(ledgerId, impact.affectedPeriods);

        return impact;
    } catch (error) {
        await Promise.allSettled([
            entities.budgetCategories.upsert(dependencyState.category).go(),
            ...dependencyState.allocations.map((allocation) =>
                entities.categoryAllocations.upsert(allocation).go(),
            ),
            ...dependencyState.transactions.map((transaction) =>
                entities.transactions.put(transaction).go(),
            ),
            ...dependencyState.transactions.map((transaction) =>
                replaceLedgerPostings({
                    ledgerId,
                    transactionId: transaction.transactionId,
                    postings: toPostingInputs(
                        dependencyState.postingsByTransactionId.get(
                            transaction.transactionId,
                        ) ?? [],
                    ),
                    occurredAt: transaction.occurredAt,
                    periodId: transaction.periodId,
                }),
            ),
            ...dependencyState.transactions.map((transaction) =>
                replaceTransactionLines({
                    ledgerId,
                    transactionId: transaction.transactionId,
                    lines: toTransactionLineInputs(
                        dependencyState.linesByTransactionId.get(
                            transaction.transactionId,
                        ) ?? [],
                    ),
                }),
            ),
            syncAffectedBudgetPeriodActivity(ledgerId, impact.affectedPeriods),
        ]);
        throw error;
    }
}
