import { describe, expect, it } from "vitest";

import { automationScheduleInputSchema } from "@/features/automation/models/automation";

const schedule = {
    aiClassificationEnabled: false,
    aiClassificationTime: "05:16",
    amazonImportEnabled: false,
    amazonImportTime: "05:00",
    amazonScraperEnabled: false,
    amazonScraperTime: "04:46",
    plaidSyncEnabled: false,
    plaidSyncTime: "04:32",
};

describe("automation schedule input", () => {
    it("accepts every two-minute UTC interval", () => {
        expect(automationScheduleInputSchema.safeParse(schedule).success).toBe(true);
    });

    it("rejects minute values outside the scheduler interval", () => {
        expect(
            automationScheduleInputSchema.safeParse({
                ...schedule,
                plaidSyncTime: "04:31",
            }).success,
        ).toBe(false);
    });
});
