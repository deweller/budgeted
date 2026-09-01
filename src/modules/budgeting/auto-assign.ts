import {
    getEffectiveBudgetCategoryDefaultAssignedCents,
    type BudgetCategoryAllocationCadence,
} from "@/modules/budgeting/allocation-schedule";
import { isUncategorizedCategoryId } from "@/modules/budgeting/uncategorized";
import { isUnassignedCategoryId } from "@/modules/budgeting/unassigned";

export type AutoAssignFundingSource = {
    amountCents: number;
    sourceId: string;
    sourceType: "budgetCategory";
};

export type AutoAssignAllocation = {
    assignedCents: number;
    categoryId: string;
    fundingSources?: AutoAssignFundingSource[];
};

export type AutoAssignCategoryInput = {
    allocationCadence?: BudgetCategoryAllocationCadence;
    allocationStartMonth?: number;
    assignedCents: number;
    availableCents: number;
    categoryId: string;
    defaultAssignedCents?: number;
    systemCategoryKey?: string;
};

type SourceDraw = {
    amountCents: number;
    sourceId: string;
};

type SourceReturn = {
    amountCents: number;
    sourceId: string;
};

function uniqueOrderedValues(values: string[]) {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }

        seen.add(value);
        result.push(value);
    }

    return result;
}

function drawFromConfiguredSources(input: {
    categoriesById: Map<string, AutoAssignCategoryInput>;
    sourceCategoryIds: string[];
    targetAssignedByCategoryId: Map<string, number>;
    requiredCents: number;
}) {
    let remainingCents = input.requiredCents;
    const sourceDraws: SourceDraw[] = [];

    for (const sourceId of uniqueOrderedValues(input.sourceCategoryIds)) {
        if (remainingCents <= 0) {
            break;
        }

        const sourceCategory = input.categoriesById.get(sourceId);

        if (!sourceCategory) {
            continue;
        }

        const availableCents = Math.max(0, sourceCategory.availableCents);
        const drawCents = Math.min(remainingCents, availableCents);

        if (drawCents <= 0) {
            continue;
        }

        input.targetAssignedByCategoryId.set(
            sourceId,
            (input.targetAssignedByCategoryId.get(sourceId) ?? 0) - drawCents,
        );
        sourceDraws.push({
            amountCents: drawCents,
            sourceId,
        });
        remainingCents -= drawCents;
    }

    return {
        shortfallCents: remainingCents,
        sourceDraws,
    };
}

function allocateSourceDrawsToDestinations(input: {
    categories: AutoAssignCategoryInput[];
    sourceDraws: SourceDraw[];
    targetAssignedByCategoryId: Map<string, number>;
}) {
    let sourceDrawIndex = 0;
    let sourceDrawRemainingCents = input.sourceDraws[0]?.amountCents ?? 0;
    const fundingSourcesByDestinationId = new Map<
        string,
        AutoAssignFundingSource[]
    >();

    for (const category of input.categories) {
        let increaseCents = Math.max(
            0,
            (input.targetAssignedByCategoryId.get(category.categoryId) ?? 0) -
                category.assignedCents,
        );

        while (increaseCents > 0 && sourceDrawIndex < input.sourceDraws.length) {
            const draw = input.sourceDraws[sourceDrawIndex];
            const sourceCoveredCents = Math.min(
                increaseCents,
                sourceDrawRemainingCents,
            );

            if (sourceCoveredCents > 0) {
                const fundingSources =
                    fundingSourcesByDestinationId.get(category.categoryId) ??
                    [];
                fundingSources.push({
                    amountCents: sourceCoveredCents,
                    sourceId: draw.sourceId,
                    sourceType: "budgetCategory",
                });
                fundingSourcesByDestinationId.set(
                    category.categoryId,
                    fundingSources,
                );
                increaseCents -= sourceCoveredCents;
                sourceDrawRemainingCents -= sourceCoveredCents;
            }

            if (sourceDrawRemainingCents <= 0) {
                sourceDrawIndex += 1;
                sourceDrawRemainingCents =
                    input.sourceDraws[sourceDrawIndex]?.amountCents ?? 0;
            }
        }
    }

    return fundingSourcesByDestinationId;
}

