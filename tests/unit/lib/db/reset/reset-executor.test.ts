// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { executeReset } from "@/lib/db/reset/reset-executor";

function createPage(
    items: Array<Record<string, unknown>>,
    lastEvaluatedKey?: Record<string, unknown>,
) {
    return {
        items,
        lastEvaluatedKey,
    };
}

describe("reset executor", () => {
    it("returns success when all targeted records are deleted", async () => {
        const listPage = vi
            .fn()
            .mockResolvedValueOnce(
                createPage([
                    {
                        pk: "user#owner-1",
                        sk: "user#owner-1",
                        __edb_e__: "userAccount",
                        userId: "owner-1",
                        email: "owner@example.com",
                    },
                    {
                        pk: "account#1",
                        sk: "account#1",
                        __edb_e__: "account",
                    },
                    {
                        pk: "budget-group#1",
                        sk: "budget-group#1",
                        __edb_e__: "budgetGroup",
                    },
                    {
                        pk: "transaction#1",
                        sk: "transaction#1",
                        __edb_e__: "transaction",
                    },
                ]),
            )
            .mockResolvedValueOnce(
                createPage([
                    {
                        pk: "user#owner-1",
                        sk: "user#owner-1",
                        __edb_e__: "userAccount",
                        userId: "owner-1",
                        email: "owner@example.com",
                    },
                ]),
            );
        const deleteBatch = vi.fn().mockResolvedValue(undefined);
        const acquireLock = vi.fn().mockResolvedValue(undefined);
        const releaseLock = vi.fn().mockResolvedValue(undefined);

        await expect(
            executeReset(
                {
                    tableName: "ledger-table",
                    targetLabel: "local",
                },
                {
                    listPage,
                    deleteBatch,
                    acquireLock,
                    releaseLock,
                    now: () => new Date("2026-05-27T12:00:00.000Z"),
                },
            ),
        ).resolves.toMatchObject({
            status: "success",
            clearedCounts: [
                { label: "Accounts", count: 1 },
                { label: "Budget groups", count: 1 },
                { label: "Transactions", count: 1 },
            ],
            preservedCounts: [{ label: "User accounts", count: 1 }],
        });

        expect(deleteBatch).toHaveBeenCalledWith({
            tableName: "ledger-table",
            keys: [
                { pk: "account#1", sk: "account#1" },
                { pk: "budget-group#1", sk: "budget-group#1" },
                { pk: "transaction#1", sk: "transaction#1" },
            ],
        });
        expect(acquireLock).toHaveBeenCalledWith("ledger-table", "local");
        expect(releaseLock).toHaveBeenCalledWith("ledger-table", "local");
    });

    it("returns incomplete when a delete batch fails but the run continues", async () => {
        const firstPassItems = Array.from({ length: 26 }, (_, index) => ({
            pk: `transaction#${index}`,
            sk: `transaction#${index}`,
            __edb_e__: "transaction",
        }));
        const remainingItems = [
            {
                pk: "user#owner-1",
                sk: "user#owner-1",
                __edb_e__: "userAccount",
                userId: "owner-1",
                email: "owner@example.com",
            },
            {
                pk: "transaction#25",
                sk: "transaction#25",
                __edb_e__: "transaction",
            },
        ];
        const listPage = vi
            .fn()
            .mockResolvedValueOnce(
                createPage([
                    {
                        pk: "user#owner-1",
                        sk: "user#owner-1",
                        __edb_e__: "userAccount",
                        userId: "owner-1",
                        email: "owner@example.com",
                    },
                    ...firstPassItems,
                ]),
            )
            .mockResolvedValueOnce(createPage(remainingItems));
        const deleteBatch = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("batch failed"));

        await expect(
            executeReset(
                {
                    tableName: "ledger-table",
                    targetLabel: "local",
                },
                {
                    listPage,
                    deleteBatch,
                    acquireLock: vi.fn().mockResolvedValue(undefined),
                    releaseLock: vi.fn().mockResolvedValue(undefined),
                    now: () => new Date("2026-05-27T12:00:00.000Z"),
                },
            ),
        ).resolves.toMatchObject({
            status: "incomplete",
            remainingCounts: [{ label: "Transactions", count: 1 }],
            failureReasons: ["batch failed"],
        });
    });

    it("treats an already-empty target as a successful rerun", async () => {
        const listPage = vi
            .fn()
            .mockResolvedValueOnce(
                createPage([
                    {
                        pk: "user#owner-1",
                        sk: "user#owner-1",
                        __edb_e__: "userAccount",
                        userId: "owner-1",
                        email: "owner@example.com",
                    },
                ]),
            )
            .mockResolvedValueOnce(
                createPage([
                    {
                        pk: "user#owner-1",
                        sk: "user#owner-1",
                        __edb_e__: "userAccount",
                        userId: "owner-1",
                        email: "owner@example.com",
                    },
                ]),
            );

        await expect(
            executeReset(
                {
                    tableName: "ledger-table",
                    targetLabel: "local",
                },
                {
                    listPage,
                    deleteBatch: vi.fn().mockResolvedValue(undefined),
                    acquireLock: vi.fn().mockResolvedValue(undefined),
                    releaseLock: vi.fn().mockResolvedValue(undefined),
                    now: () => new Date("2026-05-27T12:00:00.000Z"),
                },
            ),
        ).resolves.toMatchObject({
            status: "success",
            clearedCounts: [],
            preservedCounts: [{ label: "User accounts", count: 1 }],
        });
    });
});
