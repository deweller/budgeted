import {
    readAmazonScraperManifest,
    launchAmazonOrderSync,
    syncLatestAmazonOrders,
} from "@/features/amazon/server/amazon-order-service";
import {
    type AutomationScheduleInput,
    type AutomationTaskRunStatus,
    type AutomationTaskType,
} from "@/features/automation/models/automation";
import { classifyLedgerNow } from "@/features/transaction-classification/server/transaction-classification-pending-service";
import type { LedgerRecord } from "@/features/ledgers/server/ledger-service";
import { getLedgerRecord, listLedgers } from "@/features/ledgers/server/ledger-service";
import { syncPlaidAccountLink } from "@/features/plaid/server/plaid-service";
import {
    beginWorkspaceExplicitMutation,
    completeWorkspaceExplicitMutation,
    persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation,
    type WorkspaceMutationChangeInput,
} from "@/features/workspace/server/workspace-sync-service";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";
import { ulid } from "ulid";

const AUTOMATION_SETTINGS_ID = "default";
const AUTOMATION_HISTORY_RETENTION_DAYS = 60;
const AMAZON_SCRAPER_SCHEDULED_MAX_ATTEMPTS = 12;
const AMAZON_SCRAPER_RETRY_INTERVAL_MINUTES = 2;
const AMAZON_SCRAPER_RETRY_MAX_BACKOFF_MINUTES = 6;

const DEFAULT_AUTOMATION_SCHEDULE = {
    aiClassificationEnabled: false,
    aiClassificationTime: "05:15",
    amazonImportEnabled: false,
    amazonImportTime: "05:00",
    amazonScraperEnabled: false,
    amazonScraperTime: "04:45",
    plaidSyncEnabled: false,
    plaidSyncTime: "04:30",
} satisfies AutomationScheduleInput;

export type AutomationSchedule = AutomationScheduleInput & {
    createdAt: string;
    settingsId: string;
    updatedAt: string;
};

type AutomationScheduleRecord = AutomationSchedule & {
    workspaceId: string;
};

export type AutomationTaskRun = {
    completedAt?: string;
    createdAt: string;
    details: Record<string, number | string>;
    error?: string;
    expiresAt: number;
    ledgerId: string;
    scheduledDate: string;
    scheduledFor: string;
    startedAt: string;
    status: AutomationTaskRunStatus;
    taskRunId: string;
    taskType: AutomationTaskType;
    updatedAt: string;
};

type AutomationTaskRunRecord = Omit<AutomationTaskRun, "details"> & {
    detailsJson: string;
    workspaceId: string;
};

type AutomationTaskResult = {
    details: Record<string, number | string>;
    error?: string;
    status: Exclude<AutomationTaskRunStatus, "queued" | "running">;
};

function nowIso(now = new Date()) {
    return now.toISOString();
}

function getUtcDate(now: Date) {
    return now.toISOString().slice(0, 10);
}

function getUtcTime(now: Date) {
    return now.toISOString().slice(11, 16);
}

function getScheduledFor(date: string, time: string) {
    return `${date}T${time}:00.000Z`;
}

function getTaskRunId(taskType: AutomationTaskType, date: string) {
    return `${date}:${taskType}`;
}

function getAmazonScraperAttemptTaskRunId(date: string, attempt: number) {
    return `${date}:amazonScraper:attempt:${attempt}`;
}

function getExpiresAt(now: Date) {
    return Math.floor(
        (now.getTime() + AUTOMATION_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000) /
            1000,
    );
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function parseDetails(detailsJson: string) {
    try {
        const parsed = JSON.parse(detailsJson) as unknown;

        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return Object.fromEntries(
                Object.entries(parsed).filter(
                    (entry): entry is [string, number | string] =>
                        typeof entry[1] === "number" ||
                        typeof entry[1] === "string",
                ),
            );
        }
    } catch {
        // A malformed historical run must remain readable.
    }

    return {};
}

function toPublicRun(record: AutomationTaskRunRecord): AutomationTaskRun {
    const { detailsJson, workspaceId, ...rest } = record;
    void workspaceId;

    return {
        ...rest,
        details: parseDetails(detailsJson),
    };
}

function toSchedule(record: AutomationSchedule | null): AutomationSchedule {
    const now = nowIso();

    return record ?? {
        ...DEFAULT_AUTOMATION_SCHEDULE,
        createdAt: now,
        settingsId: AUTOMATION_SETTINGS_ID,
        updatedAt: now,
    };
}

