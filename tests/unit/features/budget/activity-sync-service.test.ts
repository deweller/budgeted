// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    syncAffectedBudgetPeriods: vi.fn(),
}));

vi.mock("@/features/shared/server/post-delete-consistency-service", () => ({
    syncAffectedBudgetPeriods: mocks.syncAffectedBudgetPeriods,
}));

import { syncAffectedBudgetPeriodActivity } from "@/features/budget/server/activity-sync-service";

describe("budget activity sync service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.syncAffectedBudgetPeriods.mockResolvedValue([
            "2026-05",
            "2026-06",
        ]);
    });

    it("binds affected period syncs to budget period activity", async () => {
        await expect(
            syncAffectedBudgetPeriodActivity("ledger-1", [
                "2026-05",
                undefined,
                "2026-06",
            ]),
        ).resolves.toEqual(["2026-05", "2026-06"]);

        expect(mocks.syncAffectedBudgetPeriods).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            periodIds: ["2026-05", undefined, "2026-06"],
            syncPeriod: expect.any(Function),
        });
    });
});
