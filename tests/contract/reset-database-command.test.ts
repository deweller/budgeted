// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    parseResetDatabaseArgs,
    runResetDatabaseCommand,
} from "../../scripts/reset-database.ts";

describe("reset database command contract", () => {
    const log = vi.fn();
    const executeReset = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        executeReset.mockResolvedValue({
            status: "success",
            targetLabel: "local",
            startedAt: "2026-05-27T12:00:00.000Z",
            finishedAt: "2026-05-27T12:01:00.000Z",
            clearedCounts: [{ label: "Accounts", count: 1 }],
            preservedCounts: [{ label: "User accounts", count: 1 }],
        });
    });

    it("parses the target, force flag, and confirmation input", () => {
        expect(
            parseResetDatabaseArgs([
                "--target",
                "local",
                "--force",
                "--confirm",
                "local",
            ]),
        ).toEqual({
            help: false,
            targetLabel: "local",
            confirmation: "local",
            force: true,
            yes: false,
        });
    });

    it("explains the target label in command help", async () => {
        await expect(
            runResetDatabaseCommand(["--help"], {
                log,
                resolveLedgerTableName: () => "ledger-table",
                executeReset,
            }),
        ).resolves.toMatchObject({
            status: "help",
            exitCode: 0,
        });

        const helpText = log.mock.calls.join("\n");

        expect(helpText).toContain(
            "Operator-facing safety label for the data you intend to reset.",
        );
        expect(helpText).toContain(
            "The actual DynamoDB table is resolved separately from SST or APP_TABLE_NAME.",
        );
        expect(helpText).toContain("Skip the final interactive prompt");
    });

    it("fails before deletion when the force flag is missing", async () => {
        await expect(
            runResetDatabaseCommand(
                ["--target", "local", "--confirm", "local"],
                {
                    log,
                    resolveLedgerTableName: () => "ledger-table",
                    executeReset,
                },
            ),
        ).rejects.toThrow(/requires --force/i);

        expect(executeReset).not.toHaveBeenCalled();
    });

    it("fails before deletion when the confirmation does not match the target", async () => {
        await expect(
            runResetDatabaseCommand(
                ["--target", "local", "--force", "--confirm", "staging"],
                {
                    log,
                    resolveLedgerTableName: () => "ledger-table",
                    executeReset,
                },
            ),
        ).rejects.toThrow(/must exactly match/i);

        expect(executeReset).not.toHaveBeenCalled();
    });

    it("cancels without deleting data when the operator declines at the final prompt", async () => {
        await expect(
            runResetDatabaseCommand(
                ["--target", "local", "--force", "--confirm", "local"],
                {
                    log,
                    promptForProceed: async () => false,
                    resolveLedgerTableName: () => "ledger-table",
                    executeReset,
                },
            ),
        ).resolves.toMatchObject({
            status: "cancelled",
            exitCode: 0,
        });

        expect(executeReset).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith("This will be preserved:");
        expect(log).toHaveBeenCalledWith(
            "Reset cancelled. No data was deleted.",
        );
    });

    it("runs the reset and prints the target summary on success", async () => {
        await expect(
            runResetDatabaseCommand(
                ["--target", "local", "--force", "--confirm", "local"],
                {
                    log,
                    promptForProceed: async () => true,
                    resolveLedgerTableName: () => "ledger-table",
                    executeReset,
                },
            ),
        ).resolves.toMatchObject({
            status: "success",
            exitCode: 0,
        });

        expect(executeReset).toHaveBeenCalledWith({
            tableName: "ledger-table",
            targetLabel: "local",
        });
        expect(log).toHaveBeenCalledWith("Reset target: local");
        expect(log).toHaveBeenCalledWith(
            "This will permanently clear budgeting and workspace data from the selected target:",
        );
        expect(log).toHaveBeenCalledWith("Status: success");
    });

    it("can skip the final prompt for explicit automation", async () => {
        const promptForProceed = vi.fn();

        await expect(
            runResetDatabaseCommand(
                [
                    "--target",
                    "e2e",
                    "--force",
                    "--confirm",
                    "e2e",
                    "--yes",
                ],
                {
                    log,
                    promptForProceed,
                    resolveLedgerTableName: () => "ledger-table",
                    executeReset,
                },
            ),
        ).resolves.toMatchObject({
            status: "success",
            exitCode: 0,
        });

        expect(promptForProceed).not.toHaveBeenCalled();
        expect(executeReset).toHaveBeenCalledWith({
            tableName: "ledger-table",
            targetLabel: "e2e",
        });
    });

    it("reports success when rerun against an already-empty target", async () => {
        executeReset.mockResolvedValueOnce({
            status: "success",
            targetLabel: "local",
            startedAt: "2026-05-27T12:02:00.000Z",
            finishedAt: "2026-05-27T12:02:01.000Z",
            clearedCounts: [],
            preservedCounts: [{ label: "User accounts", count: 1 }],
        });

        await expect(
            runResetDatabaseCommand(
                ["--target", "local", "--force", "--confirm", "local"],
                {
                    log,
                    promptForProceed: async () => true,
                    resolveLedgerTableName: () => "ledger-table",
                    executeReset,
                },
            ),
        ).resolves.toMatchObject({
            status: "success",
            exitCode: 0,
        });

        expect(log).toHaveBeenCalledWith("Target is ready for fresh setup.");
    });
});
