import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    CategoryDetailReportWorkspace,
    CategoryTrackingReportWorkspace,
    ReportingWorkspace,
} from "@/components/workspace/workspace-views";
import { CategoryTrackingChart } from "@/components/reporting/category-tracking-chart";
import { CategoryTrackingReport } from "@/components/reporting/category-tracking-report";
import { WorkspaceStoreProvider } from "@/components/workspace/workspace-store-provider";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

vi.mock("next/navigation", () => ({
    usePathname: () => "/reporting/category-detail",
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

const timestamp = "2026-01-01T00:00:00.000Z";
const ledgerId = "ledger-1";

function makeWorkspaceSnapshot(
    overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
    return {
        accounts: [],
        activeLedgerId: ledgerId,
        activeLedgerName: "Ledger",
        allocationFundingSources: [],
        budgetAllocations: [],
        budgetCategories: [
            {
                categoryId: "food",
                createdAt: timestamp,
                defaultAssignedCents: 0,
                groupId: "monthly",
                isIncomeCategory: false,
                ledgerAccountId: "cat_food",
                name: "Food",
                sortOrder: 0,
                status: "active",
                updatedAt: timestamp,
                ledgerId,
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
                ledgerId,
            },
        ],
        budgetPeriods: [
            {
                availableToBudgetCents: 0,
                createdAt: timestamp,
                currency: "USD",
                endsOn: "2026-01-31",
                periodId: "2026-01",
                startsOn: "2026-01-01",
                status: "open",
                updatedAt: timestamp,
                ledgerId,
            },
        ],
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: ledgerId,
            changeCursor: "",
            entityCounts: {
                account: 1,
                allocationFundingSource: 0,
                budgetCategory: 1,
                budgetGroup: 1,
                budgetPeriod: 1,
                categoryAllocation: 1,
                ledger: 1,
                ledgerPosting: 1,
                plaidAccountLink: 0,
                plaidTransactionSync: 0,
                transaction: 1,
                transactionLine: 1,
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
                ledgerId,
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

async function selectComboboxOption(
    user: ReturnType<typeof userEvent.setup>,
    combobox: HTMLElement,
    optionLabel: string,
) {
    await user.click(combobox);
    await user.clear(combobox);
    await user.type(combobox, optionLabel);
    await user.keyboard("{Enter}");
}

describe("category detail reporting", () => {
    beforeEach(() => {
        window.history.replaceState(null, "", "/reporting/category-tracking");
        vi.clearAllMocks();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers(),
                json: async () => ({}),
            }),
        );
    });

    it("renders the reporting chooser with a category detail report link", () => {
        render(<ReportingWorkspace />);

        const link = screen.getByRole("link", { name: /category detail/i });
        const trackingLink = screen.getByRole("link", {
            name: /category tracking/i,
        });

        expect(
            screen.getByRole("list", { name: "Reports" }),
        ).toBeInTheDocument();
        expect(link).toHaveAttribute("data-pane-list-item", "true");
        expect(link).toHaveClass("min-h-24", "gap-4", "p-5");
        expect(link).toHaveAttribute("href", "/reporting/category-detail");
        expect(trackingLink).toHaveAttribute(
            "href",
            "/reporting/category-tracking",
        );
        expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument();
    });

    it("renders yearly category tracking with the shared chooser and a zero line", async () => {
        const user = userEvent.setup();
        const transactionLine = {
            amountCents: 6_000,
            categoryId: "food",
            createdAt: timestamp,
            fromAccountId: "checking",
            lineId: "line-food",
            memo: "Weekly run",
            payee: "Market",
            sortOrder: 0,
            transactionId: "transaction-food",
            updatedAt: timestamp,
            ledgerId,
        };
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 4_000,
                    createdAt: timestamp,
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 10_000,
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "allocation-food",
                    assignedCents: 5_000,
                    categoryId: "food",
                    periodId: "2026-01",
                    updatedAt: timestamp,
                    ledgerId,
                },
                {
                    allocationId: "allocation-travel",
                    assignedCents: 2_500,
                    categoryId: "travel",
                    periodId: "2026-01",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            budgetCategories: [
                ...makeWorkspaceSnapshot().budgetCategories,
                {
                    categoryId: "travel",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "monthly",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_travel",
                    name: "Travel",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            transactionLines: [transactionLine],
            transactions: [
                {
                    displayAmountCents: -6_000,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [transactionLine],
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    payee: "Market",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-food",
                    updatedAt: timestamp,
                },
            ],
        });

        const renderReport = () => (
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <CategoryTrackingReportWorkspace />
            </WorkspaceStoreProvider>
        );
        const { rerender } = render(renderReport());

        expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
            "Food",
        );
        expect(screen.getByLabelText("Year")).toHaveValue("2026");
        expect(
            screen.getByRole("heading", {
                name: "Category balance for 2026",
            }),
        ).toBeInTheDocument();
        expect(screen.getByText("Category balance")).toBeInTheDocument();
        expect(
            screen.getByRole("img", {
                name: /Food category balance during 2026/i,
            }),
        ).toBeInTheDocument();
        expect(screen.getAllByText("Available")).toHaveLength(2);
        expect(screen.getByText("Overspent")).toBeInTheDocument();
        expect(screen.queryByText("Opening available")).not.toBeInTheDocument();
        expect(screen.queryByText("Year-end available")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Show trends" }),
        ).toHaveAttribute("aria-pressed", "false");
        expect(
            screen
                .getByRole("button", { name: "Show trends" })
                .querySelector('[data-icon="eye"]'),
        ).not.toBeNull();
        expect(
            screen.getByTestId("category-tracking-zero-line"),
        ).toBeInTheDocument();
        expect(screen.getAllByText("-$10.00").length).toBeGreaterThan(0);

        await user.click(
            screen.getByRole("button", { name: "Show trends" }),
        );

        expect(
            screen.getByRole("button", { name: "Hide trends" }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(
            screen
                .getByRole("button", { name: "Hide trends" })
                .querySelector('[data-icon="eye-slash"]'),
        ).not.toBeNull();

        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Travel",
        );
        rerender(renderReport());

        expect(
            screen.getByRole("img", {
                name: /Travel category balance during 2026/i,
            }),
        ).toBeInTheDocument();
        expect(window.location.search).toBe("?category=travel");
    });

    it("selects the linked category from the query parameter", () => {
        window.history.replaceState(
            null,
            "",
            "/reporting/category-tracking?category=travel",
        );
        const snapshot = makeWorkspaceSnapshot({
            budgetCategories: [
                ...makeWorkspaceSnapshot().budgetCategories,
                {
                    categoryId: "travel",
                    createdAt: timestamp,
                    defaultAssignedCents: 0,
                    groupId: "monthly",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_travel",
                    name: "Travel",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
        });

        render(<CategoryTrackingReport snapshot={snapshot} />);

        expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
            "Travel",
        );
        expect(
            screen.getByRole("img", {
                name: /Travel category balance during 2026/i,
            }),
        ).toBeInTheDocument();
    });

    it("shows exact transaction and smoothed trend details without trend dots", async () => {
        const user = userEvent.setup();

        const { container } = render(
            <CategoryTrackingChart
                view={{
                    allocationTotalCents: 0,
                    categoryOptions: [],
                    endingAvailableCents: -300,
                    openingAvailableCents: 0,
                    points: [
                        {
                            amountCents: 0,
                            availableCents: 0,
                            date: "2026-01-01",
                            pointId: "opening",
                            type: "opening",
                        },
                        {
                            amountCents: -100,
                            availableCents: -100,
                            date: "2026-01-15",
                            description: "First purchase",
                            pointId: "first-transaction",
                            type: "transaction",
                        },
                        {
                            amountCents: -200,
                            availableCents: -300,
                            date: "2026-01-15",
                            description: "Second purchase",
                            pointId: "second-transaction",
                            type: "transaction",
                        },
                    ],
                    selectedCategoryId: "food",
                    selectedCategoryName: "Food",
                    selectedYear: "2026",
                    transactionTotalCents: -300,
                    yearOptions: ["2026"],
                }}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Show trends" }));

        expect(screen.getByText("Smoothed trend")).toBeInTheDocument();
        expect(screen.getByText("Start month value")).toBeInTheDocument();
        expect(screen.getByText("End month value")).toBeInTheDocument();

        const secondTransaction = screen.getByLabelText(
            /Transaction on 2026-01-15, Second purchase/,
        );

        await user.hover(secondTransaction);

        expect(
            within(screen.getByRole("tooltip")).getByText("Second purchase"),
        ).toBeInTheDocument();

        await user.unhover(secondTransaction);

        const trendLine = container.querySelector<SVGPathElement>(
            ".recharts-line-curve",
        );

        expect(trendLine).not.toBeNull();
        expect(container.querySelector(".recharts-line-dots")).toBeNull();
        expect(
            container.querySelectorAll(".recharts-line-curve"),
        ).toHaveLength(6);
        expect(
            container.querySelectorAll(
                '.recharts-line-curve[stroke-opacity="0.35"]',
            ),
        ).toHaveLength(3);
        expect(
            container.querySelectorAll(
                '.recharts-line-curve[stroke-width="5"]',
            ),
        ).toHaveLength(6);
        expect(
            container.querySelectorAll(
                '.recharts-line-curve[stroke="var(--color-chart-trend-month-end)"]',
            ),
        ).toHaveLength(2);

        vi.spyOn(trendLine!, "getBoundingClientRect").mockReturnValue({
            bottom: 200,
            height: 100,
            left: 100,
            right: 800,
            toJSON: () => ({}),
            top: 100,
            width: 700,
            x: 100,
            y: 100,
        });
        fireEvent.mouseMove(trendLine!, { clientX: 450 });

        expect(
            within(screen.getByRole("tooltip")).getByText("Smoothed trend"),
        ).toBeInTheDocument();

        const projectedTrendLine = container.querySelectorAll<SVGPathElement>(
            ".recharts-line-curve",
        )[1]!;
        vi.spyOn(
            projectedTrendLine,
            "getBoundingClientRect",
        ).mockReturnValue({
            bottom: 200,
            height: 100,
            left: 100,
            right: 800,
            toJSON: () => ({}),
            top: 100,
            width: 700,
            x: 100,
            y: 100,
        });
        fireEvent.mouseMove(projectedTrendLine, { clientX: 800 });

        expect(
            within(screen.getByRole("tooltip")).getByText(
                "Smoothed trend projection",
            ),
        ).toBeInTheDocument();

        const balanceLine = container.querySelector<SVGPathElement>(
            ".recharts-area-curve",
        );
        const plot = screen.getByTestId("category-tracking-plot");

        expect(balanceLine).not.toBeNull();
        fireEvent.mouseEnter(
            screen.getByLabelText(
                /Transaction on 2026-01-15, Second purchase/,
            ),
        );

        expect(
            within(screen.getByRole("tooltip")).getByText("Second purchase"),
        ).toBeInTheDocument();

        vi.spyOn(
            container.querySelector<SVGPathElement>(".recharts-area-curve")!,
            "getBoundingClientRect",
        ).mockReturnValue({
            bottom: 300,
            height: 200,
            left: 100,
            right: 600,
            toJSON: () => ({}),
            top: 100,
            width: 500,
            x: 100,
            y: 100,
        });

        fireEvent.mouseMove(plot, { clientX: 700 });

        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("renders category detail rows and switches categories with the shared combobox", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 8_800,
                    createdAt: timestamp,
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 10_000,
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "allocation-food",
                    assignedCents: 5_000,
                    categoryId: "food",
                    periodId: "2026-01",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            ledgerPostings: [
                {
                    amountCents: 1_200,
                    createdAt: timestamp,
                    direction: "credit",
                    ledgerAccountId: "acct_checking",
                    ledgerAccountKind: "financial",
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    periodId: "2026-01",
                    postingId: "posting-food",
                    transactionId: "transaction-food",
                    ledgerId,
                },
            ],
            transactionImportActivities: [{
                activityId: "amazon:payment-1",
                createdAt: timestamp,
                detailsJson: JSON.stringify({
                    itemSummary: "Pantry staples",
                    orderNumber: "111-222",
                    paymentKind: "charge",
                }),
                detailsVersion: 2,
                direction: "outflow",
                financialFingerprint: "amazon-fingerprint",
                ledgerId,
                linkedTransactionId: "transaction-food",
                occurredDate: "2026-01-15",
                provider: "amazon",
                providerAmountCents: -1_200,
                providerRecordId: "payment-1",
                state: "manualMatched",
                updatedAt: timestamp,
            }],
            transactionLines: [
                {
                    amountCents: 1_200,
                    categoryId: "food",
                    createdAt: timestamp,
                    fromAccountId: "checking",
                    lineId: "line-food",
                    memo: "Weekly run",
                    payee: "Market",
                    sortOrder: 0,
                    transactionId: "transaction-food",
                    updatedAt: timestamp,
                    ledgerId,
                },
            ],
            transactions: [
                {
                    displayAmountCents: -1_200,
                    enteredAt: timestamp,
                    kind: "standard",
                    ledgerId,
                    lines: [
                        {
                            amountCents: 1_200,
                            categoryId: "food",
                            createdAt: timestamp,
                            fromAccountId: "checking",
                            lineId: "line-food",
                            memo: "Weekly run",
                            payee: "Market",
                            sortOrder: 0,
                            transactionId: "transaction-food",
                            updatedAt: timestamp,
                            ledgerId,
                        },
                    ],
                    occurredAt: "2026-01-15T00:00:00.000Z",
                    importActivities: [{
                        activityId: "amazon:payment-1",
                        createdAt: timestamp,
                        detailsJson: JSON.stringify({
                            itemSummary: "Pantry staples",
                            orderNumber: "111-222",
                            paymentKind: "charge",
                        }),
                        detailsVersion: 2,
                        direction: "outflow",
                        financialFingerprint: "amazon-fingerprint",
                        ledgerId,
                        linkedTransactionId: "transaction-food",
                        occurredDate: "2026-01-15",
                        provider: "amazon",
                        providerAmountCents: -1_200,
                        providerRecordId: "payment-1",
                        state: "manualMatched",
                        updatedAt: timestamp,
                    }],
                    payee: "Market",
                    periodId: "2026-01",
                    postings: [],
                    referenceAccountId: "checking",
                    source: "manual",
                    status: "entered",
                    transactionId: "transaction-food",
                    updatedAt: timestamp,
                },
            ],
        });

        const { container } = render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <CategoryDetailReportWorkspace />
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
            "",
        );
        expect(
            screen.getByText("Choose a category to view its activity."),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Net assigned allocations"),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Opening balance")).not.toBeInTheDocument();

        await user.click(screen.getByRole("combobox", { name: "Category" }));

        expect(screen.queryByRole("option", { name: "Unassigned" })).toBeNull();
        await user.keyboard("{Escape}");

        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Food",
        );

        const rows = screen.getAllByRole("row");
        expect(screen.getByText("Date").closest("thead")?.className).toContain(
            "sticky",
        );
        expect(within(rows[1]).getByText("Allocation")).toBeInTheDocument();
        expect(within(rows[2]).getByText("Transaction")).toBeInTheDocument();
        expect(rows[1].querySelector('[data-icon="right-left"]')).not.toBeNull();
        expect(
            rows[2].querySelector('[data-icon="money-bill-wave"]'),
        ).not.toBeNull();
        expect(container.querySelectorAll('[data-icon="money-bill-wave"]').length)
            .toBeGreaterThan(0);
        expect(screen.getByText("Market")).toBeInTheDocument();
        expect(screen.getByText("Weekly run")).toBeInTheDocument();
        expect(screen.getByText("Pantry staples")).toBeInTheDocument();
        expect(screen.getByText("111-222")).toHaveClass("font-mono");
        expect(screen.getAllByText("$38.00").length).toBeGreaterThan(0);
    });

    it("shows all activity by default and supports compact month and year filters", async () => {
        const user = userEvent.setup();

        render(
            <WorkspaceStoreProvider initialSnapshot={makeWorkspaceSnapshot()}>
                <CategoryDetailReportWorkspace />
            </WorkspaceStoreProvider>,
        );

        expect(screen.queryByText("Filter:")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Filter" }));

        expect(screen.getByLabelText("Range")).toHaveValue("all");
        expect(screen.queryByLabelText("Month")).not.toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText("Range"), "month");

        expect(screen.getByLabelText("Month")).toHaveValue("2026-01");

        await user.selectOptions(screen.getByLabelText("Range"), "year");

        expect(screen.getByLabelText("Year")).toHaveValue(2026);
    });
});