async function getScheduleRecord() {
    const { entities } = getBudgetedSchema();
    const result = await entities.automationSchedules
        .get({
            settingsId: AUTOMATION_SETTINGS_ID,
            workspaceId: GLOBAL_WORKSPACE_ID,
        })
        .go();

    return (result.data as AutomationScheduleRecord | undefined) ?? null;
}

export async function getAutomationSchedule() {
    return toSchedule(await getScheduleRecord());
}

export async function updateAutomationSchedule(input: AutomationScheduleInput) {
    const { entities } = getBudgetedSchema();
    const existing = await getScheduleRecord();
    const now = nowIso();
    const record = {
        ...input,
        createdAt: existing?.createdAt ?? now,
        settingsId: AUTOMATION_SETTINGS_ID,
        updatedAt: now,
        workspaceId: GLOBAL_WORKSPACE_ID,
    } satisfies AutomationScheduleRecord;

    await entities.automationSchedules.put(record).go();

    return toSchedule(record);
}

export async function listRecentAutomationTaskRuns(limit = 100) {
    const { entities } = getBudgetedSchema();
    const now = Math.floor(Date.now() / 1000);
    const records = (await queryAllPages(
        entities.automationTaskRuns.query.byRecent({
            workspaceId: GLOBAL_WORKSPACE_ID,
        }),
    )) as AutomationTaskRunRecord[];

    return records
        .filter((record) => record.expiresAt > now)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .slice(0, limit)
        .map(toPublicRun);
}

async function listQueuedAutomationTaskRunRecords() {
    const { entities } = getBudgetedSchema();
    const now = Math.floor(Date.now() / 1000);
    const records = (await queryAllPages(
        entities.automationTaskRuns.query.byQueue({
            status: "queued",
            workspaceId: GLOBAL_WORKSPACE_ID,
        }),
    )) as AutomationTaskRunRecord[];

    return records
        .filter((record) => record.expiresAt > now)
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export async function getAutomationOverview() {
    const [schedule, ledgers] = await Promise.all([
        getAutomationSchedule(),
        listLedgers(),
    ]);

    return {
        ledgers: ledgers.map((ledger) => ({
            ledgerId: ledger.ledgerId,
            name: ledger.name,
        })),
        schedule,
    };
}

function getDueTaskTypes(schedule: AutomationSchedule, now: Date) {
    const date = getUtcDate(now);
    const time = getUtcTime(now);
    const tasks: Array<{ time: string; taskType: AutomationTaskType }> = [
        ...(schedule.plaidSyncEnabled
            ? [{ taskType: "plaidSync" as const, time: schedule.plaidSyncTime }]
            : []),
        ...(schedule.amazonScraperEnabled
            ? [
                  {
                      taskType: "amazonScraper" as const,
                      time: schedule.amazonScraperTime,
                  },
              ]
            : []),
        ...(schedule.amazonImportEnabled
            ? [
                  {
                      taskType: "amazonImport" as const,
                      time: schedule.amazonImportTime,
                  },
              ]
            : []),
        ...(schedule.aiClassificationEnabled
            ? [
                  {
                      taskType: "aiClassification" as const,
                      time: schedule.aiClassificationTime,
                  },
              ]
            : []),
    ];

    return tasks.filter((task) => task.time <= time).map((task) => ({
        ...task,
        scheduledDate: date,
    }));
}

async function getTaskRun(input: { ledgerId: string; taskRunId: string }) {
    const { entities } = getBudgetedSchema();
    const result = await entities.automationTaskRuns.get(input).go();

    return (result.data as AutomationTaskRunRecord | undefined) ?? null;
}

async function putTaskRun(record: AutomationTaskRunRecord) {
    await getBudgetedSchema().entities.automationTaskRuns.put(record).go();
    return toPublicRun(record);
}

function createTaskRun(input: {
    details?: Record<string, number | string>;
    ledgerId: string;
    now: Date;
    scheduledDate: string;
    scheduledFor?: string;
    scheduledTime: string;
    status: AutomationTaskRunStatus;
    taskRunId?: string;
    taskType: AutomationTaskType;
}) {
    const timestamp = nowIso(input.now);

    return {
        completedAt:
            input.status === "queued" || input.status === "running"
                ? undefined
                : timestamp,
        createdAt: timestamp,
        detailsJson: JSON.stringify(input.details ?? {}),
        expiresAt: getExpiresAt(input.now),
        ledgerId: input.ledgerId,
        scheduledDate: input.scheduledDate,
        scheduledFor:
            input.scheduledFor ??
            getScheduledFor(input.scheduledDate, input.scheduledTime),
        startedAt: timestamp,
        status: input.status,
        taskRunId:
            input.taskRunId ?? getTaskRunId(input.taskType, input.scheduledDate),
        taskType: input.taskType,
        updatedAt: timestamp,
        workspaceId: GLOBAL_WORKSPACE_ID,
    } satisfies AutomationTaskRunRecord;
}

function finishTaskRun(input: {
    details: Record<string, number | string>;
    error?: string;
    now: Date;
    record: AutomationTaskRunRecord;
    status: Exclude<AutomationTaskRunStatus, "queued" | "running">;
}) {
    const record = { ...input.record };
    delete record.error;

    return {
        ...record,
        completedAt: nowIso(input.now),
        detailsJson: JSON.stringify({
            ...parseDetails(input.record.detailsJson),
            ...input.details,
        }),
        ...(input.error ? { error: input.error } : {}),
        status: input.status,
        updatedAt: nowIso(input.now),
    } satisfies AutomationTaskRunRecord;
}

function isConditionalWriteConflict(error: unknown) {
    return (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error.name === "ConditionalCheckFailedException" ||
            error.name === "ConditionalCheckFailed")
    );
}

