import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import { normalizeWorkspaceDigestRecord } from "@/lib/workspace/record-normalization";

type WorkspaceChangeIdentity = Pick<
    WorkspaceMutationChangeInput,
    "entityId" | "entityType"
>;

function getPreviousRecordDigest(
    identity: WorkspaceChangeIdentity,
    previousRecord: unknown | null,
) {
    return previousRecord === null
        ? null
        : calculateWorkspaceRecordDigest({
              entityType: identity.entityType,
              record: normalizeWorkspaceDigestRecord(
                  identity.entityType,
                  previousRecord,
              ),
          });
}

export function createWorkspaceUpsertChange(input: WorkspaceChangeIdentity & {
    previousRecord: unknown | null;
    record: unknown;
}): WorkspaceMutationChangeInput {
    return {
        entityId: input.entityId,
        entityType: input.entityType,
        operation: "upsert",
        previousRecordDigest: getPreviousRecordDigest(
            input,
            input.previousRecord,
        ),
        record: input.record,
    };
}

export function createWorkspaceDeleteChange(input: WorkspaceChangeIdentity & {
    previousRecord: unknown;
}): WorkspaceMutationChangeInput {
    return {
        entityId: input.entityId,
        entityType: input.entityType,
        operation: "delete",
        previousRecordDigest: getPreviousRecordDigest(
            input,
            input.previousRecord,
        ),
        record: null,
    };
}
