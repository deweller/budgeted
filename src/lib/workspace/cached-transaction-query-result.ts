import type {
    CachedTransactionQueryResult,
    WorkspaceCacheIdentity,
} from "@/lib/workspace/repository/types";
import type { WorkspaceKnowledge } from "@/lib/workspace/sync-types";
import {
    getWorkspaceGeneration,
    getWorkspaceTransactionQueryKey,
    type WorkspaceTransactionQuery,
} from "@/lib/workspace/workspace-protocol";

export function isCurrentCachedTransactionQueryResult(input: {
    identity: WorkspaceCacheIdentity;
    knowledge: WorkspaceKnowledge;
    query: WorkspaceTransactionQuery;
    result: CachedTransactionQueryResult;
}) {
    return (
        input.result.identity.cacheOwnerId === input.identity.cacheOwnerId &&
        input.result.identity.ledgerId === input.identity.ledgerId &&
        input.result.identity.changeCursor === input.knowledge.changeCursor &&
        input.result.identity.workspaceGeneration ===
            getWorkspaceGeneration(input.knowledge) &&
        input.result.identity.workspaceRevision ===
            input.knowledge.workspaceRevision &&
        input.result.identity.queryKey ===
            getWorkspaceTransactionQueryKey(input.query)
    );
}
