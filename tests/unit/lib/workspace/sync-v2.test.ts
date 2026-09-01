import { describe, expect, it } from "vitest";

import {
    createWorkspaceSyncEnvelope,
    createWorkspaceVersion,
    isWorkspaceCommitContiguous,
    workspaceKnowledgeToVersion,
} from "@/lib/workspace/sync-v2";
import type {
    WorkspaceChange,
    WorkspaceKnowledge,
} from "@/lib/workspace/sync-types";

function knowledge(revision: number): WorkspaceKnowledge {
    return {
        activeLedgerId: "ledger-1",
        changeCursor: `g3:r${revision}`,
        entityCounts: {},
        entityDigests: {},
        entityRevisions: {},
        generatedAt: "2026-08-01T12:00:00.000Z",
        oldestRetainedWorkspaceRevision: 0,
        retainedChangesAfter: "2026-07-01T00:00:00.000Z",
        revision: `g3:r${revision}`,
        workspaceGeneration: 3,
        workspaceRevision: revision,
    };
}

function change(input: {
    batchId: string;
    entityId: string;
    revision: number;
}): WorkspaceChange {
    return {
        batchId: input.batchId,
        changedAt: "2026-08-01T12:00:00.000Z",
        changeCount: 1,
        changeId: `${input.batchId}:0`,
        changeIndex: 0,
        entityId: input.entityId,
        entityType: "account",
        expiresAt: 0,
        operation: "upsert",
        previousRecordDigest: null,
        record: { accountId: input.entityId },
        workspaceGeneration: 3,
        workspaceRevision: input.revision,
    };
}

describe("Workspace Sync V2", () => {
    it("groups and orders reconciliation-style multi-revision changes", () => {
        const envelope = createWorkspaceSyncEnvelope({
            changes: [
                change({ batchId: "batch-5", entityId: "account-5", revision: 5 }),
                change({ batchId: "batch-4", entityId: "account-4", revision: 4 }),
            ],
            knowledge: knowledge(5),
        });

        expect(envelope.commits.map((commit) => commit.commitId)).toEqual([
            "batch-4",
            "batch-5",
        ]);
        expect(envelope.fromVersion.cursor).toBe("g3:r3");
        expect(envelope.toVersion.cursor).toBe("g3:r5");
        expect(envelope.commits[0]?.changes[0]).toEqual({
            entityId: "account-4",
            entityType: "account",
            operation: "upsert",
            record: { accountId: "account-4" },
        });
    });

    it("represents a no-op mutation at one stable version", () => {
        const envelope = createWorkspaceSyncEnvelope({
            changes: [],
            knowledge: knowledge(7),
        });

        expect(envelope).toEqual({
            commits: [],
            fromVersion: workspaceKnowledgeToVersion(knowledge(7)),
            toVersion: workspaceKnowledgeToVersion(knowledge(7)),
        });
    });

    it("checks commit contiguity without entity digest proofs", () => {
        const envelope = createWorkspaceSyncEnvelope({
            changes: [
                change({ batchId: "batch-2", entityId: "account-1", revision: 2 }),
            ],
            knowledge: knowledge(2),
        });

        expect(
            isWorkspaceCommitContiguous(
                createWorkspaceVersion({
                    generation: 3,
                    ledgerId: "ledger-1",
                    revision: 1,
                }),
                envelope.commits[0]!,
            ),
        ).toBe(true);
    });

    it("rejects child upserts that omit the canonical transaction parent", () => {
        expect(() =>
            createWorkspaceSyncEnvelope({
                changes: [
                    {
                        ...change({
                            batchId: "batch-child",
                            entityId: "line-1",
                            revision: 2,
                        }),
                        entityType: "transactionLine",
                        record: {
                            lineId: "line-1",
                            transactionId: "transaction-1",
                        },
                    },
                ],
                knowledge: knowledge(2),
            }),
        ).toThrow(/canonical parent transaction/i);

        expect(() =>
            createWorkspaceSyncEnvelope({
                changes: [
                    {
                        ...change({
                            batchId: "batch-parent",
                            entityId: "transaction-1",
                            revision: 2,
                        }),
                        changeCount: 2,
                        entityType: "transaction",
                        record: { transactionId: "transaction-1" },
                    },
                    {
                        ...change({
                            batchId: "batch-parent",
                            entityId: "line-1",
                            revision: 2,
                        }),
                        changeCount: 2,
                        changeId: "batch-parent:1",
                        changeIndex: 1,
                        entityType: "transactionLine",
                        record: {
                            lineId: "line-1",
                            transactionId: "transaction-1",
                        },
                    },
                ],
                knowledge: knowledge(2),
            }),
        ).not.toThrow();
    });
});
