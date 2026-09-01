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
    usePathname: () => "/accounts",
    useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/shared/background-mutation-activity-provider", () => ({
    useBackgroundMutationActivity: () => ({
        activities: [],
        startActivity: mocks.startActivity,
    }),
}));

import { AccountsTable } from "@/components/accounts/accounts-table";
import { FeedbackToastProvider } from "@/components/shared/feedback-toast-provider";
import { createIntegrationWorkspaceMutationResponse } from "../helpers/workspace-mutation-response";

function renderWithFeedback(ui: ReactElement) {
    return render(<FeedbackToastProvider>{ui}</FeedbackToastProvider>);
}

describe("account deletion cascade", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.startActivity.mockReturnValue({
            complete: mocks.completeActivity,
            fail: mocks.failActivity,
        });
    });

    it("loads an account delete preview and keeps saved rows unchanged when cancelled", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    target: {
                        targetType: "account",
                        targetId: "account-1",
                        displayName: "Checking",
                        sectionId: "accounts",
                    },
                    dependentCounts: [{ label: "Transactions", count: 1 }],
                    affectedPeriods: ["2026-05"],
                    preservedRecords: [],
                    crossAreaEffects: ["Balances will update."],
                    isPermanent: true,
                    permanentWarning:
                        "This deletion is permanent and cannot be undone.",
                    previewRevision: "preview-1",
                }),
            }),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                        balanceCents: 10_000,
                    },
                ]}
            />,
        );

        expect(
            screen.getByRole("link", {
                name: "View transactions for Checking",
            }),
        ).toHaveAttribute("href", "/transactions/checking");

        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        expect(fetch).toHaveBeenCalledWith("/api/accounts/account-1");
        expect(
            screen.getByRole("heading", { name: "Delete Checking?" }),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(screen.getAllByText("Checking").length).toBeGreaterThan(0);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("confirms account deletion with the preview revision token", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        target: {
                            targetType: "account",
                            targetId: "account-1",
                            displayName: "Checking",
                            sectionId: "accounts",
                        },
                        dependentCounts: [{ label: "Transactions", count: 1 }],
                        affectedPeriods: ["2026-05"],
                        preservedRecords: [],
                        crossAreaEffects: ["Balances will update."],
                        isPermanent: true,
                        permanentWarning:
                            "This deletion is permanent and cannot be undone.",
                        previewRevision: "preview-1",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        createIntegrationWorkspaceMutationResponse(),
                }),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                        balanceCents: 10_000,
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        await user.click(
            screen.getByRole("button", { name: "Delete permanently" }),
        );

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

        const [, request] = vi.mocked(fetch).mock.calls[1];

        expect(fetch).toHaveBeenNthCalledWith(
            2,
            "/api/accounts/account-1",
            expect.objectContaining({ method: "DELETE" }),
        );
        expect(JSON.parse(String(request?.body))).toEqual({
            previewRevision: "preview-1",
        });
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Account deleted.",
            pendingLabel: "Deleting account…",
        });
        expect(mocks.completeActivity).toHaveBeenCalledOnce();
        expect(mocks.failActivity).not.toHaveBeenCalled();
    });
});
