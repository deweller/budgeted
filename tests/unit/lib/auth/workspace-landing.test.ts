import { describe, expect, it } from "vitest";

import { resolveWorkspaceLanding } from "@/lib/auth/workspace-landing";

describe("workspace landing", () => {
    it("lands on the dashboard even before accounts exist", async () => {
        await expect(resolveWorkspaceLanding("owner-1")).resolves.toBe(
            "/dashboard",
        );
    });
});
