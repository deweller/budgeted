export type CategoryAvailabilityInput = {
    assignedCents: number;
    carriedForwardCents: number;
    activityCents: number;
};

export function calculateAvailableCents(input: CategoryAvailabilityInput) {
    return (
        input.carriedForwardCents + input.assignedCents + input.activityCents
    );
}

export function carryForwardAvailableCents(availableCents: number) {
    return availableCents;
}

export function summarizeAvailability(inputs: CategoryAvailabilityInput[]) {
    return inputs.reduce<{
        assignedCents: number;
        carriedForwardCents: number;
        activityCents: number;
        availableCents: number;
    }>(
        (summary, input) => {
            summary.assignedCents += input.assignedCents;
            summary.carriedForwardCents += input.carriedForwardCents;
            summary.activityCents += input.activityCents;
            summary.availableCents += calculateAvailableCents(input);
            return summary;
        },
        {
            assignedCents: 0,
            carriedForwardCents: 0,
            activityCents: 0,
            availableCents: 0,
        },
    );
}
