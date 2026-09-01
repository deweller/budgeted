import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    buildReportingRouteSummary: vi.fn(),
    requireCurrentUserAccount: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
    getActiveLedgerId: (user: {
        activeLedgerId?: string;
        userId: string;
    }) => user.activeLedgerId ?? user.userId,
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/reporting/server/reporting-service", () => ({
    buildReportingRouteSummary: mocks.buildReportingRouteSummary,
}));

import { GET } from "@/app/api/reports/summary/route";

describe("reporting carry-forward contract", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireCurrentUserAccount.mockResolvedValue({
            userId: "owner-1",
        });
    });

    it("returns carry-forward reductions and reporting attention states", async () => {
        mocks.buildReportingRouteSummary.mockResolvedValue({
            startDate: "2026-05-01",
            endDate: "2026-05-31",
            inflowCents: 0,
            outflowCents: 0,
            netWorthCents: 8_000,
            categoryTotals: [],
            attentionStates: [
                {
                    code: "carryForwardReduction",
                    severity: "info",
                    message:
                        "Groceries started 2026-05 reduced by overspending.",
                    categoryId: "category-groceries",
                    transactionId: null,
                },
            ],
            carryForwardSummaries: [
                {
                    categoryId: "category-groceries",
                    categoryName: "Groceries",
                    carryForwardCents: -500,
                    reducedByOverspending: true,
                },
            ],
        });

        const response = await GET(
            new Request(
                "http://localhost/api/reports/summary?startDate=2026-05-01&endDate=2026-05-31",
            ),
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.attentionStates).toEqual([
            expect.objectContaining({
                code: "carryForwardReduction",
                categoryId: "category-groceries",
            }),
        ]);
        expect(body.carryForwardSummaries).toEqual([
            expect.objectContaining({
                categoryId: "category-groceries",
                carryForwardCents: -500,
                reducedByOverspending: true,
            }),
        ]);
    });

    it("returns empty continuity arrays when no reportable activity exists", async () => {
        mocks.buildReportingRouteSummary.mockResolvedValue({
            startDate: "2026-05-01",
            endDate: "2026-05-31",
            inflowCents: 0,
            outflowCents: 0,
            netWorthCents: 0,
            categoryTotals: [],
            attentionStates: [],
            carryForwardSummaries: [],
        });

        const response = await GET(
            new Request(
                "http://localhost/api/reports/summary?startDate=2026-05-01&endDate=2026-05-31",
            ),
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.attentionStates).toEqual([]);
        expect(body.carryForwardSummaries).toEqual([]);
        expect(body.categoryTotals).toEqual([]);
    });
});
