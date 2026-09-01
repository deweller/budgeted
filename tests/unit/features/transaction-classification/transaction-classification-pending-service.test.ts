// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
    accountsGet: vi.fn(),
    accountsGetGo: vi.fn(),
    applyTransactionClassificationSuggestionToTransaction: vi.fn(),
    applyTransactionClassificationSuggestions: vi.fn(),
    generateTransactionClassificationSuggestionsForPreloadedRun: vi.fn(),
    getTransactionWithPostings: vi.fn(),
    isTransactionClassificationEligible: vi.fn(),
    listReferenceAccountTransactionsWithPostings: vi.fn(),
    loadTransactionClassificationPreloadedRunContext: vi.fn(),
    pendingDelete: vi.fn(),
    pendingDeleteGo: vi.fn(),
    pendingGet: vi.fn(),
    pendingPut: vi.fn(),
    pendingPutGo: vi.fn(),
    pendingQueryByAccount: vi.fn(),
    pendingQueryByAccountGo: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: {
                get: mocks.accountsGet,
            },
            transactionClassificationPending: {
                delete: mocks.pendingDelete,
                get: mocks.pendingGet,
                put: mocks.pendingPut,
                query: {
                    byAccount: mocks.pendingQueryByAccount,
                },
            },
        },
    }),
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    getTransactionWithPostings: mocks.getTransactionWithPostings,
    listReferenceAccountTransactionsWithPostings:
        mocks.listReferenceAccountTransactionsWithPostings,
}));

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-service",
    () => ({
        applyTransactionClassificationSuggestionToTransaction:
            mocks.applyTransactionClassificationSuggestionToTransaction,
        applyTransactionClassificationSuggestions:
            mocks.applyTransactionClassificationSuggestions,
        generateTransactionClassificationSuggestionsForPreloadedRun:
            mocks.generateTransactionClassificationSuggestionsForPreloadedRun,
        isTransactionClassificationEligible:
            mocks.isTransactionClassificationEligible,
        loadTransactionClassificationPreloadedRunContext:
            mocks.loadTransactionClassificationPreloadedRunContext,
    }),
);

import { transactionClassificationPromptVersion } from "@/features/transaction-classification/models/transaction-classification";
import {
    applyTransactionClassificationPending,
    classifyAccountNow,
    getTransactionClassificationPendingExpiresAt,
    listTransactionClassificationPending,
    listTransactionClassificationPendingForAccount,
    rejectTransactionClassificationPending,
} from "@/features/transaction-classification/server/transaction-classification-pending-service";

const baseTransaction = {
    referenceAccountId: "checking",
    transactionId: "transaction-1",
    updatedAt: "2026-07-01T00:00:00.000Z",
};

const categorySuggestion = {
    confidence: 0.92,
    lineAssignments: [
        {
            categoryId: "groceries",
            lineId: "line-1",
        },
    ],
    reason: "Matched history.",
    targetLineIds: ["line-1"],
    transactionId: "transaction-1",
    transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
    type: "category" as const,
};

const noSuggestion = {
    confidence: 0,
    lineAssignments: [],
    reason: "No compact category candidates were found.",
    targetLineIds: ["line-1"],
    transactionId: "transaction-1",
    transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
    type: "noSuggestion" as const,
};

function makePendingRecord(overrides = {}) {
    return {
        accountId: "checking",
        createdAt: "2026-07-07T12:00:00.000Z",
        expiresAt: 1_791_372_000,
        ledgerId: "ledger-1",
        modelId: "gpt-5.6-luna",
        promptVersion: transactionClassificationPromptVersion,
        source: "manual" as const,
        suggestionJson: JSON.stringify(categorySuggestion),
        suggestionType: "category" as const,
        transactionId: "transaction-1",
        transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-07T12:00:00.000Z",
        ...overrides,
    };
}

