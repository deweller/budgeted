import type {
    WorkspaceCursor,
    WorkspaceEntityCounts,
    WorkspaceEntityDigests,
    WorkspaceEntityRevisions,
    WorkspaceEntityType,
    WorkspaceSnapshotRecords,
} from "@/lib/workspace/sync-types";
import {
    WORKSPACE_ENTITY_CONFIGS,
    WORKSPACE_ENTITY_TYPES,
    getWorkspaceEntityId,
} from "@/lib/workspace/entity-config";
import { encodeWorkspaceCursor } from "@/lib/workspace/cursor";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export { WORKSPACE_ENTITY_TYPES, getWorkspaceEntityId };

export function createEmptyWorkspaceEntityCounts(): WorkspaceEntityCounts {
    return Object.fromEntries(
        WORKSPACE_ENTITY_TYPES.map((entityType) => [entityType, 0]),
    ) as WorkspaceEntityCounts;
}

function sortRecordKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortRecordKeys);
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nestedValue]) => [key, sortRecordKeys(nestedValue)]),
    );
}

export function stableStringify(value: unknown) {
    return JSON.stringify(sortRecordKeys(value));
}

function digestWorkspaceRevision(value: unknown) {
    return bytesToHex(sha256(stableStringify(value)));
}

/** A stable digest for domain aggregates that must include every stored field. */
export function calculateWorkspaceContentDigest(value: unknown) {
    return digestWorkspaceRevision(value);
}

const EMPTY_WORKSPACE_DIGEST_ACCUMULATOR = "0".repeat(64);

function xorHex(left: string, right: string) {
    const leftBytes = hexToBytes(left);
    const rightBytes = hexToBytes(right);

    if (leftBytes.length !== rightBytes.length) {
        throw new Error("Workspace digest accumulators must use the same length.");
    }

    return bytesToHex(
        leftBytes.map((value, index) => value ^ rightBytes[index]!),
    );
}

export function xorWorkspaceEntityDigestAccumulator(
    accumulator: string,
    recordDigest: string,
) {
    return xorHex(accumulator, recordDigest);
}

export function calculateWorkspaceRecordDigest(input: {
    entityType: WorkspaceEntityType;
    record: unknown;
}) {
    return digestWorkspaceRevision({
        id: getWorkspaceEntityId(input.entityType, input.record),
        record: toRevisionRecord(input.entityType, input.record),
    });
}

export function createWorkspaceEntityDigest(input: {
    accumulator: string;
    count: number;
}) {
    return digestWorkspaceRevision({
        accumulator: input.accumulator,
        count: input.count,
    });
}

export function updateWorkspaceEntityDigestAccumulator(input: {
    accumulator: string;
    entityType: WorkspaceEntityType;
    record: unknown;
}) {
    return xorHex(
        input.accumulator,
        calculateWorkspaceRecordDigest({
            entityType: input.entityType,
            record: input.record,
        }),
    );
}

export function calculateWorkspaceEntityDigestAccumulators(
    records: WorkspaceSnapshotRecords,
) {
    return Object.fromEntries(
        WORKSPACE_ENTITY_CONFIGS.map((config) => [
            config.entityType,
            records[config.arrayKey].reduce(
                (accumulator, record) =>
                    updateWorkspaceEntityDigestAccumulator({
                        accumulator,
                        entityType: config.entityType,
                        record,
                    }),
                EMPTY_WORKSPACE_DIGEST_ACCUMULATOR,
            ),
        ]),
    ) as Record<WorkspaceEntityType, string>;
}

export function calculateWorkspaceEntityDigests(
    records: WorkspaceSnapshotRecords,
): WorkspaceEntityDigests {
    const accumulators = calculateWorkspaceEntityDigestAccumulators(records);

    return Object.fromEntries(
        WORKSPACE_ENTITY_CONFIGS.map((config) => [
            config.entityType,
            createWorkspaceEntityDigest({
                accumulator: accumulators[config.entityType],
                count: records[config.arrayKey].length,
            }),
        ]),
    ) as WorkspaceEntityDigests;
}

export function createWorkspaceEntityRevisionTokens(
    cursor: WorkspaceCursor,
): WorkspaceEntityRevisions {
    const token = encodeWorkspaceCursor(cursor);

    return Object.fromEntries(
        WORKSPACE_ENTITY_TYPES.map((entityType) => [entityType, token]),
    ) as WorkspaceEntityRevisions;
}

function compareByStableRecord(left: unknown, right: unknown) {
    return stableStringify(left).localeCompare(stableStringify(right));
}

function stripDerivedTransactionPostings(record: unknown) {
    if (!record || typeof record !== "object") {
        return record;
    }

    const transaction = { ...(record as Record<string, unknown>) };
    delete transaction.lines;
    delete transaction.postings;
    delete transaction.aggregateRevision;
    delete transaction.aggregateLineCount;
    delete transaction.aggregateLineDigest;
    delete transaction.aggregatePostingCount;
    delete transaction.aggregatePostingDigest;
    delete transaction.aggregatePlaidSyncCount;
    delete transaction.aggregatePlaidSyncDigest;

    return transaction;
}

function toRevisionRecord(entityType: WorkspaceEntityType, record: unknown) {
    if (entityType === "transaction") {
        return stripDerivedTransactionPostings(record);
    }

    if (entityType === "account" && record && typeof record === "object") {
        const account = { ...(record as Record<string, unknown>) };
        delete account.balanceCents;
        return account;
    }

    if (entityType === "ledger" && record && typeof record === "object") {
        const ledger = { ...(record as Record<string, unknown>) };
        delete ledger.workspaceGeneration;
        delete ledger.workspaceRevision;
        delete ledger.workspaceSyncProtocolVersion;
        return ledger;
    }

    return record;
}

export function buildWorkspaceRevisionInput(input: {
    activeLedgerId: string;
    records: WorkspaceSnapshotRecords;
}) {
    const records = Object.fromEntries(
        WORKSPACE_ENTITY_CONFIGS.map((config) => [
            config.arrayKey,
            [...input.records[config.arrayKey]]
                .map((record) => toRevisionRecord(config.entityType, record))
                .sort(compareByStableRecord),
        ]),
    );

    return {
        activeLedgerId: input.activeLedgerId,
        ...records,
    };
}

export function calculateWorkspaceEntityCounts(
    records: WorkspaceSnapshotRecords,
): WorkspaceEntityCounts {
    return Object.fromEntries(
        WORKSPACE_ENTITY_CONFIGS.map((config) => [
            config.entityType,
            records[config.arrayKey].length,
        ]),
    ) as WorkspaceEntityCounts;
}

export function calculateWorkspaceRevision(input: {
    activeLedgerId: string;
    records: WorkspaceSnapshotRecords;
}) {
    return digestWorkspaceRevision(buildWorkspaceRevisionInput(input));
}
