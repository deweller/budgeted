import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAutomationOverview: vi.fn(),
    invokeQueuedAutomationWorker: vi.fn(),
    listRecentAutomationTaskRuns: vi.fn(),
    scheduleAutomationRunNow: vi.fn(),
    updateAutomationSchedule: vi.fn(),
}));

vi.mock("@/features/automation/server/automation-service", () => ({
    getAutomationOverview: mocks.getAutomationOverview,
    listRecentAutomationTaskRuns: mocks.listRecentAutomationTaskRuns,
    scheduleAutomationRunNow: mocks.scheduleAutomationRunNow,
    updateAutomationSchedule: mocks.updateAutomationSchedule,
}));

vi.mock("@/features/automation/server/automation-invocation-service", () => ({
    invokeQueuedAutomationWorker: mocks.invokeQueuedAutomationWorker,
}));

vi.mock("@/lib/api/workspace-route", () => ({
    handleWorkspaceRoute: async (
        handler: (context: { ledgerId: string; user: { userId: string } }) => Promise<Response>,
    ) => handler({ ledgerId: "ledger-1", user: { userId: "owner-1" } }),
    workspaceReadJson: async (
        read: (context: { ledgerId: string; user: { userId: string } }) => Promise<unknown>,
    ) => Response.json(await read({ ledgerId: "ledger-1", user: { userId: "owner-1" } })),
}));

import {
    GET,
    POST,
} from "@/app/api/utilities/automation/route";
import { GET as GET_HISTORY } from "@/app/api/utilities/automation/history/route";

describe("automation routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns automation overview data", async () => {
        mocks.getAutomationOverview.mockResolvedValue({
            ledgers: [],
            schedule: {},
        });

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ schedule: {} });
        expect(mocks.listRecentAutomationTaskRuns).not.toHaveBeenCalled();
    });

    it("returns task history only from the history endpoint", async () => {
        mocks.listRecentAutomationTaskRuns.mockResolvedValue([
            { taskRunId: "run-1" },
        ]);

        const response = await GET_HISTORY();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            taskRuns: [{ taskRunId: "run-1" }],
        });
    });

    it("queues every active-ledger run and invokes the worker asynchronously", async () => {
        mocks.scheduleAutomationRunNow.mockResolvedValue([
            {
                ledgerId: "ledger-1",
                status: "queued",
                taskRunId: "manual:plaidSync:run-1",
                taskType: "plaidSync",
            },
        ]);

        const response = await POST(
            new Request("http://localhost/api/utilities/automation", {
                body: JSON.stringify({ taskType: "plaidSync" }),
                headers: { "content-type": "application/json" },
                method: "POST",
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.scheduleAutomationRunNow).toHaveBeenCalledWith("plaidSync");
        expect(mocks.invokeQueuedAutomationWorker).toHaveBeenCalledWith();
        await expect(response.json()).resolves.toMatchObject({
            taskRuns: [
                {
                    ledgerId: "ledger-1",
                    status: "queued",
                },
            ],
        });
    });

    it("does not invoke the worker when every ledger is archived", async () => {
        mocks.scheduleAutomationRunNow.mockResolvedValue([]);

        const response = await POST(
            new Request("http://localhost/api/utilities/automation", {
                body: JSON.stringify({ taskType: "amazonImport" }),
                headers: { "content-type": "application/json" },
                method: "POST",
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.invokeQueuedAutomationWorker).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toEqual({ taskRuns: [] });
    });
});
