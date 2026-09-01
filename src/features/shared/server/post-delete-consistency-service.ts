import { normalizeAffectedPeriods } from "@/features/shared/models/deletion-impact";

export function getUniqueAffectedPeriodIds(
    ...periodGroups: Array<Iterable<string | undefined> | undefined>
) {
    return normalizeAffectedPeriods(
        periodGroups.flatMap((periodGroup) => Array.from(periodGroup ?? [])),
    );
}

export async function syncAffectedBudgetPeriods(input: {
    ledgerId: string;
    periodIds: Iterable<string | undefined>;
    syncPeriod: (ledgerId: string, periodId: string) => Promise<unknown>;
}) {
    const affectedPeriods = getUniqueAffectedPeriodIds(input.periodIds);

    await Promise.all(
        affectedPeriods.map((periodId) =>
            input.syncPeriod(input.ledgerId, periodId),
        ),
    );

    return affectedPeriods;
}
