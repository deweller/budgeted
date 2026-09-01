import { HttpError } from "@/lib/api/errors";

import {
    type DeletionCountSummary,
    normalizeAffectedPeriods,
    normalizeDeletionCounts,
    type PreservedRecordSummary,
} from "@/features/shared/models/deletion-impact";

function serializeCountSummaries(
    counts: DeletionCountSummary[] | PreservedRecordSummary[],
) {
    return counts.map((count) => `${count.label}:${count.count}`).join("|");
}

export function createDeletionPreviewRevision(input: {
    affectedPeriods?: Iterable<string | undefined>;
    dependentRevisions?: Iterable<string | undefined>;
    dependentCounts?: Iterable<DeletionCountSummary | undefined>;
    preservedRecords?: Iterable<PreservedRecordSummary | undefined>;
    targetId: string;
    targetUpdatedAt?: string;
}) {
    const dependentCounts = normalizeDeletionCounts(input.dependentCounts);
    const preservedRecords = normalizeDeletionCounts(input.preservedRecords);
    const affectedPeriods = normalizeAffectedPeriods(input.affectedPeriods);
    const dependentRevisions = Array.from(
        new Set(
            Array.from(input.dependentRevisions ?? []).filter(
                (revision): revision is string => Boolean(revision?.trim()),
            ),
        ),
    ).sort((left, right) => left.localeCompare(right));

    return [
        input.targetId,
        input.targetUpdatedAt ?? "",
        serializeCountSummaries(dependentCounts),
        serializeCountSummaries(preservedRecords),
        affectedPeriods.join("|"),
        dependentRevisions.join("|"),
    ].join("::");
}

export function assertDeletionPreviewRevision(
    previewRevision: string | null | undefined,
    expectedRevision: string,
) {
    if (!previewRevision) {
        throw new HttpError(
            409,
            "deletion_preview_missing",
            "The deletion preview is missing. Refresh and review the warning before confirming.",
        );
    }

    if (previewRevision !== expectedRevision) {
        throw new HttpError(
            409,
            "deletion_preview_stale",
            "The deletion preview is stale. Refresh and review the warning before confirming.",
        );
    }
}
