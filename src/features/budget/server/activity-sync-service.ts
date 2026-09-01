import { syncAffectedBudgetPeriods } from "@/features/shared/server/post-delete-consistency-service";

import { buildBudgetPeriodSummary } from "./budget-period-service";

export async function syncBudgetPeriodActivity(
    ledgerId: string,
    periodId: string,
) {
    return buildBudgetPeriodSummary(ledgerId, periodId);
}

export async function syncAffectedBudgetPeriodActivity(
    ledgerId: string,
    periodIds: Iterable<string | undefined>,
) {
    return syncAffectedBudgetPeriods({
        ledgerId,
        periodIds,
        syncPeriod: syncBudgetPeriodActivity,
    });
}