async function claimQueuedTaskRun(
    record: AutomationTaskRunRecord,
    now: Date,
) {
    const timestamp = nowIso(now);

    try {
        await getBudgetedSchema().entities.automationTaskRuns
            .update({
                ledgerId: record.ledgerId,
                taskRunId: record.taskRunId,
            })
            .set({
                startedAt: timestamp,
                status: "running",
                updatedAt: timestamp,
            })
            .composite({ workspaceId: record.workspaceId })
            .where((attribute, operation) =>
                operation.eq(attribute.status, "queued"),
            )
            .go();
    } catch (error) {
        if (isConditionalWriteConflict(error)) {
            return null;
        }

        throw error;
    }

    return {
        ...record,
        startedAt: timestamp,
        status: "running" as const,
        updatedAt: timestamp,
    } satisfies AutomationTaskRunRecord;
}

async function runPublishedWorkspaceMutation<
    TResult extends { workspaceChanges: WorkspaceMutationChangeInput[] },
>(input: {
    ledgerId: string;
    mutate: () => Promise<TResult>;
}) {
    const fenceToken = await beginWorkspaceExplicitMutation(input.ledgerId);
    let fenceActive = true;

    try {
        const result = await input.mutate();

        await persistWorkspaceChanges({
            activeLedgerId: input.ledgerId,
            changes: result.workspaceChanges,
        });
        await completeWorkspaceExplicitMutation({
            ledgerId: input.ledgerId,
            token: fenceToken,
        });
        fenceActive = false;

        return result;
    } catch (error) {
        if (fenceActive) {
            await recoverWorkspaceExplicitMutation({
                ledgerId: input.ledgerId,
                token: fenceToken,
            }).catch(() => undefined);
        }

        throw error;
    }
}

async function runPlaidSync(ledgerId: string): Promise<AutomationTaskResult> {
    const { entities } = getBudgetedSchema();
    const links = await queryAllPages(
        entities.plaidAccountLinks.query.byLink({ ledgerId }),
    );
    const linksByItem = new Map<string, string>();

    for (const link of links) {
        if (link.status === "linked" && !linksByItem.has(link.plaidItemId)) {
            linksByItem.set(link.plaidItemId, link.plaidAccountLinkId);
        }
    }

    if (linksByItem.size === 0) {
        return {
            details: { itemCount: 0 },
            status: "skipped" as const,
        };
    }

    let succeededCount = 0;
    let failedCount = 0;

    for (const linkId of linksByItem.values()) {
        try {
            await syncPlaidAccountLink({ ledgerId }, linkId);
            succeededCount += 1;
        } catch {
            failedCount += 1;
        }
    }

    return {
        details: {
            failedCount,
            itemCount: linksByItem.size,
            succeededCount,
        },
        status:
            failedCount === 0
                ? ("succeeded" as const)
                : succeededCount > 0
                  ? ("partial" as const)
                  : ("failed" as const),
    };
}

