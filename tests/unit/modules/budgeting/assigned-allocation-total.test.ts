import { describe, expect, it } from "vitest";

import { calculateAssignedAllocationTotalCents } from "@/modules/budgeting";

describe("assigned allocation total", () => {
    it("sums assigned allocation values", () => {
        expect(
            calculateAssignedAllocationTotalCents([
                {
                    assignedCents: 1_500,
                },
                {
                    assignedCents: -500,
                },
            ]),
        ).toBe(1_000);
    });
});
