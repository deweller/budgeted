import { describe, expect, it, vi } from "vitest";

import {
    getUniqueAffectedPeriodIds,
    syncAffectedBudgetPeriods,
} from "@/features/shared/server/post-delete-consistency-service";

describe("post delete consistency service", () => {
    it("deduplicates and sorts affected periods", () => {
        expect(
            getUniqueAffectedPeriodIds(
                ["2026-06", undefined, "2026-05"],
                ["2026-05", "2026-07"],
            ),
        ).toEqual(["2026-05", "2026-06", "2026-07"]);
    });

    it("synchronizes each affected period once", async () => {
        const syncPeriod = vi.fn().mockResolvedValue(undefined);

        const affectedPeriods = await syncAffectedBudgetPeriods({
            ledgerId: "ledger-1",
            periodIds: ["2026-06", "2026-05", "2026-06"],
            syncPeriod,
        });

        expect(affectedPeriods).toEqual(["2026-05", "2026-06"]);
        expect(syncPeriod).toHaveBeenCalledTimes(2);
        expect(syncPeriod).toHaveBeenNthCalledWith(1, "ledger-1", "2026-05");
        expect(syncPeriod).toHaveBeenNthCalledWith(2, "ledger-1", "2026-06");
    });
});
