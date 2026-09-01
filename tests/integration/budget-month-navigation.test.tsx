import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    pathname: "/budget",
    push: vi.fn(),
    refresh: vi.fn(),
    searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => mocks.pathname,
    useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
    useSearchParams: () => mocks.searchParams,
}));

import { BudgetTable } from "@/components/budget/budget-table";
import { PeriodSelector } from "@/components/budget/period-selector";
import { BudgetWorkspace } from "@/components/workspace/workspace-views";
import { WorkspaceStoreProvider } from "@/components/workspace/workspace-store-provider";
import {
    clearRememberedActiveBudgetPeriods,
    getRememberedActiveBudgetPeriod,
    rememberActiveBudgetPeriod,
} from "@/features/budget/models/active-budget-period-memory";
import { resolveBudgetPeriodQuery } from "@/features/budget/models/budget-period-query";
import type { BudgetPeriodSummary } from "@/features/budget/models/budget-period-summary";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import { UNCATEGORIZED_CATEGORY_ID } from "@/modules/budgeting/uncategorized";

function getAssignedAmountButton(categoryName: string) {
    return screen.getByRole("button", {
        name: `Edit assigned amount for ${categoryName}`,
    });
}

function createCompleteBudgetSummary(
    summary: Omit<
        BudgetPeriodSummary,
        | "allocationDifferenceCents"
        | "allocationFundingCents"
        | "allocationFundingRows"
        | "assignedAllocationTotalCents"
        | "fundingReconciliationCents"
    > &
        Partial<
            Pick<
                BudgetPeriodSummary,
                | "allocationDifferenceCents"
                | "allocationFundingCents"
                | "allocationFundingRows"
                | "assignedAllocationTotalCents"
                | "fundingReconciliationCents"
            >
        >,
): BudgetPeriodSummary {
    const assignedAllocationTotalCents =
        summary.assignedAllocationTotalCents ??
        summary.categories.reduce(
            (total, category) => total + category.assignedCents,
            0,
        );
    const allocationDifferenceCents =
        summary.allocationDifferenceCents ?? summary.availableToBudgetCents;
    const allocationFundingCents =
        summary.allocationFundingCents ??
        assignedAllocationTotalCents + allocationDifferenceCents;

    return {
        ...summary,
        allocationDifferenceCents,
        allocationFundingCents,
        allocationFundingRows: summary.allocationFundingRows ?? [],
        assignedAllocationTotalCents,
        fundingReconciliationCents:
            summary.fundingReconciliationCents ??
            allocationDifferenceCents,
    };
}

function createBudgetSummary(
    periodId: string,
    assignedCents: number,
    hasSavedAssignments = true,
) {
    return createCompleteBudgetSummary({
        activeAccountCount: 1,
        availableToBudgetCents: 7_500,
        attentionStates: [],
        categories: [
            {
                activityCents: 0,
                assignedCents,
                attentionStates: [],
                availableCents: 750,
                carriedForwardCents: -750,
                categoryId: "travel",
                name: "Travel",
                reducedByOverspending: true,
            },
        ],
        carryForwardSummaries: [],
        hasSavedAssignments,
        periodId,
        status: "open" as const,
    });
}

function getBudgetRow(categoryName: string) {
    const row = screen.getByText(categoryName).closest("tr");

    expect(row).not.toBeNull();

    return row as HTMLTableRowElement;
}

