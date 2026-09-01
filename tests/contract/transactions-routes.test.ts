import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/errors";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence-token"),
    buildCommittedWorkspaceKnowledge: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    applyTransactionClassificationSuggestions: vi.fn(),
    categorizeTransactionsWithWorkspaceChanges: vi.fn(),
    createWorkspaceChanges: vi.fn(),
    deleteTransaction: vi.fn(),
    deleteTransactionWithWorkspaceChanges: vi.fn(),
    deleteTransactions: vi.fn(),
    deleteTransactionsWithWorkspaceChanges: vi.fn(),
    executeWorkspaceMutationWithReplay: vi.fn(),
    findWorkspaceMutationBatch: vi.fn(),
    findWorkspaceMutationOperation: vi.fn(),
    getPlaidTransactionReference: vi.fn(),
    getTransactionDeletionImpact: vi.fn(),
    getTransactionsDeletionImpact: vi.fn(),
    generateTransactionClassificationSuggestions: vi.fn(),
    applyTransactionClassificationPending: vi.fn(),
    listTransactionClassificationPending: vi.fn(),
    listTransactionClassificationPendingForAccount: vi.fn(),
    listTransactionReferences: vi.fn(),
    listTransactions: vi.fn(),
    mergeTransactionsWithWorkspaceChanges: vi.fn(),
    partitionWorkspaceChangesForPersistence: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    requireCurrentUserAccount: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
    upsertTransaction: vi.fn(),
    upsertTransactionWithWorkspaceChanges: vi.fn(),
    validateCategorizeWorkspaceMutation: vi.fn(),
    validateDeleteWorkspaceMutation: vi.fn(),
    rejectTransactionClassificationPending: vi.fn(),
    updateTransactionsStatusWithWorkspaceChanges: vi.fn(),
}));

const fakeKnowledge = {
    activeLedgerId: "default",
    changeCursor: "01HZ0000000000000000000000",
    entityCounts: {
        account: 0,
        allocationFundingSource: 0,
        budgetCategory: 0,
        budgetPeriod: 0,
        categoryAllocation: 0,
        ledger: 0,
        ledgerPosting: 0,
        plaidAccountLink: 0,
        plaidTransactionSync: 0,
        transaction: 0,
        transactionLine: 0,
        userAccount: 1,
    },
    generatedAt: "2026-06-05T12:00:00.000Z",
    retainedChangesAfter: "2026-05-06T12:00:00.000Z",
    revision: "revision",
};

function workspaceSyncContaining(
    changes: Array<{
        entityId: string;
        entityType: string;
        operation: string;
        record: unknown;
    }>,
) {
    const recordChanges = changes.map(
        ({ entityId, entityType, operation, record }) => ({
            entityId,
            entityType,
            operation,
            record,
        }),
    );

    return {
        workspaceSync:
            recordChanges.length === 0
                ? expect.objectContaining({ commits: [] })
                : expect.objectContaining({
                      commits: [
                          expect.objectContaining({ changes: recordChanges }),
                      ],
                  }),
    };
}

vi.mock("@/lib/auth/current-user", () => ({
    getActiveLedgerId: (user: { activeLedgerId?: string; userId: string }) =>
        user.activeLedgerId ?? user.userId,
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    listTransactions: mocks.listTransactions,
}));

vi.mock(
    "@/features/transactions/server/transaction-reference-read-service",
    () => ({
        listTransactionReferences: mocks.listTransactionReferences,
    }),
);

vi.mock("@/features/plaid/server/plaid-transaction-reference-service", () => ({
    getPlaidTransactionReference: mocks.getPlaidTransactionReference,
}));

vi.mock("@/features/transactions/server/transaction-save-service", () => ({
    upsertTransactionWithWorkspaceChanges:
        mocks.upsertTransactionWithWorkspaceChanges,
}));

vi.mock("@/features/transactions/server/transaction-delete-service", () => ({
    deleteTransactionWithWorkspaceChanges:
        mocks.deleteTransactionWithWorkspaceChanges,
    deleteTransactionsWithWorkspaceChanges:
        mocks.deleteTransactionsWithWorkspaceChanges,
    getTransactionDeletionImpact: mocks.getTransactionDeletionImpact,
    getTransactionsDeletionImpact: mocks.getTransactionsDeletionImpact,
    validateDeleteWorkspaceMutation: mocks.validateDeleteWorkspaceMutation,
}));

vi.mock(
    "@/features/transactions/server/transaction-categorize-service",
    () => ({
        categorizeTransactionsWithWorkspaceChanges:
            mocks.categorizeTransactionsWithWorkspaceChanges,
        validateCategorizeWorkspaceMutation:
            mocks.validateCategorizeWorkspaceMutation,
    }),
);

