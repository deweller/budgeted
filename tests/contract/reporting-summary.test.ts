import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/errors";

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

describe("reporting summary route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireCurrentUserAccount.mockResolvedValue({
            activeLedgerId: "owner-1",
            userId: "owner-1",
        });
    });

    it("loads the reporting summary for a date range and optional account filter", async () => {
        mocks.buildReportingRouteSummary.mockResolvedValue({
            startDate: "2026-04-01",
            endDate: "2026-05-31",
            inflowCents: 4_500,
            outflowCents: 7_500,
            netWorthCents: 12_000,
            categoryTotals: [
                {
                    categoryId: "category-groceries",
                    spentCents: 3_000,
                    reducedByOverspending: true,
                },
            ],
            attentionStates: [],
            carryForwardSummaries: [],
        });

        const response = await GET(
            new Request(
                "http://localhost/api/reports/summary?startDate=2026-04-01&endDate=2026-05-31&accountId=account-1",
            ),
        );

        expect(response.status).toBe(200);
        expect(mocks.buildReportingRouteSummary).toHaveBeenCalledWith(
            "owner-1",
            {
                startDate: "2026-04-01",
                endDate: "2026-05-31",
                accountId: "account-1",
            },
        );
        await expect(response.json()).resolves.toMatchObject({
            periodStart: "2026-04-01",
            periodEnd: "2026-05-31",
            inflowCents: 4_500,
            outflowCents: 7_500,
            netWorthCents: 12_000,
        });
    });

    it("returns a normalized error response when the reporting read fails", async () => {
        mocks.buildReportingRouteSummary.mockRejectedValue(
            new HttpError(
                503,
                "reporting_unavailable",
                "Reporting data is temporarily unavailable.",
            ),
        );

        const response = await GET(
            new Request(
                "http://localhost/api/reports/summary?startDate=2026-04-01&endDate=2026-05-31",
            ),
        );

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "reporting_unavailable",
                details: undefined,
                message: "Reporting data is temporarily unavailable.",
            },
        });
    });
});
