// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    parsePurgeWorkspaceChangesArgs,
    runPurgeWorkspaceChangesCommand,
} from "../../scripts/purge-workspace-changes.ts";

describe("purge workspace changes command contract", () => {
    const log = vi.fn();
    const executePurge = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        executePurge.mockResolvedValue({
            finishedAt: "2026-06-25T12:01:00.000Z",
            matchedCount: 2,
            purgedCount: 2,
            remainingCount: 0,
            startedAt: "2026-06-25T12:00:00.000Z",
            status: "success",
            targetLabel: "dev",
        });
    });

    it("parses the target, force flag, and confirmation input", () => {
        expect(
            parsePurgeWorkspaceChangesArgs([
                "--target",
                "dev",
                "--force",
                "--confirm",
                "dev",
            ]),
        ).toEqual({
            confirmation: "dev",
            force: true,
            help: false,
            targetLabel: "dev",
        });
    });

    it("accepts equals-style target and confirmation arguments", () => {
        expect(
            parsePurgeWorkspaceChangesArgs([
                "--target=dev",
                "--force",
                "--confirm=dev",
            ]),
        ).toMatchObject({
            confirmation: "dev",
            targetLabel: "dev",
        });
    });

    it("documents SST stage usage in command help", async () => {
        await expect(
            runPurgeWorkspaceChangesCommand(["--help"], {
                executePurge,
                log,
                resolveLedgerTableName: () => "ledger-table",
            }),
        ).resolves.toMatchObject({
            exitCode: 0,
            status: "help",
        });

        const helpText = log.mock.calls.join("\n");

        expect(helpText).toContain(
            "SST stage to run through. The npm wrapper passes this to `sst shell`.",
        );
        expect(helpText).toContain(
            "The actual DynamoDB table is resolved separately from SST or APP_TABLE_NAME.",
        );
    });

    it("fails before deletion when the force flag is missing", async () => {
        await expect(
            runPurgeWorkspaceChangesCommand(
                ["--target", "dev", "--confirm", "dev"],
                {
                    executePurge,
                    log,
                    resolveLedgerTableName: () => "ledger-table",
                },
            ),
        ).rejects.toThrow(/requires --force/i);

        expect(executePurge).not.toHaveBeenCalled();
    });

    it("fails before deletion when the confirmation does not match the target", async () => {
        await expect(
            runPurgeWorkspaceChangesCommand(
                ["--target", "dev", "--force", "--confirm", "prod"],
                {
                    executePurge,
                    log,
                    resolveLedgerTableName: () => "ledger-table",
                },
            ),
        ).rejects.toThrow(/must exactly match/i);

        expect(executePurge).not.toHaveBeenCalled();
    });

    it("cancels without deleting data when the operator declines at the final prompt", async () => {
        await expect(
            runPurgeWorkspaceChangesCommand(
                ["--target", "dev", "--force", "--confirm", "dev"],
                {
                    executePurge,
                    log,
                    promptForProceed: async () => false,
                    resolveLedgerTableName: () => "ledger-table",
                },
            ),
        ).resolves.toMatchObject({
            exitCode: 0,
            status: "cancelled",
        });

        expect(executePurge).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            "Workspace change purge cancelled. No data was deleted.",
        );
    });

    it("runs the purge and prints a summary on success", async () => {
        await expect(
            runPurgeWorkspaceChangesCommand(
                ["--target", "dev", "--force", "--confirm", "dev"],
                {
                    executePurge,
                    log,
                    promptForProceed: async () => true,
                    resolveLedgerTableName: () => "ledger-table",
                },
            ),
        ).resolves.toMatchObject({
            exitCode: 0,
            status: "success",
        });

        expect(executePurge).toHaveBeenCalledWith({
            tableName: "ledger-table",
            targetLabel: "dev",
        });
        expect(log).toHaveBeenCalledWith("Workspace change purge target: dev");
        expect(log).toHaveBeenCalledWith(
            "Purged workspace sync-log records: 2",
        );
        expect(log).toHaveBeenCalledWith("Workspace change log is clear.");
    });
});
