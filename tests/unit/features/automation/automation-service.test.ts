import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    automationScheduleGet: vi.fn(),
    automationTaskRunGet: vi.fn(),
    automationTaskRunPut: vi.fn(),
    automationTaskRunComposite: vi.fn(),
    automationTaskRunQueueQuery: vi.fn(),
    automationTaskRunRecentQuery: vi.fn(),
    automationTaskRunUpdate: vi.fn(),
    beginWorkspaceExplicitMutation: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn(),
    getLedgerRecord: vi.fn(),
    launchAmazonOrderSync: vi.fn(),
    listLedgers: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    queryAllPages: vi.fn(),
    readAmazonScraperManifest: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn(),
}));

vi.mock("@/features/amazon/server/amazon-order-service", () => ({
    launchAmazonOrderSync: mocks.launchAmazonOrderSync,
    readAmazonScraperManifest: mocks.readAmazonScraperManifest,
    syncLatestAmazonOrders: vi.fn(),
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
}));

vi.mock("@/features/ledgers/server/ledger-service", () => ({
    getLedgerRecord: mocks.getLedgerRecord,
    listLedgers: mocks.listLedgers,
}));

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-pending-service",
    () => ({ classifyLedgerNow: vi.fn() }),
);

vi.mock("@/features/plaid/server/plaid-service", () => ({
    syncPlaidAccountLink: vi.fn(),
}));

vi.mock("@/lib/db/query-all-pages", () => ({
    queryAllPages: mocks.queryAllPages,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            automationSchedules: {
                get: mocks.automationScheduleGet,
            },
            automationTaskRuns: {
                get: mocks.automationTaskRunGet,
                put: mocks.automationTaskRunPut,
                query: {
                    byQueue: mocks.automationTaskRunQueueQuery,
                    byRecent: mocks.automationTaskRunRecentQuery,
                },
                update: mocks.automationTaskRunUpdate,
            },
        },
    }),
}));

import {
    runQueuedAutomation,
    runScheduledAutomation,
    scheduleAutomationRunNow,
} from "@/features/automation/server/automation-service";

function useDailyAmazonScraperSchedule() {
    mocks.automationScheduleGet.mockReturnValue({
        go: async () => ({
            data: {
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
                workspaceId: "global",
            },
        }),
    });
    mocks.listLedgers.mockResolvedValue([
        {
            ledgerId: "ledger-1",
            name: "Current ledger",
            status: "active",
        },
    ]);
    mocks.getLedgerRecord.mockResolvedValue({
        ledgerId: "ledger-1",
        name: "Current ledger",
        status: "active",
    });
}

function scheduledScraperAttempt(input: {
    attempt: number;
    completedAt?: string;
    status: "failed" | "running" | "succeeded";
}) {
    return {
        ...(input.completedAt ? { completedAt: input.completedAt } : {}),
        createdAt: "2026-07-13T04:45:00.000Z",
        detailsJson: JSON.stringify({
            attempt: input.attempt,
            maxAttempts: 12,
            scraperSyncId: `scraper-sync-${input.attempt}`,
            syncRunId: `sync-run-${input.attempt}`,
            trigger: "scheduled",
        }),
        expiresAt: 2_000_000_000,
        ledgerId: "ledger-1",
        scheduledDate: "2026-07-13",
        scheduledFor: "2026-07-13T04:45:00.000Z",
        startedAt: "2026-07-13T04:45:00.000Z",
        status: input.status,
        taskRunId: `2026-07-13:amazonScraper:attempt:${input.attempt}`,
        taskType: "amazonScraper" as const,
        updatedAt: input.completedAt ?? "2026-07-13T04:45:00.000Z",
        workspaceId: "global",
    };
}

