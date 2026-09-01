// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { executeWorkspaceChangePurge } from "@/lib/db/workspace-change-purge";

function createPage(
    items: Array<Record<string, unknown>>,
    lastEvaluatedKey?: Record<string, unknown>,
) {
    return {
        items,
        lastEvaluatedKey,
    };
}

describe("workspace change purge", () => {
    it("deletes every workspaceChange key and reports success", async () => {
        const listPage = vi
            .fn()
            .mockResolvedValueOnce(
                createPage(
                    [{ pk: "change#1", sk: "change#1" }],
                    { pk: "cursor", sk: "cursor" },
                ),
            )
            .mockResolvedValueOnce(
                createPage([{ pk: "change#2", sk: "change#2" }]),
            )
            .mockResolvedValueOnce(createPage([]));
        const deleteBatch = vi.fn().mockResolvedValue(undefined);

        await expect(
            executeWorkspaceChangePurge(
                {
                    tableName: "ledger-table",
                    targetLabel: "dev",
                },
                {
                    deleteBatch,
                    listPage,
                    now: () => new Date("2026-06-25T12:00:00.000Z"),
                },
            ),
        ).resolves.toEqual({
            failureReasons: undefined,
            finishedAt: "2026-06-25T12:00:00.000Z",
            matchedCount: 2,
            purgedCount: 2,
            remainingCount: 0,
            startedAt: "2026-06-25T12:00:00.000Z",
            status: "success",
            targetLabel: "dev",
        });

        expect(deleteBatch).toHaveBeenCalledWith({
            keys: [
                { pk: "change#1", sk: "change#1" },
                { pk: "change#2", sk: "change#2" },
            ],
            tableName: "ledger-table",
        });
    });

    it("returns incomplete when records remain after deletion", async () => {
        const listPage = vi
            .fn()
            .mockResolvedValueOnce(
                createPage([{ pk: "change#1", sk: "change#1" }]),
            )
            .mockResolvedValueOnce(
                createPage([{ pk: "change#1", sk: "change#1" }]),
            );

        await expect(
            executeWorkspaceChangePurge(
                {
                    tableName: "ledger-table",
                    targetLabel: "dev",
                },
                {
                    deleteBatch: vi.fn().mockRejectedValue(new Error("denied")),
                    listPage,
                    now: () => new Date("2026-06-25T12:00:00.000Z"),
                },
            ),
        ).resolves.toMatchObject({
            failureReasons: ["denied"],
            matchedCount: 1,
            purgedCount: 0,
            remainingCount: 1,
            status: "incomplete",
        });
    });

    it("treats an already-empty workspaceChange log as success", async () => {
        const listPage = vi
            .fn()
            .mockResolvedValueOnce(createPage([]))
            .mockResolvedValueOnce(createPage([]));
        const deleteBatch = vi.fn();

        await expect(
            executeWorkspaceChangePurge(
                {
                    tableName: "ledger-table",
                    targetLabel: "dev",
                },
                {
                    deleteBatch,
                    listPage,
                    now: () => new Date("2026-06-25T12:00:00.000Z"),
                },
            ),
        ).resolves.toMatchObject({
            matchedCount: 0,
            purgedCount: 0,
            remainingCount: 0,
            status: "success",
        });

        expect(deleteBatch).not.toHaveBeenCalled();
    });
});
