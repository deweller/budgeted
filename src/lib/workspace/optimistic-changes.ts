import { ulid } from "ulid";

import {
    WORKSPACE_CHANGE_RETENTION_DAYS,
    type WorkspaceEntityType,
    type WorkspaceRecordChange,
} from "@/lib/workspace/sync-types";

type OptimisticWorkspaceRecordChangeInput = {
    batchId?: string;
    changedAt?: Date;
    entityId: string;
    entityType: WorkspaceEntityType;
    record: unknown;
};

type OptimisticWorkspaceDeleteInput = Omit<
    OptimisticWorkspaceRecordChangeInput,
    "record"
>;

export type OptimisticWorkspaceChange = WorkspaceRecordChange & {
    batchId: string;
    changedAt: string;
    changeId: string;
    expiresAt: number;
};

function createOptimisticWorkspaceChangeMetadata(input: {
    batchId?: string;
    changedAt?: Date;
    entityId: string;
    entityType: WorkspaceEntityType;
}) {
    const changedAtDate = input.changedAt ?? new Date();
    const changedAt = changedAtDate.toISOString();
    const batchId = input.batchId ?? `optimistic:${ulid()}`;

    return {
        batchId,
        changedAt,
        changeId: `${batchId}:${input.entityType}:${input.entityId}`,
        entityId: input.entityId,
        entityType: input.entityType,
        expiresAt:
            Math.floor(changedAtDate.getTime() / 1000) +
            WORKSPACE_CHANGE_RETENTION_DAYS * 24 * 60 * 60,
    };
}

export function createOptimisticWorkspaceUpsert(
    input: OptimisticWorkspaceRecordChangeInput,
): OptimisticWorkspaceChange {
    return {
        ...createOptimisticWorkspaceChangeMetadata(input),
        operation: "upsert",
        record: input.record,
    };
}

export function createOptimisticWorkspaceDelete(
    input: OptimisticWorkspaceDeleteInput,
): OptimisticWorkspaceChange {
    return {
        ...createOptimisticWorkspaceChangeMetadata(input),
        operation: "delete",
        record: null,
    };
}
