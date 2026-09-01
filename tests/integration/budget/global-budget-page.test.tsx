import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    resolveBudgetPeriodQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/budget",
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams("month=2026-05"),
}));

vi.mock("@/features/budget/models/budget-period-query", () => ({
    resolveBudgetPeriodQuery: mocks.resolveBudgetPeriodQuery,
}));

import BudgetPage from "@/app/(dashboard)/budget/page";
import GlobalBudgetPage from "@/app/(dashboard)/global-budget/page";
import { BudgetTable } from "@/components/budget/budget-table";
import {
    WorkspaceStoreProvider,
    useWorkspaceStore,
} from "@/components/workspace/workspace-store-provider";
import type {
    WorkspaceBudgetCategoryRecord,
    WorkspaceBudgetGroupRecord,
    WorkspaceCategoryAllocationRecord,
    WorkspaceEntityCounts,
    WorkspaceSnapshot,
} from "@/lib/workspace/sync-types";

const generatedAt = "2026-05-01T00:00:00.000Z";
const entityCounts: WorkspaceEntityCounts = {
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
};

function buildWorkspaceSnapshot(input?: {
    budgetAllocations?: WorkspaceCategoryAllocationRecord[];
    budgetCategories?: WorkspaceBudgetCategoryRecord[];
    budgetGroups?: WorkspaceBudgetGroupRecord[];
}) {
    const budgetAllocations = input?.budgetAllocations ?? [];
    const budgetCategories = input?.budgetCategories ?? [];
    const budgetGroups = input?.budgetGroups ?? [];

    return {
        accounts: [],
        activeLedgerId: "ledger-1",
        activeLedgerName: "2026",
        allocationFundingSources: [],
        budgetAllocations,
        budgetCategories,
        budgetGroups,
        budgetPeriods: [],
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: "ledger-1",
            changeCursor: "change-1",
            entityCounts: {
                ...entityCounts,
                budgetCategory: budgetCategories.length,
                budgetGroup: budgetGroups.length,
                categoryAllocation: budgetAllocations.length,
            },
            generatedAt,
            retainedChangesAfter: "2026-04-01T00:00:00.000Z",
            revision: `test-${budgetCategories.length}`,
        },
        ledgerPostings: [],
        ledgers: [
            {
                createdAt: generatedAt,
                isDefault: false,
                ledgerId: "ledger-1",
                workspaceId: "global",
                name: "2026",
                status: "active",
                updatedAt: generatedAt,
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [],
    } satisfies WorkspaceSnapshot;
}

function WorkspaceBudgetTable() {
    const { snapshot } = useWorkspaceStore();
    const categories = snapshot.budgetCategories.map((category) => {
        const allocation = snapshot.budgetAllocations.find(
            (candidate) => candidate.categoryId === category.categoryId,
        );

        return {
            activityCents: 0,
            assignedCents: allocation?.assignedCents ?? 0,
            attentionStates: [],
            availableCents: allocation?.assignedCents ?? 0,
            carriedForwardCents: 0,
            categoryId: category.categoryId,
            defaultAssignedCents: category.defaultAssignedCents,
            isIncomeCategory: category.isIncomeCategory,
            name: category.name,
            reducedByOverspending: false,
        };
    });

    return (
        <BudgetTable
            summary={{
                activeAccountCount: 1,
                allocationDifferenceCents: 0,
                allocationFundingCents: categories.reduce(
                    (total, category) => total + category.assignedCents,
                    0,
                ),
                allocationFundingRows: [],
                assignedAllocationTotalCents: categories.reduce(
                    (total, category) => total + category.assignedCents,
                    0,
                ),
                attentionStates: [],
                availableToBudgetCents: 10_000,
                carryForwardSummaries: [],
                categories,
                fundingReconciliationCents: 10_000,
                hasSavedAssignments: true,
                periodId: "2026-05",
                status: "open",
            }}
        />
    );
}

describe("budget plan page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveBudgetPeriodQuery.mockResolvedValue({
            isFallback: false,
            label: "May, 2026",
            normalizedPeriodId: "2026-05",
            source: "query",
        });
    });

    it("renders reusable setup controls on the Budget Plan route without month navigation", async () => {
        const user = userEvent.setup();
        const snapshot = buildWorkspaceSnapshot({
            budgetGroups: [
                {
                    createdAt: generatedAt,
                    groupId: "essentials",
                    name: "Essentials",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: generatedAt,
                    ledgerId: "ledger-1",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: generatedAt,
                    defaultAssignedCents: 6_500,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "category-groceries",
                    name: "Groceries",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: generatedAt,
                    ledgerId: "ledger-1",
                },
            ],
        });

        render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <GlobalBudgetPage />
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByText("Budget Plan")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Add category" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Save budget plan" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Active period")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Add category" }));

        const categoryNameInput =
            await screen.findByLabelText("Category name");
        await waitFor(() => expect(categoryNameInput).toHaveFocus());
    });

    it("keeps the Budget route focused on the selected month without requiring accounts", async () => {
        render(
            <WorkspaceStoreProvider initialSnapshot={buildWorkspaceSnapshot()}>
                {await BudgetPage({ searchParams: { month: "2026-05" } })}
            </WorkspaceStoreProvider>,
        );

        expect(screen.getByText("Monthly Budget")).toBeInTheDocument();
        expect(screen.getByText("Active period")).toBeInTheDocument();
        expect(
            screen.queryByText("No assignments saved for this month yet."),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
        expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
        expect(
            screen.getByRole("columnheader", { name: "Assigned" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("columnheader", { name: "Activity" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Add category" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Save budget plan" }),
        ).not.toBeInTheDocument();
    });

    it("optimistically exits allocation editing and updates the assigned amount", async () => {
        const user = userEvent.setup();
        const snapshot = buildWorkspaceSnapshot({
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: generatedAt,
                    defaultAssignedCents: 6_500,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "category-groceries",
                    name: "Groceries",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: generatedAt,
                    ledgerId: "ledger-1",
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "2026-05:groceries",
                    assignedCents: 2_500,
                    categoryId: "groceries",
                    periodId: "2026-05",
                    updatedAt: generatedAt,
                    ledgerId: "ledger-1",
                },
            ],
        });

        vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

        render(
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <WorkspaceBudgetTable />
            </WorkspaceStoreProvider>,
        );

        await user.click(
            screen.getByRole("button", {
                name: "Edit assigned amount for Groceries",
            }),
        );
        await user.clear(screen.getByLabelText("Assigned amount for Groceries"));
        await user.type(
            screen.getByLabelText("Assigned amount for Groceries"),
            "40.00",
        );
        await user.click(
            screen.getByRole("button", { name: "Save allocations" }),
        );

        expect(
            screen.queryByLabelText("Assigned amount for Groceries"),
        ).not.toBeInTheDocument();
        expect(screen.getAllByText("$40.00").length).toBeGreaterThan(0);
        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/budget/periods/2026-05/allocations",
                expect.objectContaining({ method: "PUT" }),
            ),
        );
    });
});
