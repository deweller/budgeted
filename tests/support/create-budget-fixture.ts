import { getBudgetedSchema } from "@/lib/db/schema";

import { buildBudgetFixture } from "../fixtures/budget-fixture";

export async function createBudgetFixture(input: {
    additionalPeriods?: Parameters<
        typeof buildBudgetFixture
    >[0]["additionalPeriods"];
    categories?: Parameters<typeof buildBudgetFixture>[0]["categories"];
    periodId: string;
    seedAllocations?: boolean;
    ledgerId: string;
}) {
    const fixture = buildBudgetFixture(input);
    const { entities } = getBudgetedSchema();

    await Promise.all(
        fixture.budgetPeriods.map((budgetPeriod) =>
            entities.budgetPeriods.put(budgetPeriod).go(),
        ),
    );
    await Promise.all(
        fixture.budgetGroups.map((budgetGroup) =>
            entities.budgetGroups.put(budgetGroup).go(),
        ),
    );
    await Promise.all(
        fixture.categories.flatMap(({ category, allocation }) => {
            const operations = [
                entities.budgetCategories.upsert(category).go(),
            ];

            if (allocation) {
                operations.push(
                    entities.categoryAllocations.upsert(allocation).go(),
                );
            }

            return operations;
        }),
    );

    return fixture;
}