async function runAmazonScraper(
    ledgerId: string,
): Promise<AutomationTaskResult> {
    try {
        const result = await runPublishedWorkspaceMutation({
            ledgerId,
            mutate: () => launchAmazonOrderSync(ledgerId),
        });

        return {
            details: { syncRunId: result.syncRunId },
            status: "succeeded" as const,
        };
    } catch (error) {
        return {
            details: {},
            error: getErrorMessage(error),
            status:
                error instanceof HttpError &&
                error.code === "amazon_account_required"
                    ? ("skipped" as const)
                    : ("failed" as const),
        };
    }
}

async function runAmazonImport(
    ledgerId: string,
): Promise<AutomationTaskResult> {
    const manifest = await readAmazonScraperManifest();

    if (manifest.state !== "complete") {
        return {
            details: { scraperState: manifest.state ?? "unknown" },
            status: "skipped" as const,
        };
    }

    try {
        const result = await runPublishedWorkspaceMutation({
            ledgerId,
            mutate: () => syncLatestAmazonOrders(ledgerId),
        });

        return {
            details: {
                paymentCount: result.paymentCount,
                syncRunId: result.syncRun.syncRunId,
            },
            status: "succeeded" as const,
        };
    } catch (error) {
        return {
            details: {},
            error: getErrorMessage(error),
            status: "failed" as const,
        };
    }
}

async function runAiClassification(
    ledgerId: string,
): Promise<AutomationTaskResult> {
    const result = await classifyLedgerNow({
        ledgerId,
        source: "background",
    });

    return {
        details: {
            accountCount: result.accountCount,
            eligibleCount: result.eligibleCount,
            errorCount: result.errorCount,
            savedCount: result.savedCount,
        },
        error: result.errors[0],
        status:
            result.errorCount === 0
                ? ("succeeded" as const)
                : result.savedCount > 0
                  ? ("partial" as const)
                  : ("failed" as const),
    };
}

async function runTaskWork(
    taskType: AutomationTaskType,
    ledgerId: string,
): Promise<AutomationTaskResult> {
    switch (taskType) {
        case "plaidSync":
            return runPlaidSync(ledgerId);
        case "amazonScraper":
            return runAmazonScraper(ledgerId);
        case "amazonImport":
            return runAmazonImport(ledgerId);
        case "aiClassification":
            return runAiClassification(ledgerId);
    }
}

export async function scheduleAutomationRunNow(
    taskType: AutomationTaskType,
    now = new Date(),
) {
    const ledgers = await listLedgers();
    const scheduledDate = getUtcDate(now);
    const scheduledTime = getUtcTime(now);
    const taskRuns: AutomationTaskRun[] = [];

    for (const ledger of ledgers) {
        if (ledger.status === "archived") {
            continue;
        }

        taskRuns.push(
            await putTaskRun(
                createTaskRun({
                    details: { trigger: "manual" },
                    ledgerId: ledger.ledgerId,
                    now,
                    scheduledDate,
                    scheduledFor: nowIso(now),
                    scheduledTime,
                    status: "queued",
                    taskRunId: `manual:${taskType}:${ulid(now.getTime())}`,
                    taskType,
                }),
            ),
        );
    }

    return taskRuns;
}

async function runQueuedTaskRun(
    record: AutomationTaskRunRecord,
    now: Date,
) {
    const currentRecord = await getTaskRun({
        ledgerId: record.ledgerId,
        taskRunId: record.taskRunId,
    });

    if (!currentRecord || currentRecord.status !== "queued") {
        return null;
    }

    const runningRecord = await claimQueuedTaskRun(currentRecord, now);

    if (!runningRecord) {
        return null;
    }

    const currentLedger = await getLedgerRecord(runningRecord.ledgerId);

    if (!currentLedger || currentLedger.status === "archived") {
        return putTaskRun(
            finishTaskRun({
                details: {
                    reason: currentLedger
                        ? "Ledger is archived."
                        : "Ledger is no longer available.",
                },
                now: new Date(),
                record: runningRecord,
                status: "skipped",
            }),
        );
    }

    try {
        const result = await runTaskWork(
            runningRecord.taskType,
            currentLedger.ledgerId,
        );

        return putTaskRun(
            finishTaskRun({
                details: result.details,
                error: result.error,
                now: new Date(),
                record: runningRecord,
                status: result.status,
            }),
        );
    } catch (error) {
        return putTaskRun(
            finishTaskRun({
                details: {},
                error: getErrorMessage(error),
                now: new Date(),
                record: runningRecord,
                status: "failed",
            }),
        );
    }
}