vi.mock("@/features/transactions/server/transaction-merge-service", () => ({
    mergeTransactionsWithWorkspaceChanges:
        mocks.mergeTransactionsWithWorkspaceChanges,
}));

vi.mock(
    "@/features/transactions/server/transaction-status-mutation-service",
    () => ({
        updateTransactionsStatusWithWorkspaceChanges:
            mocks.updateTransactionsStatusWithWorkspaceChanges,
    }),
);

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    createWorkspaceChanges: mocks.createWorkspaceChanges,
    executeWorkspaceMutationWithReplay: mocks.executeWorkspaceMutationWithReplay,
    findWorkspaceMutationBatch: mocks.findWorkspaceMutationBatch,
    findWorkspaceMutationOperation: mocks.findWorkspaceMutationOperation,
    partitionWorkspaceChangesForPersistence:
        mocks.partitionWorkspaceChangesForPersistence,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-service",
    () => ({
        applyTransactionClassificationSuggestions:
            mocks.applyTransactionClassificationSuggestions,
        generateTransactionClassificationSuggestions:
            mocks.generateTransactionClassificationSuggestions,
    }),
);

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-pending-service",
    () => ({
        applyTransactionClassificationPending:
            mocks.applyTransactionClassificationPending,
        listTransactionClassificationPending:
            mocks.listTransactionClassificationPending,
        listTransactionClassificationPendingForAccount:
            mocks.listTransactionClassificationPendingForAccount,
        rejectTransactionClassificationPending:
            mocks.rejectTransactionClassificationPending,
    }),
);

import {
    DELETE as DELETE_TRANSACTIONS,
    GET,
    POST,
} from "@/app/api/transactions/route";
import {
    DELETE,
    GET as GET_TRANSACTION,
    PATCH,
} from "@/app/api/transactions/[transactionId]/route";
import { GET as GET_PLAID_TRANSACTION_REFERENCE } from "@/app/api/transactions/[transactionId]/plaid-reference/route";
import { POST as POST_CLASSIFICATION_APPLY } from "@/app/api/transactions/classification/apply/route";
import { POST as POST_CLASSIFICATION_PENDING } from "@/app/api/transactions/classification/pending/route";
import { POST as POST_CLASSIFICATION_PENDING_APPLY } from "@/app/api/transactions/classification/pending/apply/route";
import { POST as POST_CLASSIFICATION_PENDING_REJECT } from "@/app/api/transactions/classification/pending/reject/route";
import { POST as POST_CLASSIFICATION_SUGGESTIONS } from "@/app/api/transactions/classification/suggestions/route";
import { POST as POST_DELETION_IMPACT } from "@/app/api/transactions/deletion-impact/route";
import { POST as POST_MERGE } from "@/app/api/transactions/merge/route";
import { POST as POST_CATEGORIZE } from "@/app/api/transactions/categorize/route";
import { POST as POST_TRANSACTION_REFERENCES } from "@/app/api/transactions/references/route";
import { POST as POST_TRANSACTION_STATUS } from "@/app/api/transactions/status/route";

