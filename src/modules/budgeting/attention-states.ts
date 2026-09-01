export type AttentionState = {
    categoryId: string | null;
    code:
        | "overspending"
        | "uncategorizedActivity"
        | "carryForwardReduction"
        | "validationWarning";
    message: string;
    severity: "info" | "warning" | "critical";
    transactionId: string | null;
};

export type CarryForwardSummary = {
    categoryId: string;
    categoryName: string;
    carryForwardCents: number;
    reducedByOverspending: boolean;
};

type CategoryAttentionInput = {
    availableCents: number;
    carriedForwardCents: number;
    categoryId: string;
    name: string;
};

export function buildCategoryAttentionStates(
    input: CategoryAttentionInput,
): AttentionState[] {
    const states: AttentionState[] = [];

    if (input.carriedForwardCents < 0) {
        states.push({
            code: "carryForwardReduction",
            severity: "info",
            message: `${input.name} carried overspending into this period.`,
            categoryId: input.categoryId,
            transactionId: null,
        });
    }

    return states;
}

export function buildCarryForwardSummaries(
    categories: Array<
        Pick<
            CategoryAttentionInput,
            "carriedForwardCents" | "categoryId" | "name"
        >
    >,
): CarryForwardSummary[] {
    return categories
        .filter((category) => category.carriedForwardCents !== 0)
        .map((category) => ({
            categoryId: category.categoryId,
            categoryName: category.name,
            carryForwardCents: category.carriedForwardCents,
            reducedByOverspending: category.carriedForwardCents < 0,
        }));
}

export function buildBudgetAttentionStates(input: {
    availableToBudgetCents: number;
    categoryStates: AttentionState[];
}) {
    const states = [...input.categoryStates];

    if (input.availableToBudgetCents < 0) {
        states.unshift({
            code: "validationWarning",
            severity: "critical",
            message:
                "Assigned funds exceed the money currently available to budget.",
            categoryId: null,
            transactionId: null,
        });
    }

    return states;
}
