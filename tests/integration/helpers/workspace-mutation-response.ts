import {
    getWorkspaceEntityArrayKey,
    getWorkspaceEntityId,
    WORKSPACE_ENTITY_TYPES,
} from "@/lib/workspace/entity-config";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import {
    applyWorkspaceChanges,
    createWorkspaceKnowledgeFromSnapshot,
} from "@/lib/workspace/snapshot-utils";
import type {
    WorkspaceChange,
    WorkspaceKnowledge,
    WorkspaceRecordChange,
    WorkspaceSnapshot,
} from "@/lib/workspace/sync-types";
import { createWorkspaceSyncEnvelope } from "@/lib/workspace/sync-v2";

const GENERATED_AT = "2026-07-16T00:00:00.000Z";
const RETAINED_CHANGES_AFTER = "2026-06-16T00:00:00.000Z";

export function createIntegrationWorkspaceKnowledge(input?: {
    changeCursor?: string;
    snapshot?: WorkspaceSnapshot;
}): WorkspaceKnowledge {
    const changeCursor = input?.changeCursor ?? "g1:r1";
    const workspaceGeneration = Number(
        changeCursor.slice(1).split(":r")[0],
    );
    const workspaceRevision = Number(changeCursor.split(":r")[1]);

    if (input?.snapshot) {
        const knowledge = createWorkspaceKnowledgeFromSnapshot({
            changeCursor,
            entityRevisions: Object.fromEntries(
                WORKSPACE_ENTITY_TYPES.map((entityType) => [
                    entityType,
                    changeCursor,
                ]),
            ),
            generatedAt: GENERATED_AT,
            retainedChangesAfter: RETAINED_CHANGES_AFTER,
            snapshot: input.snapshot,
            workspaceGeneration,
            workspaceRevision,
        });

        return {
            ...knowledge,
            oldestRetainedWorkspaceRevision:
                knowledge.oldestRetainedWorkspaceRevision ?? 0,
        };
    }

    return {
        activeLedgerId: "ledger-1",
        changeCursor,
        entityCounts: Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [entityType, 0]),
        ),
        entityDigests: Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [
                entityType,
                "0".repeat(64),
            ]),
        ),
        entityRevisions: Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [
                entityType,
                changeCursor,
            ]),
        ),
        generatedAt: GENERATED_AT,
        oldestRetainedWorkspaceRevision: 0,
        retainedChangesAfter: RETAINED_CHANGES_AFTER,
        revision: changeCursor,
        workspaceGeneration,
        workspaceRevision,
    };
}

export function createIntegrationWorkspaceMutationResponse<
    TBody extends object = Record<string, never>,
>(input?: {
    body?: TBody;
    changes?: WorkspaceChange[];
    knowledge?: WorkspaceKnowledge;
    snapshot?: WorkspaceSnapshot;
}) {
    return {
        ...(input?.body ?? ({} as TBody)),
        workspaceSync: createWorkspaceSyncEnvelope({
            changes: input?.changes ?? [],
            knowledge:
                input?.knowledge ??
                createIntegrationWorkspaceKnowledge({
                    snapshot: input?.snapshot,
                }),
        }),
    };
}

export function createIntegrationCommittedWorkspaceMutationResponse<
    TBody extends object = Record<string, never>,
>(input: {
    body?: TBody;
    changes: WorkspaceRecordChange[];
    currentSnapshot: WorkspaceSnapshot;
}) {
    const workspaceGeneration =
        input.currentSnapshot.knowledge.workspaceGeneration ?? 1;
    const workspaceRevision =
        (input.currentSnapshot.knowledge.workspaceRevision ?? 0) + 1;
    const changeCursor = `g${workspaceGeneration}:r${workspaceRevision}`;
    const batchId = `integration:${changeCursor}`;
    const changeCount = input.changes.length;
    const revisionedChanges = input.changes.map((change, changeIndex) => {
        const arrayKey = getWorkspaceEntityArrayKey(change.entityType);
        const currentRecord = (input.currentSnapshot[arrayKey] ?? []).find(
            (record) =>
                getWorkspaceEntityId(change.entityType, record) ===
                change.entityId,
        );

        return {
            ...change,
            batchId,
            changedAt: GENERATED_AT,
            changeCount,
            changeId: `${changeCursor}:i${changeIndex}`,
            changeIndex,
            expiresAt: 1_800_000_000,
            previousRecordDigest:
                currentRecord === undefined
                    ? null
                    : calculateWorkspaceRecordDigest({
                          entityType: change.entityType,
                          record: currentRecord,
                      }),
            workspaceGeneration,
            workspaceRevision,
        } satisfies WorkspaceChange;
    });
    const nextSnapshot = applyWorkspaceChanges(
        input.currentSnapshot,
        revisionedChanges,
    );
    const changedEntityTypes = new Set(
        revisionedChanges.map((change) => change.entityType),
    );
    const entityRevisions = Object.fromEntries(
        WORKSPACE_ENTITY_TYPES.map((entityType) => [
            entityType,
            changedEntityTypes.has(entityType)
                ? changeCursor
                : (input.currentSnapshot.knowledge.entityRevisions?.[
                      entityType
                  ] ?? `g${workspaceGeneration}:r${workspaceRevision - 1}`),
        ]),
    );
    const projectedKnowledge = createWorkspaceKnowledgeFromSnapshot({
        changeCursor,
        entityRevisions,
        generatedAt: revisionedChanges.at(-1)?.changedAt ?? GENERATED_AT,
        retainedChangesAfter:
            input.currentSnapshot.knowledge.retainedChangesAfter,
        snapshot: nextSnapshot,
        workspaceGeneration,
        workspaceRevision,
    });
    const knowledge = {
        ...projectedKnowledge,
        oldestRetainedWorkspaceRevision:
            projectedKnowledge.oldestRetainedWorkspaceRevision ?? 0,
    };

    return createIntegrationWorkspaceMutationResponse({
        body: input.body,
        changes: revisionedChanges,
        knowledge,
    });
}

export function withIntegrationWorkspaceKnowledge<T extends WorkspaceSnapshot>(
    snapshot: T,
    changeCursor = "g1:r1",
): T {
    return {
        ...snapshot,
        knowledge: createIntegrationWorkspaceKnowledge({
            changeCursor,
            snapshot,
        }),
    };
}
