"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faChevronRight,
    faClock,
    faPlay,
    faRobot,
    faTruckFast,
} from "@fortawesome/free-solid-svg-icons";

import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import type {
    AutomationScheduleInput,
    AutomationTaskType,
} from "@/features/automation/models/automation";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatMediumDisplayDateTime } from "@/lib/dates/local-date";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type AutomationSchedule = AutomationScheduleInput & {
    createdAt: string;
    settingsId: string;
    updatedAt: string;
};

type AutomationTaskRun = {
    completedAt?: string;
    details: Record<string, number | string>;
    error?: string;
    ledgerId: string;
    scheduledFor: string;
    startedAt: string;
    status: "failed" | "partial" | "queued" | "running" | "skipped" | "succeeded";
    taskRunId: string;
    taskType: "aiClassification" | "amazonImport" | "amazonScraper" | "plaidSync";
};

type AutomationOverview = {
    ledgers: Array<{ ledgerId: string; name: string }>;
    schedule: AutomationSchedule;
};

type AutomationHistoryResponse = {
    taskRuns: AutomationTaskRun[];
};

type AutomationRunNowResponse = {
    taskRuns: AutomationTaskRun[];
};

type AutomationScheduleState = {
    aiClassificationEnabled: boolean;
    aiClassificationTime: string;
    amazonImportEnabled: boolean;
    amazonImportTime: string;
    amazonScraperEnabled: boolean;
    amazonScraperTime: string;
    plaidSyncEnabled: boolean;
    plaidSyncTime: string;
};

const TASK_ROWS = [
    {
        description: "Sync linked Plaid institutions for every non-archived ledger.",
        enabledKey: "plaidSyncEnabled" as const,
        icon: faArrowsRotate,
        label: "Plaid sync",
        taskType: "plaidSync" as const,
        timeKey: "plaidSyncTime" as const,
    },
    {
        description: "Launch the Amazon scraper before the daily import.",
        enabledKey: "amazonScraperEnabled" as const,
        icon: faTruckFast,
        label: "Amazon scraper",
        taskType: "amazonScraper" as const,
        timeKey: "amazonScraperTime" as const,
    },
    {
        description: "Import the scraper's completed Amazon orders and match payments.",
        enabledKey: "amazonImportEnabled" as const,
        icon: faClock,
        label: "Amazon import",
        taskType: "amazonImport" as const,
        timeKey: "amazonImportTime" as const,
    },
    {
        description: "Generate pending AI reviews for eligible uncategorized transactions.",
        enabledKey: "aiClassificationEnabled" as const,
        icon: faRobot,
        label: "AI classification",
        taskType: "aiClassification" as const,
        timeKey: "aiClassificationTime" as const,
    },
] as const;

