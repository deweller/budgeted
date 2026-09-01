import { WORKSPACE_ENTITY_CONFIGS } from "@/lib/workspace/entity-config";
import {
    calculateWorkspaceEntityCounts,
    calculateWorkspaceEntityDigests,
    createWorkspaceEntityRevisionTokens,
} from "@/lib/workspace/revision";
import {
    getWorkspaceCacheKey,
    getWorkspaceRecordKey,
} from "@/lib/workspace/repository/identity";
import { getWorkspaceRepositoryDatabase } from "@/lib/workspace/repository/schema";
import {
    WORKSPACE_CACHE_SCHEMA_VERSION,
    type CachedTransactionQueryResult,
    type WorkspaceCacheIdentity,
    type WorkspaceCacheWriteResult,
    type WorkspaceV2CacheMetadata,
    type WorkspaceV2CacheRecord,
} from "@/lib/workspace/repository/types";
import {
    rebuildWorkspaceSnapshot,
    rebuildWorkspaceSnapshotRecords,
} from "@/lib/workspace/snapshot-utils";
import {
    workspaceKnowledgeToVersion,
    compareWorkspaceVersions,
} from "@/lib/workspace/sync-v2";
import type {
    WorkspaceChange,
    WorkspaceEntityType,
    WorkspaceKnowledge,
    WorkspaceSnapshot,
    WorkspaceSnapshotPayload,
    WorkspaceSnapshotRecords,
    WorkspaceVersion,
} from "@/lib/workspace/sync-types";
import {
    getWorkspaceTransactionQueryKey,
    normalizeWorkspaceTransactionQuery,
    transactionMatchesWorkspaceQuery,
    type WorkspaceTransactionQuery,
} from "@/lib/workspace/workspace-protocol";

export {
    WORKSPACE_CACHE_SCHEMA_VERSION,
    type CachedTransactionQueryResult,
    type WorkspaceCacheIdentity,
    type WorkspaceCacheWriteResult,
};

function toCacheRecord(input: {
    cacheKey: string;
    entityId: string;
    entityType: WorkspaceEntityType;
    record: unknown;
}): WorkspaceV2CacheRecord {
    const record = input.record as { transactionId?: unknown };
    return {
        ...input,
        key: getWorkspaceRecordKey(input),
        transactionId:
            typeof record.transactionId === "string"
                ? record.transactionId
                : undefined,
    };
}

function createCacheRecords(cacheKey: string, records: WorkspaceSnapshotRecords) {
    return WORKSPACE_ENTITY_CONFIGS.flatMap((config) =>
        records[config.arrayKey].map((record) =>
            toCacheRecord({
                cacheKey,
                entityId: String(
                    (record as unknown as Record<string, unknown>)[config.idKey],
                ),
                entityType: config.entityType,
                record,
            }),
        ),
    );
}

function cacheRecordsToWorkspaceRecords(records: WorkspaceV2CacheRecord[]) {
    const result = Object.fromEntries(
        WORKSPACE_ENTITY_CONFIGS.map((config) => [config.arrayKey, []]),
    ) as unknown as WorkspaceSnapshotRecords;

    for (const cached of records) {
        const config = WORKSPACE_ENTITY_CONFIGS.find(
            (candidate) => candidate.entityType === cached.entityType,
        );
        if (config) {
            result[config.arrayKey].push(cached.record as never);
        }
    }

    return result;
}

function createCompatibilityKnowledge(input: {
    records: WorkspaceSnapshotRecords;
    version: WorkspaceVersion;
}): WorkspaceKnowledge {
    const generatedAt = new Date().toISOString();
    return {
        activeLedgerId: input.version.ledgerId,
        changeCursor: input.version.cursor,
        entityCounts: calculateWorkspaceEntityCounts(input.records),
        entityDigests: calculateWorkspaceEntityDigests(input.records),
        entityRevisions: createWorkspaceEntityRevisionTokens({
            generation: input.version.generation,
            revision: input.version.revision,
        }),
        generatedAt,
        oldestRetainedWorkspaceRevision: 0,
        retainedChangesAfter: new Date(0).toISOString(),
        revision: input.version.cursor,
        workspaceGeneration: input.version.generation,
        workspaceRevision: input.version.revision,
    };
}

async function readCacheRecords(cacheKey: string) {
    const database = await getWorkspaceRepositoryDatabase();
    if (!database) return null;
    return database
        .transaction("workspaceRecords", "readonly")
        .objectStore("workspaceRecords")
        .index("byCacheKey")
        .getAll(cacheKey);
}

