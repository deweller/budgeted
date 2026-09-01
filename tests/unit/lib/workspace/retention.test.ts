import { describe, expect, it } from "vitest";

import { isKnowledgeTooOldForDelta } from "@/lib/workspace/snapshot-utils";
import type { WorkspaceKnowledge } from "@/lib/workspace/sync-types";

function createKnowledge(input: {
    oldestRetainedWorkspaceRevision?: number;
    workspaceRevision: number;
}) {
    return {
        activeLedgerId: "ledger-1",
        changeCursor: "g1:r10",
        entityCounts: {},
        entityDigests: {},
        entityRevisions: {},
        generatedAt: "2026-07-16T00:00:00.000Z",
        oldestRetainedWorkspaceRevision:
            input.oldestRetainedWorkspaceRevision ?? 0,
        retainedChangesAfter: "2026-07-01T00:00:00.000Z",
        revision: "g1:r10",
        workspaceGeneration: 1,
        workspaceRevision: input.workspaceRevision,
    } satisfies WorkspaceKnowledge;
}

describe("workspace retention", () => {
    it("keeps a cursor exactly at the oldest retained revision", () => {
        expect(
            isKnowledgeTooOldForDelta(
                createKnowledge({ workspaceRevision: 4 }),
                createKnowledge({
                    oldestRetainedWorkspaceRevision: 4,
                    workspaceRevision: 10,
                }),
            ),
        ).toBe(false);
    });

    it("requires a snapshot before the oldest retained revision", () => {
        expect(
            isKnowledgeTooOldForDelta(
                createKnowledge({ workspaceRevision: 3 }),
                createKnowledge({
                    oldestRetainedWorkspaceRevision: 4,
                    workspaceRevision: 10,
                }),
            ),
        ).toBe(true);
    });

});
