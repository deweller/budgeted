import { z } from "zod";

import { WORKSPACE_ENTITY_TYPES } from "@/lib/workspace/entity-config";
import { WorkspaceMutationResponseError } from "@/lib/workspace/reconciliation";
import {
    WORKSPACE_SYNC_PROTOCOL_VERSION,
    type WorkspaceEntityType,
    type WorkspaceSyncEnvelope,
} from "@/lib/workspace/sync-types";

const workspaceEntityTypeSchema = z.enum(
    WORKSPACE_ENTITY_TYPES as [
        WorkspaceEntityType,
        ...WorkspaceEntityType[],
    ],
);

const workspaceVersionSchema = z.object({
    cursor: z.string().min(1),
    generation: z.number().int().positive(),
    ledgerId: z.string().min(1),
    protocolVersion: z.literal(WORKSPACE_SYNC_PROTOCOL_VERSION),
    revision: z.number().int().nonnegative(),
});

const workspaceRecordChangeBaseSchema = z.object({
    entityId: z.string().min(1),
    entityType: workspaceEntityTypeSchema,
});

const workspaceRecordChangeSchema = z.discriminatedUnion("operation", [
    workspaceRecordChangeBaseSchema.extend({
        operation: z.literal("delete"),
        record: z.null(),
    }),
    workspaceRecordChangeBaseSchema.extend({
        operation: z.literal("upsert"),
        record: z.object({}).passthrough(),
    }),
]);

const workspaceCommitSchema = z.object({
    changes: z.array(workspaceRecordChangeSchema),
    commitId: z.string().min(1),
    committedAt: z.string().datetime({ offset: true }),
    fromVersion: workspaceVersionSchema,
    toVersion: workspaceVersionSchema,
});

export const workspaceSyncEnvelopeSchema = z.object({
    commits: z.array(workspaceCommitSchema),
    fromVersion: workspaceVersionSchema,
    toVersion: workspaceVersionSchema,
});

const workspaceMutationResponseSchema = z
    .object({ workspaceSync: workspaceSyncEnvelopeSchema })
    .passthrough();

export { WorkspaceMutationResponseError };

export type WorkspaceMutationResponse<TResponse extends object> = TResponse & {
    workspaceSync: WorkspaceSyncEnvelope;
};

function throwWorkspaceMutationResponseError(): never {
    throw new WorkspaceMutationResponseError();
}

export async function readWorkspaceMutationResponse<
    TResponse extends object,
>(
    response: Response,
): Promise<WorkspaceMutationResponse<TResponse>> {
    const payload = await response.json().catch(() => null);
    const parsed = workspaceMutationResponseSchema.safeParse(payload);

    if (!parsed.success) {
        return throwWorkspaceMutationResponseError();
    }

    return {
        ...(parsed.data as TResponse),
        workspaceSync: parsed.data.workspaceSync as WorkspaceSyncEnvelope,
    };
}

export async function readWorkspaceMutationWorkspaceChanges(response: Response) {
    const payload = await readWorkspaceMutationResponse(response);
    return payload.workspaceSync;
}
