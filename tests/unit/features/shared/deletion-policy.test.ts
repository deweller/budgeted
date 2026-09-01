import { describe, expect, it } from "vitest";

import {
    assertDeletionPreviewRevision,
    createDeletionPreviewRevision,
} from "@/features/shared/server/deletion-policy-service";

describe("deletion policy service", () => {
    it("creates deterministic preview revisions from target state and grouped counts", () => {
        const firstRevision = createDeletionPreviewRevision({
            targetId: "category-1",
            targetUpdatedAt: "2026-05-25T12:00:00.000Z",
            dependentCounts: [{ label: "Allocations", count: 2 }],
            preservedRecords: [
                { label: "Uncategorized transactions", count: 4 },
            ],
            affectedPeriods: ["2026-05", "2026-06"],
        });
        const secondRevision = createDeletionPreviewRevision({
            targetId: "category-1",
            targetUpdatedAt: "2026-05-25T12:00:00.000Z",
            dependentCounts: [{ label: "Allocations", count: 3 }],
            preservedRecords: [
                { label: "Uncategorized transactions", count: 4 },
            ],
            affectedPeriods: ["2026-05", "2026-06"],
        });

        expect(firstRevision).not.toBe(secondRevision);
        expect(firstRevision).toContain("category-1");
    });

    it("rejects missing or stale preview revisions", () => {
        expect(() =>
            assertDeletionPreviewRevision(undefined, "expected"),
        ).toThrow(/missing/i);
        expect(() =>
            assertDeletionPreviewRevision("actual", "expected"),
        ).toThrow(/stale/i);
    });

    it("accepts matching preview revisions", () => {
        expect(() =>
            assertDeletionPreviewRevision("expected", "expected"),
        ).not.toThrow();
    });
});
