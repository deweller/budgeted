"use client";

import { useMemo, useState } from "react";
import {
    faCircleCheck,
    faCircleNotch,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    useBackgroundMutationActivity,
    type BackgroundMutationActivity,
} from "@/components/shared/background-mutation-activity-provider";

type SidebarMutationActivityProps = {
    isCollapsed: boolean;
    onExpandSidebar: () => void;
};

function getActivityLabel(activity: BackgroundMutationActivity) {
    return activity.status === "pending"
        ? activity.pendingLabel
        : activity.completedLabel;
}

function getPrioritizedActivities(activities: BackgroundMutationActivity[]) {
    return [...activities].sort((left, right) => {
        if (left.status === right.status) {
            return 0;
        }

        return left.status === "pending" ? -1 : 1;
    });
}

export function SidebarMutationActivity({
    isCollapsed,
    onExpandSidebar,
}: SidebarMutationActivityProps) {
    const { activities } = useBackgroundMutationActivity();
    const [isExpanded, setIsExpanded] = useState(false);
    const prioritizedActivities = useMemo(
        () => getPrioritizedActivities(activities),
        [activities],
    );
    const primaryActivity = prioritizedActivities[0];
    const additionalActivityCount = Math.max(
        0,
        prioritizedActivities.length - 1,
    );

    if (!primaryActivity) {
        return null;
    }

    function expandFromCollapsedSidebar() {
        onExpandSidebar();
        setIsExpanded(true);
    }

    return (
        <div className="relative shrink-0 border-t border-[var(--color-border)] bg-[var(--color-panel-strong)]">
            {isExpanded ? (
                <div className="absolute bottom-full left-0 right-0 max-h-64 overflow-y-auto border-t border-[var(--color-border)] bg-[var(--color-panel-strong)] shadow-[var(--shadow-panel)]">
                    <ol aria-label="Background activity" className="grid">
                        {prioritizedActivities.map((activity) => (
                            <li
                                key={activity.id}
                                className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-xs last:border-b-0"
                            >
                                <ActivityIcon activity={activity} />
                                <span className="min-w-0 flex-1 truncate">
                                    {getActivityLabel(activity)}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : null}
            {isCollapsed ? (
                <button
                    type="button"
                    aria-label="Show background activity"
                    title={getActivityLabel(primaryActivity)}
                    onClick={expandFromCollapsedSidebar}
                    className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-1 bg-transparent px-2 text-sm text-[var(--color-ink)] transition hover:bg-[var(--color-panel-elevated)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                >
                    <ActivityIcon activity={primaryActivity} />
                    {additionalActivityCount > 0 ? (
                        <span className="text-xs font-semibold">
                            +{additionalActivityCount}
                        </span>
                    ) : null}
                </button>
            ) : (
                <div className="grid gap-1 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--color-ink)]">
                        <ActivityIcon activity={primaryActivity} />
                        <span className="min-w-0 flex-1 truncate">
                            {getActivityLabel(primaryActivity)}
                        </span>
                    </div>
                    {additionalActivityCount > 0 ? (
                        <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => setIsExpanded((value) => !value)}
                            className="w-fit cursor-pointer bg-transparent text-left text-xs font-medium text-[var(--color-accent-ink)] transition hover:text-[var(--color-accent-ink-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                        >
                            {isExpanded
                                ? "Hide activity"
                                : `and ${additionalActivityCount} more`}
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function ActivityIcon({ activity }: { activity: BackgroundMutationActivity }) {
    return (
        <FontAwesomeIcon
            aria-hidden="true"
            className={
                activity.status === "pending"
                    ? "h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-accent-ink)]"
                    : "h-3.5 w-3.5 shrink-0 text-[var(--tone-success-ink)]"
            }
            icon={
                activity.status === "pending" ? faCircleNotch : faCircleCheck
            }
        />
    );
}
