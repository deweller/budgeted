import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutomationPanel } from "@/components/utilities/automation-panel";

const mocks = vi.hoisted(() => ({
    notifyError: vi.fn(),
    startActivity: vi.fn(() => ({
        complete: vi.fn(),
        fail: vi.fn(),
    })),
}));

vi.mock("@/components/shared/feedback-toast-provider", () => ({
    useFeedbackToasts: () => ({ notifyError: mocks.notifyError }),
}));

vi.mock("@/components/shared/background-mutation-activity-provider", () => ({
    useBackgroundMutationActivity: () => ({
        startActivity: mocks.startActivity,
    }),
}));

describe("AutomationPanel", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(
                Response.json({
                    ledgers: [
                        { ledgerId: "ledger-1", name: "Household ledger" },
                    ],
                    schedule: {
                        aiClassificationEnabled: false,
                        aiClassificationTime: "05:15",
                        amazonImportEnabled: false,
                        amazonImportTime: "05:00",
                        amazonScraperEnabled: true,
                        amazonScraperTime: "04:45",
                        createdAt: "2026-07-13T00:00:00.000Z",
                        plaidSyncEnabled: false,
                        plaidSyncTime: "04:30",
                        settingsId: "default",
                        updatedAt: "2026-07-13T00:00:00.000Z",
                    },
                }),
            ).mockResolvedValue(
                Response.json({
                    taskRuns: [
                        {
                            details: { attempt: 2, maxAttempts: 12 },
                            ledgerId: "ledger-1",
                            scheduledFor: "2026-07-13T04:45:00.000Z",
                            startedAt: "2026-07-13T09:15:00.000Z",
                            status: "running",
                            taskRunId:
                                "2026-07-13:amazonScraper:attempt:2",
                            taskType: "amazonScraper",
                        },
                    ],
                }),
            ),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("uses a two-minute time input and lazy loads expandable task history", async () => {
        const user = userEvent.setup();
        render(<AutomationPanel />);

        const historyDisclosure = await screen.findByText("Recent task history");
        expect(historyDisclosure.closest("details")).not.toHaveAttribute("open");
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
        const timeInput = screen.getAllByLabelText("Time")[0]!;
        expect(timeInput).toHaveAttribute("type", "time");
        expect(timeInput).toHaveAttribute("step", "120");

        await user.click(historyDisclosure);

        const table = await screen.findByRole("table");

        expect(fetch).toHaveBeenLastCalledWith("/api/utilities/automation/history");
        expect(within(table).getByText("Jul 13, 2026, 4:15 AM")).toHaveClass(
            "min-w-48",
            "whitespace-nowrap",
        );
        expect(within(table).getByText("Household ledger")).toHaveClass(
            "min-w-48",
        );
        expect(within(table).getByText("Amazon scraper")).toHaveClass(
            "min-w-44",
        );
        expect(within(table!).getByText("Started")).toHaveClass("min-w-48");
        expect(within(table!).getByText("Ledger")).toHaveClass("min-w-48");
        expect(within(table!).getByText("Task")).toHaveClass("min-w-44");
        expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();

        await user.click(historyDisclosure);
        await user.click(historyDisclosure);

        expect(fetch).toHaveBeenCalledTimes(3);
    });
});