export async function runQueuedAutomation(now = new Date()) {
    const queuedRecords = await listQueuedAutomationTaskRunRecords();
    const runs: AutomationTaskRun[] = [];

    for (const record of queuedRecords) {
        const run = await runQueuedTaskRun(record, now);

        if (run) {
            runs.push(run);
        }
    }

    return runs;
}

async function runTaskForLedger(input: {
    ledger: LedgerRecord;
    now: Date;
    scheduledDate: string;
    scheduledTime: string;
    taskType: AutomationTaskType;
}) {
    const taskRunId = getTaskRunId(input.taskType, input.scheduledDate);
    const existing = await getTaskRun({
        ledgerId: input.ledger.ledgerId,
        taskRunId,
    });

    if (existing) {
        return toPublicRun(existing);
    }

    const currentLedger = await getLedgerRecord(input.ledger.ledgerId);

    if (!currentLedger || currentLedger.status === "archived") {
        return putTaskRun(
            createTaskRun({
                details: { reason: "Ledger is archived." },
                ledgerId: input.ledger.ledgerId,
                now: input.now,
                scheduledDate: input.scheduledDate,
                scheduledTime: input.scheduledTime,
                status: "skipped",
                taskType: input.taskType,
            }),
        );
    }

    const running = await putTaskRun(
        createTaskRun({
            ledgerId: currentLedger.ledgerId,
            now: input.now,
            scheduledDate: input.scheduledDate,
            scheduledTime: input.scheduledTime,
            status: "running",
            taskType: input.taskType,
        }),
    );
    const runningRecord: AutomationTaskRunRecord = {
        ...running,
        detailsJson: JSON.stringify(running.details),
        workspaceId: GLOBAL_WORKSPACE_ID,
    };

    try {
        const result = await runTaskWork(input.taskType, currentLedger.ledgerId);

        return putTaskRun(
            finishTaskRun({
                details: result.details,
                error: result.error,
                now: new Date(),
                record: runningRecord,
                status: result.status,
            }),
        );
    } catch (error) {
        return putTaskRun(
            finishTaskRun({
                details: {},
                error: getErrorMessage(error),
                now: new Date(),
                record: runningRecord,
                status: "failed",
            }),
        );
    }
}

async function listScheduledAmazonScraperAttempts(input: {
    ledgerId: string;
    scheduledDate: string;
}) {
    const attempts = await Promise.all(
        Array.from(
            { length: AMAZON_SCRAPER_SCHEDULED_MAX_ATTEMPTS },
            (_, index) =>
                getTaskRun({
                    ledgerId: input.ledgerId,
                    taskRunId: getAmazonScraperAttemptTaskRunId(
                        input.scheduledDate,
                        index + 1,
                    ),
                }),
        ),
    );

    return attempts.filter(
        (attempt): attempt is AutomationTaskRunRecord => Boolean(attempt),
    );
}

function getAmazonScraperAttemptNumber(record: AutomationTaskRunRecord) {
    const attempt = Number(parseDetails(record.detailsJson).attempt);

    return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
}

function isAmazonScraperRetryDue(input: {
    attempt: number;
    completedAt?: string;
    now: Date;
}) {
    if (!input.completedAt) {
        return false;
    }

    const backoffMinutes = Math.min(
        input.attempt * AMAZON_SCRAPER_RETRY_INTERVAL_MINUTES,
        AMAZON_SCRAPER_RETRY_MAX_BACKOFF_MINUTES,
    );

    return (
        input.now.getTime() >=
        new Date(input.completedAt).getTime() + backoffMinutes * 60 * 1000
    );
}

async function finishScheduledAmazonScraperAttemptFromManifest(
    record: AutomationTaskRunRecord,
    now: Date,
) {
    const manifest = await readAmazonScraperManifest().catch(() => null);
    if (!manifest) {
        return record;
    }
    const details = parseDetails(record.detailsJson);
    const expectedSyncId = details.scraperSyncId;

    if (
        typeof expectedSyncId === "string" &&
        manifest.syncId !== expectedSyncId
    ) {
        return record;
    }

    if (manifest.state !== "complete" && manifest.state !== "failed") {
        return record;
    }

    const finished = finishTaskRun({
        details: {
            orderCount: manifest.orderCount ?? 0,
            scraperState: manifest.state,
        },
        error:
            manifest.state === "failed"
                ? manifest.lastError ?? "The Amazon scraper failed."
                : undefined,
        now,
        record,
        status: manifest.state === "complete" ? "succeeded" : "failed",
    });
    await getBudgetedSchema().entities.automationTaskRuns.put(finished).go();

    return finished;
}

