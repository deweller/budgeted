import { RESET_WARNING_LABELS } from "./reset-scope";

export type ResetCountEntry = {
    label: string;
    count: number;
};

export type ResetSuccessResult = {
    status: "success";
    targetLabel: string;
    startedAt: string;
    finishedAt: string;
    clearedCounts: ResetCountEntry[];
    preservedCounts: ResetCountEntry[];
};

export type IncompleteResetResult = {
    status: "incomplete";
    targetLabel: string;
    startedAt: string;
    finishedAt: string;
    clearedCounts: ResetCountEntry[];
    preservedCounts: ResetCountEntry[];
    remainingCounts: ResetCountEntry[];
    failureReasons: string[];
};

export type ResetExecutionResult = ResetSuccessResult | IncompleteResetResult;

export function buildCountEntries(
    counts: ReadonlyMap<string, number>,
): ResetCountEntry[] {
    return Array.from(counts.entries())
        .filter(([, count]) => count > 0)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, count]) => ({ label, count }));
}

function formatCountList(entries: ResetCountEntry[]) {
    if (entries.length === 0) {
        return ["- none"];
    }

    return entries.map((entry) => `- ${entry.label}: ${entry.count}`);
}

export function buildDestructiveWarning(input: {
    targetLabel: string;
}) {
    return [
        `Reset target: ${input.targetLabel}`,
        "This will permanently clear budgeting and workspace data from the selected target:",
        ...RESET_WARNING_LABELS.map((label) => `- ${label}`),
        "This will be preserved:",
        "- User accounts",
        "- Linked auth configuration",
        'Type "yes" at the prompt to continue or anything else to cancel.',
    ];
}

export function formatResetExecutionResult(result: ResetExecutionResult) {
    const lines = [
        `Reset target: ${result.targetLabel}`,
        `Status: ${result.status}`,
        `Started: ${result.startedAt}`,
        `Finished: ${result.finishedAt}`,
        "Cleared:",
        ...formatCountList(result.clearedCounts),
        "Preserved:",
        ...formatCountList(result.preservedCounts),
    ];

    if (result.status === "success") {
        return [...lines, "Target is ready for fresh setup."];
    }

    return [
        ...lines,
        "Remaining targeted data:",
        ...formatCountList(result.remainingCounts),
        "Failures:",
        ...(result.failureReasons.length > 0
            ? result.failureReasons.map((reason) => `- ${reason}`)
            : ["- none recorded"]),
        "Target is incomplete. Retry is required before treating it as clean.",
    ];
}
