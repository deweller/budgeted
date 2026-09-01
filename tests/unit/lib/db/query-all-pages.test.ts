import { describe, expect, it, vi } from "vitest";

import { queryAllPages } from "@/lib/db/query-all-pages";

describe("queryAllPages", () => {
    it("requests all ElectroDB pages and returns the data array", async () => {
        const go = vi.fn().mockResolvedValue({
            data: [{ id: "first" }, { id: "second" }],
        });

        await expect(
            queryAllPages({ go }, { consistent: true }),
        ).resolves.toEqual([{ id: "first" }, { id: "second" }]);

        expect(go).toHaveBeenCalledWith({
            consistent: true,
            pages: "all",
        });
    });
});
