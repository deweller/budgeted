import type { DBSchema } from "idb";

import type {
    WorkspaceEntityType,
    WorkspaceKnowledge,
    WorkspaceSnapshot,
    WorkspaceVersion,
} from "@/lib/workspace/sync-types";

export const WORKSPACE_CACHE_DATABASE_NAME = "budgeted-workspace-cache";
export const WORKSPACE_CACHE_DATABASE_VERSION = 10;
export const WORKSPACE_CACHE_SCHEMA_VERSION = 18;

export type WorkspaceCacheIdentity = {
    cacheOwnerId: string;
    ledgerId: string;
};

export type WorkspaceCacheWriteResult =
    | "committed"
    | "superseded"
    | "invalid"
    | "unavailable"
    | "failed";

export type WorkspaceV2CacheMetadata = {
    activeLedgerName: string;
    cacheKey: string;
    cachedAt: string;
    cacheOwnerId: string;
    ledgerId: string;
    schemaVersion: number;
    version: WorkspaceVersion;
};

export type WorkspaceV2CacheRecord = {
    cacheKey: string;
    entityId: string;
    entityType: WorkspaceEntityType;
    key: string;
    record: unknown;
    transactionId?: string;
};

export interface WorkspaceCacheDatabaseSchema extends DBSchema {
    workspaceMetadata: {
        key: string;
        value: WorkspaceV2CacheMetadata;
    };
    workspaceRecords: {
        indexes: {
            byCacheKey: string;
            byCacheEntityId: [string, WorkspaceEntityType, string];
            byCacheEntityType: [string, WorkspaceEntityType];
            byTransactionId: [string, WorkspaceEntityType, string];
        };
        key: string;
        value: WorkspaceV2CacheRecord;
    };
}

export type CachedTransactionQueryResultIdentity = WorkspaceCacheIdentity & {
    cacheSchemaVersion: number;
    changeCursor: string;
    queryKey: string;
    workspaceGeneration: number;
    workspaceRevision?: number;
};

export type CachedTransactionQueryResult = {
    identity: CachedTransactionQueryResultIdentity;
    knowledge: WorkspaceKnowledge;
    plaidTransactionSyncs: WorkspaceSnapshot["plaidTransactionSyncs"];
    transactions: WorkspaceSnapshot["transactions"];
};
