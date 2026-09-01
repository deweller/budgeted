// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
    buildCountEntries,
    buildDestructiveWarning,
    formatResetExecutionResult,
} from "@/lib/db/reset/reset-summary";

describe("reset summary formatting", () => {
    it("builds a destructive warning that names the target and preserved user accounts", () => {
        expect(
            buildDestructiveWarning({
                targetLabel: "local",
            }),
        ).toEqual(
            expect.arrayContaining([
                "Reset target: local",
                "This will be preserved:",
                "- User accounts",
            ]),
        );
    });

    it("formats a success result with cleared and preserved counts", () => {
        const output = formatResetExecutionResult({
            status: "success",
            targetLabel: "local",
            startedAt: "2026-05-27T12:00:00.000Z",
            finishedAt: "2026-05-27T12:01:00.000Z",
            clearedCounts: [
                { label: "Accounts", count: 1 },
                { label: "Transactions", count: 2 },
            ],
            preservedCounts: [{ label: "User accounts", count: 1 }],
        });

        expect(output).toEqual(
            expect.arrayContaining([
                "Status: success",
                "- Accounts: 1",
                "- Transactions: 2",
                "- User accounts: 1",
            ]),
        );
    });

    it("formats an incomplete result with retry guidance", () => {
        const output = formatResetExecutionResult({
            status: "incomplete",
            targetLabel: "local",
            startedAt: "2026-05-27T12:00:00.000Z",
            finishedAt: "2026-05-27T12:01:00.000Z",
            clearedCounts: [{ label: "Accounts", count: 1 }],
            preservedCounts: [{ label: "User accounts", count: 1 }],
            remainingCounts: [{ label: "Transactions", count: 1 }],
            failureReasons: ["batch failed"],
        });

        expect(output).toEqual(
            expect.arrayContaining([
                "Status: incomplete",
                "Remaining targeted data:",
                "- Transactions: 1",
                "Target is incomplete. Retry is required before treating it as clean.",
            ]),
        );
    });

    it("sorts count entries and drops zero values", () => {
        const counts = new Map([
            ["Transactions", 2],
            ["Accounts", 0],
            ["Budget periods", 1],
        ]);

        expect(buildCountEntries(counts)).toEqual([
            { label: "Budget periods", count: 1 },
            { label: "Transactions", count: 2 },
        ]);
    });
});
