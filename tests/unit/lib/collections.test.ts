import { describe, expect, it } from "vitest";

import { getOrCreateMapValue, groupBy } from "@/lib/collections";

describe("collection helpers", () => {
    it("groups records by the selected key while preserving item order", () => {
        const grouped = groupBy(
            [
                { id: "one", kind: "asset" },
                { id: "two", kind: "liability" },
                { id: "three", kind: "asset" },
            ],
            (item) => item.kind,
        );

        expect(Array.from(grouped.keys())).toEqual(["asset", "liability"]);
        expect(grouped.get("asset")?.map((item) => item.id)).toEqual([
            "one",
            "three",
        ]);
        expect(grouped.get("liability")?.map((item) => item.id)).toEqual([
            "two",
        ]);
    });

    it("returns an existing map value without recreating it", () => {
        const values = new Map([["existing", 0]]);

        const value = getOrCreateMapValue(values, "existing", () => 42);

        expect(value).toBe(0);
        expect(values.get("existing")).toBe(0);
    });

    it("stores and returns a new map value when the key is missing", () => {
        const values = new Map<string, { count: number }>();

        const value = getOrCreateMapValue(values, "new", () => ({ count: 1 }));

        expect(value).toEqual({ count: 1 });
        expect(values.get("new")).toBe(value);
    });
});
