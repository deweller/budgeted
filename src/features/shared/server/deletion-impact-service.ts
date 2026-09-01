import {
    DEFAULT_PERMANENT_WARNING,
    normalizeAffectedPeriods,
    normalizeDeletionCounts,
    type DeletionImpactSummary,
    type DeletionTarget,
    type DeletionCountSummary,
    type PreservedRecordSummary,
} from "@/features/shared/models/deletion-impact";
import { createDeletionPreviewRevision } from "@/features/shared/server/deletion-policy-service";

export function createDeletionImpactSummary(input: {
    affectedPeriods?: Iterable<string | undefined>;
    crossAreaEffects?: Iterable<string | undefined>;
    dependentRevisions?: Iterable<string | undefined>;
    dependentCounts?: Iterable<DeletionCountSummary | undefined>;
    permanentWarning?: string;
    preservedRecords?: Iterable<PreservedRecordSummary | undefined>;
    target: DeletionTarget;
    targetUpdatedAt?: string;
}): DeletionImpactSummary {
    const dependentCounts = normalizeDeletionCounts(input.dependentCounts);
    const preservedRecords = normalizeDeletionCounts(input.preservedRecords);
    const affectedPeriods = normalizeAffectedPeriods(input.affectedPeriods);
    const crossAreaEffects = Array.from(
        new Set(
            Array.from(input.crossAreaEffects ?? []).filter(
                (effect): effect is string => Boolean(effect?.trim()),
            ),
        ),
    );

    return {
        target: input.target,
        isPermanent: true,
        permanentWarning:
            input.permanentWarning?.trim() || DEFAULT_PERMANENT_WARNING,
        dependentCounts,
        affectedPeriods,
        preservedRecords,
        crossAreaEffects,
        previewRevision: createDeletionPreviewRevision({
            targetId: input.target.targetId,
            targetUpdatedAt: input.targetUpdatedAt,
            dependentCounts,
            preservedRecords,
            affectedPeriods,
            dependentRevisions: input.dependentRevisions,
        }),
    };
}

export function hasDependentDeletionImpact(summary: DeletionImpactSummary) {
    return summary.dependentCounts.length > 0;
}
