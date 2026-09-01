import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createIntegrationCommittedWorkspaceMutationResponse,
    createIntegrationWorkspaceMutationResponse,
    withIntegrationWorkspaceKnowledge,
} from "./helpers/workspace-mutation-response";

const mocks = vi.hoisted(() => ({
    refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/budget",
    useRouter: () => ({ refresh: mocks.refresh }),
}));

import { BudgetTable } from "@/components/budget/budget-table";
import { GlobalPlanEditor } from "@/components/budget/global-plan-editor";
import { FeedbackToastProvider } from "@/components/shared/feedback-toast-provider";
import {
    WorkspaceStoreProvider,
    useWorkspaceStore,
} from "@/components/workspace/workspace-store-provider";
import { buildBudgetPeriodSummaryFromSnapshot } from "@/lib/workspace/budget-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

function renderWithFeedback(ui: ReactElement) {
    return render(<FeedbackToastProvider>{ui}</FeedbackToastProvider>);
}

function makeWorkspaceSnapshot(
    overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
    return withIntegrationWorkspaceKnowledge({
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
            generatedAt: "2026-05-01T00:00:00.000Z",
            retainedChangesAfter: "2026-04-01T00:00:00.000Z",
            revision: "test-revision",
        },
        ledgerPostings: [],
        ledgers: [
            {
                createdAt: "2026-05-01T00:00:00.000Z",
                isDefault: true,
                ledgerId: "ledger-1",
                name: "Ledger",
                status: "active",
                updatedAt: "2026-05-01T00:00:00.000Z",
                workspaceId: "global",
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [],
        ...overrides,
    });
}

function WorkspaceBudgetTable({ periodId }: { periodId: string }) {
    const { snapshot } = useWorkspaceStore();

    return (
        <BudgetTable
            summary={buildBudgetPeriodSummaryFromSnapshot(snapshot, periodId)}
        />
    );
}

function renderBudgetWithWorkspace(snapshot: WorkspaceSnapshot, periodId: string) {
    return renderWithFeedback(
        <WorkspaceStoreProvider initialSnapshot={snapshot}>
            <WorkspaceBudgetTable periodId={periodId} />
        </WorkspaceStoreProvider>,
    );
}

function mockWorkspaceFetch(input: {
    deleteResponse?: Response;
    refreshSnapshot?: WorkspaceSnapshot;
    snapshot: WorkspaceSnapshot;
}) {
    let didDeleteAllocations = false;

    vi.stubGlobal(
        "fetch",
        vi.fn((resource: RequestInfo | URL, init?: RequestInit) => {
            const url = String(resource);

            if (url === "/api/workspace/knowledge") {
                return Promise.resolve(
                    new Response(JSON.stringify(input.snapshot.knowledge), {
                        status: 200,
                    }),
                );
            }

            if (url === "/api/workspace/snapshot") {
                return Promise.resolve(
                    new Response(
                        JSON.stringify(
                            didDeleteAllocations
                                ? (input.refreshSnapshot ?? input.snapshot)
                                : input.snapshot,
                        ),
                        {
                            status: 200,
                        },
                    ),
                );
            }

            if (url === "/api/budget/periods/2026-05/allocations") {
                didDeleteAllocations = true;

                if (init?.method === "DELETE" && !input.deleteResponse) {
                    const changes = [
                        ...input.snapshot.budgetAllocations
                            .filter((record) => record.periodId === "2026-05")
                            .map((record) => ({
                                batchId: "allocation-reset",
                                changedAt: "2026-05-02T00:00:00.000Z",
                                changeId: `delete:${record.allocationId}`,
                                entityId: record.allocationId,
                                entityType: "categoryAllocation" as const,
                                expiresAt: 1_780_000_000,
                                operation: "delete" as const,
                                record: null,
                            })),
                        ...input.snapshot.allocationFundingSources
                            .filter((record) => record.periodId === "2026-05")
                            .map((record) => ({
                                batchId: "allocation-reset",
                                changedAt: "2026-05-02T00:00:00.000Z",
                                changeId: `delete:${record.fundingSourceId}`,
                                entityId: record.fundingSourceId,
                                entityType: "allocationFundingSource" as const,
                                expiresAt: 1_780_000_000,
                                operation: "delete" as const,
                                record: null,
                            })),
                    ];

                    return Promise.resolve(
                        new Response(
                            JSON.stringify(
                                createIntegrationCommittedWorkspaceMutationResponse(
                                    {
                                        changes,
                                        currentSnapshot: input.snapshot,
                                    },
                                ),
                            ),
                            { status: 200 },
                        ),
                    );
                }

                return Promise.resolve(
                    input.deleteResponse ??
                        new Response(
                            JSON.stringify(
                                createIntegrationWorkspaceMutationResponse({
                                    snapshot: input.snapshot,
                                }),
                            ),
                            { status: 200 },
                        ),
                );
            }

            return Promise.resolve(
                new Response(JSON.stringify({}), { status: 200 }),
            );
        }),
    );
}

function makeAssignedBudgetSnapshot() {
    return makeWorkspaceSnapshot({
        accounts: [
            {
                accountId: "checking",
                accountType: "checking",
                balanceCents: 10_000,
                createdAt: "2026-05-01T00:00:00.000Z",
                ledgerAccountId: "acct_checking",
                name: "Checking",
                openedOn: "2026-01-01",
                openingBalanceCents: 10_000,
                updatedAt: "2026-05-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        allocationFundingSources: [
            {
                allocationId: "2026-05:groceries",
                amountCents: 1_500,
                categoryId: "groceries",
                createdAt: "2026-05-01T00:00:00.000Z",
                fundingSourceId: "funding-1",
                ledgerId: "ledger-1",
                periodId: "2026-05",
                sourceId: "buffer",
                sourceType: "incomeCategory",
                updatedAt: "2026-05-01T00:00:00.000Z",
            },
        ],
        budgetAllocations: [
            {
                allocationId: "2026-05:groceries",
                assignedCents: 5_000,
                categoryId: "groceries",
                ledgerId: "ledger-1",
                periodId: "2026-05",
                updatedAt: "2026-05-01T00:00:00.000Z",
            },
        ],
        budgetCategories: [
            {
                categoryId: "groceries",
                createdAt: "2026-05-01T00:00:00.000Z",
                defaultAssignedCents: 5_000,
                groupId: "essentials",
                isIncomeCategory: false,
                ledgerAccountId: "cat_groceries",
                name: "Groceries",
                sortOrder: 0,
                status: "active",
                updatedAt: "2026-05-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                autoAssignSourceEnabled: true,
                autoAssignSourceSortOrder: 0,
                categoryId: "buffer",
                createdAt: "2026-05-01T00:00:00.000Z",
                defaultAssignedCents: 0,
                groupId: "essentials",
                isIncomeCategory: false,
                ledgerAccountId: "cat_buffer",
                name: "Buffer",
                sortOrder: 1,
                status: "active",
                updatedAt: "2026-05-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        budgetGroups: [
            {
                createdAt: "2026-05-01T00:00:00.000Z",
                groupId: "essentials",
                ledgerId: "ledger-1",
                name: "Essentials",
                sortOrder: 0,
                status: "active",
                updatedAt: "2026-05-01T00:00:00.000Z",
            },
        ],
        budgetPeriods: [
            {
                availableToBudgetCents: 5_000,
                carryForwardFromPeriodId: "2026-04",
                createdAt: "2026-05-01T00:00:00.000Z",
                currency: "USD",
                endsOn: "2026-05-31",
                ledgerId: "ledger-1",
                periodId: "2026-05",
                startsOn: "2026-05-01",
                status: "open",
                updatedAt: "2026-05-01T00:00:00.000Z",
            },
        ],
    });
}

describe("budget mutation feedback", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () =>
                    createIntegrationWorkspaceMutationResponse(),
            }),
        );
    });

    it("surfaces saved feedback after creating a category", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <GlobalPlanEditor
                groups={[
                    {
                        groupId: "everyday",
                        name: "Everyday",
                        sortOrder: 0,
                        status: "active",
                    },
                ]}
                categories={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Add category" }));
        await user.type(screen.getByLabelText("Category name"), "Groceries");
        await user.click(screen.getByRole("button", { name: "Save category" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        expect(fetch).toHaveBeenCalledWith(
            "/api/budget/categories",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    groupId: "everyday",
                    name: "Groceries",
                    status: "active",
                }),
            }),
        );
        expect(screen.queryByLabelText("Kind")).not.toBeInTheDocument();
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(screen.queryByText("Category saved.")).not.toBeInTheDocument();
        expect(
            screen.queryByText(
                "The category was committed. The latest saved budget structure is now available across the workspace.",
            ),
        ).not.toBeInTheDocument();
    });

    it("collapses and expands budget plan groups from their headers", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <GlobalPlanEditor
                groups={[
                    {
                        groupId: "essentials",
                        name: "Essentials",
                        sortOrder: 0,
                        status: "active",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        defaultAssignedCents: 6_500,
                        groupId: "essentials",
                        isIncomeCategory: false,
                        name: "Groceries",
                        sortOrder: 0,
                        status: "active",
                    },
                ]}
            />,
        );

        const collapseButton = screen.getByRole("button", {
            name: "Collapse Essentials",
        });
        expect(collapseButton).toHaveAttribute("aria-expanded", "true");
        expect(collapseButton.querySelector("svg")).toHaveClass("text-base");
        expect(screen.getByText("Groceries")).toBeInTheDocument();

        await user.click(collapseButton);

        const expandButton = screen.getByRole("button", {
            name: "Expand Essentials",
        });
        expect(expandButton).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("Groceries")).not.toBeInTheDocument();

        await user.click(expandButton);

        expect(
            screen.getByRole("button", { name: "Collapse Essentials" }),
        ).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("Groceries")).toBeInTheDocument();
    });

    it("saves budget plan category edits from the modal and bulk schedule actions", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <GlobalPlanEditor
                groups={[
                    {
                        groupId: "essentials",
                        name: "Essentials",
                        sortOrder: 0,
                        status: "active",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        defaultAssignedCents: 6_500,
                        groupId: "essentials",
                        isIncomeCategory: false,
                        name: "Groceries",
                        sortOrder: 1,
                        status: "active",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit group" }));
        await user.clear(screen.getByLabelText("Group name"));
        await user.type(screen.getByLabelText("Group name"), "Household");
        await user.click(screen.getByRole("button", { name: "Apply changes" }));
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.clear(screen.getByLabelText("Category name"));
        await user.type(screen.getByLabelText("Category name"), "Food");
        await user.click(screen.getByRole("combobox", { name: "Category type" }));
        await user.click(screen.getByRole("option", { name: "Savings" }));
        await user.click(screen.getByRole("combobox", { name: "Schedule" }));
        await user.click(screen.getByRole("option", { name: "Yearly" }));
        await user.click(screen.getByRole("combobox", { name: "Start month" }));
        await user.click(screen.getByRole("option", { name: "June" }));
        await user.clear(screen.getByLabelText("Amount"));
        await user.type(screen.getByLabelText("Amount"), "75.00");
        await user.click(screen.getByRole("button", { name: "Apply changes" }));
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

        await user.click(
            screen.getByRole("button", {
                name: "Amount for Food",
            }),
        );
        await user.clear(screen.getByLabelText("Amount for Food"));
        await user.type(
            screen.getByLabelText("Amount for Food"),
            "80.00",
        );
        await user.keyboard("{Enter}");

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

        expect(fetch).toHaveBeenLastCalledWith(
            "/api/budget/plan",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    groups: [
                        {
                            groupId: "essentials",
                            name: "Household",
                            sortOrder: 0,
                            status: "active",
                        },
                    ],
                    categories: [
                        {
                            allocationCadence: "yearly",
                            allocationStartMonth: 6,
                            categoryId: "groceries",
                            categoryType: "savings",
                            defaultAssignedCents: 8_000,
                            groupId: "essentials",
                            isIncomeCategory: false,
                            name: "Food",
                            sortOrder: 0,
                        },
                    ],
                }),
            }),
        );

        expect(screen.getByText("Yearly · June")).toBeInTheDocument();
        expect(
            screen.queryByLabelText("Allocation type for Food"),
        ).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Start month for Food")).not.toBeInTheDocument();

        await user.click(screen.getByRole("checkbox", { name: "Select Food" }));
        await user.selectOptions(
            screen.getByLabelText("Schedule actions"),
            "monthly",
        );
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
        expect(fetch).toHaveBeenLastCalledWith(
            "/api/budget/plan",
            expect.objectContaining({
                method: "PUT",
                body: expect.stringContaining(
                    '"allocationCadence":"monthly"',
                ),
            }),
        );
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(screen.getByText("Savings")).toBeInTheDocument();
        expect(
            screen.queryByText("Budget plan saved."),
        ).not.toBeInTheDocument();
    });

    it("keeps category editing separate from reorder mode", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <GlobalPlanEditor
                groups={[
                    {
                        groupId: "essentials",
                        name: "Essentials",
                        sortOrder: 0,
                        status: "active",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        defaultAssignedCents: 6_500,
                        groupId: "essentials",
                        isIncomeCategory: false,
                        name: "Groceries",
                        sortOrder: 0,
                        status: "active",
                    },
                ]}
            />,
        );

        expect(screen.getByRole("button", { name: "Reorder" })).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Drag category Groceries" }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();

        await user.click(screen.getByRole("button", { name: "Reorder" }));

        expect(screen.getByRole("button", { name: "Save order" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Drag category Groceries" }),
        ).toBeVisible();
        expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByRole("button", { name: "Reorder" })).toBeVisible();
        expect(
            screen.queryByRole("button", { name: "Drag category Groceries" }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Reorder" }));
        await user.click(screen.getByRole("button", { name: "Save order" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        expect(fetch).toHaveBeenCalledWith(
            "/api/budget/plan",
            expect.objectContaining({ method: "PUT" }),
        );
        expect(screen.getByRole("button", { name: "Reorder" })).toBeVisible();
    });

    it("selects categories individually, by range, and by group before bulk type updates", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <GlobalPlanEditor
                groups={[
                    {
                        groupId: "essentials",
                        name: "Essentials",
                        sortOrder: 0,
                        status: "active",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        defaultAssignedCents: 6_500,
                        groupId: "essentials",
                        isIncomeCategory: false,
                        name: "Groceries",
                        sortOrder: 0,
                        status: "active",
                    },
                    {
                        categoryId: "household",
                        defaultAssignedCents: 2_000,
                        groupId: "essentials",
                        isIncomeCategory: false,
                        name: "Household",
                        sortOrder: 1,
                        status: "active",
                    },
                    {
                        categoryId: "utilities",
                        defaultAssignedCents: 1_500,
                        groupId: "essentials",
                        isIncomeCategory: false,
                        name: "Utilities",
                        sortOrder: 2,
                        status: "active",
                    },
                ]}
            />,
        );

        await user.click(
            screen.getByRole("checkbox", { name: "Select Groceries" }),
        );
        await user.keyboard("{Meta>}");
        await user.click(
            screen.getByRole("checkbox", { name: "Select Household" }),
        );
        await user.keyboard("{/Meta}");
        await user.keyboard("{Shift>}");
        await user.click(
            screen.getByRole("checkbox", { name: "Select Utilities" }),
        );
        await user.keyboard("{/Shift}");

        expect(
            screen.getByRole("button", { name: "3 categories selected" }),
        ).toBeVisible();

        await user.selectOptions(
            screen.getByLabelText("Category type actions"),
            "savings",
        );

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        const [, request] = vi.mocked(fetch).mock.calls[0];
        const payload = JSON.parse(String(request?.body));

        expect(payload.categories).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    categoryId: "groceries",
                    categoryType: "savings",
                }),
                expect.objectContaining({
                    categoryId: "household",
                    categoryType: "savings",
                }),
                expect.objectContaining({
                    categoryId: "utilities",
                    categoryType: "savings",
                }),
            ]),
        );
        await waitFor(() => {
            expect(
                screen.queryByLabelText("Category type actions"),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText("Schedule actions"),
            ).not.toBeInTheDocument();
        });

        await user.click(
            screen.getByRole("checkbox", {
                name: "Select all categories in Essentials",
            }),
        );
        expect(
            screen.getByRole("button", { name: "3 categories selected" }),
        ).toBeVisible();

        await user.click(
            screen.getByRole("checkbox", {
                name: "Deselect all categories in Essentials",
            }),
        );
        await waitFor(() => {
            expect(
                screen.queryByLabelText("Category type actions"),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText("Schedule actions"),
            ).not.toBeInTheDocument();
        });
    });

    it("keeps the last saved allocation row visible when allocation save fails", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: "allocation_save_failed",
                            message: "Unable to save allocations.",
                        },
                    }),
                    {
                        status: 422,
                        headers: { "content-type": "application/json" },
                    },
                ),
            ),
        );

        renderWithFeedback(
            <BudgetTable
                summary={{
                    activeAccountCount: 1,
                    allocationDifferenceCents: 0,
                    allocationFundingCents: 5_000,
                    allocationFundingRows: [],
                    assignedAllocationTotalCents: 5_000,
                    availableToBudgetCents: 12_500,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 5_000,
                            attentionStates: [],
                            availableCents: 5_000,
                            carriedForwardCents: 0,
                            categoryId: "groceries",
                            name: "Groceries",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    fundingReconciliationCents: 12_500,
                    hasSavedAssignments: true,
                    periodId: "2026-05",
                    status: "open",
                }}
            />,
        );

        await user.click(
            screen.getByRole("button", {
                name: "Edit assigned amount for Groceries",
            }),
        );
        await user.clear(
            screen.getByLabelText("Assigned amount for Groceries"),
        );
        await user.keyboard("{Enter}");

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        await waitFor(() =>
            expect(
                screen.getByText(
                    "Unable to save allocations. Save failed. The latest saved data has been restored.",
                ),
            ).toBeInTheDocument(),
        );
        expect(screen.getAllByText("Groceries").length).toBeGreaterThan(0);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("saves an inline allocation edit when Enter is pressed", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <BudgetTable
                summary={{
                    activeAccountCount: 1,
                    allocationDifferenceCents: 0,
                    allocationFundingCents: 5_000,
                    allocationFundingRows: [],
                    assignedAllocationTotalCents: 5_000,
                    availableToBudgetCents: 12_500,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 5_000,
                            attentionStates: [],
                            availableCents: 5_000,
                            carriedForwardCents: 0,
                            categoryId: "groceries",
                            name: "Groceries",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    fundingReconciliationCents: 12_500,
                    hasSavedAssignments: true,
                    periodId: "2026-05",
                    status: "open",
                }}
            />,
        );

        await user.click(
            screen.getByRole("button", {
                name: "Edit assigned amount for Groceries",
            }),
        );

        const assignedInput = screen.getByLabelText(
            "Assigned amount for Groceries",
        );

        await user.clear(assignedInput);
        await user.type(assignedInput, "65.00");
        await user.keyboard("{Enter}");

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        expect(fetch).toHaveBeenCalledWith(
            "/api/budget/periods/2026-05/allocations",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    allocations: [
                        {
                            categoryId: "groceries",
                            assignedCents: 6_500,
                        },
                    ],
                }),
            }),
        );
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(
            screen.queryByText("Allocations saved."),
        ).not.toBeInTheDocument();
    });

    it("shows monthly allocation details in a modal", async () => {
        const user = userEvent.setup();
        const baseSnapshot = makeAssignedBudgetSnapshot();
        const snapshot = {
            ...baseSnapshot,
            budgetAllocations: [
                ...baseSnapshot.budgetAllocations,
                {
                    activityCents: 0,
                    allocationId: "2026-05:buffer",
                    assignedCents: 1_500,
                    availableCents: 1_500,
                    carriedForwardCents: 0,
                    categoryId: "buffer",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
                {
                    activityCents: 0,
                    allocationId: "2026-05:manual-adjustment",
                    assignedCents: -500,
                    availableCents: -500,
                    carriedForwardCents: 0,
                    categoryId: "manual-adjustment",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        };

        mockWorkspaceFetch({ snapshot });
        renderBudgetWithWorkspace(snapshot, "2026-05");

        await user.click(
            screen.getByRole("button", { name: "Allocation details" }),
        );

        const dialog = screen.getByRole("dialog", {
            name: "Allocation details",
        });

        expect(dialog).toHaveClass(
            "max-h-[calc(100vh-2rem)]",
            "overflow-y-auto",
            "overscroll-contain",
        );
        expect(within(dialog).queryByText("Type")).not.toBeInTheDocument();
        expect(within(dialog).queryByText("Assignment")).not.toBeInTheDocument();
        expect(within(dialog).queryByText("Auto assign")).not.toBeInTheDocument();
        expect(within(dialog).queryByText("->")).not.toBeInTheDocument();
        expect(
            within(dialog)
                .getAllByRole("columnheader")
                .map((header) => header.textContent),
        ).toEqual(["Detail", "Amount"]);

        const rowText = within(dialog)
            .getAllByRole("row")
            .map((row) => row.textContent ?? "");

        expect(rowText.findIndex((text) => text.includes("Funding"))).toBeLessThan(
            rowText.findIndex((text) => text.includes("Allocations")),
        );
        expect(within(dialog).queryByText("Unassigned")).not.toBeInTheDocument();
        expect(within(dialog).getAllByText("Groceries").length).toBeGreaterThan(
            0,
        );
        expect(within(dialog).getAllByText("$50.00").length).toBeGreaterThan(0);
        const fundingGroup = within(dialog)
            .getByText("Funding", { exact: true })
            .closest("tbody");
        const allocationsGroup = within(dialog)
            .getByText("Allocations", { exact: true })
            .closest("tbody");

        expect(fundingGroup).not.toBeNull();
        expect(allocationsGroup).not.toBeNull();
        expect(
            within(fundingGroup as HTMLElement).getByText("Buffer", {
                exact: true,
            }),
        ).toBeInTheDocument();
        expect(
            within(fundingGroup as HTMLElement).queryByText(
                "Buffer for Groceries",
            ),
        ).not.toBeInTheDocument();
        expect(
            within(fundingGroup as HTMLElement).getAllByText("-$15.00"),
        ).toHaveLength(2);
        expect(
            within(allocationsGroup as HTMLElement).queryByText("Buffer", {
                exact: true,
            }),
        ).not.toBeInTheDocument();
        expect(
            within(allocationsGroup as HTMLElement).getByText(
                "manual-adjustment",
            ),
        ).toBeInTheDocument();
        expect(
            within(allocationsGroup as HTMLElement).getByText("-$5.00"),
        ).toBeInTheDocument();
        const fundingSubtotalRow = within(dialog)
            .getAllByRole("row")
            .find((row) => row.textContent?.includes("Funding subtotal"));
        const allocationsSubtotalRow = within(dialog)
            .getAllByRole("row")
            .find((row) => row.textContent?.includes("Allocations subtotal"));

        expect(fundingSubtotalRow).toHaveClass(
            "bg-[var(--tone-info-surface)]/35",
        );
        expect(allocationsSubtotalRow).toHaveClass(
            "bg-[var(--tone-info-surface)]/35",
        );
        expect(within(dialog).getByText("Funding subtotal")).toBeInTheDocument();
        expect(
            within(dialog).getByText("Allocations subtotal"),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText("Allocation amount leftover"),
        ).toBeInTheDocument();
        expect(within(dialog).getByText("-$60.00")).toBeInTheDocument();
    });

    it("optimistically resets monthly allocations from the details modal", async () => {
        const user = userEvent.setup();
        const snapshot = makeAssignedBudgetSnapshot();
        const resetSnapshot = {
            ...snapshot,
            allocationFundingSources: [],
            budgetAllocations: [],
            knowledge: {
                ...snapshot.knowledge,
                revision: "reset-revision",
            },
        };

        mockWorkspaceFetch({ refreshSnapshot: resetSnapshot, snapshot });
        renderBudgetWithWorkspace(snapshot, "2026-05");

        await user.click(
            screen.getByRole("button", { name: "Allocation details" }),
        );
        await user.click(
            within(
                screen.getByRole("dialog", { name: "Allocation details" }),
            ).getByRole("button", { name: "Reset month assignments" }),
        );
        await user.click(
            within(
                screen.getByRole("dialog", { name: "Allocation details" }),
            ).getByRole("button", { name: "Reset month assignments" }),
        );

        expect(
            screen.queryByRole("dialog", { name: "Allocation details" }),
        ).not.toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.queryByRole("button", { name: "Allocation details" }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByRole("button", { name: "Auto assign defaults" }),
        ).toBeInTheDocument();
        const groceriesRow = screen.getByText("Groceries").closest("tr");
        expect(groceriesRow).not.toBeNull();
        expect(within(groceriesRow as HTMLElement).getAllByText("$0.00").length)
            .toBeGreaterThan(0);
        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/budget/periods/2026-05/allocations",
                expect.objectContaining({ method: "DELETE" }),
            ),
        );
        expect(
            screen.queryByText("Month assignments reset."),
        ).not.toBeInTheDocument();
    });

    it("restores monthly allocations and shows an error toast when reset fails", async () => {
        const user = userEvent.setup();
        const snapshot = makeAssignedBudgetSnapshot();

        mockWorkspaceFetch({
            deleteResponse: new Response(
                JSON.stringify({
                    error: {
                        code: "allocation_reset_failed",
                        message: "Unable to reset allocations.",
                    },
                }),
                { status: 500 },
            ),
            snapshot,
        });
        renderBudgetWithWorkspace(snapshot, "2026-05");

        await user.click(
            screen.getByRole("button", { name: "Allocation details" }),
        );
        await user.click(
            within(
                screen.getByRole("dialog", { name: "Allocation details" }),
            ).getByRole("button", { name: "Reset month assignments" }),
        );
        await user.click(
            within(
                screen.getByRole("dialog", { name: "Allocation details" }),
            ).getByRole("button", { name: "Reset month assignments" }),
        );

        expect(
            await screen.findByText(
                "Reset failed. The latest saved data has been restored.",
            ),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "Allocation details" }),
            ).toBeInTheDocument(),
        );
        const groceriesRow = screen.getByText("Groceries").closest("tr");
        expect(groceriesRow).not.toBeNull();
        expect(
            within(groceriesRow as HTMLElement).getAllByText("$50.00").length,
        ).toBeGreaterThan(0);
    });

    it("disables auto assignment when no source categories are configured", () => {
        renderWithFeedback(
            <BudgetTable
                summary={{
                    activeAccountCount: 1,
                    allocationDifferenceCents: 0,
                    allocationFundingCents: 2_500,
                    allocationFundingRows: [],
                    assignedAllocationTotalCents: 2_500,
                    availableToBudgetCents: 1_000,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 2_500,
                            attentionStates: [],
                            availableCents: 2_500,
                            carriedForwardCents: 0,
                            categoryId: "groceries",
                            defaultAssignedCents: 3_000,
                            name: "Groceries",
                            reducedByOverspending: false,
                        },
                        {
                            activityCents: 0,
                            assignedCents: 1_500,
                            attentionStates: [],
                            availableCents: 1_500,
                            carriedForwardCents: 0,
                            categoryId: "utilities",
                            defaultAssignedCents: 2_000,
                            name: "Utilities",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    fundingReconciliationCents: 1_000,
                    hasSavedAssignments: false,
                    periodId: "2026-05",
                    status: "open",
                }}
            />,
        );

        expect(
            screen.getByRole("button", { name: "Auto assign defaults" }),
        ).toBeDisabled();
        expect(
            screen.getByText(
                "Auto assign needs at least one configured source category.",
            ),
        ).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalledWith(
            "/api/budget/periods/2026-05/allocations",
            expect.anything(),
        );
    });

    it("hides auto assignment after monthly assignments have been saved", () => {
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 6_000,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 6_000,
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "2026-05:groceries",
                    assignedCents: 3_000,
                    categoryId: "groceries",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
                {
                    allocationId: "2026-05:utilities",
                    assignedCents: 1_000,
                    categoryId: "utilities",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
                {
                    allocationId: "2026-05:buffer",
                    assignedCents: 2_000,
                    categoryId: "buffer",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 4_000,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "utilities",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 2_000,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_utilities",
                    name: "Utilities",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    autoAssignSourceEnabled: true,
                    autoAssignSourceSortOrder: 0,
                    categoryId: "buffer",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_buffer",
                    name: "Buffer",
                    sortOrder: 2,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetGroups: [
                {
                    createdAt: "2026-05-01T00:00:00.000Z",
                    groupId: "essentials",
                    ledgerId: "ledger-1",
                    name: "Essentials",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
            budgetPeriods: [
                {
                    availableToBudgetCents: 0,
                    carryForwardFromPeriodId: "2026-04",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    currency: "USD",
                    endsOn: "2026-05-31",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    startsOn: "2026-05-01",
                    status: "open",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });

        mockWorkspaceFetch({ snapshot });
        renderBudgetWithWorkspace(snapshot, "2026-05");

        expect(
            screen.queryByRole("button", { name: "Auto assign defaults" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("dialog", {
                name: "Replace saved assignments?",
            }),
        ).not.toBeInTheDocument();
    });

    it("disables auto assignment when source categories cannot cover category defaults", () => {
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 3_000,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 3_000,
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "2026-05:buffer",
                    assignedCents: 1_000,
                    categoryId: "buffer",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 3_000,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    autoAssignSourceEnabled: true,
                    autoAssignSourceSortOrder: 0,
                    categoryId: "buffer",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_buffer",
                    name: "Buffer",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetGroups: [
                {
                    createdAt: "2026-05-01T00:00:00.000Z",
                    groupId: "essentials",
                    ledgerId: "ledger-1",
                    name: "Essentials",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
            budgetPeriods: [
                {
                    availableToBudgetCents: 2_000,
                    carryForwardFromPeriodId: "2026-04",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    currency: "USD",
                    endsOn: "2026-05-31",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    startsOn: "2026-05-01",
                    status: "open",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });

        renderBudgetWithWorkspace(snapshot, "2026-05");

        expect(
            screen.queryByRole("button", { name: "Auto assign defaults" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText((_content, element) => {
                return (
                    element?.tagName.toLowerCase() === "p" &&
                    element.textContent ===
                        "Auto assign needs $20.00 more configured source funds."
                );
            }),
        ).toBeInTheDocument();
    });

    it("auto assigns from configured source categories without using Unassigned", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 4_000,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 4_000,
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "2026-04:buffer",
                    assignedCents: 3_000,
                    categoryId: "buffer",
                    ledgerId: "ledger-1",
                    periodId: "2026-04",
                    updatedAt: "2026-04-01T00:00:00.000Z",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 3_000,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    autoAssignSourceEnabled: true,
                    autoAssignSourceSortOrder: 0,
                    categoryId: "buffer",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 5_000,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_buffer",
                    name: "Buffer",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetGroups: [
                {
                    createdAt: "2026-05-01T00:00:00.000Z",
                    groupId: "essentials",
                    ledgerId: "ledger-1",
                    name: "Essentials",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
            budgetPeriods: [
                {
                    availableToBudgetCents: 1_000,
                    carryForwardFromPeriodId: "2026-04",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    currency: "USD",
                    endsOn: "2026-05-31",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    startsOn: "2026-05-01",
                    status: "open",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });

        mockWorkspaceFetch({ snapshot });
        renderBudgetWithWorkspace(snapshot, "2026-05");

        expect(
            screen.getByRole("button", { name: "Auto assign defaults" }),
        ).toHaveClass("bg-[var(--color-accent-ink)]");

        await user.click(
            screen.getByRole("button", { name: "Auto assign defaults" }),
        );

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/budget/periods/2026-05/allocations",
                expect.objectContaining({
                    method: "PUT",
                    body: JSON.stringify({
                        allocations: [
                            {
                                categoryId: "groceries",
                                assignedCents: 3_000,
                                fundingSources: [
                                    {
                                        amountCents: 3_000,
                                        sourceId: "buffer",
                                        sourceType: "budgetCategory",
                                    },
                                ],
                            },
                            {
                                categoryId: "buffer",
                                assignedCents: -3_000,
                            },
                        ],
                    }),
                }),
            ),
        );
    });

    it("disables auto assign when Unassigned is negative", () => {
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    balanceCents: 4_000,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-01-01",
                    openingBalanceCents: 4_000,
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetAllocations: [
                {
                    allocationId: "2026-04:income",
                    assignedCents: 5_000,
                    categoryId: "income",
                    ledgerId: "ledger-1",
                    periodId: "2026-04",
                    updatedAt: "2026-04-01T00:00:00.000Z",
                },
                {
                    allocationId: "2026-05:income",
                    assignedCents: -1_000,
                    categoryId: "income",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 3_000,
                    groupId: "essentials",
                    isIncomeCategory: false,
                    ledgerAccountId: "cat_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    autoAssignSourceEnabled: true,
                    autoAssignSourceSortOrder: 0,
                    categoryId: "income",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "essentials",
                    isIncomeCategory: true,
                    ledgerAccountId: "cat_income",
                    name: "Income",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetGroups: [
                {
                    createdAt: "2026-05-01T00:00:00.000Z",
                    groupId: "essentials",
                    ledgerId: "ledger-1",
                    name: "Essentials",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
            budgetPeriods: [
                {
                    availableToBudgetCents: -1_000,
                    carryForwardFromPeriodId: "2026-04",
                    createdAt: "2026-05-01T00:00:00.000Z",
                    currency: "USD",
                    endsOn: "2026-05-31",
                    ledgerId: "ledger-1",
                    periodId: "2026-05",
                    startsOn: "2026-05-01",
                    status: "open",
                    updatedAt: "2026-05-01T00:00:00.000Z",
                },
            ],
        });

        mockWorkspaceFetch({ snapshot });
        renderBudgetWithWorkspace(snapshot, "2026-05");

        expect(
            screen.queryByRole("button", { name: "Auto assign defaults" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText((_content, element) => {
                return (
                    element?.tagName.toLowerCase() === "p" &&
                    element.textContent ===
                        "Auto assign cannot run while Unassigned is negative by $10.00"
                );
            }),
        ).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalledWith(
            "/api/budget/periods/2026-05/allocations",
            expect.anything(),
        );
    });

    it("submits assignment edits without manual funding-source inputs", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <BudgetTable
                summary={{
                    activeAccountCount: 1,
                    allocationDifferenceCents: 0,
                    allocationFundingCents: 5_000,
                    allocationFundingRows: [],
                    assignedAllocationTotalCents: 5_000,
                    availableToBudgetCents: 12_500,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 5_000,
                            attentionStates: [],
                            availableCents: 5_000,
                            carriedForwardCents: 0,
                            categoryId: "groceries",
                            name: "Groceries",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    fundingReconciliationCents: 12_500,
                    hasSavedAssignments: true,
                    periodId: "2026-05",
                    status: "open",
                }}
            />,
        );

        await user.click(
            screen.getByRole("button", {
                name: "Edit assigned amount for Groceries",
            }),
        );

        await user.clear(
            screen.getByLabelText("Assigned amount for Groceries"),
        );
        await user.type(
            screen.getByLabelText("Assigned amount for Groceries"),
            "65.00",
        );
        expect(
            screen.queryByRole("button", { name: "Add funding source" }),
        ).not.toBeInTheDocument();
        await user.keyboard("{Enter}");

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        expect(fetch).toHaveBeenCalledWith(
            "/api/budget/periods/2026-05/allocations",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    allocations: [
                        {
                            categoryId: "groceries",
                            assignedCents: 6_500,
                        },
                    ],
                }),
            }),
        );
    });

    it("saves an inline allocation edit when the field loses focus", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <BudgetTable
                summary={{
                    activeAccountCount: 1,
                    allocationDifferenceCents: 0,
                    allocationFundingCents: 5_000,
                    allocationFundingRows: [],
                    assignedAllocationTotalCents: 5_000,
                    availableToBudgetCents: 12_500,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 5_000,
                            attentionStates: [],
                            availableCents: 5_000,
                            carriedForwardCents: 0,
                            categoryId: "groceries",
                            name: "Groceries",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    fundingReconciliationCents: 12_500,
                    hasSavedAssignments: true,
                    periodId: "2026-05",
                    status: "open",
                }}
            />,
        );

        await user.click(
            screen.getByRole("button", {
                name: "Edit assigned amount for Groceries",
            }),
        );
        await user.clear(
            screen.getByLabelText("Assigned amount for Groceries"),
        );
        await user.type(
            screen.getByLabelText("Assigned amount for Groceries"),
            "72.50",
        );
        await user.tab();

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        expect(fetch).toHaveBeenCalledWith(
            "/api/budget/periods/2026-05/allocations",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    allocations: [
                        {
                            categoryId: "groceries",
                            assignedCents: 7_250,
                        },
                    ],
                }),
            }),
        );
        expect(
            screen.queryByLabelText("Assigned amount for Groceries"),
        ).not.toBeInTheDocument();
    });

    it("shows an error and does not submit invalid inline allocation input on blur", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <BudgetTable
                summary={{
                    activeAccountCount: 1,
                    allocationDifferenceCents: 0,
                    allocationFundingCents: 5_000,
                    allocationFundingRows: [],
                    assignedAllocationTotalCents: 5_000,
                    availableToBudgetCents: 12_500,
                    attentionStates: [],
                    categories: [
                        {
                            activityCents: 0,
                            assignedCents: 5_000,
                            attentionStates: [],
                            availableCents: 5_000,
                            carriedForwardCents: 0,
                            categoryId: "groceries",
                            name: "Groceries",
                            reducedByOverspending: false,
                        },
                    ],
                    carryForwardSummaries: [],
                    fundingReconciliationCents: 12_500,
                    hasSavedAssignments: true,
                    periodId: "2026-05",
                    status: "open",
                }}
            />,
        );

        await user.click(
            screen.getByRole("button", {
                name: "Edit assigned amount for Groceries",
            }),
        );
        await user.clear(
            screen.getByLabelText("Assigned amount for Groceries"),
        );
        await user.type(
            screen.getByLabelText("Assigned amount for Groceries"),
            "4 + .",
        );
        await user.tab();

        expect(fetch).not.toHaveBeenCalled();
        expect(
            await screen.findByText(
                "USD values must use standard dollars and cents precision. The last saved budget allocations are unchanged. Review the values and try again.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText("Assigned amount for Groceries"),
        ).toHaveValue("4 + .");
    });
});