export async function readWorkspaceCacheMetadata(identity: WorkspaceCacheIdentity) {
    const database = await getWorkspaceRepositoryDatabase();
    if (!database) return null;
    const metadata = await database.get(
        "workspaceMetadata",
        getWorkspaceCacheKey(identity),
    );
    return metadata?.schemaVersion === WORKSPACE_CACHE_SCHEMA_VERSION
        ? metadata
        : null;
}

export async function readWorkspaceCache(
    identity: WorkspaceCacheIdentity,
): Promise<WorkspaceSnapshot | null> {
    const metadata = await readWorkspaceCacheMetadata(identity);
    if (!metadata) return null;
    const cachedRecords = await readCacheRecords(metadata.cacheKey);
    if (!cachedRecords) return null;
    const records = cacheRecordsToWorkspaceRecords(cachedRecords);
    const knowledge = createCompatibilityKnowledge({
        records,
        version: metadata.version,
    });

    return rebuildWorkspaceSnapshot({
        ...records,
        activeLedgerId: metadata.ledgerId,
        activeLedgerName: metadata.activeLedgerName,
        baseChangeCursor: metadata.version.cursor,
        knowledge,
        transactionHydration: "full",
        version: metadata.version,
    });
}

export const readWorkspaceCacheConfiguration = readWorkspaceCache;

export async function readCachedTransactionById(input: {
    identity: WorkspaceCacheIdentity;
    transactionId: string;
}) {
    const database = await getWorkspaceRepositoryDatabase();
    if (!database) return null;
    const record = await database
        .transaction("workspaceRecords", "readonly")
        .objectStore("workspaceRecords")
        .index("byCacheEntityId")
        .get([
            getWorkspaceCacheKey(input.identity),
            "transaction",
            input.transactionId,
        ]);
    return record?.record ?? null;
}

export async function readCachedTransactionChildren(input: {
    identity: WorkspaceCacheIdentity;
    entityType: "ledgerPosting" | "transactionLine";
    transactionId: string;
}) {
    const database = await getWorkspaceRepositoryDatabase();
    if (!database) return [];
    const records = await database
        .transaction("workspaceRecords", "readonly")
        .objectStore("workspaceRecords")
        .index("byTransactionId")
        .getAll([
            getWorkspaceCacheKey(input.identity),
            input.entityType,
            input.transactionId,
        ]);
    return records.map((record) => record.record);
}

export async function readCachedTransactions(input: {
    identity: WorkspaceCacheIdentity;
    query?: WorkspaceTransactionQuery;
}): Promise<CachedTransactionQueryResult | null> {
    const snapshot = await readWorkspaceCache(input.identity);
    if (!snapshot) return null;
    const query = normalizeWorkspaceTransactionQuery(input.query);
    const transactions = snapshot.transactions.filter((transaction) =>
        transactionMatchesWorkspaceQuery(transaction, query),
    );

    return {
        identity: {
            cacheOwnerId: input.identity.cacheOwnerId,
            cacheSchemaVersion: WORKSPACE_CACHE_SCHEMA_VERSION,
            changeCursor: snapshot.knowledge.changeCursor,
            ledgerId: input.identity.ledgerId,
            queryKey: getWorkspaceTransactionQueryKey(query),
            workspaceGeneration: snapshot.knowledge.workspaceGeneration,
            workspaceRevision: snapshot.knowledge.workspaceRevision,
        },
        knowledge: snapshot.knowledge,
        plaidTransactionSyncs: snapshot.plaidTransactionSyncs.filter((sync) =>
            transactions.some(
                (transaction) => transaction.transactionId === sync.transactionId,
            ),
        ),
        transactions,
    };
}

export async function readCachedAccountTransactions(input: {
    identity: WorkspaceCacheIdentity;
    referenceAccountId: string;
}) {
    const result = await readCachedTransactions({
        identity: input.identity,
        query: { accountId: input.referenceAccountId },
    });
    return result?.transactions ?? [];
}

function createMetadata(input: {
    activeLedgerName: string;
    identity: WorkspaceCacheIdentity;
    version: WorkspaceVersion;
}): WorkspaceV2CacheMetadata {
    return {
        activeLedgerName: input.activeLedgerName,
        cacheKey: getWorkspaceCacheKey(input.identity),
        cachedAt: new Date().toISOString(),
        cacheOwnerId: input.identity.cacheOwnerId,
        ledgerId: input.identity.ledgerId,
        schemaVersion: WORKSPACE_CACHE_SCHEMA_VERSION,
        version: input.version,
    };
}

