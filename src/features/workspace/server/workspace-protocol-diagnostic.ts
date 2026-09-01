import { ScanCommand } from "@aws-sdk/lib-dynamodb";

import { documentClient } from "@/lib/db/client";
import { listAllPaginatedItems } from "@/lib/db/paginated-list";
import { requireLedgerTableName } from "@/lib/db/resource";
import { WORKSPACE_ENTITY_TYPES } from "@/lib/workspace/entity-config";
import {
    hasCompleteWorkspaceBatchManifest,
    type WorkspaceChange,
    type WorkspaceEntityType,
} from "@/lib/workspace/sync-types";

type WorkspaceProtocolDiagnosticItem = {
    __edb_e__?:
        | "ledger"
        | "workspaceChange"
        | "workspaceMutationBatch"
        | "workspaceState";
    changeCount?: number;
    changesJson?: string;
    entityCountsJson?: string;
    entityDigestsJson?: string;
    entityRevisionsJson?: string;
    expiresAt?: number;
    ledgerId?: string;
    oldestRetainedWorkspaceRevision?: number;
    stateId?: string;
    status?: "active" | "archived";
    workspaceGeneration?: number;
    workspaceRevision?: number;
};

export type WorkspaceProtocolLedgerDiagnostic = {
    invalidRetainedBatchCount: number;
    ledgerWorkspaceGeneration?: number;
    ledgerWorkspaceRevision?: number;
    ledgerId: string;
    legacyWorkspaceChangeCount: number;
    retainedBatchCount: number;
    revisionStateValid: boolean;
    stateEntityProofsComplete: boolean;
    stateWorkspaceGeneration?: number;
    stateWorkspaceRevision?: number;
    status: "active" | "archived";
    workspaceStateExists: boolean;
};

export type WorkspaceProtocolReadinessDiagnostic = {
    checkedAt: string;
    deprecatedRouteImports: string[];
    ledgerResults: WorkspaceProtocolLedgerDiagnostic[];
    readyForLegacyCleanup: boolean;
};

function parseProofRecord(
    value: string | undefined,
): Partial<Record<WorkspaceEntityType, unknown>> | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function hasCompleteEntityProofs(item: WorkspaceProtocolDiagnosticItem) {
    const counts = parseProofRecord(item.entityCountsJson);
    const digests = parseProofRecord(item.entityDigestsJson);
    const revisions = parseProofRecord(item.entityRevisionsJson);

    return WORKSPACE_ENTITY_TYPES.every(
        (entityType) =>
            Number.isSafeInteger(counts?.[entityType]) &&
            (counts?.[entityType] as number) >= 0 &&
            typeof digests?.[entityType] === "string" &&
            (digests[entityType] as string).length === 64 &&
            typeof revisions?.[entityType] === "string" &&
            (revisions[entityType] as string).length > 0,
    );
}

function hasValidRevisionState(input: {
    ledger: WorkspaceProtocolDiagnosticItem;
    state?: WorkspaceProtocolDiagnosticItem;
}) {
    return Boolean(
        input.state &&
            Number.isSafeInteger(input.ledger.workspaceGeneration) &&
            input.ledger.workspaceGeneration! >= 1 &&
            Number.isSafeInteger(input.ledger.workspaceRevision) &&
            input.ledger.workspaceRevision! >= 0 &&
            input.state.workspaceGeneration ===
                input.ledger.workspaceGeneration &&
            input.state.workspaceRevision === input.ledger.workspaceRevision &&
            Number.isSafeInteger(
                input.state.oldestRetainedWorkspaceRevision,
            ) &&
            input.state.oldestRetainedWorkspaceRevision! >= 0 &&
            input.state.oldestRetainedWorkspaceRevision! <=
                input.state.workspaceRevision! &&
            hasCompleteEntityProofs(input.state),
    );
}

function isValidRetainedBatch(item: WorkspaceProtocolDiagnosticItem) {
    if (
        !Number.isSafeInteger(item.workspaceGeneration) ||
        item.workspaceGeneration! < 1 ||
        !Number.isSafeInteger(item.workspaceRevision) ||
        item.workspaceRevision! < 1 ||
        !Number.isSafeInteger(item.changeCount) ||
        item.changeCount! < 1 ||
        !item.changesJson
    ) {
        return false;
    }

    try {
        const changes = JSON.parse(item.changesJson) as WorkspaceChange[];

        return hasCompleteWorkspaceBatchManifest(changes);
    } catch {
        return false;
    }
}

