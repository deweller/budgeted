import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import type { WorkspaceChange } from "@/lib/workspace/sync-types";

export class WorkspaceTransitionError extends Error {
    readonly change: WorkspaceChange;

    constructor(change: WorkspaceChange) {
        super(
            `Workspace ${change.operation} transition for ${change.entityType}:${change.entityId} does not match its expected prior record.`,
        );
        this.name = "WorkspaceTransitionError";
        this.change = change;
    }
}

export function isWorkspaceTransitionError(
    error: unknown,
): error is WorkspaceTransitionError {
    return error instanceof WorkspaceTransitionError;
}

/** Verifies that a change applies to the exact prior server record. */
export function hasValidWorkspaceRecordTransition(input: {
    change: WorkspaceChange;
    currentRecord: unknown | undefined;
}) {
    const { change, currentRecord } = input;

    if (change.previousRecordDigest === null) {
        return currentRecord === undefined;
    }

    if (!change.previousRecordDigest || currentRecord === undefined) {
        return false;
    }

    return (
        calculateWorkspaceRecordDigest({
            entityType: change.entityType,
            record: currentRecord,
        }) === change.previousRecordDigest
    );
}

export function assertValidWorkspaceRecordTransition(input: {
    change: WorkspaceChange;
    currentRecord: unknown | undefined;
}) {
    if (hasValidWorkspaceRecordTransition(input)) {
        return;
    }

    throw new WorkspaceTransitionError(input.change);
}
