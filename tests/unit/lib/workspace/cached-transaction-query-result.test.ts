import { describe, expect, it } from "vitest";

import { isCurrentCachedTransactionQueryResult } from "@/lib/workspace/cached-transaction-query-result";
import { WORKSPACE_CACHE_SCHEMA_VERSION } from "@/lib/workspace/repository/types";
import { getWorkspaceTransactionQueryKey } from "@/lib/workspace/workspace-protocol";

describe("cached transaction query result validation", () => {
    const identity = {
        cacheOwnerId: "owner-1",
        ledgerId: "ledger-1",
    };
    const knowledge = {
        activeLedgerId: "ledger-1",
        changeCursor: "g1:r2",
        entityDigests: {},
        entityCounts: {},
        entityRevisions: {},
        generatedAt: "2026-07-17T00:00:00.000Z",
        oldestRetainedWorkspaceRevision: 0,
        retainedChangesAfter: "2026-05-17T00:00:00.000Z",
        revision: "g1:r2",
        workspaceGeneration: 1,
        workspaceRevision: 2,
    };
    const query = { transactionId: "transaction-1" };
    const result = {
        identity: {
            ...identity,
            cacheSchemaVersion: WORKSPACE_CACHE_SCHEMA_VERSION,
            changeCursor: knowledge.changeCursor,
            queryKey: getWorkspaceTransactionQueryKey(query),
            workspaceGeneration: 1,
            workspaceRevision: 2,
        },
        knowledge,
        plaidTransactionSyncs: [],
        transactions: [],
    };

    it("accepts a result bound to the rendered knowledge and query", () => {
        expect(
            isCurrentCachedTransactionQueryResult({
                identity,
                knowledge,
                query,
                result,
            }),
        ).toBe(true);
    });

    it("rejects a result from a different workspace revision", () => {
        expect(
            isCurrentCachedTransactionQueryResult({
                identity,
                knowledge,
                query,
                result: {
                    ...result,
                    identity: {
                        ...result.identity,
                        changeCursor: "g1:r1",
                        workspaceRevision: 1,
                    },
                },
            }),
        ).toBe(false);
    });
});
