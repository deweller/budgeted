import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    completeActivity: vi.fn(),
    failActivity: vi.fn(),
    refresh: vi.fn(),
    startActivity: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/global-budget",
    useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/shared/background-mutation-activity-provider", () => ({
    useBackgroundMutationActivity: () => ({
        activities: [],
        startActivity: mocks.startActivity,
    }),
}));

import { GlobalPlanEditor } from "@/components/budget/global-plan-editor";
import { FeedbackToastProvider } from "@/components/shared/feedback-toast-provider";

function renderWithFeedback(ui: ReactElement) {
    return render(<FeedbackToastProvider>{ui}</FeedbackToastProvider>);
}

describe("category deletion cascade", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.startActivity.mockReturnValue({
            complete: mocks.completeActivity,
            fail: mocks.failActivity,
        });
    });

    it("shows a generic delete warning and confirms deletion", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        target: {
                            targetType: "category",
                            targetId: "category-1",
                            displayName: "Groceries",
                            sectionId: "budget",
                        },
                        dependentCounts: [
                            { label: "Category ledger postings", count: 2 },
                            { label: "Category allocations", count: 1 },
                        ],
                        affectedPeriods: ["2026-05"],
                        preservedRecords: [
                            {
                                label: "Transactions kept as uncategorized activity",
                                count: 1,
                                description:
                                    "The transactions remain saved and lose only the deleted category reference.",
                            },
                        ],
                        crossAreaEffects: [
                            "Budget totals and readiness will be recalculated for affected periods.",
                        ],
                        isPermanent: true,
                        permanentWarning:
                            "This deletion is permanent and cannot be undone.",
                        previewRevision: "preview-1",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                }),
        );

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
                        categoryId: "category-1",
                        defaultAssignedCents: 5_000,
                        groupId: "essentials",
                        isIncomeCategory: false,
                        name: "Groceries",
                        sortOrder: 1,
                        status: "active",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        expect(
            screen.getByText(
                "This deletion is permanent. All related data will be deleted.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Transactions kept as uncategorized activity"),
        ).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Delete permanently" }),
        );

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

        const [, request] = vi.mocked(fetch).mock.calls[1];

        expect(fetch).toHaveBeenNthCalledWith(
            2,
            "/api/budget/categories/category-1",
            expect.objectContaining({ method: "DELETE" }),
        );
        expect(JSON.parse(String(request?.body))).toEqual({
            previewRevision: "preview-1",
        });
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Category deleted.",
            pendingLabel: "Deleting category…",
        });
        expect(mocks.completeActivity).toHaveBeenCalledOnce();
        expect(mocks.failActivity).not.toHaveBeenCalled();
    });
});
