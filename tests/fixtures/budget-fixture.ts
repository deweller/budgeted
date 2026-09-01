import { ulid } from "ulid";

import { calculateAvailableCents } from "@/modules/budgeting";
import { getMonthlyPeriodBounds } from "@/modules/ledger";

type BudgetFixtureCategoryInput = {
    activityCents?: number;
    assignedCents?: number;
    carriedForwardCents?: number;
    categoryId?: string;
    defaultAssignedCents?: number;
    groupId?: string;
    groupLabel?: string;
    isIncomeCategory?: boolean;
    name: string;
    persistAllocation?: boolean;
    status?: "active" | "archived";
};

export function buildBudgetFixture(input: {
    additionalPeriods?: Array<{
        categories?: BudgetFixtureCategoryInput[];
        periodId: string;
        seedAllocations?: boolean;
    }>;
    categories?: BudgetFixtureCategoryInput[];
    periodId: string;
    seedAllocations?: boolean;
    ledgerId: string;
}) {
    const now = new Date().toISOString();
    const periods = [
        {
            periodId: input.periodId,
            categories: input.categories ?? [
                {
                    name: "Groceries",
                    groupId: "group-living",
                    groupLabel: "Living",
                },
            ],
            seedAllocations: input.seedAllocations ?? true,
        },
        ...(input.additionalPeriods ?? []),
    ];

    const budgetPeriods = periods.map(({ periodId }) => {
        const bounds = getMonthlyPeriodBounds(periodId);

        return {
            ledgerId: input.ledgerId,
            periodId,
            startsOn: bounds.startsOn,
            endsOn: bounds.endsOn,
            currency: "USD" as const,
            availableToBudgetCents: 0,
            status: "open" as const,
            createdAt: now,
            updatedAt: now,
        };
    });

    const groupRecordsById = new Map<
        string,
        {
            createdAt: string;
            groupId: string;
            name: string;
            sortOrder: number;
            status: "active" | "archived";
            updatedAt: string;
            ledgerId: string;
        }
    >();
    const categories = periods.flatMap(
        (
            { categories: periodCategories, periodId, seedAllocations },
            periodIndex,
        ) =>
            (periodCategories ?? []).map((category, categoryIndex) => {
                const categoryId = category.categoryId ?? ulid();
                const groupId = category.groupId ?? "group-general";
                const assignedCents = category.assignedCents ?? 0;
                const carriedForwardCents = category.carriedForwardCents ?? 0;
                const activityCents = category.activityCents ?? 0;
                if (!groupRecordsById.has(groupId)) {
                    groupRecordsById.set(groupId, {
                        groupId,
                        ledgerId: input.ledgerId,
                        name: category.groupLabel ?? "General",
                        status: "active",
                        sortOrder: groupRecordsById.size,
                        createdAt: now,
                        updatedAt: now,
                    });
                }

                return {
                    category: {
                        categoryId,
                        ledgerId: input.ledgerId,
                        name: category.name,
                        groupId,
                        defaultAssignedCents:
                            category.defaultAssignedCents ?? 0,
                        isIncomeCategory: category.isIncomeCategory ?? false,
                        ledgerAccountId: `cat_${categoryId}`,
                        status: category.status ?? "active",
                        sortOrder: periodIndex * 100 + categoryIndex,
                        createdAt: now,
                        updatedAt: now,
                    },
                    allocation:
                        (category.persistAllocation ?? seedAllocations)
                            ? {
                                  allocationId: `${periodId}:${categoryId}`,
                                  ledgerId: input.ledgerId,
                                  periodId,
                                  categoryId,
                                  assignedCents,
                                  carriedForwardCents,
                                  activityCents,
                                  availableCents: calculateAvailableCents({
                                      assignedCents,
                                      carriedForwardCents,
                                      activityCents,
                                  }),
                                  updatedAt: now,
                              }
                            : null,
                };
            }),
    );

    return {
        budgetPeriod: budgetPeriods[0],
        budgetPeriods,
        budgetGroups: Array.from(groupRecordsById.values()),
        categories,
    };
}
