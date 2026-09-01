import type { WorkspaceCacheIdentity } from "@/lib/workspace/repository/types";
import type { WorkspaceEntityType } from "@/lib/workspace/sync-types";

export function getWorkspaceCacheKey(identity: WorkspaceCacheIdentity) {
    return JSON.stringify([identity.cacheOwnerId, identity.ledgerId]);
}

export function getWorkspaceRecordKey(input: {
    cacheKey: string;
    entityId: string;
    entityType: WorkspaceEntityType;
}) {
    return JSON.stringify([input.cacheKey, input.entityType, input.entityId]);
}

export function getTransactionAccountLookupKey(
    cacheKey: string,
    accountId: string,
) {
    return JSON.stringify([cacheKey, accountId]);
}

export function getAccountBalanceProjectionKey(
    cacheKey: string,
    accountId: string,
) {
    return JSON.stringify([cacheKey, accountId]);
}