describe("transactions routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.buildCommittedWorkspaceKnowledge.mockResolvedValue(fakeKnowledge);
        mocks.requireCurrentUserAccount.mockResolvedValue({
            activeLedgerId: "ledger-1",
            userId: "owner-1",
        });
        mocks.trackWorkspaceMutation.mockImplementation(async (_user, mutate) => ({
            knowledge: fakeKnowledge,
            result: await mutate(),
        }));
        mocks.persistWorkspaceChanges.mockImplementation(
            async ({ changes }: { changes: WorkspaceMutationChangeInput[] }) =>
                changes.map((change, index) => ({
                    ...change,
                    batchId: "batch-1",
                    changedAt: "2026-06-05T12:00:00.000Z",
                    changeId: `change-${index}`,
                    expiresAt: 1_781_000_000,
                })),
        );
        mocks.partitionWorkspaceChangesForPersistence.mockImplementation(
            (changes) => ({
                persistedChanges: changes,
                unpublishedChanges: [],
            }),
        );
        mocks.findWorkspaceMutationBatch.mockResolvedValue(null);
        mocks.findWorkspaceMutationOperation.mockResolvedValue(null);
        mocks.executeWorkspaceMutationWithReplay.mockImplementation(
            async ({
                execute,
                ledgerId,
                mutationId,
                mutationType,
                validateExistingMutation,
            }: {
                execute: () => Promise<unknown>;
                ledgerId: string;
                mutationId: string;
                mutationType: string;
                validateExistingMutation?: () => Promise<void>;
            }) => {
                await validateExistingMutation?.();
                const batch = await mocks.findWorkspaceMutationBatch({
                    ledgerId,
                    mutationId,
                    mutationType,
                });

                if (batch) {
                    return { batch, result: null };
                }

                return { batch: null, result: await execute() };
            },
        );
        mocks.createWorkspaceChanges.mockImplementation(
            ({ changes }: { changes: WorkspaceMutationChangeInput[] }) =>
                changes.map((change, index) => ({
                    ...change,
                    batchId: "batch-1",
                    changedAt: "2026-06-05T12:00:00.000Z",
                    changeId: `change-${index}`,
                    expiresAt: 1_781_000_000,
                })),
        );
        mocks.generateTransactionClassificationSuggestions.mockResolvedValue({
            eligibleCount: 1,
            modelId: "gemini-3.5-flash",
            promptVersion: "2026-07-07.v1",
            suggestions: [],
        });
        mocks.listTransactionClassificationPending.mockResolvedValue({
            pending: [],
        });
        mocks.applyTransactionClassificationSuggestions.mockResolvedValue({
            appliedCount: 1,
            workspaceChanges: [],
        });
        mocks.applyTransactionClassificationPending.mockResolvedValue({
            appliedCount: 1,
            workspaceChanges: [],
        });
        mocks.rejectTransactionClassificationPending.mockResolvedValue({
            pending: { status: "rejected" },
        });
    });

    it("updates transaction lock status with committed workspace changes", async () => {
        mocks.updateTransactionsStatusWithWorkspaceChanges.mockResolvedValue({
            updatedCount: 2,
            workspaceChanges: [
                {
                    entityId: "transaction-1",
                    entityType: "transaction",
                    operation: "upsert",
                    record: {
                        status: "reconciled",
                        transactionId: "transaction-1",
                    },
                },
            ],
        });

        const response = await POST_TRANSACTION_STATUS(
            new Request("http://localhost/api/transactions/status", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    mutationId: "mutation-1",
                    status: "reconciled",
                    transactionIds: ["transaction-1", "transaction-2"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            updatedCount: 2,
            workspaceSync: expect.objectContaining({
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "transaction-1",
                                entityType: "transaction",
                                operation: "upsert",
                            }),
                        ],
                    }),
                ],
            }),
        });
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).toHaveBeenCalledWith({
            actorUserId: "owner-1",
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            status: "reconciled",
            transactionIds: ["transaction-1", "transaction-2"],
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("returns AI classification suggestions for selected transactions", async () => {
        mocks.generateTransactionClassificationSuggestions.mockResolvedValue({
            eligibleCount: 1,
            modelId: "gemini-3.5-flash",
            promptVersion: "2026-07-07.v1",
            suggestions: [
                {
                    confidence: 0.9,
                    lineAssignments: [
                        {
                            categoryId: "groceries",
                            lineId: "line-1",
                        },
                    ],
                    reason: "History matched.",
                    suggestedMemo: "Weekly groceries",
                    suggestedPayee: "Market",
                    targetLineIds: ["line-1"],
                    transactionId: "transaction-1",
                    transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                    type: "category",
                },
            ],
        });

        const response = await POST_CLASSIFICATION_SUGGESTIONS(
            new Request(
                "http://localhost/api/transactions/classification/suggestions",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        transactionIds: ["transaction-1"],
                    }),
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            modelId: "gemini-3.5-flash",
            suggestions: [
                {
                    suggestedMemo: "Weekly groceries",
                    suggestedPayee: "Market",
                },
            ],
        });
        expect(
            mocks.generateTransactionClassificationSuggestions,
        ).toHaveBeenCalledWith("ledger-1", {
            transactionIds: ["transaction-1"],
        });
    });

    it("returns a missing Google API key error for AI classification", async () => {
        mocks.generateTransactionClassificationSuggestions.mockRejectedValue(
            new HttpError(
                503,
                "google_ai_key_missing",
                "Google AI Studio is not configured.",
            ),
        );

        const response = await POST_CLASSIFICATION_SUGGESTIONS(
            new Request(
                "http://localhost/api/transactions/classification/suggestions",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        transactionIds: ["transaction-1"],
                    }),
                },
            ),
        );

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "google_ai_key_missing",
                message: "Google AI Studio is not configured.",
            },
        });
    });

    it("returns a normalized model failure for AI classification", async () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        mocks.generateTransactionClassificationSuggestions.mockRejectedValue(
            new Error("Model failed"),
        );

        const response = await POST_CLASSIFICATION_SUGGESTIONS(
            new Request(
                "http://localhost/api/transactions/classification/suggestions",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        transactionIds: ["transaction-1"],
                    }),
                },
            ),
        );

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "internal_error",
                message: "Unexpected server error.",
            },
        });
        consoleError.mockRestore();
    });

    it("applies AI classification suggestions and persists workspace changes", async () => {
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "upsert" as const,
            record: { transactionId: "transaction-1" },
        };

        mocks.applyTransactionClassificationSuggestions.mockResolvedValue({
            appliedCount: 1,
            workspaceChanges: [workspaceChange],
        });

        const suggestion = {
            confidence: 0.9,
            lineAssignments: [
                {
                    categoryId: "groceries",
                    lineId: "line-1",
                },
            ],
            reason: "History matched.",
            suggestedMemo: "Weekly groceries",
            suggestedPayee: "Market",
            targetLineIds: ["line-1"],
            transactionId: "transaction-1",
            transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
            type: "category",
        };
        const response = await POST_CLASSIFICATION_APPLY(
            new Request("http://localhost/api/transactions/classification/apply", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    fieldSelections: [
                        {
                            applySuggestedMemo: true,
                            applySuggestedPayee: false,
                            transactionId: "transaction-1",
                        },
                    ],
                    modelId: "gemini-3.5-flash",
                    suggestions: [suggestion],
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            appliedCount: 1,
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(
            mocks.applyTransactionClassificationSuggestions,
        ).toHaveBeenCalledWith({
            actorUserId: "owner-1",
            fieldSelections: [
                {
                    applySuggestedMemo: true,
                    applySuggestedPayee: false,
                    transactionId: "transaction-1",
                },
            ],
            ledgerId: "ledger-1",
            modelId: "gemini-3.5-flash",
            suggestions: [suggestion],
        });
    });

    it("returns stale AI classification apply conflicts", async () => {
        mocks.applyTransactionClassificationSuggestions.mockRejectedValue(
            new HttpError(
                409,
                "classification_suggestion_stale",
                "The transaction changed after this classification was generated.",
            ),
        );

        const suggestion = {
            confidence: 0.9,
            lineAssignments: [
                {
                    categoryId: "groceries",
                    lineId: "line-1",
                },
            ],
            reason: "History matched.",
            targetLineIds: ["line-1"],
            transactionId: "transaction-1",
            transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
            type: "category",
        };
        const response = await POST_CLASSIFICATION_APPLY(
            new Request("http://localhost/api/transactions/classification/apply", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    modelId: "gemini-3.5-flash",
                    suggestions: [suggestion],
                }),
            }),
        );

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "classification_suggestion_stale",
                message:
                    "The transaction changed after this classification was generated.",
            },
        });
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
        expect(mocks.beginWorkspaceExplicitMutation).toHaveBeenCalledWith(
            "ledger-1",
        );
        expect(mocks.completeWorkspaceExplicitMutation).not.toHaveBeenCalled();
        expect(mocks.recoverWorkspaceExplicitMutation).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            token: "fence-token",
        });
    });

    it("does not apply AI payee or memo suggestions without a classification suggestion", async () => {
        mocks.applyTransactionClassificationSuggestions.mockRejectedValue(
            new HttpError(
                422,
                "classification_no_suggestion",
                "No-suggestion results cannot be applied.",
            ),
        );

        const suggestion = {
            confidence: 0,
            lineAssignments: [],
            reason: "No category confidence.",
            suggestedMemo: "Weekly groceries",
            suggestedPayee: "Market",
            targetLineIds: ["line-1"],
            transactionId: "transaction-1",
            transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
            type: "noSuggestion",
        };
        const response = await POST_CLASSIFICATION_APPLY(
            new Request("http://localhost/api/transactions/classification/apply", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    fieldSelections: [
                        {
                            applySuggestedMemo: true,
                            applySuggestedPayee: true,
                            transactionId: "transaction-1",
                        },
                    ],
                    suggestions: [suggestion],
                }),
            }),
        );

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "classification_no_suggestion",
                message: "No-suggestion results cannot be applied.",
            },
        });
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("returns current pending AI classifications", async () => {
        mocks.listTransactionClassificationPending.mockResolvedValue({
            pending: [
                {
                    accountId: "checking",
                    createdAt: "2026-07-07T12:00:00.000Z",
                    expiresAt: 1_791_372_000,
                    modelId: "gpt-5.6-luna",
                    promptVersion: "2026-07-07.v1",
                    source: "manual",
                    suggestion: {
                        confidence: 0,
                        lineAssignments: [],
                        reason: "No compact category candidates were found.",
                        targetLineIds: ["line-1"],
                        transactionId: "transaction-1",
                        transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                        type: "noSuggestion",
                    },
                    suggestionType: "noSuggestion",
                    transactionId: "transaction-1",
                    transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-07T12:00:00.000Z",
                },
            ],
        });

        const response = await POST_CLASSIFICATION_PENDING(
            new Request("http://localhost/api/transactions/classification/pending", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    transactionIds: ["transaction-1"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            pending: [
                {
                    suggestionType: "noSuggestion",
                    transactionId: "transaction-1",
                },
            ],
        });
        expect(mocks.listTransactionClassificationPending).toHaveBeenCalledWith(
            "ledger-1",
            ["transaction-1"],
        );
    });

    it("returns account pending AI classifications", async () => {
        mocks.listTransactionClassificationPendingForAccount.mockResolvedValue({
            pending: [
                {
                    accountId: "checking",
                    createdAt: "2026-07-07T12:00:00.000Z",
                    expiresAt: 1_791_372_000,
                    modelId: "gpt-5.6-luna",
                    promptVersion: "2026-07-07.v1",
                    source: "manual",
                    suggestion: {
                        confidence: 0,
                        lineAssignments: [],
                        reason: "No compact category candidates were found.",
                        targetLineIds: ["line-1"],
                        transactionId: "transaction-1",
                        transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                        type: "noSuggestion",
                    },
                    suggestionType: "noSuggestion",
                    transactionId: "transaction-1",
                    transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-07T12:00:00.000Z",
                },
            ],
        });

        const response = await POST_CLASSIFICATION_PENDING(
            new Request("http://localhost/api/transactions/classification/pending", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    accountId: "checking",
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            pending: [
                {
                    suggestionType: "noSuggestion",
                    transactionId: "transaction-1",
                },
            ],
        });
        expect(
            mocks.listTransactionClassificationPendingForAccount,
        ).toHaveBeenCalledWith("ledger-1", "checking");
        expect(mocks.listTransactionClassificationPending).not.toHaveBeenCalled();
    });

    it("applies a pending AI classification and persists workspace changes", async () => {
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "upsert" as const,
            record: { transactionId: "transaction-1" },
        };

        mocks.applyTransactionClassificationPending.mockResolvedValue({
            appliedCount: 1,
            workspaceChanges: [workspaceChange],
        });

        const response = await POST_CLASSIFICATION_PENDING_APPLY(
            new Request(
                "http://localhost/api/transactions/classification/pending/apply",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        fieldSelection: {
                            applySuggestedMemo: true,
                            applySuggestedPayee: false,
                        },
                        transactionId: "transaction-1",
                    }),
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            appliedCount: 1,
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(mocks.applyTransactionClassificationPending).toHaveBeenCalledWith({
            actorUserId: "owner-1",
            fieldSelection: {
                applySuggestedMemo: true,
                applySuggestedPayee: false,
            },
            ledgerId: "ledger-1",
            transactionId: "transaction-1",
        });
    });

    it("rejects pending noSuggestion applies", async () => {
        mocks.applyTransactionClassificationPending.mockRejectedValue(
            new HttpError(
                422,
                "classification_no_suggestion",
                "No-suggestion results cannot be applied.",
            ),
        );

        const response = await POST_CLASSIFICATION_PENDING_APPLY(
            new Request(
                "http://localhost/api/transactions/classification/pending/apply",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        transactionId: "transaction-1",
                    }),
                },
            ),
        );

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "classification_no_suggestion",
                message: "No-suggestion results cannot be applied.",
            },
        });
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("marks pending AI classifications as rejected", async () => {
        const response = await POST_CLASSIFICATION_PENDING_REJECT(
            new Request(
                "http://localhost/api/transactions/classification/pending/reject",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ transactionId: "transaction-1" }),
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            pending: { status: "rejected" },
        });
        expect(mocks.rejectTransactionClassificationPending).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            transactionId: "transaction-1",
        });
    });

    it("lists transactions with query filters", async () => {
        mocks.listTransactions.mockResolvedValue([
            {
                transactionId: "transaction-1",
                occurredAt: "2026-05-22T12:00:00.000Z",
                kind: "standard",
                displayAmountCents: -5_000,
                status: "entered",
            },
        ]);

        const response = await GET(
            new Request(
                "http://localhost/api/transactions?periodId=2026-05&accountId=account-1",
            ),
        );

        expect(response.status).toBe(200);
        expect(mocks.listTransactions).toHaveBeenCalledWith("ledger-1", {
            accountId: "account-1",
            periodId: "2026-05",
        });
    });

    it("creates a transaction", async () => {
        const transaction = {
            transactionId: "transaction-1",
            occurredAt: "2026-05-22T00:00:00.000Z",
            kind: "standard",
            displayAmountCents: -5_000,
            status: "entered",
        };
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "upsert" as const,
            record: transaction,
        };

        mocks.upsertTransactionWithWorkspaceChanges.mockResolvedValue({
            transaction,
            workspaceChanges: [workspaceChange],
        });

        const payload = {
            accountId: "account-1",
            occurredAt: "2026-05-22",
            kind: "standard",
            lines: [
                {
                    amountCents: 5_000,
                    categoryId: "groceries",
                    fromAccountId: "account-1",
                },
            ],
        };

        const response = await POST(
            new Request("http://localhost/api/transactions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            transaction,
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(mocks.upsertTransactionWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            {
                ...payload,
                audit: {
                    actorUserId: "owner-1",
                    source: "manual",
                },
                occurredAt: "2026-05-22T00:00:00.000Z",
                workspaceMutation: {
                    mutationId: expect.any(String),
                    mutationType: "transaction.create",
                },
            },
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("creates a multi-line transaction from a legacy timestamp payload", async () => {
        const transaction = {
            transactionId: "transaction-1",
            occurredAt: "2026-05-22T00:00:00.000Z",
            kind: "standard",
            displayAmountCents: -10_000,
            status: "entered",
        };
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "upsert" as const,
            record: transaction,
        };

        mocks.upsertTransactionWithWorkspaceChanges.mockResolvedValue({
            transaction,
            workspaceChanges: [workspaceChange],
        });

        const payload = {
            accountId: "account-1",
            occurredAt: "2026-05-22T12:00:00.000Z",
            kind: "standard",
            lines: [
                {
                    amountCents: 6_000,
                    categoryId: "groceries",
                    fromAccountId: "account-1",
                    memo: "Food",
                    payee: "Market",
                },
                {
                    amountCents: 4_000,
                    categoryId: "household",
                    fromAccountId: "account-1",
                    memo: "Home",
                    payee: "Market",
                },
            ],
        };

        const response = await POST(
            new Request("http://localhost/api/transactions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            transaction,
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(mocks.upsertTransactionWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            {
                ...payload,
                audit: {
                    actorUserId: "owner-1",
                    source: "manual",
                },
                occurredAt: "2026-05-22T00:00:00.000Z",
                workspaceMutation: {
                    mutationId: expect.any(String),
                    mutationType: "transaction.create",
                },
            },
        );
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("replays a completed transaction create for the same mutation id", async () => {
        const workspaceChanges = [
            {
                batchId: "batch-1",
                changedAt: "2026-06-05T12:00:00.000Z",
                changeId: "change-1",
                entityId: "transaction-1",
                entityType: "transaction" as const,
                expiresAt: 1_781_000_000,
                operation: "upsert" as const,
                record: { transactionId: "transaction-1" },
            },
        ];
        mocks.findWorkspaceMutationBatch.mockResolvedValue({
            changes: workspaceChanges,
            response: { transaction: { transactionId: "transaction-1" } },
        });

        const response = await POST(
            new Request("http://localhost/api/transactions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    accountId: "account-1",
                    kind: "standard",
                    lines: [
                        {
                            amountCents: 5_000,
                            fromAccountId: "account-1",
                        },
                    ],
                    mutationId: "mutation-1",
                    occurredAt: "2026-05-22",
                }),
            }),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            transaction: { transactionId: "transaction-1" },
            ...workspaceSyncContaining(workspaceChanges),
        });
        expect(mocks.upsertTransactionWithWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("updates a transaction", async () => {
        const transaction = {
            transactionId: "transaction-1",
            occurredAt: "2026-05-22T00:00:00.000Z",
            kind: "standard",
            displayAmountCents: 5_000,
            status: "entered",
        };
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "upsert" as const,
            record: transaction,
        };

        mocks.upsertTransactionWithWorkspaceChanges.mockResolvedValue({
            transaction,
            workspaceChanges: [workspaceChange],
        });

        const payload = {
            accountId: "account-1",
            occurredAt: "2026-05-22",
            kind: "standard",
            lines: [
                {
                    amountCents: 5_000,
                    toAccountId: "account-1",
                },
            ],
        };

        const response = await PATCH(
            new Request("http://localhost/api/transactions/transaction-1", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }),
            { params: Promise.resolve({ transactionId: "transaction-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            transaction,
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(mocks.upsertTransactionWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            {
                transactionId: "transaction-1",
                ...payload,
                audit: {
                    actorUserId: "owner-1",
                    source: "manual",
                },
                occurredAt: "2026-05-22T00:00:00.000Z",
                workspaceMutation: {
                    mutationId: expect.any(String),
                    mutationType: "transaction.update:transaction-1",
                },
            },
        );
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("loads a transaction delete preview", async () => {
        mocks.getTransactionDeletionImpact.mockResolvedValue({
            target: {
                targetType: "transaction",
                targetId: "transaction-1",
                displayName: "Grocer",
                sectionId: "transactions",
            },
            dependentCounts: [{ label: "Ledger postings", count: 2 }],
            affectedPeriods: ["2026-05"],
            preservedRecords: [],
            crossAreaEffects: [],
            isPermanent: true,
            permanentWarning: "This deletion is permanent and cannot be undone.",
            previewRevision: "preview-1",
        });

        const response = await GET_TRANSACTION(
            new Request("http://localhost/api/transactions/transaction-1"),
            { params: Promise.resolve({ transactionId: "transaction-1" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.getTransactionDeletionImpact).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
    });

    it("loads a compact Plaid transaction reference", async () => {
        const reference = {
            lastSyncedAt: "2026-05-22T12:00:00.000Z",
            name: "Coffee Shop",
            pending: false,
            plaidAmountCents: 1_234,
            plaidDate: "2026-05-21",
            plaidTransactionSyncId: "sync-1",
            status: "active" as const,
        };
        mocks.getPlaidTransactionReference.mockResolvedValue(reference);

        const response = await GET_PLAID_TRANSACTION_REFERENCE(
            new Request(
                "http://localhost/api/transactions/transaction-1/plaid-reference",
            ),
            { params: Promise.resolve({ transactionId: "transaction-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ reference });
        expect(mocks.getPlaidTransactionReference).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
    });

    it("loads bounded transaction references for cached UI details", async () => {
        const references = [
            {
                accountIds: ["account-1"],
                displayAmountCents: -1_234,
                occurredAt: "2026-05-21T00:00:00.000Z",
                payee: "Coffee Shop",
                transactionId: "transaction-1",
            },
        ];
        mocks.listTransactionReferences.mockResolvedValue(references);

        const response = await POST_TRANSACTION_REFERENCES(
            new Request("http://localhost/api/transactions/references", {
                body: JSON.stringify({
                    transactionIds: ["transaction-1"],
                }),
                headers: { "content-type": "application/json" },
                method: "POST",
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ references });
        expect(mocks.listTransactionReferences).toHaveBeenCalledWith("ledger-1", [
            "transaction-1",
        ]);
    });

    it("loads a bulk transaction delete preview", async () => {
        mocks.getTransactionsDeletionImpact.mockResolvedValue({
            target: {
                targetType: "transaction",
                targetId: "bulk:transaction-1|transaction-2",
                displayName: "2 transactions",
                sectionId: "transactions",
            },
            dependentCounts: [{ label: "Transactions", count: 2 }],
            affectedPeriods: ["2026-05"],
            preservedRecords: [],
            crossAreaEffects: [],
            isPermanent: true,
            permanentWarning: "This deletion is permanent and cannot be undone.",
            previewRevision: "bulk-preview-1",
        });

        const response = await POST_DELETION_IMPACT(
            new Request("http://localhost/api/transactions/deletion-impact", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    transactionIds: ["transaction-1", "transaction-2"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.getTransactionsDeletionImpact).toHaveBeenCalledWith(
            "ledger-1",
            ["transaction-1", "transaction-2"],
        );
    });

    it("deletes a transaction after preview confirmation", async () => {
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "delete" as const,
            record: null,
        };

        mocks.deleteTransactionWithWorkspaceChanges.mockResolvedValue({
            impact: {},
            workspaceChanges: [workspaceChange],
        });

        const response = await DELETE(
            new Request("http://localhost/api/transactions/transaction-1", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ previewRevision: "preview-1" }),
            }),
            { params: Promise.resolve({ transactionId: "transaction-1" }) },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(mocks.deleteTransactionWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
            "preview-1",
            {
                actorUserId: "owner-1",
                source: "manual",
            },
            {
                mutationId: expect.any(String),
                mutationType: "transaction.delete:transaction-1",
            },
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
        expect(response.headers.get("X-Budgeted-Knowledge")).toBeNull();
    });

    it("bulk deletes selected transactions", async () => {
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "delete" as const,
            record: null,
        };

        mocks.deleteTransactionsWithWorkspaceChanges.mockResolvedValue({
            deletedCount: 2,
            workspaceChanges: [workspaceChange],
        });

        const response = await DELETE_TRANSACTIONS(
            new Request("http://localhost/api/transactions", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    previewRevision: "bulk-preview-1",
                    transactionIds: ["transaction-1", "transaction-2"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            deletedCount: 2,
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(mocks.deleteTransactionsWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            ["transaction-1", "transaction-2"],
            "bulk-preview-1",
            {
                actorUserId: "owner-1",
                source: "manual",
            },
            {
                mutationId: expect.any(String),
                mutationType: "transaction.bulkDelete",
            },
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
        expect(mocks.validateDeleteWorkspaceMutation).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            previewRevision: "bulk-preview-1",
            transactionIds: ["transaction-1", "transaction-2"],
            workspaceMutation: {
                mutationId: expect.any(String),
                mutationType: "transaction.bulkDelete",
            },
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
        expect(response.headers.get("X-Budgeted-Knowledge")).toBeNull();
    });

    it("merges transactions with explicit workspace changes", async () => {
        const workspaceChange = {
            entityId: "transaction-1",
            entityType: "transaction" as const,
            operation: "upsert" as const,
            record: {
                transactionId: "transaction-1",
                ledgerId: "ledger-1",
            },
        };

        mocks.mergeTransactionsWithWorkspaceChanges.mockResolvedValue({
            transaction: {
                transactionId: "transaction-1",
                occurredAt: "2026-05-22T00:00:00.000Z",
                kind: "standard",
                displayAmountCents: -5_000,
                status: "entered",
            },
            workspaceChanges: [workspaceChange],
        });

        const response = await POST_MERGE(
            new Request("http://localhost/api/transactions/merge", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    transactionIds: ["transaction-1", "transaction-2"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            ...workspaceSyncContaining([workspaceChange]),
        });
        expect(mocks.mergeTransactionsWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            ["transaction-1", "transaction-2"],
            {
                actorUserId: "owner-1",
                source: "manual",
            },
            {
                mutationId: expect.any(String),
                mutationType: "transaction.merge",
            },
            undefined,
        );
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
        expect(mocks.createWorkspaceChanges).not.toHaveBeenCalled();
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
        expect(response.headers.get("X-Budgeted-Knowledge")).toBeNull();
    });

    it("forwards the expected auto-match type for authoritative validation", async () => {
        mocks.mergeTransactionsWithWorkspaceChanges.mockResolvedValue({
            transaction: {
                transactionId: "bank-payment",
            },
            workspaceChanges: [],
        });

        const response = await POST_MERGE(
            new Request("http://localhost/api/transactions/merge", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    expectedMatchType: "creditCardPayment",
                    transactionIds: ["bank-payment", "card-payment"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.mergeTransactionsWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            ["bank-payment", "card-payment"],
            {
                actorUserId: "owner-1",
                source: "manual",
            },
            {
                mutationId: expect.any(String),
                mutationType: "transaction.merge",
            },
            "creditCardPayment",
        );
    });

    it("categorizes selected transactions with one committed workspace batch", async () => {
        const workspaceChanges = [
            {
                batchId: "batch-1",
                changedAt: "2026-06-05T12:00:00.000Z",
                changeId: "change-1",
                entityId: "transaction-1",
                entityType: "transaction" as const,
                expiresAt: 1_781_000_000,
                operation: "upsert" as const,
                record: { transactionId: "transaction-1" },
            },
        ];
        mocks.categorizeTransactionsWithWorkspaceChanges.mockResolvedValue({
            updatedCount: 1,
            workspaceChanges,
        });

        const response = await POST_CATEGORIZE(
            new Request("http://localhost/api/transactions/categorize", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    categoryId: "groceries",
                    transactionIds: ["transaction-1"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            updatedCount: 1,
            ...workspaceSyncContaining(workspaceChanges),
        });
        expect(
            mocks.categorizeTransactionsWithWorkspaceChanges,
        ).toHaveBeenCalledWith({
            actorUserId: "owner-1",
            categoryId: "groceries",
            ledgerId: "ledger-1",
            transactionIds: ["transaction-1"],
            workspaceMutation: {
                mutationId: expect.any(String),
                mutationType: "transaction.categorize",
            },
        });
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
        expect(mocks.validateCategorizeWorkspaceMutation).toHaveBeenCalledWith({
            categoryId: "groceries",
            ledgerId: "ledger-1",
            transactionIds: ["transaction-1"],
            workspaceMutation: {
                mutationId: expect.any(String),
                mutationType: "transaction.categorize",
            },
        });
    });

    it("returns a normalized error response when transaction creation fails", async () => {
        mocks.upsertTransactionWithWorkspaceChanges.mockRejectedValue(
            new HttpError(
                404,
                "account_missing",
                "One or more transaction postings reference a missing account.",
            ),
        );

        const payload = {
            accountId: "account-1",
            occurredAt: "2026-05-22",
            kind: "standard",
            lines: [
                {
                    amountCents: 5_000,
                    categoryId: "groceries",
                    fromAccountId: "missing-account",
                },
            ],
        };

        const response = await POST(
            new Request("http://localhost/api/transactions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }),
        );

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "account_missing",
                details: undefined,
                message:
                    "One or more transaction postings reference a missing account.",
            },
        });
    });
});
