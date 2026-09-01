import {
    readCachedAccountTransactions,
    readCachedTransactionById,
    readCachedTransactionChildren,
    readCachedTransactions,
    readWorkspaceCache,
    readWorkspaceCacheConfiguration,
    readWorkspaceCacheMetadata,
} from "@/lib/workspace/repository/queries";
import { applyWorkspaceRepositoryChanges } from "@/lib/workspace/repository/apply";
import { invalidateWorkspaceRepository } from "@/lib/workspace/repository/invalidate";
import { replaceWorkspaceRepository } from "@/lib/workspace/repository/replace";
import { resetWorkspaceRepositoryDatabaseForTests } from "@/lib/workspace/repository/schema";
import type {
    CachedTransactionQueryResult,
    WorkspaceCacheIdentity,
    WorkspaceCacheWriteResult,
} from "@/lib/workspace/repository/types";
import type {
    WorkspaceChange,
    WorkspaceKnowledge,
    WorkspaceSnapshot,
    WorkspaceSnapshotPayload,
    WorkspaceVersion,
} from "@/lib/workspace/sync-types";
import type { WorkspaceTransactionQuery } from "@/lib/workspace/workspace-protocol";

export type WorkspaceRepository = {
    applyChanges: (input: {
        activeLedgerName: string;
        changes: WorkspaceChange[];
        identity: WorkspaceCacheIdentity;
        knowledge: WorkspaceKnowledge;
    }) => Promise<WorkspaceCacheWriteResult>;
    invalidate: (identity: WorkspaceCacheIdentity) => Promise<void>;
    read: (
        identity: WorkspaceCacheIdentity,
    ) => Promise<WorkspaceSnapshot | null>;
    readConfiguration: (
        identity: WorkspaceCacheIdentity,
    ) => Promise<WorkspaceSnapshot | null>;
    readMetadata: (
        identity: WorkspaceCacheIdentity,
    ) => Promise<{ version: WorkspaceVersion } | null>;
    readTransactions: (input: {
        identity: WorkspaceCacheIdentity;
        query?: WorkspaceTransactionQuery;
    }) => Promise<CachedTransactionQueryResult | null>;
    replace: (input: {
        identity: WorkspaceCacheIdentity;
        snapshot: WorkspaceSnapshot | WorkspaceSnapshotPayload;
    }) => Promise<WorkspaceCacheWriteResult>;
};

export const indexedDbWorkspaceRepository = {
    applyChanges: applyWorkspaceRepositoryChanges,
    invalidate: invalidateWorkspaceRepository,
    read: readWorkspaceCache,
    readAccountTransactions: readCachedAccountTransactions,
    readConfiguration: readWorkspaceCacheConfiguration,
    readMetadata: readWorkspaceCacheMetadata,
    readTransactionById: readCachedTransactionById,
    readTransactionChildren: readCachedTransactionChildren,
    readTransactions: readCachedTransactions,
    replace: replaceWorkspaceRepository,
} satisfies WorkspaceRepository & {
    readAccountTransactions: typeof readCachedAccountTransactions;
    readTransactionById: typeof readCachedTransactionById;
    readTransactionChildren: typeof readCachedTransactionChildren;
};

export {
    resetWorkspaceRepositoryDatabaseForTests as resetWorkspaceCacheDatabaseForTests,
};
export * from "@/lib/workspace/repository/types";
