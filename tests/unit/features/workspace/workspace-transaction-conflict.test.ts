import { describe, expect, it } from "vitest";

import {
    assertWorkspaceTransactionCommitted,
    isRetryableWorkspaceTransactionConflict,
    isWorkspaceRevisionConflict,
    WorkspaceRevisionConflictError,
    WorkspaceTransactionCanceledError,
} from "@/features/workspace/server/workspace-transaction-conflict";

const successfulReason = {
    code: "None",
    rejected: false,
};
const revisionConflictReason = {
    code: "ConditionalCheckFailed",
    message: "The conditional request failed",
    rejected: true,
};

describe("workspace transaction conflict classification", () => {
    it("classifies a resolved ElectroDB revision-fence cancellation", () => {
        expect(() =>
            assertWorkspaceTransactionCommitted({
                canceled: true,
                data: [successfulReason, successfulReason, revisionConflictReason],
            }),
        ).toThrow(WorkspaceRevisionConflictError);
    });

    it("classifies a wrapped AWS revision-fence cancellation", () => {
        const error = new Error("ElectroDB transaction failed", {
            cause: {
                name: "TransactionCanceledException",
                CancellationReasons: [
                    { Code: "None" },
                    { Code: "ConditionalCheckFailed" },
                ],
            },
        });

        expect(isWorkspaceRevisionConflict(error)).toBe(true);
    });

    it("does not classify a mutation receipt collision as a revision conflict", () => {
        const error = {
            name: "TransactionCanceledException",
            CancellationReasons: [
                { Code: "None" },
                { Code: "ConditionalCheckFailed" },
                { Code: "None" },
            ],
        };

        expect(isWorkspaceRevisionConflict(error)).toBe(false);
    });

    it("classifies an otherwise clean DynamoDB transaction conflict as retryable", () => {
        expect(
            isRetryableWorkspaceTransactionConflict({
                CancellationReasons: [
                    { Code: "None" },
                    {
                        Code: "TransactionConflict",
                        Message: "Transaction is ongoing for the item",
                    },
                ],
                name: "TransactionCanceledException",
            }),
        ).toBe(true);
    });

    it("does not retry a transaction conflict that includes a domain failure", () => {
        expect(
            isRetryableWorkspaceTransactionConflict({
                CancellationReasons: [
                    { Code: "ConditionalCheckFailed" },
                    { Code: "TransactionConflict" },
                ],
                name: "TransactionCanceledException",
            }),
        ).toBe(false);
    });

    it("does not classify an unrelated condition failure as a revision conflict", () => {
        expect(() =>
            assertWorkspaceTransactionCommitted({
                canceled: true,
                data: [
                    revisionConflictReason,
                    successfulReason,
                    successfulReason,
                ],
            }),
        ).toThrow(WorkspaceTransactionCanceledError);

        try {
            assertWorkspaceTransactionCommitted({
                canceled: true,
                data: [
                    revisionConflictReason,
                    successfulReason,
                    successfulReason,
                ],
            });
        } catch (error) {
            expect(isWorkspaceRevisionConflict(error)).toBe(false);
        }
    });

    it("does not classify validation and generic cancellation messages", () => {
        expect(
            isWorkspaceRevisionConflict({
                CancellationReasons: [
                    { Code: "None" },
                    { Code: "ValidationError" },
                ],
                name: "TransactionCanceledException",
            }),
        ).toBe(false);
        expect(
            isWorkspaceRevisionConflict(
                new Error(
                    "TransactionCanceledException: ConditionalCheckFailed",
                ),
            ),
        ).toBe(false);
    });

    it("does not infer a revision conflict when the write has no revision fence", () => {
        let thrown: unknown;

        try {
            assertWorkspaceTransactionCommitted(
                {
                    canceled: true,
                    data: [successfulReason, revisionConflictReason],
                },
                { hasRevisionFence: false },
            );
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(WorkspaceTransactionCanceledError);
        expect(thrown).not.toBeInstanceOf(WorkspaceRevisionConflictError);
        expect(isWorkspaceRevisionConflict(thrown)).toBe(false);
    });

    it("accepts a committed transaction result", () => {
        expect(() =>
            assertWorkspaceTransactionCommitted({
                canceled: false,
                data: [],
            }),
        ).not.toThrow();
    });
});
