import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    notifyError: vi.fn(),
    notifySuccessToast: vi.fn(),
}));

vi.mock("@/components/shared/feedback-toast-provider", () => ({
    useFeedbackToasts: () => ({
        notifyError: mocks.notifyError,
        notifySuccessToast: mocks.notifySuccessToast,
    }),
}));

import {
    YnabImportPanel,
    ynabImportPanelTestInternals,
} from "@/components/utilities/ynab-import-panel";

const readyJob = {
    accountMappings: [
        {
            accountId: "account-1",
            accountName: "Checking",
            accountType: "checking" as const,
            importRole: "budget" as const,
            reason: "Likely on-budget account.",
        },
    ],
    createdAt: "2026-09-01T12:00:00.000Z",
    jobId: "job-1",
    ledgerName: "Imported budget",
    previewRevision: 2,
    status: "ready" as const,
    summary: {
        accountCountByRole: { budget: 1, exclude: 0, tracking: 0 },
        budgetCategoryCount: 2,
        budgetGroupCount: 1,
        firstMonth: "2025-01",
        lastMonth: "2026-06",
        multiLineTransactionCount: 0,
        skippedSyntheticAccountCount: 0,
        transactionCount: 10,
        transactionLineCount: 10,
        warnings: [],
    },
    targetLedgerId: "ledger-import",
    updatedAt: "2026-09-01T12:01:00.000Z",
};

describe("YnabImportPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("recognizes a ZIP or an extracted Plan/Register pair", () => {
        expect(
            ynabImportPanelTestInternals.selectYnabSource([
                new File(["zip"], "Household.zip", { type: "application/zip" }),
            ]),
        ).toMatchObject({ suggestedLedgerName: "Household" });
        expect(
            ynabImportPanelTestInternals.selectYnabSource([
                new File(["plan"], "Household - Plan.csv", { type: "text/csv" }),
                new File(["register"], "Household - Register.csv", { type: "text/csv" }),
            ]),
        ).toMatchObject({
            files: [
                expect.objectContaining({ kind: "plan" }),
                expect.objectContaining({ kind: "register" }),
            ],
            suggestedLedgerName: "Household",
        });
    });

    it("restores a ready job and requires a refreshed preview after mapping edits", async () => {
        const user = userEvent.setup();
        vi.stubGlobal(
            "fetch",
            vi.fn()
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ job: readyJob }), {
                        headers: { "content-type": "application/json" },
                    }),
                )
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            job: { ...readyJob, status: "analyzing" },
                        }),
                        { headers: { "content-type": "application/json" }, status: 202 },
                    ),
                ),
        );

        render(<YnabImportPanel />);

        const role = await screen.findByRole("combobox", {
            name: "Import Checking as",
        });
        await user.selectOptions(role, "tracking");
        expect(
            screen.getByRole("button", { name: "Update preview" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /Import as new ledger/i }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Update preview" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        const [, init] = vi.mocked(fetch).mock.calls[1]!;
        const body = JSON.parse(String(init?.body));
        expect(body.accountMappings[0]).toMatchObject({
            accountName: "Checking",
            importRole: "tracking",
        });
    });

    it("shows a completed inactive ledger with a link to switch ledgers", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        job: {
                            ...readyJob,
                            completedAt: "2026-09-01T12:10:00.000Z",
                            recordCount: 42,
                            status: "completed",
                        },
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            ),
        );

        render(<YnabImportPanel />);

        expect(
            await screen.findByText(/Your current ledger is still active/),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View ledgers" })).toHaveAttribute(
            "href",
            "/ledgers",
        );
    });
});
