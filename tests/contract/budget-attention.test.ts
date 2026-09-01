import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUserAccount: vi.fn(),
  buildBudgetPeriodSummary: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getActiveLedgerId: (user: {
    activeLedgerId?: string;
    userId: string;
  }) => user.activeLedgerId ?? user.userId,
  requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/budget/server/budget-period-service", () => ({
  buildBudgetPeriodSummary: mocks.buildBudgetPeriodSummary,
}));

import { GET } from "@/app/api/budget/periods/current/route";

describe("budget attention contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserAccount.mockResolvedValue({ userId: "owner-1" });
  });

  it("includes attention states and carry-forward summaries in the response", async () => {
    mocks.buildBudgetPeriodSummary.mockResolvedValue({
      periodId: "2026-05",
      availableToBudgetCents: -500,
      status: "open",
      attentionStates: [
        {
          code: "validationWarning",
          severity: "critical",
          message: "Assigned funds exceed the money currently available to budget.",
          categoryId: null,
          transactionId: null,
        },
      ],
      carryForwardSummaries: [
        {
          categoryId: "groceries",
          categoryName: "Groceries",
          reducedByOverspending: true,
          carryForwardCents: -750,
        },
      ],
      categories: [],
    });

    const response = await GET();
    const payload = await response.json();

    expect(payload.attentionStates).toEqual([
      expect.objectContaining({ code: "validationWarning", severity: "critical" }),
    ]);
    expect(payload.carryForwardSummaries).toEqual([
      expect.objectContaining({
        categoryId: "groceries",
        reducedByOverspending: true,
        carryForwardCents: -750,
      }),
    ]);
  });
});
