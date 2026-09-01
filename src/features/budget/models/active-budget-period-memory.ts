import { isMonthlyPeriodId } from "@/modules/ledger/monthly-period";

const activeBudgetPeriodByLedgerId = new Map<string, string>();

export function getRememberedActiveBudgetPeriod(ledgerId: string) {
    return activeBudgetPeriodByLedgerId.get(ledgerId);
}

export function rememberActiveBudgetPeriod(ledgerId: string, periodId: string) {
    if (!isMonthlyPeriodId(periodId)) {
        return;
    }

    activeBudgetPeriodByLedgerId.set(ledgerId, periodId);
}

export function clearRememberedActiveBudgetPeriods() {
    activeBudgetPeriodByLedgerId.clear();
}