async function replaceRecords(input: {
    metadata: WorkspaceV2CacheMetadata;
    records: WorkspaceV2CacheRecord[];
}) {
    const database = await getWorkspaceRepositoryDatabase();
    if (!database) return "unavailable" as const;
    const transaction = database.transaction(
        ["workspaceMetadata", "workspaceRecords"],
        "readwrite",
    );
    const metadataStore = transaction.objectStore("workspaceMetadata");
    const recordStore = transaction.objectStore("workspaceRecords");
    const existingKeys = await recordStore
        .index("byCacheKey")
        .getAllKeys(input.metadata.cacheKey);
    await Promise.all(existingKeys.map((key) => recordStore.delete(key)));
    await Promise.all(input.records.map((record) => recordStore.put(record)));
    await metadataStore.put(input.metadata);
    await transaction.done;
    return "committed" as const;
}

export async function replaceWorkspaceRepository(input: {
    identity: WorkspaceCacheIdentity;
    snapshot: WorkspaceSnapshot | WorkspaceSnapshotPayload;
}): Promise<WorkspaceCacheWriteResult> {
    try {
        const current = await readWorkspaceCacheMetadata(input.identity);
        const version =
            input.snapshot.version ??
            workspaceKnowledgeToVersion(input.snapshot.knowledge);
        if (current && compareWorkspaceVersions(current.version, version) >= 0) {
            return "superseded";
        }
        const records = rebuildWorkspaceSnapshotRecords(input.snapshot);
        return await replaceRecords({
            metadata: createMetadata({
                activeLedgerName: input.snapshot.activeLedgerName,
                identity: input.identity,
                version,
            }),
            records: createCacheRecords(getWorkspaceCacheKey(input.identity), records),
        });
    } catch {
        return "failed";
    }
}

export async function applyWorkspaceCacheChanges(input: {
    activeLedgerName: string;
    changes: WorkspaceChange[];
    identity: WorkspaceCacheIdentity;
    knowledge: WorkspaceKnowledge;
}): Promise<WorkspaceCacheWriteResult> {
    const database = await getWorkspaceRepositoryDatabase();
    if (!database) return "unavailable";

    try {
        const cacheKey = getWorkspaceCacheKey(input.identity);
        const transaction = database.transaction(
            ["workspaceMetadata", "workspaceRecords"],
            "readwrite",
        );
        const metadataStore = transaction.objectStore("workspaceMetadata");
        const recordStore = transaction.objectStore("workspaceRecords");
        const existing = await metadataStore.get(cacheKey);
        const version = workspaceKnowledgeToVersion(input.knowledge);

        if (!existing) {
            transaction.abort();
            await transaction.done.catch(() => undefined);
            return "invalid";
        }
        if (compareWorkspaceVersions(existing.version, version) >= 0) {
            await transaction.done;
            return "superseded";
        }
        if (
            existing.version.ledgerId !== version.ledgerId ||
            existing.version.generation !== version.generation
        ) {
            transaction.abort();
            await transaction.done.catch(() => undefined);
            return "invalid";
        }

        const revisions = [
            ...new Set(
                input.changes.map((change) => change.workspaceRevision),
            ),
        ].sort((left, right) => left - right);
        const revisionsAreContiguous =
            revisions.length > 0 &&
            revisions[0] === existing.version.revision + 1 &&
            revisions.at(-1) === version.revision &&
            revisions.every(
                (revision, index) =>
                    revision === existing.version.revision + index + 1,
            );

        if (!revisionsAreContiguous) {
            transaction.abort();
            await transaction.done.catch(() => undefined);
            return "invalid";
        }

        for (const change of input.changes) {
            const key = getWorkspaceRecordKey({
                cacheKey,
                entityId: change.entityId,
                entityType: change.entityType,
            });
            if (change.operation === "delete" || !change.record) {
                await recordStore.delete(key);
            } else {
                await recordStore.put(
                    toCacheRecord({
                        cacheKey,
                        entityId: change.entityId,
                        entityType: change.entityType,
                        record: change.record,
                    }),
                );
            }
        }

        await metadataStore.put(
            createMetadata({
                activeLedgerName: input.activeLedgerName,
                identity: input.identity,
                version,
            }),
        );
        await transaction.done;
        return "committed";
    } catch {
        return "failed";
    }
}

export async function invalidateWorkspaceRepository(identity: WorkspaceCacheIdentity) {
    const database = await getWorkspaceRepositoryDatabase();
    if (!database) return;
    const cacheKey = getWorkspaceCacheKey(identity);
    const transaction = database.transaction(
        ["workspaceMetadata", "workspaceRecords"],
        "readwrite",
    );
    const recordStore = transaction.objectStore("workspaceRecords");
    const keys = await recordStore.index("byCacheKey").getAllKeys(cacheKey);
    await Promise.all(keys.map((key) => recordStore.delete(key)));
    await transaction.objectStore("workspaceMetadata").delete(cacheKey);
    await transaction.done;
}
