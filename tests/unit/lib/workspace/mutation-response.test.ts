import { describe, expect, it } from "vitest";

import {
    readWorkspaceMutationResponse,
    WorkspaceMutationResponseError,
} from "@/lib/workspace/mutation-response";
function createVersion(revision: number) {
    return {
        cursor: `g1:r${revision}`,
        generation: 1,
        ledgerId: "ledger-1",
        protocolVersion: 2 as const,
        revision,
    };
}

function createValidWorkspaceSync() {
    return {
        commits: [
            {
                changes: [
                    {
                        entityId: "account-1",
                        entityType: "account",
                        operation: "upsert" as const,
                        record: { accountId: "account-1", name: "Checking" },
                    },
                ],
                commitId: "01K00000000000000000000000",
                committedAt: "2026-07-16T00:00:00.000Z",
                fromVersion: createVersion(0),
                toVersion: createVersion(1),
            },
        ],
        fromVersion: createVersion(0),
        toVersion: createVersion(1),
    };
}

describe("workspace mutation response parsing", () => {
    it("accepts a response with persisted workspace changes", async () => {
        const payload = await readWorkspaceMutationResponse<{ saved: boolean }>(
            new Response(
                JSON.stringify({
                    saved: true,
                    workspaceSync: createValidWorkspaceSync(),
                }),
            ),
        );

        expect(payload.saved).toBe(true);
        expect(payload.workspaceSync).toEqual(createValidWorkspaceSync());
    });

    it("accepts an explicit no-op workspace change response", async () => {
        await expect(
            readWorkspaceMutationResponse(
                new Response(
                    JSON.stringify({
                        workspaceSync: {
                            commits: [],
                            fromVersion: createVersion(1),
                            toVersion: createVersion(1),
                        },
                    }),
                ),
            ),
        ).resolves.toMatchObject({ workspaceSync: { commits: [] } });
    });

    it.each([
        ["missing workspaceSync", JSON.stringify({ saved: true })],
        ["invalid JSON", "not-json"],
        [
            "unknown entity type",
            JSON.stringify({
                workspaceSync: {
                    ...createValidWorkspaceSync(),
                    commits: [
                        {
                            ...createValidWorkspaceSync().commits[0],
                            changes: [
                                {
                                    ...createValidWorkspaceSync().commits[0]!.changes[0],
                                    entityType: "unknown",
                                },
                            ],
                        },
                    ],
                },
            }),
        ],
        [
            "malformed delete record",
            JSON.stringify({
                workspaceSync: {
                    ...createValidWorkspaceSync(),
                    commits: [
                        {
                            ...createValidWorkspaceSync().commits[0],
                            changes: [
                                {
                                    ...createValidWorkspaceSync().commits[0]!.changes[0],
                                    operation: "delete",
                                    record: {},
                                },
                            ],
                        },
                    ],
                },
            }),
        ],
    ])("rejects %s", async (_label, body) => {
        await expect(
            readWorkspaceMutationResponse(new Response(body)),
        ).rejects.toBeInstanceOf(WorkspaceMutationResponseError);
    });
});
