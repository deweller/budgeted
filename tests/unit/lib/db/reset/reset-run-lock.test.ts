// @vitest-environment node

import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";

import {
    acquireResetRunLock,
    buildResetRunLockKey,
    releaseResetRunLock,
} from "@/lib/db/reset/reset-run-lock";

describe("reset run lock", () => {
    it("acquires a target-scoped lock with a conditional write", async () => {
        const send = vi.fn().mockResolvedValue(undefined);

        await expect(
            acquireResetRunLock("ledger-table", "local", {
                send,
                now: () => new Date("2026-05-27T12:00:00.000Z"),
                createId: () => "lock-1",
            }),
        ).resolves.toMatchObject({
            lockId: "lock-1",
            targetLabel: "local",
        });

        const command = send.mock.calls[0][0] as PutCommand;
        expect(command).toBeInstanceOf(PutCommand);
        expect(command.input.TableName).toBe("ledger-table");
        expect(command.input.ConditionExpression).toMatch(
            /attribute_not_exists/,
        );
    });

    it("fails with an overlap error when an active lock already exists", async () => {
        const send = vi.fn().mockRejectedValue(
            Object.assign(new Error("busy"), {
                name: "ConditionalCheckFailedException",
            }),
        );

        await expect(
            acquireResetRunLock("ledger-table", "local", { send }),
        ).rejects.toThrow(/already running/i);
    });

    it("releases the lock by deleting the lock record", async () => {
        const send = vi.fn().mockResolvedValue(undefined);

        await releaseResetRunLock("ledger-table", "local", { send });

        const command = send.mock.calls[0][0] as DeleteCommand;
        expect(command).toBeInstanceOf(DeleteCommand);
        expect(command.input.Key).toEqual(buildResetRunLockKey("local"));
    });
});