function createWorkspaceSnapshot(
    overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
    const timestamp = "2026-01-01T00:00:00.000Z";

    return {
        accounts: [],
        activeLedgerId: "ledger-1",
        activeLedgerName: "Ledger",
        allocationFundingSources: [],
        budgetAllocations: [],
        budgetCategories: [],
        budgetGroups: [],
        budgetPeriods: [],
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: "ledger-1",
            changeCursor: "",
            entityCounts: {
                account: 0,
                allocationFundingSource: 0,
                budgetCategory: 0,
                budgetGroup: 0,
                budgetPeriod: 0,
                categoryAllocation: 0,
                ledger: 1,
                ledgerPosting: 0,
                plaidAccountLink: 0,
                plaidTransactionSync: 0,
                transaction: 0,
                transactionLine: 0,
            },
            generatedAt: timestamp,
            retainedChangesAfter: timestamp,
            revision: "test-revision",
        },
        ledgerPostings: [],
        ledgers: [
            {
                createdAt: timestamp,
                isDefault: true,
                ledgerId: "ledger-1",
                name: "Ledger",
                status: "active",
                updatedAt: timestamp,
                workspaceId: "global",
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [],
        ...overrides,
    };
}

describe("budget month navigation", () => {
    beforeEach(() => {
        window.localStorage.clear();
        clearRememberedActiveBudgetPeriods();
        mocks.pathname = "/budget";
        mocks.push.mockReset();
        mocks.refresh.mockReset();
        mocks.searchParams = new URLSearchParams();
    });

    it("falls back to the current month when the query is invalid", async () => {
        const query = await resolveBudgetPeriodQuery(
            { month: "invalid" },
            new Date("2026-05-15T00:00:00.000Z"),
        );

        expect(query.normalizedPeriodId).toBe("2026-05");
        expect(query.isFallback).toBe(true);
        expect(query.label).toBe("May, 2026");
        expect(query.source).toBe("default");
    });

    it("keeps a valid selected month from the query", async () => {
        const query = await resolveBudgetPeriodQuery(
            { month: "2025-12" },
            new Date("2026-05-15T00:00:00.000Z"),
        );

        expect(query.normalizedPeriodId).toBe("2025-12");
        expect(query.isFallback).toBe(false);
        expect(query.label).toBe("December, 2025");
        expect(query.source).toBe("query");
    });

    it("renders the active period label and navigates to adjacent months", async () => {
        const user = userEvent.setup();

        render(<PeriodSelector periodId="2026-05" />);

        expect(screen.getByText("Active period")).toBeInTheDocument();
        expect(screen.getByText("May, 2026")).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Go to previous month" }),
        );

        expect(mocks.push).toHaveBeenCalledWith("/budget?month=2026-04");

        await user.click(
            screen.getByRole("button", { name: "Go to next month" }),
        );

        expect(mocks.push).toHaveBeenCalledWith("/budget?month=2026-06");
    });

    it("renders header actions in the period selector", () => {
        render(
            <PeriodSelector
                actions={<button type="button">Allocations</button>}
                periodId="2026-05"
            />,
        );

        expect(screen.getByText("May, 2026")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Allocations" }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
        expect(screen.queryByText("Assigned")).not.toBeInTheDocument();
        expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    });

    it("preserves existing query parameters when changing months", async () => {
        const user = userEvent.setup();

        mocks.searchParams = new URLSearchParams("view=compact&month=2026-05");

        render(<PeriodSelector periodId="2026-05" />);

        await user.click(
            screen.getByRole("button", { name: "Go to next month" }),
        );

        expect(mocks.push).toHaveBeenCalledWith(
            "/budget?view=compact&month=2026-06",
        );
    });

    it("crosses the year boundary when navigating backward from January", async () => {
        const user = userEvent.setup();

        render(<PeriodSelector periodId="2026-01" />);

        await user.click(
            screen.getByRole("button", { name: "Go to previous month" }),
        );

        expect(mocks.push).toHaveBeenCalledWith("/budget?month=2025-12");
    });

    it("remembers the active budget period in memory by ledger", async () => {
        const user = userEvent.setup();
        const snapshot = createWorkspaceSnapshot();

        const firstRender = render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <BudgetWorkspace initialPeriodId="2026-05" />
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByText("May, 2026")).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Go to next month" }),
        );

        expect(getRememberedActiveBudgetPeriod("ledger-1")).toBe("2026-06");
        firstRender.unmount();

        render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <BudgetWorkspace initialPeriodId="2026-05" />
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByText("June, 2026")).toBeInTheDocument();
    });

    it("keeps remembered active budget periods scoped to the active ledger", async () => {
        rememberActiveBudgetPeriod("ledger-1", "2026-06");
        rememberActiveBudgetPeriod("ledger-2", "2026-07");

        const firstLedgerRender = render(
            <WorkspaceStoreProvider initialSnapshot={createWorkspaceSnapshot()}>
                <BudgetWorkspace initialPeriodId="2026-05" />
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByText("June, 2026")).toBeInTheDocument();
        firstLedgerRender.unmount();

        render(
            <WorkspaceStoreProvider
                initialSnapshot={createWorkspaceSnapshot({
                    activeLedgerId: "ledger-2",
                    activeLedgerName: "Second Ledger",
                    knowledge: {
                        ...createWorkspaceSnapshot().knowledge,
                        activeLedgerId: "ledger-2",
                    },
                    ledgers: [
                        {
                            createdAt: "2026-01-01T00:00:00.000Z",
                            isDefault: true,
                            ledgerId: "ledger-2",
                            name: "Second Ledger",
                            status: "active",
                            updatedAt: "2026-01-01T00:00:00.000Z",
                            workspaceId: "global",
                        },
                    ],
                })}
            >
                <BudgetWorkspace initialPeriodId="2026-05" />
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByText("July, 2026")).toBeInTheDocument();
    });

    it("renders the monthly budget table with total as the last column", () => {
        render(
            <BudgetTable
                summary={createCompleteBudgetSummary({
                    activeAccountCount: 1,
                    availableToBudgetCents: 7_500,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 1_500,
                            attentionStates: [],
                            availableCents: 750,
                            carriedForwardCents: -750,
                            categoryId: "travel",
                            name: "Travel",
                            reducedByOverspending: true,
                        },
                    ],
                    carryForwardSummaries: [],
                    hasSavedAssignments: true,
                    periodId: "2025-12",
                    status: "open",
                })}
            />,
        );

        expect(screen.getByText("Travel")).toBeInTheDocument();
        expect(
            screen
                .getAllByRole("columnheader")
                .map((header) => header.textContent),
        ).toEqual(["Category", "Month Start", "Assigned", "Activity", "Total"]);
        const table = within(screen.getByRole("table"));
        expect(table.getByText("Month Start")).toBeInTheDocument();
        expect(table.getByText("Assigned")).toBeInTheDocument();
        expect(table.getByText("Activity")).toBeInTheDocument();
        expect(table.getByText("Total")).toBeInTheDocument();
        expect(screen.getByText("Category").closest("thead")?.className).toContain(
            "sticky",
        );
        expect(screen.queryByText("Carry forward")).not.toBeInTheDocument();
        expect(screen.queryByText("Available")).not.toBeInTheDocument();
        expect(
            screen.queryByText("Reduced by prior overspending"),
        ).not.toBeInTheDocument();

        const row = getBudgetRow("Travel");
        expect(within(row).getByText("-$7.50")).toBeInTheDocument();
        expect(within(row).getByText("$7.50")).toBeInTheDocument();
    });

    it("shows the pending allocation summary when monthly allocations have not been applied", async () => {
        const user = userEvent.setup();

        render(
            <BudgetTable
                summary={createCompleteBudgetSummary({
                    activeAccountCount: 1,
                    availableToBudgetCents: 0,
                    attentionStates: [],
                    categories: [],
                    carryForwardSummaries: [],
                    hasSavedAssignments: false,
                    periodId: "2026-05",
                    status: "open",
                })}
            />,
        );

        const allocationControl = screen
            .getByText("Monthly Allocation")
            .closest("summary");

        expect(allocationControl).not.toBeNull();
        expect(
            allocationControl?.querySelector('svg[data-icon="clock"]'),
        ).toBeInTheDocument();
        expect(
            allocationControl?.querySelector('svg[data-icon="circle-check"]'),
        ).not.toBeInTheDocument();
        expect(allocationControl).not.toHaveTextContent("$0.00");

        await user.click(allocationControl as HTMLElement);

        const allocationDisclosure = allocationControl?.closest("details");

        expect(allocationDisclosure).not.toBeNull();
        expect(within(allocationDisclosure as HTMLElement).getByText("Available", { exact: true })).toBeInTheDocument();
        expect(within(allocationDisclosure as HTMLElement).getByText("Plan", { exact: true })).toBeInTheDocument();
        expect(within(allocationDisclosure as HTMLElement).getByText("Difference", { exact: true })).toBeInTheDocument();
        expect(within(allocationDisclosure as HTMLElement).queryByText("Initial funds")).not.toBeInTheDocument();
        expect(within(allocationDisclosure as HTMLElement).queryByText("Assigned", { exact: true })).not.toBeInTheDocument();
        expect(within(allocationDisclosure as HTMLElement).queryByText("Status", { exact: true })).not.toBeInTheDocument();
    });

    it("shows funding and allocation subtotals for a saved month", async () => {
        const user = userEvent.setup();

        render(
            <BudgetTable
                summary={createCompleteBudgetSummary({
                    activeAccountCount: 1,
                    availableToBudgetCents: 0,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 1_500,
                            attentionStates: [],
                            availableCents: 1_500,
                            carriedForwardCents: 0,
                            categoryId: "travel",
                            name: "Travel",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    hasSavedAssignments: true,
                    periodId: "2026-05",
                    status: "open",
                })}
            />,
        );

        const allocationControl = screen
            .getByText("Monthly Allocation")
            .closest("summary");

        expect(allocationControl).not.toBeNull();
        expect(
            allocationControl?.querySelector(
                'svg[data-icon="triangle-exclamation"]',
            ),
        ).toBeInTheDocument();
        expect(allocationControl).not.toHaveTextContent("$0.00");

        await user.click(allocationControl as HTMLElement);

        expect(screen.getByText("Funding", { exact: true })).toBeInTheDocument();
        expect(screen.getByText("Allocated", { exact: true })).toBeInTheDocument();
        expect(screen.getByText("Difference", { exact: true })).toBeInTheDocument();
        expect(screen.queryByText("Available", { exact: true })).not.toBeInTheDocument();
        expect(screen.queryByText("Plan", { exact: true })).not.toBeInTheDocument();
    });

    it("filters the monthly budget table by category name", async () => {
        const user = userEvent.setup();

        render(
            <BudgetTable
                summary={createCompleteBudgetSummary({
                    activeAccountCount: 1,
                    availableToBudgetCents: 0,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: -2_500,
                            assignedCents: 5_000,
                            attentionStates: [],
                            availableCents: 2_500,
                            carriedForwardCents: 0,
                            categoryId: "groceries",
                            name: "Groceries",
                            reducedByOverspending: false,
                        },
                        {
                            activityCents: 0,
                            assignedCents: 10_000,
                            attentionStates: [],
                            availableCents: 10_000,
                            carriedForwardCents: 0,
                            categoryId: "travel",
                            name: "Travel",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    hasSavedAssignments: true,
                    periodId: "2026-05",
                    status: "open",
                })}
            />,
        );

        const budgetTable = screen.getByRole("table");

        expect(within(budgetTable).getByText("Groceries")).toBeInTheDocument();
        expect(within(budgetTable).getByText("Travel")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Filter" }));

        const categoryFilter = screen.getByRole("textbox", {
            name: "Category",
        });

        await waitFor(() => expect(categoryFilter).toHaveFocus());
        await user.type(categoryFilter, "gRo");

        expect(screen.getByText("Filter:")).toBeInTheDocument();
        expect(screen.getByText("Category: gRo")).toBeInTheDocument();
        expect(within(budgetTable).getByText("Groceries")).toBeInTheDocument();
        expect(within(budgetTable).queryByText("Travel")).not.toBeInTheDocument();
        expect(categoryFilter).toHaveValue("gRo");

        await user.clear(categoryFilter);
        await user.type(categoryFilter, "missing");

        expect(
            within(budgetTable).getByText(
                "No budget categories match this filter.",
            ),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Clear all" }));

        expect(screen.queryByText("Filter:")).not.toBeInTheDocument();
        expect(categoryFilter).toHaveValue("");
        expect(within(budgetTable).getByText("Travel")).toBeInTheDocument();
    });

    it("opens the monthly budget filter with slash outside editable controls", async () => {
        const user = userEvent.setup();

        render(<BudgetTable summary={createBudgetSummary("2026-05", 1_500)} />);

        await user.keyboard("/");

        const categoryFilter = screen.getByRole("textbox", {
            name: "Category",
        });

        expect(categoryFilter).toHaveFocus();
        await user.type(categoryFilter, "travel");
        await user.keyboard("/");

        expect(categoryFilter).toHaveValue("travel/");
    });

    it("pins the month navigator above the sticky monthly budget table header", () => {
        const { container } = render(
            <BudgetTable
                renderHeader={(allocationStatus) => (
                    <PeriodSelector
                        actions={allocationStatus}
                        periodId="2025-12"
                    />
                )}
                summary={createBudgetSummary("2025-12", 1_500)}
            />,
        );

        const periodHeader = container.querySelector(
            "[data-budget-period-header]",
        );
        const budgetTableRoot = container.querySelector(
            "[data-budget-table-root]",
        );
        const tableHeader = screen.getByText("Category").closest("thead");

        expect(periodHeader).not.toBeNull();
        expect(periodHeader).toHaveClass("sticky");
        expect(periodHeader).toHaveClass("top-0");
        expect(periodHeader).toHaveClass("z-30");
        expect(periodHeader).toHaveClass("w-full");
        expect(periodHeader).toHaveClass("after:h-4");
        expect(periodHeader).toHaveClass("after:bg-[var(--color-surface)]");
        expect(budgetTableRoot).toHaveClass("w-fit");
        expect(budgetTableRoot).toHaveClass("max-w-full");
        expect(tableHeader).not.toBeNull();
        expect(tableHeader).toHaveClass(
            "!top-[var(--budget-table-header-top)]",
        );
        expect(tableHeader).toHaveClass(
            "[&>tr>th]:!top-[var(--budget-table-header-top)]",
        );
        expect(budgetTableRoot).toHaveStyle({
            "--budget-table-header-top": "calc(0px + 1rem)",
        });
    });

    it("opens monthly activity transactions from the activity column", async () => {
        const user = userEvent.setup();
        const timestamp = "2026-01-01T00:00:00.000Z";
        const snapshot = createWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "credit-card",
                    accountType: "creditCard",
                    balanceCents: -750,
                    createdAt: timestamp,
                    ledgerAccountId: "acct_credit_card",
                    name: "Credit Card",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 0,
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "travel",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "monthly",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_travel",
                    name: "Travel",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
            budgetGroups: [
                {
                    createdAt: timestamp,
                    groupId: "monthly",
                    name: "Monthly",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
            transactionLines: [
                {
                    amountCents: 750,
                    categoryId: "travel",
                    createdAt: timestamp,
                    fromAccountId: "credit-card",
                    lineId: "line-travel",
                    memo: "Train fare",
                    payee: "Transit",
                    sortOrder: 0,
                    transactionId: "transaction-travel",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
            transactions: [
                {
                    displayAmountCents: -750,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId: "ledger-1",
                    lines: [],
                    occurredAt: "2025-12-12T00:00:00.000Z",
                    payee: "Transit",
                    periodId: "2025-12",
                    postings: [],
                    referenceAccountId: "credit-card",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-travel",
                    updatedAt: timestamp,
                },
            ],
        });

        render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <BudgetTable
                    summary={createCompleteBudgetSummary({
                        activeAccountCount: 1,
                        availableToBudgetCents: 7_500,
                        attentionStates: [],
                        categories: [
                            {
                                activityCents: -750,
                                assignedCents: 1_500,
                                attentionStates: [],
                                availableCents: 750,
                                carriedForwardCents: 0,
                                categoryId: "travel",
                                name: "Travel",
                                reducedByOverspending: false,
                            },
                        ],
                        carryForwardSummaries: [],
                        hasSavedAssignments: true,
                        periodId: "2025-12",
                        status: "open",
                    })}
                />
            </WorkspaceStoreProvider>,
        );

        await user.click(
            screen.getByRole("button", {
                name: "View activity for Travel in 2025-12",
            }),
        );

        const dialog = screen.getByRole("dialog", {
            name: "Activity details",
        });

        expect(within(dialog).getByText("Travel - 2025-12")).toBeInTheDocument();
        expect(within(dialog).getByText("Month Start")).toBeInTheDocument();
        expect(
            within(dialog).queryByText("Balance at the start of the month"),
        ).not.toBeInTheDocument();
        expect(within(dialog).getByText("Assigned")).toBeInTheDocument();
        expect(
            within(dialog).queryByText("Assigned in this month"),
        ).not.toBeInTheDocument();
        expect(within(dialog).getByText("Transit")).toBeInTheDocument();
        expect(within(dialog).getByText("Train fare")).toBeInTheDocument();
        expect(within(dialog).getByText("Total")).toBeInTheDocument();
        expect(
            within(dialog).queryByText("Month Start + Assigned + Activity"),
        ).not.toBeInTheDocument();
        expect(within(dialog).queryByText("Info")).not.toBeInTheDocument();
        const monthStartRow = within(dialog)
            .getAllByRole("row")
            .find((row) => row.textContent?.includes("Month Start"));

        expect(monthStartRow).toBeDefined();
        expect(monthStartRow).toHaveClass(
            "bg-[var(--tone-info-surface-strong)]/60",
        );
        expect(
            within(monthStartRow!).getByText("Month Start"),
        ).toBeInTheDocument();
        const monthStartCells = within(monthStartRow!).getAllByRole("cell");
        expect(monthStartCells[2]).toBeEmptyDOMElement();
        expect(monthStartCells[3]).toBeEmptyDOMElement();
        const transactionLink = within(dialog).getByRole("link", {
            name: "Transaction",
        });
        const transactionLinkLabel =
            within(transactionLink).getByText("Transaction");
        expect(transactionLink).toHaveClass("group");
        expect(transactionLinkLabel).not.toHaveClass("underline");
        expect(transactionLinkLabel).toHaveClass("group-hover:underline");
        expect(transactionLinkLabel).toHaveClass(
            "text-[var(--color-accent-contrast)]",
        );
        expect(transactionLink).toHaveAttribute(
            "href",
            "/transactions/all-accounts?selected=transaction-travel",
        );
        await user.click(transactionLink);
        expect(mocks.push).toHaveBeenCalledWith(
            "/transactions/credit-card?selected=transaction-travel",
        );
        expect(
            dialog.querySelector('[data-icon="money-bill-wave"]'),
        ).not.toBeNull();
        expect(dialog.querySelector('[data-icon="calculator"]')).not.toBeNull();
        expect(within(dialog).getAllByText("-$7.50").length).toBeGreaterThan(0);
        expect(within(dialog).getAllByText("$15.00").length).toBeGreaterThan(0);
        expect(
            within(
                within(dialog).getByRole("row", {
                    name: /Total/,
                }),
            ).getAllByText("$7.50"),
        ).toHaveLength(1);
    });

    it("does not show computed Unassigned as a monthly budget category row", () => {
        render(
            <WorkspaceStoreProvider initialSnapshot={createWorkspaceSnapshot()}>
                <BudgetTable
                    summary={createCompleteBudgetSummary({
                        activeAccountCount: 1,
                        availableToBudgetCents: 7_500,
                        attentionStates: [],
                        categories: [
                            {
                                activityCents: -750,
                                assignedCents: 1_500,
                                attentionStates: [],
                                availableCents: 750,
                                carriedForwardCents: 0,
                                categoryId: "travel",
                                name: "Travel",
                                reducedByOverspending: false,
                            },
                        ],
                        carryForwardSummaries: [],
                        hasSavedAssignments: true,
                        periodId: "2025-12",
                        status: "open",
                    })}
                />
            </WorkspaceStoreProvider>,
        );

        expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
        expect(
            within(screen.getByRole("table")).queryByText("$75.00"),
        ).not.toBeInTheDocument();
        expect(
            within(screen.getByRole("table")).getAllByText("$15.00").length,
        ).toBeGreaterThan(0);
        expect(
            screen.queryByRole("button", {
                name: "View activity for Unassigned in 2025-12",
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: "View activity for Travel in 2025-12",
            }),
        ).toBeInTheDocument();
    });

    it("groups and orders monthly budget categories by the Budget Plan", () => {
        const timestamp = "2026-01-01T00:00:00.000Z";
        const snapshot = createWorkspaceSnapshot({
            budgetCategories: [
                {
                    categoryId: "rent",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "housing",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_rent",
                    name: "Rent",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "groceries",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "daily",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "electric",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "housing",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_electric",
                    name: "Electric",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
            budgetGroups: [
                {
                    createdAt: timestamp,
                    groupId: "housing",
                    name: "Housing",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
                {
                    createdAt: timestamp,
                    groupId: "daily",
                    name: "Daily",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
        });

        const summary = createCompleteBudgetSummary({
            activeAccountCount: 1,
            availableToBudgetCents: 0,
            attentionStates: [],
            categories: [
                {
                    activityCents: -250,
                    assignedCents: 0,
                    attentionStates: [],
                    availableCents: -250,
                    carriedForwardCents: 0,
                    categoryId: UNCATEGORIZED_CATEGORY_ID,
                    name: "Uncategorized",
                    reducedByOverspending: false,
                },
                {
                    activityCents: 0,
                    assignedCents: 0,
                    attentionStates: [],
                    availableCents: 0,
                    carriedForwardCents: 0,
                    categoryId: "rent",
                    name: "Rent",
                    reducedByOverspending: false,
                },
                {
                    activityCents: -500,
                    assignedCents: 2_000,
                    attentionStates: [],
                    availableCents: 2_500,
                    carriedForwardCents: 1_000,
                    categoryId: "groceries",
                    name: "Groceries",
                    reducedByOverspending: false,
                },
                {
                    activityCents: 0,
                    assignedCents: 0,
                    attentionStates: [],
                    availableCents: 0,
                    carriedForwardCents: 0,
                    categoryId: "electric",
                    name: "Electric",
                    reducedByOverspending: false,
                },
            ],
            carryForwardSummaries: [],
            hasSavedAssignments: true,
            periodId: "2026-05",
            status: "open" as const,
        });

        render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <BudgetTable summary={summary} />
            </WorkspaceStoreProvider>,
        );

        const rowText = screen
            .getAllByRole("row")
            .map((row) => row.textContent ?? "");

        expect(
            rowText.findIndex((text) => text.includes("Uncategorized")),
        ).toBeLessThan(rowText.findIndex((text) => text.includes("Daily")));
        expect(rowText.findIndex((text) => text.includes("Daily"))).toBeLessThan(
            rowText.findIndex((text) => text.includes("Groceries")),
        );
        expect(
            rowText.findIndex((text) => text.includes("Groceries")),
        ).toBeLessThan(rowText.findIndex((text) => text.includes("Housing")));
        expect(
            rowText.findIndex((text) => text.includes("Housing")),
        ).toBeLessThan(rowText.findIndex((text) => text.includes("Electric")));
        expect(
            rowText.findIndex((text) => text.includes("Electric")),
        ).toBeLessThan(rowText.findIndex((text) => text.includes("Rent")));
        const dailyGroupRow = screen
            .getAllByRole("row")
            .find((row) => row.textContent?.includes("Daily"));
        const table = screen.getByRole("table");
        const groupSpacers = table.querySelectorAll("[data-budget-group-spacer]");

        expect(dailyGroupRow).toBeDefined();
        expect(groupSpacers).toHaveLength(2);
        expect(groupSpacers[0]?.querySelector("td")).toHaveClass("h-8");
        expect(table.querySelector("tbody")?.firstElementChild).not.toHaveAttribute(
            "data-budget-group-spacer",
        );
        expect(dailyGroupRow).toHaveClass("border-b-2");
        expect(dailyGroupRow).toHaveClass("border-t-2");
        expect(dailyGroupRow).not.toHaveClass("border-b-4");
        expect(dailyGroupRow).not.toHaveClass("border-t-4");
        expect(
            within(dailyGroupRow!).getByRole("button", {
                name: "Hide categories in Daily",
            }).closest("th"),
        ).toHaveClass("bg-[var(--color-panel-strong)]");
        expect(dailyGroupRow).toHaveTextContent("$10.00");
        expect(dailyGroupRow).toHaveTextContent("$20.00");
        expect(dailyGroupRow).toHaveTextContent("-$5.00");
        expect(dailyGroupRow).toHaveTextContent("$25.00");
        expect(within(dailyGroupRow!).getByText("$20.00").closest("td"))
            .toHaveClass("bg-[var(--color-panel-strong)]");
        expect(within(dailyGroupRow!).getByText("$20.00")).toHaveClass(
            "money-positive",
        );
        expect(within(dailyGroupRow!).getByText("-$5.00")).toHaveClass(
            "money-negative",
        );
        expect(within(dailyGroupRow!).getByText("$25.00").closest("td"))
            .toHaveClass("bg-[var(--color-panel-strong)]");
        expect(within(dailyGroupRow!).getByText("$25.00").closest("td"))
            .not.toHaveClass("bg-[var(--tone-success-surface)]");
        expect(within(dailyGroupRow!).getByText("$25.00")).toHaveClass(
            "money-positive",
        );
        expect(within(dailyGroupRow!).getByText("-$5.00").closest("td"))
            .not.toHaveClass("bg-[var(--tone-error-surface)]");
        const housingGroupRow = screen
            .getAllByRole("row")
            .find((row) => row.textContent?.includes("Housing"));
        const uncategorizedGroupRow = screen
            .getAllByRole("row")
            .find((row) => row.textContent?.includes("Uncategorized"));
        const groceriesCategoryRow = screen
            .getAllByRole("row")
            .find((row) => row.textContent?.includes("Groceries"));

        expect(housingGroupRow).toBeDefined();
        expect(uncategorizedGroupRow).toBeDefined();
        expect(groceriesCategoryRow).toBeDefined();
        expect(uncategorizedGroupRow).not.toHaveClass("border-t-2");
        expect(groceriesCategoryRow).toHaveClass("border-b-2");
        expect(within(housingGroupRow!).getAllByText("$0.00").at(-1)?.closest("td"))
            .toHaveClass("bg-[var(--color-panel-strong)]");
        expect(within(housingGroupRow!).getAllByText("$0.00").at(-1))
            .toHaveClass("money-zero");
        expect(
            screen.queryByRole("button", {
                name: "Edit assigned amount for Uncategorized",
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: "View activity for Uncategorized in 2026-05",
            }),
        ).toBeInTheDocument();
    });

    it("collapses monthly budget groups with per-group and global carets", async () => {
        const user = userEvent.setup();
        const timestamp = "2026-01-01T00:00:00.000Z";
        const snapshot = createWorkspaceSnapshot({
            budgetCategories: [
                {
                    categoryId: "rent",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "housing",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_rent",
                    name: "Rent",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "groceries",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "daily",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "electric",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "housing",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_electric",
                    name: "Electric",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
            budgetGroups: [
                {
                    createdAt: timestamp,
                    groupId: "housing",
                    name: "Housing",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
                {
                    createdAt: timestamp,
                    groupId: "daily",
                    name: "Daily",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId: "ledger-1",
                },
            ],
        });
        const summary = createCompleteBudgetSummary({
            activeAccountCount: 1,
            availableToBudgetCents: 0,
            attentionStates: [],
            categories: [
                {
                    activityCents: 0,
                    assignedCents: 0,
                    attentionStates: [],
                    availableCents: 0,
                    carriedForwardCents: 0,
                    categoryId: "rent",
                    name: "Rent",
                    reducedByOverspending: false,
                },
                {
                    activityCents: 0,
                    assignedCents: 0,
                    attentionStates: [],
                    availableCents: 0,
                    carriedForwardCents: 0,
                    categoryId: "groceries",
                    name: "Groceries",
                    reducedByOverspending: false,
                },
                {
                    activityCents: 0,
                    assignedCents: 0,
                    attentionStates: [],
                    availableCents: 0,
                    carriedForwardCents: 0,
                    categoryId: "electric",
                    name: "Electric",
                    reducedByOverspending: false,
                },
            ],
            carryForwardSummaries: [],
            hasSavedAssignments: true,
            periodId: "2026-05",
            status: "open" as const,
        });

        const initialRender = render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <BudgetTable summary={summary} />
            </WorkspaceStoreProvider>,
        );

        const globalToggle = screen.getByRole("button", {
            name: "Hide all budget category groups",
        });

        await waitFor(() =>
            expect(globalToggle).toHaveAttribute("aria-expanded", "true"),
        );

        await user.click(
            screen.getByRole("button", { name: "Hide categories in Daily" }),
        );

        expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
        expect(screen.getByText("Electric")).toBeInTheDocument();
        expect(screen.getByText("Rent")).toBeInTheDocument();
        expect(globalToggle).toHaveAttribute("aria-expanded", "true");

        initialRender.unmount();

        await waitFor(() =>
            expect(
                window.localStorage.getItem(
                    "budgeted:monthly-budget:collapsed-groups:v1:ledger-1",
                ),
            ).toBe(JSON.stringify(["group:daily"])),
        );
        expect(
            window.localStorage.getItem(
                "budgeted:monthly-budget:collapsed-groups:v1:ledger-2",
            ),
        ).toBeNull();

        const secondLedgerRender = render(
            <WorkspaceStoreProvider
                initialSnapshot={{
                    ...snapshot,
                    activeLedgerId: "ledger-2",
                    activeLedgerName: "Second Ledger",
                    knowledge: {
                        ...snapshot.knowledge,
                        activeLedgerId: "ledger-2",
                    },
                    ledgers: [
                        {
                            ...snapshot.ledgers[0],
                            ledgerId: "ledger-2",
                            name: "Second Ledger",
                        },
                    ],
                }}
            >
                <BudgetTable summary={summary} />
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByText("Groceries")).toBeInTheDocument();
        secondLedgerRender.unmount();

        const persistedRender = render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <BudgetTable summary={summary} />
            </WorkspaceStoreProvider>,
        );

        await waitFor(() =>
            expect(screen.queryByText("Groceries")).not.toBeInTheDocument(),
        );
        expect(screen.getByText("Electric")).toBeInTheDocument();
        expect(screen.getByText("Rent")).toBeInTheDocument();

        persistedRender.unmount();

        render(
            <WorkspaceStoreProvider
                initialSnapshot={{
                    ...snapshot,
                    budgetCategories: [
                        ...snapshot.budgetCategories,
                        {
                            categoryId: "buffer",
                            createdAt: timestamp,
                            defaultAssignedCents: 0,
                            groupId: "savings",
                            isIncomeCategory: false,
                            ledgerAccountId: "cat_buffer",
                            name: "Buffer",
                            sortOrder: 0,
                            status: "active",
                            updatedAt: timestamp,
                            ledgerId: "ledger-1",
                        },
                    ],
                    budgetGroups: [
                        ...snapshot.budgetGroups,
                        {
                            createdAt: timestamp,
                            groupId: "savings",
                            name: "Savings",
                            sortOrder: 2,
                            status: "active",
                            updatedAt: timestamp,
                            ledgerId: "ledger-1",
                        },
                    ],
                }}
            >
                <BudgetTable
                    summary={{
                        ...summary,
                        categories: [
                            ...summary.categories,
                            {
                                activityCents: 0,
                                assignedCents: 0,
                                attentionStates: [],
                                availableCents: 0,
                                carriedForwardCents: 0,
                                categoryId: "buffer",
                                name: "Buffer",
                                reducedByOverspending: false,
                            },
                        ],
                    }}
                />
            </WorkspaceStoreProvider>,
        );

        await waitFor(() =>
            expect(screen.queryByText("Groceries")).not.toBeInTheDocument(),
        );
        expect(screen.getByText("Buffer")).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", {
                name: "Hide all budget category groups",
            }),
        );

        expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
        expect(screen.queryByText("Electric")).not.toBeInTheDocument();
        expect(screen.queryByText("Rent")).not.toBeInTheDocument();
        expect(screen.queryByText("Buffer")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: "Show all budget category groups",
            }),
        ).toHaveAttribute("aria-expanded", "false");

        await user.click(
            screen.getByRole("button", {
                name: "Show all budget category groups",
            }),
        );

        expect(screen.getByText("Groceries")).toBeInTheDocument();
        expect(screen.getByText("Electric")).toBeInTheDocument();
        expect(screen.getByText("Rent")).toBeInTheDocument();
        expect(screen.getByText("Buffer")).toBeInTheDocument();
    });

    it("refreshes assigned inputs across three consecutive months", () => {
        const { rerender } = render(
            <BudgetTable summary={createBudgetSummary("2026-05", 1_500)} />,
        );

        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$15.00");
        expect(getAssignedAmountButton("Travel").className).toContain(
            "justify-end",
        );

        rerender(
            <BudgetTable summary={createBudgetSummary("2026-06", 2_500)} />,
        );

        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$25.00");

        rerender(
            <BudgetTable summary={createBudgetSummary("2026-07", 3_500)} />,
        );

        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$35.00");
    });

    it("discards unsaved drafts when the selected month changes", async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <BudgetTable summary={createBudgetSummary("2026-05", 1_500)} />,
        );

        await user.click(getAssignedAmountButton("Travel"));

        const assignedInput = screen.getByLabelText(
            "Assigned amount for Travel",
        );

        await user.clear(assignedInput);
        await user.type(assignedInput, "99.00");

        expect(screen.getByLabelText("Assigned amount for Travel")).toHaveValue(
            "99.00",
        );

        rerender(
            <BudgetTable summary={createBudgetSummary("2026-06", 2_500)} />,
        );

        expect(
            screen.queryByLabelText("Assigned amount for Travel"),
        ).not.toBeInTheDocument();
        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$25.00");
    });

    it("renders carry-forward-derived values for an untouched future month", () => {
        render(
            <BudgetTable summary={createBudgetSummary("2026-08", 0, false)} />,
        );

        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$0.00");
        expect(within(getBudgetRow("Travel")).getByText("-$7.50"))
            .toBeInTheDocument();
        expect(screen.queryByText("Carry forward")).not.toBeInTheDocument();
    });

    it("updates the rendered assigned value when navigating between derived and saved months", () => {
        const { rerender } = render(
            <BudgetTable summary={createBudgetSummary("2026-08", 0, false)} />,
        );

        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$0.00");

        rerender(
            <BudgetTable summary={createBudgetSummary("2026-09", 3_500)} />,
        );

        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$35.00");

        rerender(
            <BudgetTable summary={createBudgetSummary("2026-10", 1_250)} />,
        );

        expect(getAssignedAmountButton("Travel")).toHaveTextContent("$12.50");
    });
});
