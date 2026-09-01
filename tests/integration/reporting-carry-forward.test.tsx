import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyStatePanel } from "@/components/dashboard/empty-state-panel";
import { CarryForwardSummary } from "@/components/reporting/carry-forward-summary";

describe("US3 carry-forward and reporting indicators", () => {
    it("renders carry-forward reductions and reporting attention messages", () => {
        render(
            <CarryForwardSummary
                attentionStates={[
                    {
                        code: "carryForwardReduction",
                        severity: "info",
                        message:
                            "Groceries started 2026-05 reduced by overspending.",
                        categoryId: "category-groceries",
                        transactionId: null,
                    },
                ]}
                details={[
                    {
                        periodId: "2026-05",
                        categoryId: "category-groceries",
                        categoryName: "Groceries",
                        carryForwardCents: -500,
                        reducedByOverspending: true,
                    },
                ]}
            />,
        );

        expect(
            screen.getByText(
                "Groceries started 2026-05 reduced by overspending.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByText("Reduced by overspending")).toBeInTheDocument();
        expect(screen.getByText("2026-05")).toBeInTheDocument();
        expect(
            screen
                .getByText("Groceries started 2026-05 reduced by overspending.")
                .closest("ul")?.className,
        ).toContain("bg-[var(--tone-warning-surface)]");
        expect(screen.getByText("Reduced by overspending").className).toContain(
            "bg-[var(--tone-warning-surface)]",
        );
    });

    it("renders section-specific next actions for an empty reporting workspace", () => {
        render(
            <EmptyStatePanel
                title="Reporting needs saved activity."
                readiness={{
                    sectionId: "reporting",
                    status: "empty",
                    message:
                        "Reports appear after saved financial activity exists.",
                    primaryActionHref: "/transactions",
                    primaryActionLabel: "Record transaction",
                }}
            />,
        );

        expect(
            screen.getByText(
                "Reports appear after saved financial activity exists.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Record transaction" }),
        ).toHaveAttribute("href", "/transactions");
    });
});