async function launchScheduledAmazonScraperAttempt(input: {
    attempt: number;
    ledger: LedgerRecord;
    now: Date;
    scheduledDate: string;
    scheduledTime: string;
}) {
    const running = createTaskRun({
        details: {
            attempt: input.attempt,
            maxAttempts: AMAZON_SCRAPER_SCHEDULED_MAX_ATTEMPTS,
            trigger: "scheduled",
        },
        ledgerId: input.ledger.ledgerId,
        now: input.now,
        scheduledDate: input.scheduledDate,
        scheduledTime: input.scheduledTime,
        status: "running",
        taskRunId: getAmazonScraperAttemptTaskRunId(
            input.scheduledDate,
            input.attempt,
        ),
        taskType: "amazonScraper",
    });
    await putTaskRun(running);

    try {
        const result = await runPublishedWorkspaceMutation({
            ledgerId: input.ledger.ledgerId,
            mutate: () => launchAmazonOrderSync(input.ledger.ledgerId),
        });
        if (!result.scraperSyncId) {
            throw new Error(
                "The Amazon scraper launch did not return a scraper sync ID.",
            );
        }
        const launched = {
            ...running,
            detailsJson: JSON.stringify({
                ...parseDetails(running.detailsJson),
                scraperSyncId: result.scraperSyncId,
                syncRunId: result.syncRunId,
            }),
            updatedAt: nowIso(),
        } satisfies AutomationTaskRunRecord;

        return putTaskRun(launched);
    } catch (error) {
        return putTaskRun(
            finishTaskRun({
                details: {},
                error: getErrorMessage(error),
                now: new Date(),
                record: running,
                status:
                    error instanceof HttpError &&
                    error.code === "amazon_account_required"
                        ? "skipped"
                        : "failed",
            }),
        );
    }
}

async function runScheduledAmazonScraperForLedger(input: {
    ledger: LedgerRecord;
    now: Date;
    scheduledDate: string;
    scheduledTime: string;
}) {
    const legacyRun = await getTaskRun({
        ledgerId: input.ledger.ledgerId,
        taskRunId: getTaskRunId("amazonScraper", input.scheduledDate),
    });
    if (legacyRun) {
        return toPublicRun(legacyRun);
    }

    const attempts = await listScheduledAmazonScraperAttempts({
        ledgerId: input.ledger.ledgerId,
        scheduledDate: input.scheduledDate,
    });
    let latest = attempts.at(-1);

    if (!latest) {
        return launchScheduledAmazonScraperAttempt({ ...input, attempt: 1 });
    }

    if (latest.status === "running") {
        latest = await finishScheduledAmazonScraperAttemptFromManifest(
            latest,
            input.now,
        );
    }

    const attempt = getAmazonScraperAttemptNumber(latest);
    if (
        latest.status === "failed" &&
        attempt < AMAZON_SCRAPER_SCHEDULED_MAX_ATTEMPTS &&
        isAmazonScraperRetryDue({
            attempt,
            completedAt: latest.completedAt,
            now: input.now,
        })
    ) {
        return launchScheduledAmazonScraperAttempt({
            ...input,
            attempt: attempt + 1,
        });
    }

    return toPublicRun(latest);
}

export async function runScheduledAutomation(now = new Date()) {
    const runs = await runQueuedAutomation(now);
    const schedule = await getAutomationSchedule();
    const dueTasks = getDueTaskTypes(schedule, now);

    if (dueTasks.length === 0) {
        return runs;
    }

    const ledgers = await listLedgers();
    const activeLedgers = ledgers.filter((ledger) => ledger.status !== "archived");
    for (const task of dueTasks) {
        for (const ledger of activeLedgers) {
            if (task.taskType === "amazonScraper") {
                runs.push(
                    await runScheduledAmazonScraperForLedger({
                        ledger,
                        now,
                        scheduledDate: task.scheduledDate,
                        scheduledTime: task.time,
                    }),
                );
                continue;
            }

            runs.push(
                await runTaskForLedger({
                    ledger,
                    now,
                    scheduledDate: task.scheduledDate,
                    scheduledTime: task.time,
                    taskType: task.taskType,
                }),
            );
        }
    }

    return runs;
}
