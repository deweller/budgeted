import { describe, expect, it } from "vitest";

import {
    encodeWorkspaceCursor,
    parseWorkspaceCursor,
    toWorkspaceRevisionKey,
} from "@/lib/workspace/cursor";

describe("workspace cursors", () => {
    it("round-trips an ordered generation and revision cursor", () => {
        const cursor = encodeWorkspaceCursor({ generation: 2, revision: 47 });

        expect(cursor).toBe("g2:r47");
        expect(parseWorkspaceCursor(cursor)).toEqual({
            generation: 2,
            revision: 47,
        });
    });

    it("rejects legacy or malformed cursors", () => {
        expect(parseWorkspaceCursor("01KZLEGACYCURSOR")).toBeNull();
        expect(parseWorkspaceCursor("g0:r1")).toBeNull();
        expect(parseWorkspaceCursor("g2:r-1")).toBeNull();
    });

    it("creates lexically sortable revision index keys", () => {
        expect(toWorkspaceRevisionKey(9) < toWorkspaceRevisionKey(10)).toBe(
            true,
        );
    });
});