export function evaluateWorkspaceProtocolReadiness(input: {
    deprecatedRouteImports?: string[];
    items: WorkspaceProtocolDiagnosticItem[];
    now?: Date;
}): WorkspaceProtocolReadinessDiagnostic {
    const checkedAt = (input.now ?? new Date()).toISOString();
    const nowSeconds = Math.floor(new Date(checkedAt).getTime() / 1000);
    const deprecatedRouteImports = [...(input.deprecatedRouteImports ?? [])]
        .sort();
    const ledgers = input.items.filter(
        (item) => item.__edb_e__ === "ledger" && item.ledgerId,
    );
    const ledgerResults = ledgers
        .map((ledger) => {
            const ledgerId = ledger.ledgerId!;
            const state = input.items.find(
                (item) =>
                    item.__edb_e__ === "workspaceState" &&
                    item.ledgerId === ledgerId &&
                    item.stateId === "default",
            );
            const retainedBatches = input.items.filter(
                (item) =>
                    item.__edb_e__ === "workspaceMutationBatch" &&
                    item.ledgerId === ledgerId &&
                    (item.expiresAt ?? 0) > nowSeconds,
            );

            return {
                invalidRetainedBatchCount:
                    retainedBatches.filter(
                        (batch) => !isValidRetainedBatch(batch),
                    ).length,
                ledgerWorkspaceGeneration: ledger.workspaceGeneration,
                ledgerWorkspaceRevision: ledger.workspaceRevision,
                ledgerId,
                legacyWorkspaceChangeCount: input.items.filter(
                    (item) =>
                        item.__edb_e__ === "workspaceChange" &&
                        item.ledgerId === ledgerId,
                ).length,
                retainedBatchCount: retainedBatches.length,
                revisionStateValid: hasValidRevisionState({ ledger, state }),
                stateEntityProofsComplete: state
                    ? hasCompleteEntityProofs(state)
                    : false,
                stateWorkspaceGeneration: state?.workspaceGeneration,
                stateWorkspaceRevision: state?.workspaceRevision,
                status: ledger.status ?? "active",
                workspaceStateExists: Boolean(state),
            } satisfies WorkspaceProtocolLedgerDiagnostic;
        })
        .sort((left, right) => left.ledgerId.localeCompare(right.ledgerId));
    const activeLedgers = ledgerResults.filter(
        (ledger) => ledger.status !== "archived",
    );

    return {
        checkedAt,
        deprecatedRouteImports,
        ledgerResults,
        readyForLegacyCleanup:
            activeLedgers.length > 0 &&
            activeLedgers.every(
                (ledger) =>
                    ledger.revisionStateValid &&
                    ledger.invalidRetainedBatchCount === 0,
            ) &&
            deprecatedRouteImports.length === 0,
    };
}

async function listWorkspaceProtocolDiagnosticItems(tableName: string) {
    return listAllPaginatedItems(async ({ exclusiveStartKey }) => {
        const result = await documentClient.send(
            new ScanCommand({
                TableName: tableName,
                ExclusiveStartKey: exclusiveStartKey,
                ExpressionAttributeNames: {
                    "#entity": "__edb_e__",
                },
                ExpressionAttributeValues: {
                    ":batch": "workspaceMutationBatch",
                    ":ledger": "ledger",
                    ":legacy": "workspaceChange",
                    ":state": "workspaceState",
                },
                FilterExpression:
                    "#entity IN (:ledger, :state, :batch, :legacy)",
            }),
        );

        return {
            items:
                (result.Items as WorkspaceProtocolDiagnosticItem[] | undefined) ??
                [],
            lastEvaluatedKey: result.LastEvaluatedKey,
        };
    });
}

export async function diagnoseWorkspaceProtocolReadiness(input: {
    deprecatedRouteImports?: string[];
    tableName?: string;
}) {
    return evaluateWorkspaceProtocolReadiness({
        deprecatedRouteImports: input.deprecatedRouteImports,
        items: await listWorkspaceProtocolDiagnosticItems(
            input.tableName ?? requireLedgerTableName(),
        ),
    });
}
