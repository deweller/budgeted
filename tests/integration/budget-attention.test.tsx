import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    usePathname: () => "/budget",
    useRouter: () => ({ refresh: vi.fn() }),
}));

import { BudgetTable } from "@/components/budget/budget-table";

describe("budget table attention", () => {
    it("does not render carry-forward warning text or a top-level attention pane", () => {
        render(
            <BudgetTable
                summary={{
                    activeAccountCount: 1,
                    periodId: "2026-05",
                    allocationDifferenceCents: -500,
                    allocationFundingCents: 2_500,
                    allocationFundingRows: [],
                    assignedAllocationTotalCents: 2_000,
                    availableToBudgetCents: -500,
                    status: "open",
                    attentionStates: [
                        {
                            code: "validationWarning",
                            severity: "critical",
                            message:
                                "Assigned funds exceed the money currently available to budget.",
                            categoryId: null,
                            transactionId: null,
                        },
                    ],
                    carryForwardSummaries: [],
                    fundingReconciliationCents: -500,
                    hasSavedAssignments: true,
                    categories: [
                        {
                            categoryId: "groceries",
                            name: "Groceries",
                            assignedCents: 2_000,
                            carriedForwardCents: -750,
                            activityCents: 0,
                            availableCents: -750,
                            reducedByOverspending: true,
                            attentionStates: [
                                {
                                    code: "carryForwardReduction",
                                    severity: "info",
                                    message:
                                        "Groceries carried overspending into this period.",
                                    categoryId: "groceries",
                                    transactionId: null,
                                },
                            ],
                        },
                    ],
                }}
            />,
        );

        expect(
            screen.queryByText(
                "Assigned funds exceed the money currently available to budget.",
            ),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText("Reduced by prior overspending"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(
                "Groceries carried overspending into this period.",
            ),
        ).not.toBeInTheDocument();

        expect(screen.queryByText("Attention")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: "Edit assigned amount for Groceries",
            }).className,
        ).toContain("hover:outline-[var(--color-border-strong)]");
    });
});
