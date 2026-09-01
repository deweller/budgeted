export type DeletionTargetType = "account" | "category" | "transaction";

export type DeletionSectionId = "accounts" | "budget" | "transactions";

export type DeletionTarget = {
    displayName: string;
    sectionId: DeletionSectionId;
    targetId: string;
    targetType: DeletionTargetType;
};

export type DeletionCountSummary = {
    count: number;
    label: string;
};

export type PreservedRecordSummary = DeletionCountSummary & {
    description?: string;
};

export type DeletionImpactSummary = {
    affectedPeriods: string[];
    crossAreaEffects: string[];
    dependentCounts: DeletionCountSummary[];
    isPermanent: true;
    permanentWarning: string;
    preservedRecords: PreservedRecordSummary[];
    previewRevision: string;
    target: DeletionTarget;
};

export const DEFAULT_PERMANENT_WARNING =
    "This deletion is permanent and cannot be undone.";

function compareCounts(
    left: DeletionCountSummary,
    right: DeletionCountSummary,
) {
    if (left.count !== right.count) {
        return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
}

export function normalizeDeletionCounts<TCount extends DeletionCountSummary>(
    counts: Iterable<TCount | undefined> | undefined,
) {
    if (!counts) {
        return [];
    }

    return Array.from(counts)
        .filter(
            (count): count is TCount =>
                count !== undefined &&
                count.count > 0 &&
                count.label.trim().length > 0,
        )
        .sort(compareCounts);
}

export function normalizeAffectedPeriods(
    periodIds: Iterable<string | undefined> | undefined,
) {
    if (!periodIds) {
        return [];
    }

    return Array.from(
        new Set(
            Array.from(periodIds).filter((periodId): periodId is string =>
                Boolean(periodId?.trim()),
            ),
        ),
    ).sort((left, right) => left.localeCompare(right));
}