function formatTimeValue(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getTodayDateValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function utcTimeToLocalTime(utcTime: string) {
    const date = new Date(`${getTodayDateValue()}T${utcTime}:00.000Z`);
    return formatTimeValue(date.getHours(), date.getMinutes());
}

function localTimeToUtcTime(localTime: string) {
    const date = new Date(`${getTodayDateValue()}T${localTime}:00`);
    return formatTimeValue(date.getUTCHours(), date.getUTCMinutes());
}

function toLocalSchedule(schedule: AutomationSchedule): AutomationScheduleState {
    return {
        aiClassificationEnabled: schedule.aiClassificationEnabled,
        aiClassificationTime: utcTimeToLocalTime(schedule.aiClassificationTime),
        amazonImportEnabled: schedule.amazonImportEnabled,
        amazonImportTime: utcTimeToLocalTime(schedule.amazonImportTime),
        amazonScraperEnabled: schedule.amazonScraperEnabled,
        amazonScraperTime: utcTimeToLocalTime(schedule.amazonScraperTime),
        plaidSyncEnabled: schedule.plaidSyncEnabled,
        plaidSyncTime: utcTimeToLocalTime(schedule.plaidSyncTime),
    };
}

function toUtcSchedule(schedule: AutomationScheduleState): AutomationScheduleInput {
    return {
        aiClassificationEnabled: schedule.aiClassificationEnabled,
        aiClassificationTime: localTimeToUtcTime(schedule.aiClassificationTime),
        amazonImportEnabled: schedule.amazonImportEnabled,
        amazonImportTime: localTimeToUtcTime(schedule.amazonImportTime),
        amazonScraperEnabled: schedule.amazonScraperEnabled,
        amazonScraperTime: localTimeToUtcTime(schedule.amazonScraperTime),
        plaidSyncEnabled: schedule.plaidSyncEnabled,
        plaidSyncTime: localTimeToUtcTime(schedule.plaidSyncTime),
    };
}

function getStatusClassName(status: AutomationTaskRun["status"]) {
    if (status === "succeeded") {
        return "text-[var(--tone-success-ink)]";
    }

    if (status === "failed") {
        return "text-[var(--tone-error-ink)]";
    }

    return typographyClassNames.mutedBody;
}

function formatTaskType(taskType: AutomationTaskRun["taskType"]) {
    return {
        aiClassification: "AI classification",
        amazonImport: "Amazon import",
        amazonScraper: "Amazon scraper",
        plaidSync: "Plaid sync",
    }[taskType];
}

export function AutomationPanel() {
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [overview, setOverview] = useState<AutomationOverview | null>(null);
    const [schedule, setSchedule] = useState<AutomationScheduleState | null>(null);
    const [taskRuns, setTaskRuns] = useState<AutomationTaskRun[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [runningTaskType, setRunningTaskType] = useState<AutomationTaskType | null>(
        null,
    );

    const ledgerNames = useMemo(
        () => new Map(overview?.ledgers.map((ledger) => [ledger.ledgerId, ledger.name])),
        [overview?.ledgers],
    );

    useEffect(() => {
        let isMounted = true;

        async function loadInitialOverview() {
            try {
                const response = await fetch("/api/utilities/automation");

                if (!response.ok) {
                    throw response;
                }

                const payload = (await response.json()) as AutomationOverview;

                if (isMounted) {
                    setOverview(payload);
                    setSchedule(toLocalSchedule(payload.schedule));
                }
            } catch (error) {
                if (isMounted) {
                    notifyError({
                        message:
                            error instanceof Response
                                ? await parseApiErrorMessage(
                                      error,
                                      "Unable to load automation settings.",
                                  )
                                : error instanceof Error
                                  ? error.message
                                  : "Unable to load automation settings.",
                        title: "Automation could not be loaded.",
                    });
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadInitialOverview();

        return () => {
            isMounted = false;
        };
    }, [notifyError]);

    async function loadTaskHistory() {
        if (isLoadingHistory) {
            return;
        }

        setIsLoadingHistory(true);

        try {
            const response = await fetch("/api/utilities/automation/history");

            if (!response.ok) {
                throw response;
            }

            const payload = (await response.json()) as AutomationHistoryResponse;
            setTaskRuns(payload.taskRuns);
        } catch (error) {
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to load task history.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to load task history.",
                title: "Automation history could not be loaded.",
            });
        } finally {
            setIsLoadingHistory(false);
        }
    }

    async function saveSchedule() {
        if (!schedule) {
            return;
        }

        setIsSaving(true);
        const activity = startActivity({
            completedLabel: "Automation schedule saved.",
            pendingLabel: "Saving automation schedule…",
        });

        try {
            const response = await fetch("/api/utilities/automation", {
                body: JSON.stringify(toUtcSchedule(schedule)),
                headers: { "content-type": "application/json" },
                method: "PATCH",
            });

            if (!response.ok) {
                throw response;
            }

            const savedSchedule = (await response.json()) as AutomationSchedule;
            setOverview((current) =>
                current ? { ...current, schedule: savedSchedule } : current,
            );
            setSchedule(toLocalSchedule(savedSchedule));
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to save automation settings.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to save automation settings.",
                title: "Automation could not be saved.",
            });
        } finally {
            setIsSaving(false);
        }
    }

    async function runTaskNow(taskType: AutomationTaskType) {
        setRunningTaskType(taskType);
        const activity = startActivity({
            completedLabel: "Automation task started.",
            pendingLabel: "Starting automation task…",
        });

        try {
            const response = await fetch("/api/utilities/automation", {
                body: JSON.stringify({ taskType }),
                headers: { "content-type": "application/json" },
                method: "POST",
            });

            if (!response.ok) {
                throw response;
            }

            const { taskRuns } =
                (await response.json()) as AutomationRunNowResponse;

            setTaskRuns((current) => {
                if (!current) {
                    return current;
                }

                const runsById = new Map(
                    current.map((run) => [
                        `${run.ledgerId}:${run.taskRunId}`,
                        run,
                    ]),
                );

                for (const run of taskRuns) {
                    runsById.set(`${run.ledgerId}:${run.taskRunId}`, run);
                }

                return [...runsById.values()].sort((left, right) =>
                    right.startedAt.localeCompare(left.startedAt),
                );
            });
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to start the automation task.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to start the automation task.",
                title: "Automation task could not be started.",
            });
        } finally {
            setRunningTaskType(null);
        }
    }

    if (isLoading || !schedule) {
        return <p className={typographyClassNames.mutedBody}>Loading automation...</p>;
    }

    return (
        <div className="grid gap-6">
            <section className={`grid gap-4 p-5 ${surfaceClassNames.panel}`}>
                <div>
                    <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                        Daily schedule
                    </h2>
                    <p className={`mt-1 text-sm ${typographyClassNames.mutedBody}`}>
                        Times are shown in your local timezone, saved in UTC, and run on the next 2-minute scheduler interval.
                    </p>
                </div>

                <div className="grid gap-3">
                    {TASK_ROWS.map((task) => (
                        <div
                            key={task.enabledKey}
                            className="grid gap-3 border-t border-[var(--color-border)] pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                        >
                            <label className="flex items-start gap-3 text-sm">
                                <input
                                    checked={schedule[task.enabledKey]}
                                    className="mt-1"
                                    type="checkbox"
                                    onChange={(event) => {
                                        setSchedule((current) =>
                                            current
                                                ? {
                                                      ...current,
                                                      [task.enabledKey]: event.target.checked,
                                                  }
                                                : current,
                                        );
                                    }}
                                />
                                <span className="grid gap-1">
                                    <span className="flex items-center gap-2 font-medium text-[var(--color-ink)]">
                                        <FontAwesomeIcon icon={task.icon} />
                                        {task.label}
                                    </span>
                                    <span className={typographyClassNames.mutedBody}>
                                        {task.description}
                                    </span>
                                </span>
                            </label>
                            <label className="grid gap-1 text-xs font-medium text-[var(--color-muted)]">
                                Time
                                <input
                                    className={controlClassNames.field}
                                    disabled={!schedule[task.enabledKey]}
                                    step={120}
                                    type="time"
                                    value={schedule[task.timeKey]}
                                    onChange={(event) => {
                                        setSchedule((current) =>
                                            current
                                                ? {
                                                      ...current,
                                                      [task.timeKey]: event.target.value,
                                                  }
                                                : current,
                                        );
                                    }}
                                />
                            </label>
                            <button
                                type="button"
                                disabled={runningTaskType === task.taskType}
                                onClick={() => void runTaskNow(task.taskType)}
                                className={`self-end ${controlClassNames.secondaryActionSmall}`}
                            >
                                <FontAwesomeIcon aria-hidden="true" icon={faPlay} />
                                {runningTaskType === task.taskType
                                    ? "Starting..."
                                    : "Run now"}
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex justify-end border-t border-[var(--color-border)] pt-4">
                    <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void saveSchedule()}
                        className={`${controlClassNames.primaryAction} min-w-40`}
                    >
                        {isSaving ? "Saving..." : "Save schedule"}
                    </button>
                </div>
            </section>

            <section>
                <details
                    className="group"
                    onToggle={(event) => {
                        if (event.currentTarget.open) {
                            void loadTaskHistory();
                        }
                    }}
                >
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
                        Recent task history
                        <FontAwesomeIcon
                            aria-hidden="true"
                            className="size-3 transition-transform group-open:rotate-90"
                            icon={faChevronRight}
                        />
                    </summary>

                    <div className="mt-4 grid gap-4">
                        {isLoadingHistory ? (
                            <p className={typographyClassNames.mutedBody}>
                                Loading task history...
                            </p>
                        ) : taskRuns?.length ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                                            <th className="min-w-48 px-3 py-2 font-medium">
                                                Started
                                            </th>
                                            <th className="min-w-48 px-3 py-2 font-medium">
                                                Ledger
                                            </th>
                                            <th className="min-w-44 px-3 py-2 font-medium">
                                                Task
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                Status
                                            </th>
                                            <th className="px-3 py-2 font-medium">
                                                Result
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {taskRuns.map((run) => (
                                            <tr
                                                key={`${run.ledgerId}:${run.taskRunId}`}
                                                className="border-b border-[var(--color-border)]/70"
                                            >
                                                <td className="min-w-48 whitespace-nowrap px-3 py-2 align-top">
                                                    {formatMediumDisplayDateTime(
                                                        run.startedAt,
                                                    )}
                                                </td>
                                                <td className="min-w-48 px-3 py-2 align-top">
                                                    {ledgerNames.get(run.ledgerId) ??
                                                        run.ledgerId}
                                                </td>
                                                <td className="min-w-44 px-3 py-2 align-top">
                                                    {formatTaskType(run.taskType)}
                                                </td>
                                                <td
                                                    className={`px-3 py-2 align-top capitalize ${getStatusClassName(run.status)}`}
                                                >
                                                    {run.status}
                                                </td>
                                                <td
                                                    className={`px-3 py-2 align-top ${typographyClassNames.mutedBody}`}
                                                >
                                                    {run.error ??
                                                        (Object.entries(run.details)
                                                            .map(
                                                                ([key, value]) =>
                                                                    `${key}: ${value}`,
                                                            )
                                                            .join("; ") ||
                                                            "-")}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className={typographyClassNames.mutedBody}>
                                No scheduled tasks have run in the last 60 days.
                            </p>
                        )}
                    </div>
                </details>
            </section>
        </div>
    );
}
