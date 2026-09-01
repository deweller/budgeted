import { describe, expect, it, vi } from "vitest";

import { listAllPaginatedItems } from "@/lib/db/paginated-list";

describe("listAllPaginatedItems", () => {
    it("collects items across cursor pages", async () => {
        const listPage = vi
            .fn()
            .mockResolvedValueOnce({
                items: ["first"],
                lastEvaluatedKey: { pk: "cursor-1" },
            })
            .mockResolvedValueOnce({
                items: ["second", "third"],
                lastEvaluatedKey: { pk: "cursor-2" },
            })
            .mockResolvedValueOnce({
                items: ["fourth"],
            });

        await expect(listAllPaginatedItems(listPage)).resolves.toEqual([
            "first",
            "second",
            "third",
            "fourth",
        ]);
        expect(listPage).toHaveBeenNthCalledWith(1, {
            exclusiveStartKey: undefined,
        });
        expect(listPage).toHaveBeenNthCalledWith(2, {
            exclusiveStartKey: { pk: "cursor-1" },
        });
        expect(listPage).toHaveBeenNthCalledWith(3, {
            exclusiveStartKey: { pk: "cursor-2" },
        });
    });

    it("returns an empty list from an empty first page", async () => {
        const listPage = vi.fn().mockResolvedValueOnce({ items: [] });

        await expect(listAllPaginatedItems(listPage)).resolves.toEqual([]);
        expect(listPage).toHaveBeenCalledTimes(1);
    });
});
