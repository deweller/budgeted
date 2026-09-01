import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveWorkspaceReadiness } from "@/lib/workspace/readiness";

function ReadinessPreview(
    props: Parameters<typeof resolveWorkspaceReadiness>[0],
) {
    const readiness = resolveWorkspaceReadiness(props);

    return (
        <section>
            <p>{readiness.message}</p>
            {readiness.primaryActionLabel ? (
                <a href={readiness.primaryActionHref}>
                    {readiness.primaryActionLabel}
                </a>
            ) : (
                <span>{readiness.status}</span>
            )}
        </section>
    );
}

describe("workspace readiness integration", () => {
    it("renders the budget partial state with the next action", () => {
        render(
            <ReadinessPreview
                accountCount={0}
                categoryCount={0}
                hasReportableActivity={false}
                sectionId="budget"
                transactionCount={0}
            />,
        );

        expect(
            screen.getByText(
                "Create your first reusable budget category before assigning money for a month.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Open Budget Plan" }),
        ).toHaveAttribute("href", "/global-budget");
    });

    it("renders the budget plan partial state without an inert action", () => {
        render(
            <ReadinessPreview
                accountCount={0}
                categoryCount={0}
                hasReportableActivity={false}
                sectionId="globalBudget"
                transactionCount={0}
            />,
        );

        expect(
            screen.getByText(
                "Create your first reusable budget category to start building the budget plan.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: "Create category" }),
        ).not.toBeInTheDocument();
        expect(screen.getByText("partial")).toBeInTheDocument();
    });

    it("renders the reporting empty state with the correct recovery action", () => {
        render(
            <ReadinessPreview
                accountCount={0}
                categoryCount={0}
                hasReportableActivity={false}
                sectionId="reporting"
                transactionCount={0}
            />,
        );

        expect(
            screen.getByText(
                "Reports appear after saved financial activity exists.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Add account" }),
        ).toHaveAttribute("href", "/accounts");
    });
});