describe("transaction classification pending service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));
        mocks.accountsGet.mockReturnValue({ go: mocks.accountsGetGo });
        mocks.accountsGetGo.mockResolvedValue({
            data: { accountId: "checking" },
        });
        mocks.pendingDelete.mockReturnValue({ go: mocks.pendingDeleteGo });
        mocks.pendingDeleteGo.mockResolvedValue({});
        mocks.pendingGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: null }),
        });
        mocks.pendingPut.mockReturnValue({ go: mocks.pendingPutGo });
        mocks.pendingPutGo.mockResolvedValue({});
        mocks.pendingQueryByAccount.mockReturnValue({
            go: mocks.pendingQueryByAccountGo,
        });
        mocks.pendingQueryByAccountGo.mockResolvedValue({ data: [] });
        mocks.listReferenceAccountTransactionsWithPostings.mockResolvedValue([
            baseTransaction,
        ]);
        mocks.getTransactionWithPostings.mockResolvedValue(baseTransaction);
        mocks.isTransactionClassificationEligible.mockReturnValue(true);
        mocks.loadTransactionClassificationPreloadedRunContext.mockResolvedValue({
            contextId: "preloaded-context",
        });
        mocks.generateTransactionClassificationSuggestionsForPreloadedRun.mockResolvedValue({
            eligibleCount: 1,
            modelId: "gpt-5.6-luna",
            promptVersion: transactionClassificationPromptVersion,
            suggestions: [noSuggestion],
        });
        mocks.applyTransactionClassificationSuggestions.mockResolvedValue({
            appliedCount: 1,
            workspaceChanges: [{ entityId: "transaction-1" }],
        });
        mocks.applyTransactionClassificationSuggestionToTransaction.mockResolvedValue(
            [{ entityId: "transaction-1" }],
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("computes a ninety day ttl", () => {
        expect(
            getTransactionClassificationPendingExpiresAt(
                new Date("2026-07-07T12:00:00.000Z"),
            ),
        ).toBe(
            Math.floor(
                (new Date("2026-07-07T12:00:00.000Z").getTime() +
                    90 * 24 * 60 * 60 * 1000) /
                    1000,
            ),
        );
    });

    it("saves noSuggestion as a pending classification", async () => {
        await expect(
            classifyAccountNow({
                accountId: "checking",
                ledgerId: "ledger-1",
            }),
        ).resolves.toMatchObject({
            noSuggestionCount: 1,
            savedCount: 1,
        });

        expect(mocks.pendingPut).toHaveBeenCalledWith(
            expect.objectContaining({
                accountId: "checking",
                expiresAt: getTransactionClassificationPendingExpiresAt(),
                suggestionJson: JSON.stringify(noSuggestion),
                suggestionType: "noSuggestion",
                transactionId: "transaction-1",
            }),
        );
        expect(
            mocks.listReferenceAccountTransactionsWithPostings,
        ).toHaveBeenCalledWith("ledger-1", "checking");
        expect(mocks.pendingQueryByAccount).toHaveBeenCalledWith({
            accountId: "checking",
            ledgerId: "ledger-1",
        });
        expect(
            mocks.loadTransactionClassificationPreloadedRunContext,
        ).toHaveBeenCalledWith("ledger-1");
        expect(
            mocks.generateTransactionClassificationSuggestionsForPreloadedRun,
        ).toHaveBeenCalledWith("ledger-1", {
            context: { contextId: "preloaded-context" },
            transactionIds: ["transaction-1"],
            transactions: [baseTransaction],
        });
    });

    it("skips transactions with a fresh pending result", async () => {
        mocks.pendingQueryByAccountGo.mockResolvedValue({
            data: [
                makePendingRecord({
                    suggestionJson: JSON.stringify(noSuggestion),
                    suggestionType: "noSuggestion",
                }),
            ],
        });

        await expect(
            classifyAccountNow({
                accountId: "checking",
                ledgerId: "ledger-1",
            }),
        ).resolves.toMatchObject({
            savedCount: 0,
            skippedCount: 1,
        });

        expect(
            mocks.generateTransactionClassificationSuggestionsForPreloadedRun,
        ).not.toHaveBeenCalled();
        expect(
            mocks.loadTransactionClassificationPreloadedRunContext,
        ).not.toHaveBeenCalled();
    });

    it("reclassifies transactions with a previous prompt version", async () => {
        mocks.pendingQueryByAccountGo.mockResolvedValue({
            data: [
                makePendingRecord({
                    promptVersion: "2026-07-07.v1",
                    suggestionJson: JSON.stringify(noSuggestion),
                    suggestionType: "noSuggestion",
                }),
            ],
        });

        await expect(
            classifyAccountNow({
                accountId: "checking",
                ledgerId: "ledger-1",
            }),
        ).resolves.toMatchObject({
            savedCount: 1,
            skippedCount: 0,
        });

        expect(
            mocks.generateTransactionClassificationSuggestionsForPreloadedRun,
        ).toHaveBeenCalled();
    });

    it("uses the optimized preloaded path for background classifications", async () => {
        await expect(
            classifyAccountNow({
                accountId: "checking",
                ledgerId: "ledger-1",
                source: "background",
            }),
        ).resolves.toMatchObject({
            savedCount: 1,
        });

        expect(
            mocks.generateTransactionClassificationSuggestionsForPreloadedRun,
        ).toHaveBeenCalledWith("ledger-1", {
            context: { contextId: "preloaded-context" },
            transactionIds: ["transaction-1"],
            transactions: [baseTransaction],
        });
        expect(mocks.pendingPut).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "background",
                transactionId: "transaction-1",
            }),
        );
    });

    it("lists pending classifications without loading transactions for freshness", async () => {
        mocks.pendingGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: makePendingRecord({
                    transactionUpdatedAt: "2026-06-01T00:00:00.000Z",
                }),
            }),
        });

        await expect(
            listTransactionClassificationPending("ledger-1", [
                "transaction-1",
            ]),
        ).resolves.toMatchObject({
            pending: [
                {
                    transactionId: "transaction-1",
                    transactionUpdatedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
        });
        expect(
            mocks.listReferenceAccountTransactionsWithPostings,
        ).not.toHaveBeenCalled();
        expect(mocks.isTransactionClassificationEligible).not.toHaveBeenCalled();
    });

    it("lists non-expired pending classifications for an account", async () => {
        mocks.pendingQueryByAccountGo.mockResolvedValue({
            data: [
                makePendingRecord(),
                makePendingRecord({
                    expiresAt: 1,
                    transactionId: "expired-transaction",
                }),
                makePendingRecord({
                    promptVersion: "2026-07-07.v1",
                    transactionId: "old-prompt-transaction",
                }),
            ],
        });

        await expect(
            listTransactionClassificationPendingForAccount(
                "ledger-1",
                "checking",
            ),
        ).resolves.toMatchObject({
            pending: [
                {
                    transactionId: "transaction-1",
                },
            ],
        });
        expect(mocks.pendingQueryByAccount).toHaveBeenCalledWith({
            accountId: "checking",
            ledgerId: "ledger-1",
        });
        expect(
            mocks.listReferenceAccountTransactionsWithPostings,
        ).not.toHaveBeenCalled();
    });

    it("rejects applying noSuggestion pending results", async () => {
        mocks.pendingGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: makePendingRecord({
                    suggestionJson: JSON.stringify(noSuggestion),
                    suggestionType: "noSuggestion",
                }),
            }),
        });

        await expect(
            applyTransactionClassificationPending({
                actorUserId: "owner",
                ledgerId: "ledger-1",
                transactionId: "transaction-1",
            }),
        ).rejects.toMatchObject(
            new HttpError(
                422,
                "classification_no_suggestion",
                "No-suggestion results cannot be applied.",
            ),
        );
        expect(
            mocks.applyTransactionClassificationSuggestionToTransaction,
        ).not.toHaveBeenCalled();
        expect(mocks.applyTransactionClassificationSuggestions).not.toHaveBeenCalled();
        expect(
            mocks.listReferenceAccountTransactionsWithPostings,
        ).not.toHaveBeenCalled();
    });

    it("applies pending classifications without using the batch classification apply path", async () => {
        mocks.pendingGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({
                data: makePendingRecord(),
            }),
        });

        await expect(
            applyTransactionClassificationPending({
                actorUserId: "owner",
                fieldSelection: {
                    applySuggestedMemo: true,
                    applySuggestedPayee: false,
                },
                ledgerId: "ledger-1",
                transactionId: "transaction-1",
            }),
        ).resolves.toEqual({
            appliedCount: 1,
            workspaceChanges: [{ entityId: "transaction-1" }],
        });

        expect(mocks.getTransactionWithPostings).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
        expect(
            mocks.applyTransactionClassificationSuggestionToTransaction,
        ).toHaveBeenCalledWith({
            actorUserId: "owner",
            fieldSelection: {
                applySuggestedMemo: true,
                applySuggestedPayee: false,
                transactionId: "transaction-1",
            },
            ledgerId: "ledger-1",
            modelId: "gpt-5.6-luna",
            suggestion: categorySuggestion,
            transaction: baseTransaction,
        });
        expect(mocks.pendingDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            transactionId: "transaction-1",
        });
        expect(
            mocks.listReferenceAccountTransactionsWithPostings,
        ).not.toHaveBeenCalled();
        expect(mocks.applyTransactionClassificationSuggestions).not.toHaveBeenCalled();
    });

    it("retains the original suggestion as a rejected classification", async () => {
        mocks.pendingGet.mockReturnValue({
            go: vi.fn().mockResolvedValue({ data: makePendingRecord() }),
        });

        await expect(
            rejectTransactionClassificationPending({
                ledgerId: "ledger-1",
                transactionId: "transaction-1",
            }),
        ).resolves.toMatchObject({
            pending: {
                rejectedAt: "2026-07-07T12:00:00.000Z",
                status: "rejected",
                suggestion: categorySuggestion,
                transactionId: "transaction-1",
            },
        });

        expect(mocks.pendingPut).toHaveBeenCalledWith(
            expect.objectContaining({
                rejectedAt: "2026-07-07T12:00:00.000Z",
                status: "rejected",
                suggestionJson: JSON.stringify(categorySuggestion),
            }),
        );
        expect(mocks.pendingDelete).not.toHaveBeenCalled();
    });
});
