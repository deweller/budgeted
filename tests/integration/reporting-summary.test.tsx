import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceStatusPanel } from "@/components/dashboard/workspace-status-panel";
import { CategorySpendChart } from "@/components/reporting/category-spend-chart";
import { NetWorthSummary } from "@/components/reporting/net-worth-summary";
import { ReportFilters } from "@/components/reporting/report-filters";

async function selectComboboxOption(
    user: ReturnType<typeof userEvent.setup>,
    combobox: HTMLElement,
    optionLabel: string,
) {
    await user.click(combobox);
    await user.clear(combobox);
    await user.type(combobox, optionLabel);
    await user.keyboard("{ArrowDown}{Enter}");
}

describe("US3 reporting filters and summaries", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("pushes an updated reporting query when filters are applied", async () => {
        const user = userEvent.setup();
        const pushState = vi
            .spyOn(window.history, "pushState")
            .mockImplementation(() => undefined);

        render(
            <ReportFilters
                accounts={[
                    {
                        accountId: "account-1",
                        name: "Checking",
                    },
                ]}
                initialStartDate="2026-04-01"
                initialEndDate="2026-05-31"
            />,
        );

        await user.clear(screen.getByLabelText("Start date"));
        await user.type(screen.getByLabelText("Start date"), "2026-05-01");
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Account filter" }),
            "Checking",
        );
        await user.click(screen.getByRole("button", { name: "Apply filters" }));

        expect(pushState).toHaveBeenCalledWith(
            null,
            "",
            "/reporting?startDate=2026-05-01&endDate=2026-05-31&accountId=account-1",
        );
        expect(screen.getByLabelText("Start date").className).toContain(
            "bg-[var(--color-field)]",
        );
    });

    it("renders net worth metrics and category totals for the reporting view", () => {
        render(
            <div>
                <NetWorthSummary
                    accountHealth={{
                        accountCount: 3,
                        assetBalanceCents: 16_000,
                        liabilityBalanceCents: 2_500,
                        netWorthCents: 13_500,
                    }}
                    inflowCents={4_500}
                    netWorthCents={13_500}
                    outflowCents={7_500}
                    periodComparisons={[
                        {
                            periodId: "2026-05",
                            inflowCents: 4_500,
                            outflowCents: 7_500,
                            netChangeCents: -3_000,
                        },
                    ]}
                />
                <CategorySpendChart
                    totals={[
                        {
                            categoryId: "category-groceries",
                            name: "Groceries",
                            spentCents: 3_000,
                            reducedByOverspending: true,
                        },
                    ]}
                />
            </div>,
        );

        expect(screen.getByText("$135.00")).toBeInTheDocument();
        expect(screen.getByText("Groceries")).toBeInTheDocument();
        expect(screen.getByText("Reduced carry-forward")).toBeInTheDocument();
        expect(screen.getByText("2026-05")).toBeInTheDocument();
        expect(screen.getByText("Reduced carry-forward").className).toContain(
            "bg-[var(--tone-warning-surface)]",
        );
    });

    it("renders retryable status messaging for failed reporting reads", async () => {
        const user = userEvent.setup();
        const retry = vi.fn();

        render(
            <WorkspaceStatusPanel
                actionLabel="Retry reporting"
                message="The last saved reporting data is unchanged. Retry the reporting read when the workspace is available again."
                onAction={retry}
                title="Reporting could not be refreshed."
                tone="error"
            />,
        );

        expect(
            screen.getByText(
                "The last saved reporting data is unchanged. Retry the reporting read when the workspace is available again.",
            ),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Retry reporting" }),
        );

        expect(retry).toHaveBeenCalledTimes(1);
    });
});