function returnToConfiguredSources(input: {
    returnCents: number;
    sourceCategoryIds: string[];
    targetAssignedByCategoryId: Map<string, number>;
}) {
    let remainingCents = input.returnCents;
    const sourceReturns: SourceReturn[] = [];

    for (const sourceId of uniqueOrderedValues(input.sourceCategoryIds)) {
        if (remainingCents <= 0) {
            break;
        }

        if (!input.targetAssignedByCategoryId.has(sourceId)) {
            continue;
        }

        input.targetAssignedByCategoryId.set(
            sourceId,
            (input.targetAssignedByCategoryId.get(sourceId) ?? 0) +
                remainingCents,
        );
        sourceReturns.push({
            amountCents: remainingCents,
            sourceId,
        });
        remainingCents = 0;
    }

    return {
        shortfallCents: remainingCents,
        sourceReturns,
    };
}

export function planAutoAssignDefaults(input: {
    availableToBudgetCents: number;
    categories: AutoAssignCategoryInput[];
    periodId: string;
    sourceCategoryIds: string[];
}) {
    const assignableCategories = input.categories.filter(
        (category) =>
            !isUnassignedCategoryId(category.categoryId) &&
            !isUncategorizedCategoryId(category.categoryId),
    );
    const sourceCategoryIds = new Set(input.sourceCategoryIds);
    const categoriesById = new Map(
        assignableCategories.map((category) => [category.categoryId, category]),
    );
    const targetAssignedByCategoryId = new Map(
        assignableCategories.map((category) => [
            category.categoryId,
            sourceCategoryIds.has(category.categoryId)
                ? category.assignedCents
                : getEffectiveBudgetCategoryDefaultAssignedCents(
                      {
                          allocationCadence: category.allocationCadence,
                          allocationStartMonth: category.allocationStartMonth,
                          defaultAssignedCents:
                              category.defaultAssignedCents ?? 0,
                      },
                      input.periodId,
                  ),
        ]),
    );
    const netNonSourceDefaultChangeCents = assignableCategories.reduce(
        (total, category) => {
            if (sourceCategoryIds.has(category.categoryId)) {
                return total;
            }

            return (
                total +
                (targetAssignedByCategoryId.get(category.categoryId) ?? 0) -
                    category.assignedCents
            );
        },
        0,
    );
    const requiredSourceCents = Math.max(0, netNonSourceDefaultChangeCents);
    const returnToSourceCents = Math.max(0, -netNonSourceDefaultChangeCents);
    const { shortfallCents, sourceDraws } = drawFromConfiguredSources({
        categoriesById,
        sourceCategoryIds: input.sourceCategoryIds,
        targetAssignedByCategoryId,
        requiredCents: requiredSourceCents,
    });
    const sourceReturnPlan = returnToConfiguredSources({
        returnCents: returnToSourceCents,
        sourceCategoryIds: input.sourceCategoryIds,
        targetAssignedByCategoryId,
    });
    const fundingSourcesByDestinationId = allocateSourceDrawsToDestinations({
        categories: assignableCategories,
        sourceDraws,
        targetAssignedByCategoryId,
    });

    return {
        allocations: assignableCategories.map((category) => {
            const fundingSources = fundingSourcesByDestinationId.get(
                category.categoryId,
            );

            return {
                categoryId: category.categoryId,
                assignedCents:
                    targetAssignedByCategoryId.get(category.categoryId) ?? 0,
                ...(fundingSources && fundingSources.length > 0
                    ? { fundingSources }
                    : {}),
            };
        }),
        requiredSourceCents,
        returnToSourceCents,
        shortfallCents: shortfallCents + sourceReturnPlan.shortfallCents,
        sourceDraws,
        sourceReturns: sourceReturnPlan.sourceReturns,
        unassignedDeficitCents: Math.max(0, -input.availableToBudgetCents),
    };
}
