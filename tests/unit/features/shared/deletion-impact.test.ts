import { describe, expect, it } from "vitest";

import {
    DEFAULT_PERMANENT_WARNING,
    normalizeAffectedPeriods,
    normalizeDeletionCounts,
} from "@/features/shared/models/deletion-impact";
import {
    createDeletionImpactSummary,
    hasDependentDeletionImpact,
} from "@/features/shared/server/deletion-impact-service";

describe("deletion impact service", () => {
    it("normalizes summaries, periods, and preview revisions", () => {
        const summary = createDeletionImpactSummary({
            target: {
                targetType: "account",
                targetId: "account-1",
                displayName: "Checking",
                sectionId: "accounts",
            },
            targetUpdatedAt: "2026-05-25T12:00:00.000Z",
            dependentCounts: [
                { label: "Transactions", count: 3 },
                { label: "Ledger postings", count: 8 },
                { label: "Unused", count: 0 },
            ],
            affectedPeriods: ["2026-06", undefined, "2026-05", "2026-05"],
            preservedRecords: [
                { label: "Uncategorized transactions", count: 0 },
            ],
            crossAreaEffects: [
                "Balances will update.",
                "Balances will update.",
                "Budget summaries will update.",
            ],
        });

        expect(summary.dependentCounts).toEqual([
            { label: "Ledger postings", count: 8 },
            { label: "Transactions", count: 3 },
        ]);
        expect(summary.affectedPeriods).toEqual(["2026-05", "2026-06"]);
        expect(summary.preservedRecords).toEqual([]);
        expect(summary.crossAreaEffects).toEqual([
            "Balances will update.",
            "Budget summaries will update.",
        ]);
        expect(summary.permanentWarning).toBe(DEFAULT_PERMANENT_WARNING);
        expect(summary.previewRevision).toContain("account-1");
        expect(hasDependentDeletionImpact(summary)).toBe(true);
    });

    it("keeps zero-dependent previews explicit without inventing counts", () => {
        const summary = createDeletionImpactSummary({
            target: {
                targetType: "transaction",
                targetId: "transaction-1",
                displayName: "Paycheck",
                sectionId: "transactions",
            },
        });

        expect(summary.dependentCounts).toEqual([]);
        expect(summary.affectedPeriods).toEqual([]);
        expect(summary.preservedRecords).toEqual([]);
        expect(summary.permanentWarning).toBe(DEFAULT_PERMANENT_WARNING);
        expect(hasDependentDeletionImpact(summary)).toBe(false);
    });

    it("exposes reusable normalizers for callers with raw dependency data", () => {
        expect(
            normalizeDeletionCounts([
                { label: "B", count: 1 },
                { label: "A", count: 1 },
                { label: "Ignored", count: 0 },
            ]),
        ).toEqual([
            { label: "A", count: 1 },
            { label: "B", count: 1 },
        ]);
        expect(
            normalizeAffectedPeriods([
                "2026-07",
                undefined,
                "2026-06",
                "2026-06",
            ]),
        ).toEqual(["2026-06", "2026-07"]);
    });
});