describe("automation service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.automationScheduleGet.mockReturnValue({
            go: async () => ({
                data: {
                    aiClassificationEnabled: false,
                    aiClassificationTime: "05:15",
                    amazonImportEnabled: false,
                    amazonImportTime: "05:00",
                    amazonScraperEnabled: false,
                    amazonScraperTime: "04:45",
                    createdAt: "2026-07-13T00:00:00.000Z",
                    plaidSyncEnabled: true,
                    plaidSyncTime: "04:30",
                    settingsId: "default",
                    updatedAt: "2026-07-13T00:00:00.000Z",
                    workspaceId: "global",
                },
            }),
        });
        mocks.automationTaskRunGet.mockReturnValue({
            go: async () => ({ data: null }),
        });
        mocks.automationTaskRunPut.mockImplementation(() => ({
            go: async () => undefined,
        }));
        mocks.automationTaskRunRecentQuery.mockReturnValue({});
        mocks.automationTaskRunQueueQuery.mockReturnValue({});
        mocks.automationTaskRunUpdate.mockReturnValue({
            set: () => ({
                composite: mocks.automationTaskRunComposite.mockReturnValue({
                    where: () => ({
                        go: async () => undefined,
                    }),
                }),
            }),
        });
        mocks.beginWorkspaceExplicitMutation.mockResolvedValue("fence-token");
        mocks.persistWorkspaceChanges.mockImplementation(({ changes }) => changes);
        mocks.queryAllPages.mockResolvedValue([]);
        mocks.readAmazonScraperManifest.mockResolvedValue({ state: "running" });
    });

    it("records a skipped run when a ledger is archived after scheduler discovery", async () => {
        mocks.listLedgers.mockResolvedValue([
            {
                ledgerId: "ledger-1",
                name: "Archived ledger",
                status: "active",
            },
        ]);
        mocks.getLedgerRecord.mockResolvedValue({
            ledgerId: "ledger-1",
            name: "Archived ledger",
            status: "archived",
        });

        const runs = await runScheduledAutomation(
            new Date("2026-07-13T04:30:00.000Z"),
        );

        expect(runs).toMatchObject([
            {
                ledgerId: "ledger-1",
                status: "skipped",
                taskType: "plaidSync",
            },
        ]);
        expect(mocks.automationTaskRunPut).toHaveBeenCalledWith(
            expect.objectContaining({
                detailsJson: JSON.stringify({ reason: "Ledger is archived." }),
                status: "skipped",
            }),
        );
    });

    it("does not create scheduled work for ledgers already archived at discovery", async () => {
        mocks.listLedgers.mockResolvedValue([
            {
                ledgerId: "ledger-1",
                name: "Archived ledger",
                status: "archived",
            },
        ]);

        await expect(
            runScheduledAutomation(new Date("2026-07-13T04:30:00.000Z")),
        ).resolves.toEqual([]);
        expect(mocks.getLedgerRecord).not.toHaveBeenCalled();
        expect(mocks.queryAllPages).toHaveBeenCalledTimes(1);
    });

    it("logs a running scheduled scraper attempt after publishing its launch", async () => {
        useDailyAmazonScraperSchedule();
        const workspaceChanges = [
            {
                entityId: "sync-run-1",
                entityType: "amazonOrderSyncRun",
                operation: "upsert" as const,
                previousRecordDigest: null,
                record: { syncRunId: "sync-run-1" },
            },
        ];
        mocks.launchAmazonOrderSync.mockResolvedValue({
            scraperSyncId: "scraper-sync-1",
            syncRunId: "sync-run-1",
            workspaceChanges,
        });

        await expect(
            runScheduledAutomation(new Date("2026-07-13T04:45:00.000Z")),
        ).resolves.toMatchObject([
            {
                details: {
                    attempt: 1,
                    maxAttempts: 12,
                    syncRunId: "sync-run-1",
                    trigger: "scheduled",
                },
                ledgerId: "ledger-1",
                status: "running",
                taskRunId: "2026-07-13:amazonScraper:attempt:1",
                taskType: "amazonScraper",
            },
        ]);

        expect(mocks.beginWorkspaceExplicitMutation).toHaveBeenCalledWith(
            "ledger-1",
        );
        expect(mocks.persistWorkspaceChanges).toHaveBeenCalledWith({
            activeLedgerId: "ledger-1",
            changes: workspaceChanges,
        });
        expect(mocks.completeWorkspaceExplicitMutation).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            token: "fence-token",
        });
    });

    it("marks the scheduled attempt failed from its scraper manifest", async () => {
        useDailyAmazonScraperSchedule();
        const attempt = scheduledScraperAttempt({
            attempt: 1,
            status: "running",
        });
        mocks.automationTaskRunGet.mockImplementation(
            (input: { taskRunId: string }) => ({
                go: async () => ({
                    data:
                        input.taskRunId === attempt.taskRunId ? attempt : null,
                }),
            }),
        );
        mocks.readAmazonScraperManifest.mockResolvedValue({
            lastError: "Amazon returned 503.",
            orderCount: 64,
            state: "failed",
            syncId: "scraper-sync-1",
        });

        await expect(
            runScheduledAutomation(new Date("2026-07-13T05:00:00.000Z")),
        ).resolves.toMatchObject([
            {
                completedAt: "2026-07-13T05:00:00.000Z",
                details: {
                    attempt: 1,
                    orderCount: 64,
                    scraperState: "failed",
                },
                error: "Amazon returned 503.",
                status: "failed",
                taskRunId: attempt.taskRunId,
            },
        ]);
        expect(mocks.launchAmazonOrderSync).not.toHaveBeenCalled();
    });

    it("launches each retry as a separate history row after backoff", async () => {
        useDailyAmazonScraperSchedule();
        const failedAttempt = scheduledScraperAttempt({
            attempt: 1,
            completedAt: "2026-07-13T05:00:00.000Z",
            status: "failed",
        });
        mocks.automationTaskRunGet.mockImplementation(
            (input: { taskRunId: string }) => ({
                go: async () => ({
                    data:
                        input.taskRunId === failedAttempt.taskRunId
                            ? failedAttempt
                            : null,
                }),
            }),
        );
        mocks.launchAmazonOrderSync.mockResolvedValue({
            scraperSyncId: "scraper-sync-2",
            syncRunId: "sync-run-2",
            workspaceChanges: [],
        });

        await expect(
            runScheduledAutomation(new Date("2026-07-13T05:01:00.000Z")),
        ).resolves.toMatchObject([
            {
                status: "failed",
                taskRunId: failedAttempt.taskRunId,
            },
        ]);
        expect(mocks.launchAmazonOrderSync).not.toHaveBeenCalled();

        await expect(
            runScheduledAutomation(new Date("2026-07-13T05:02:00.000Z")),
        ).resolves.toMatchObject([
            {
                details: {
                    attempt: 2,
                    scraperSyncId: "scraper-sync-2",
                    syncRunId: "sync-run-2",
                },
                startedAt: "2026-07-13T05:02:00.000Z",
                status: "running",
                taskRunId: "2026-07-13:amazonScraper:attempt:2",
            },
        ]);
        expect(mocks.launchAmazonOrderSync).toHaveBeenCalledTimes(1);
    });

    it.each([
        { attempt: 2, backoffMinutes: 4, nextAttempt: 3 },
        { attempt: 3, backoffMinutes: 6, nextAttempt: 4 },
        { attempt: 11, backoffMinutes: 6, nextAttempt: 12 },
    ])(
        "waits $backoffMinutes minutes before launching attempt $nextAttempt",
        async ({ attempt, backoffMinutes, nextAttempt }) => {
            useDailyAmazonScraperSchedule();
            const failedAttempt = scheduledScraperAttempt({
                attempt,
                completedAt: "2026-07-13T05:00:00.000Z",
                status: "failed",
            });
            mocks.automationTaskRunGet.mockImplementation(
                (input: { taskRunId: string }) => ({
                    go: async () => ({
                        data:
                            input.taskRunId === failedAttempt.taskRunId
                                ? failedAttempt
                                : null,
                    }),
                }),
            );
            mocks.launchAmazonOrderSync.mockResolvedValue({
                scraperSyncId: `scraper-sync-${nextAttempt}`,
                syncRunId: `sync-run-${nextAttempt}`,
                workspaceChanges: [],
            });

            const beforeBackoff = new Date(
                new Date("2026-07-13T05:00:00.000Z").getTime() +
                    backoffMinutes * 60 * 1000 -
                    60 * 1000,
            );
            await runScheduledAutomation(beforeBackoff);
            expect(mocks.launchAmazonOrderSync).not.toHaveBeenCalled();

            const afterBackoff = new Date(
                new Date("2026-07-13T05:00:00.000Z").getTime() +
                    backoffMinutes * 60 * 1000,
            );
            await expect(
                runScheduledAutomation(afterBackoff),
            ).resolves.toMatchObject([
                {
                    details: { attempt: nextAttempt },
                    status: "running",
                    taskRunId: `2026-07-13:amazonScraper:attempt:${nextAttempt}`,
                },
            ]);
        },
    );

    it("stops after twelve failed scheduled scraper attempts", async () => {
        useDailyAmazonScraperSchedule();
        const failedAttempt = scheduledScraperAttempt({
            attempt: 12,
            completedAt: "2026-07-13T05:00:00.000Z",
            status: "failed",
        });
        mocks.automationTaskRunGet.mockImplementation(
            (input: { taskRunId: string }) => ({
                go: async () => ({
                    data:
                        input.taskRunId === failedAttempt.taskRunId
                            ? failedAttempt
                            : null,
                }),
            }),
        );

        await expect(
            runScheduledAutomation(new Date("2026-07-13T12:00:00.000Z")),
        ).resolves.toMatchObject([
            {
                status: "failed",
                taskRunId: failedAttempt.taskRunId,
            },
        ]);
        expect(mocks.launchAmazonOrderSync).not.toHaveBeenCalled();
    });

    it("queues one immediate task for every non-archived ledger", async () => {
        mocks.listLedgers.mockResolvedValue([
            {
                ledgerId: "ledger-1",
                name: "Current ledger",
                status: "active",
            },
            {
                ledgerId: "ledger-2",
                name: "Archived ledger",
                status: "archived",
            },
        ]);

        const taskRuns = await scheduleAutomationRunNow(
            "plaidSync",
            new Date("2026-07-13T04:31:00.000Z"),
        );

        expect(taskRuns).toMatchObject([
            {
                details: { trigger: "manual" },
                ledgerId: "ledger-1",
                scheduledFor: "2026-07-13T04:31:00.000Z",
                status: "queued",
                taskType: "plaidSync",
            },
        ]);
        expect(taskRuns[0]?.taskRunId).toMatch(/^manual:plaidSync:/);
        expect(mocks.automationTaskRunPut).toHaveBeenCalledTimes(1);
    });

    it("claims and executes queued work exactly once", async () => {
        const queuedRun = {
            createdAt: "2026-07-13T04:31:00.000Z",
            detailsJson: JSON.stringify({ trigger: "manual" }),
            expiresAt: 2_000_000_000,
            ledgerId: "ledger-1",
            scheduledDate: "2026-07-13",
            scheduledFor: "2026-07-13T04:31:00.000Z",
            startedAt: "2026-07-13T04:31:00.000Z",
            status: "queued" as const,
            taskRunId: "manual:amazonScraper:run-1",
            taskType: "amazonScraper" as const,
            updatedAt: "2026-07-13T04:31:00.000Z",
            workspaceId: "global",
        };
        mocks.queryAllPages.mockResolvedValue([queuedRun]);
        mocks.automationTaskRunGet.mockReturnValue({
            go: async () => ({ data: queuedRun }),
        });
        mocks.getLedgerRecord.mockResolvedValue({
            ledgerId: "ledger-1",
            name: "Current ledger",
            status: "active",
        });
        mocks.launchAmazonOrderSync.mockResolvedValue({
            syncRunId: "sync-run-1",
            workspaceChanges: [],
        });

        await expect(
            runQueuedAutomation(new Date("2026-07-13T04:32:00.000Z")),
        ).resolves.toMatchObject([
            {
                details: { syncRunId: "sync-run-1", trigger: "manual" },
                ledgerId: "ledger-1",
                status: "succeeded",
                taskType: "amazonScraper",
            },
        ]);

        expect(mocks.automationTaskRunUpdate).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            taskRunId: "manual:amazonScraper:run-1",
        });
        expect(mocks.automationTaskRunComposite).toHaveBeenCalledWith({
            workspaceId: "global",
        });
        expect(mocks.launchAmazonOrderSync).toHaveBeenCalledWith("ledger-1");
    });
});
