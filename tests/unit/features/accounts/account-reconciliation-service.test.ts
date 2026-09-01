import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findWorkspaceMutationOperation: vi.fn(),
    getAccountRecord: vi.fn(),
    getBudgetCategoryRecord: vi.fn(),
    findWorkspaceMutationBatch: vi.fn(),
    listLedgerPostingsForLedgerAccount: vi.fn(),
    listStoredTransactionsByPrimaryKeys: vi.fn(),
    listTransactionChildrenByTransactionId: vi.fn(),
    persistWorkspaceMutationOperation: vi.fn(),
    queryAllPages: vi.fn(),
    updateTransactionsStatusWithWorkspaceChanges: vi.fn(),
    upsertTransactionWithWorkspaceChanges: vi.fn(),
}));

vi.mock("@/features/accounts/server/account-service", () => ({
    getAccountRecord: mocks.getAccountRecord,
}));

vi.mock("@/features/budget/server/category-service", () => ({
    getBudgetCategoryRecord: mocks.getBudgetCategoryRecord,
    isUserVisibleBudgetCategory: (category: { systemCategoryKey?: string }) =>
        category.systemCategoryKey !== "startingBalances",
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    listStoredTransactionsByPrimaryKeys:
        mocks.listStoredTransactionsByPrimaryKeys,
}));

vi.mock("@/features/transactions/server/posting-service", () => ({
    listLedgerPostingsForLedgerAccount:
        mocks.listLedgerPostingsForLedgerAccount,
}));

vi.mock("@/features/transactions/server/transaction-child-service", () => ({
    listTransactionChildrenByTransactionId:
        mocks.listTransactionChildrenByTransactionId,
}));

vi.mock("@/features/transactions/server/transaction-save-service", () => ({
    upsertTransactionWithWorkspaceChanges:
        mocks.upsertTransactionWithWorkspaceChanges,
}));

vi.mock(
    "@/features/transactions/server/transaction-status-mutation-service",
    async () => {
        const actual = await vi.importActual<
            typeof import("@/features/transactions/server/transaction-status-mutation-service")
        >(
            "@/features/transactions/server/transaction-status-mutation-service",
        );

        return {
            ...actual,
            updateTransactionsStatusWithWorkspaceChanges:
                mocks.updateTransactionsStatusWithWorkspaceChanges,
        };
    },
);

vi.mock("@/lib/db/query-all-pages", () => ({
    queryAllPages: mocks.queryAllPages,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            plaidAccountLinks: {
                query: {
                    byAccount: () => ({ query: "plaid-account-links" }),
                },
            },
        },
    }),
}));

vi.mock("@/features/workspace/server/workspace-sync-service", async () => {
    const actual = await vi.importActual<
        typeof import("@/features/workspace/server/workspace-sync-service")
    >("@/features/workspace/server/workspace-sync-service");

    return {
        ...actual,
        findWorkspaceMutationBatch: mocks.findWorkspaceMutationBatch,
        findWorkspaceMutationOperation:
            mocks.findWorkspaceMutationOperation,
        persistWorkspaceMutationOperation:
            mocks.persistWorkspaceMutationOperation,
    };
});

import {
    commitAccountReconciliationWithWorkspaceChanges,
    getAccountReconciliationPreview,
} from "@/features/accounts/server/account-reconciliation-service";

const account = {
    accountId: "account-1",
    accountType: "checking" as const,
    ledgerAccountId: "financial-checking",
    ledgerId: "ledger-1",
    name: "Checking",
    openedOn: "2026-01-01",
    openingBalanceCents: 10_000,
    updatedAt: "2026-07-18T10:00:00.000Z",
};

const transaction = {
    aggregateRevision: "aggregate-1",
    displayAmountCents: 2_000,
    kind: "standard" as const,
    lines: [
        {
            amountCents: 2_000,
            toAccountId: "account-1",
        },
    ],
    occurredAt: "2026-07-10T00:00:00.000Z",
    payee: "Paycheck",
    postings: [
        {
            amountCents: 2_000,
            direction: "debit" as const,
            ledgerAccountId: "financial-checking",
            ledgerAccountKind: "financial" as const,
            occurredAt: "2026-07-10T00:00:00.000Z",
            transactionId: "transaction-1",
        },
        {
            amountCents: 2_000,
            direction: "credit" as const,
            ledgerAccountId: "category-income",
            ledgerAccountKind: "category" as const,
            occurredAt: "2026-07-10T00:00:00.000Z",
            transactionId: "transaction-1",
        },
    ],
    referenceAccountId: "account-1",
    source: "manual" as const,
    status: "cleared" as const,
    transactionId: "transaction-1",
    updatedAt: "2026-07-10T00:00:00.000Z",
};

function plaidLink(currentBalanceCents = 12_000) {
    return {
        accountId: "account-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-07-18T10:15:00.000Z",
        lastSyncStatus: "succeeded" as const,
        plaidAccountId: "plaid-account-1",
        plaidAccountLinkId: "link-1",
        plaidBalanceCurrentCents: currentBalanceCents,
        plaidBalanceLastSyncedAt: "2026-07-18T10:20:00.000Z",
        plaidBalanceSyncStatus: "succeeded" as const,
        plaidItemId: "item-1",
        status: "linked" as const,
        syncStartDate: "2026-01-01",
        updatedAt: "2026-07-18T10:20:00.000Z",
        ledgerId: "ledger-1",
    };
}

function reconciliationTransaction(
    transactionId: string,
    status: "cleared" | "pending" | "reconciled" = "cleared",
) {
    const occurredAt = "2026-07-10T00:00:00.000Z";

    return {
        ...transaction,
        aggregateRevision: `aggregate-${transactionId}`,
        displayAmountCents: 1,
        lines: [{ amountCents: 1, toAccountId: "account-1" }],
        occurredAt,
        postings: [
            {
                amountCents: 1,
                direction: "debit" as const,
                ledgerAccountId: "financial-checking",
                ledgerAccountKind: "financial" as const,
                occurredAt,
                transactionId,
            },
            {
                amountCents: 1,
                direction: "credit" as const,
                ledgerAccountId: "category-income",
                ledgerAccountKind: "category" as const,
                occurredAt,
                transactionId,
            },
        ],
        status,
        transactionId,
        updatedAt: `2026-07-10T00:${transactionId.slice(-2).padStart(2, "0")}:00.000Z`,
    };
}

describe("account reconciliation service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAccountRecord.mockResolvedValue(account);
        mocks.getBudgetCategoryRecord.mockResolvedValue({
            categoryId: "category-1",
            status: "active",
        });
        mocks.findWorkspaceMutationBatch.mockResolvedValue(null);
        mocks.findWorkspaceMutationOperation.mockResolvedValue(null);
        mocks.listLedgerPostingsForLedgerAccount.mockResolvedValue([
            transaction.postings[0],
        ]);
        mocks.listStoredTransactionsByPrimaryKeys.mockResolvedValue({
            transactions: [transaction],
            unprocessedKeys: [],
        });
        mocks.listTransactionChildrenByTransactionId.mockResolvedValue({
            linesByTransactionId: new Map([
                [transaction.transactionId, transaction.lines],
            ]),
            postingsByTransactionId: new Map([
                [transaction.transactionId, transaction.postings],
            ]),
        });
        mocks.persistWorkspaceMutationOperation.mockResolvedValue(undefined);
        mocks.queryAllPages.mockResolvedValue([]);
        mocks.updateTransactionsStatusWithWorkspaceChanges.mockResolvedValue({
            updatedCount: 1,
            workspaceChanges: [],
        });
    });

    it("previews a manual account using its entered current balance", async () => {
        await expect(
            getAccountReconciliationPreview("ledger-1", "account-1", {
                manualBalanceCents: 12_500,
            }),
        ).resolves.toMatchObject({
            accountId: "account-1",
            differenceCents: 500,
            eligibleTransactionCount: 1,
            ledgerBalanceCents: 12_000,
            manualBalanceCents: 12_500,
            mismatchSuggestions: [],
            mode: "manual",
            transactionIds: ["transaction-1"],
            unreconciledTransactionIds: ["transaction-1"],
        });
    });

    it("uses zero and negative manual balances as signed current balances", async () => {
        await expect(
            getAccountReconciliationPreview("ledger-1", "account-1", {
                manualBalanceCents: 0,
            }),
        ).resolves.toMatchObject({
            differenceCents: -12_000,
            manualBalanceCents: 0,
        });

        await expect(
            getAccountReconciliationPreview("ledger-1", "account-1", {
                manualBalanceCents: -500,
            }),
        ).resolves.toMatchObject({
            differenceCents: -12_500,
            manualBalanceCents: -500,
        });
    });

    it("requires successful Plaid transaction and balance syncs on the same UTC day", async () => {
        mocks.queryAllPages.mockResolvedValue([
            {
                ...plaidLink(),
                plaidBalanceLastSyncedAt: "2026-07-17T23:59:00.000Z",
            },
        ]);

        await expect(
            getAccountReconciliationPreview("ledger-1", "account-1"),
        ).rejects.toMatchObject({
            code: "account_reconciliation_sync_dates",
            status: 409,
        });
    });

    it("normalizes Plaid balances and calculates the exact difference", async () => {
        mocks.queryAllPages.mockResolvedValue([plaidLink(12_500)]);

        await expect(
            getAccountReconciliationPreview("ledger-1", "account-1"),
        ).resolves.toMatchObject({
            cutoffDate: "2026-07-18",
            differenceCents: 500,
            institutionBalanceCents: 12_500,
            ledgerBalanceCents: 12_000,
            mode: "plaid",
        });
    });

    it("includes possible mismatch transactions in the Plaid preview", async () => {
        mocks.queryAllPages.mockResolvedValue([plaidLink(10_000)]);

        await expect(
            getAccountReconciliationPreview("ledger-1", "account-1"),
        ).resolves.toMatchObject({
            differenceCents: -2_000,
            mismatchSuggestions: [
                {
                    confidence: "high",
                    reason: "includedActivity",
                    transactions: [
                        {
                            amountCents: 2_000,
                            occurredAt: "2026-07-10",
                            payee: "Paycheck",
                        },
                    ],
                },
            ],
        });
    });

    it("rejects stale reconciliation commits", async () => {
        await expect(
            commitAccountReconciliationWithWorkspaceChanges({
                accountId: "account-1",
                actorUserId: "owner-1",
                commit: { previewRevision: "stale-preview" },
                ledgerId: "ledger-1",
                mutationId: "mutation-1",
            }),
        ).rejects.toMatchObject({
            code: "account_reconciliation_stale",
            status: 409,
        });
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).not.toHaveBeenCalled();
    });

    it("does not write when the indexed parent read is incomplete", async () => {
        mocks.listStoredTransactionsByPrimaryKeys.mockResolvedValue({
            transactions: [],
            unprocessedKeys: [
                {
                    ledgerId: "ledger-1",
                    occurredAt: transaction.occurredAt,
                    transactionId: transaction.transactionId,
                },
            ],
        });

        await expect(
            commitAccountReconciliationWithWorkspaceChanges({
                accountId: "account-1",
                actorUserId: "owner-1",
                commit: { previewRevision: "preview-1" },
                ledgerId: "ledger-1",
                mutationId: "incomplete-read-reconciliation",
            }),
        ).rejects.toMatchObject({
            code: "account_reconciliation_read_incomplete",
            status: 503,
        });
        expect(mocks.persistWorkspaceMutationOperation).not.toHaveBeenCalled();
        expect(mocks.upsertTransactionWithWorkspaceChanges).not.toHaveBeenCalled();
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).not.toHaveBeenCalled();
    });

    it("does not write when an indexed posting has no parent transaction", async () => {
        mocks.listStoredTransactionsByPrimaryKeys.mockResolvedValue({
            transactions: [],
            unprocessedKeys: [],
        });

        await expect(
            commitAccountReconciliationWithWorkspaceChanges({
                accountId: "account-1",
                actorUserId: "owner-1",
                commit: { previewRevision: "preview-1" },
                ledgerId: "ledger-1",
                mutationId: "missing-parent-reconciliation",
            }),
        ).rejects.toMatchObject({
            code: "account_reconciliation_stale",
            status: 409,
        });
        expect(mocks.persistWorkspaceMutationOperation).not.toHaveBeenCalled();
        expect(mocks.upsertTransactionWithWorkspaceChanges).not.toHaveBeenCalled();
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).not.toHaveBeenCalled();
    });

    it("hydrates and locks only unlocked transactions from a large account history", async () => {
        const historicalTransactions = Array.from(
            { length: 1_000 },
            (_, index) =>
                reconciliationTransaction(
                    `historical-${String(index).padStart(4, "0")}`,
                    "reconciled",
                ),
        );
        const unlockedTransactions = Array.from({ length: 5 }, (_, index) =>
            reconciliationTransaction(
                `unlocked-${String(index).padStart(2, "0")}`,
                index % 2 === 0 ? "cleared" : "pending",
            ),
        );
        const allTransactions = [
            ...historicalTransactions,
            ...unlockedTransactions,
        ];
        const transactionsById = new Map(
            allTransactions.map((record) => [record.transactionId, record]),
        );
        mocks.listLedgerPostingsForLedgerAccount.mockResolvedValue(
            allTransactions.map((record) => record.postings[0]),
        );
        mocks.listStoredTransactionsByPrimaryKeys.mockImplementation(
            async (keys: Iterable<{ transactionId: string }>) => ({
                transactions: [...keys].map(
                    (key) => transactionsById.get(key.transactionId)!,
                ),
                unprocessedKeys: [],
            }),
        );
        mocks.listTransactionChildrenByTransactionId.mockImplementation(
            async (_ledgerId: string, transactionIds: string[]) => ({
                linesByTransactionId: new Map(
                    transactionIds.map((transactionId) => [
                        transactionId,
                        transactionsById.get(transactionId)!.lines,
                    ]),
                ),
                postingsByTransactionId: new Map(
                    transactionIds.map((transactionId) => [
                        transactionId,
                        transactionsById.get(transactionId)!.postings,
                    ]),
                ),
            }),
        );
        mocks.updateTransactionsStatusWithWorkspaceChanges.mockResolvedValue({
            updatedCount: 5,
            workspaceChanges: [],
        });
        const preview = await getAccountReconciliationPreview(
            "ledger-1",
            "account-1",
        );
        expect(
            mocks.listTransactionChildrenByTransactionId,
        ).not.toHaveBeenCalled();

        const result = await commitAccountReconciliationWithWorkspaceChanges({
            accountId: "account-1",
            actorUserId: "owner-1",
            commit: { previewRevision: preview.previewRevision },
            ledgerId: "ledger-1",
            mutationId: "large-history-reconciliation",
        });

        expect(mocks.listStoredTransactionsByPrimaryKeys).toHaveBeenCalledTimes(
            3,
        );
        expect(
            [
                ...mocks.listStoredTransactionsByPrimaryKeys.mock.calls[0]![0],
            ],
        ).toHaveLength(1_005);
        expect(
            [
                ...mocks.listStoredTransactionsByPrimaryKeys.mock.calls[1]![0],
            ],
        ).toHaveLength(1_005);
        expect(
            [
                ...mocks.listStoredTransactionsByPrimaryKeys.mock.calls[2]![0],
            ],
        ).toHaveLength(5);
        expect(
            mocks.listTransactionChildrenByTransactionId,
        ).toHaveBeenCalledTimes(1);
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).toHaveBeenCalledTimes(1);
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges.mock.calls[0]![0]
                .transactionIds,
        ).toHaveLength(5);
        expect(result.reconciledCount).toBe(5);
    });

    it("caps mismatch child hydration at the duplicate candidate limit", async () => {
        const transactions = Array.from({ length: 100 }, (_, index) =>
            reconciliationTransaction(
                `candidate-${String(index).padStart(3, "0")}`,
            ),
        );
        const transactionsById = new Map(
            transactions.map((record) => [record.transactionId, record]),
        );
        mocks.queryAllPages.mockResolvedValue([plaidLink(10_600)]);
        mocks.listLedgerPostingsForLedgerAccount.mockResolvedValue(
            transactions.map((record) => record.postings[0]),
        );
        mocks.listStoredTransactionsByPrimaryKeys.mockImplementation(
            async (keys: Iterable<{ transactionId: string }>) => ({
                transactions: [...keys].map(
                    (key) => transactionsById.get(key.transactionId)!,
                ),
                unprocessedKeys: [],
            }),
        );
        mocks.listTransactionChildrenByTransactionId.mockImplementation(
            async (_ledgerId: string, transactionIds: string[]) => ({
                linesByTransactionId: new Map(
                    transactionIds.map((transactionId) => [
                        transactionId,
                        transactionsById.get(transactionId)!.lines,
                    ]),
                ),
                postingsByTransactionId: new Map(
                    transactionIds.map((transactionId) => [
                        transactionId,
                        transactionsById.get(transactionId)!.postings,
                    ]),
                ),
            }),
        );

        await getAccountReconciliationPreview("ledger-1", "account-1");

        expect(mocks.listStoredTransactionsByPrimaryKeys).toHaveBeenCalledTimes(
            1,
        );
        expect(
            mocks.listTransactionChildrenByTransactionId,
        ).toHaveBeenCalledTimes(1);
        expect(
            mocks.listTransactionChildrenByTransactionId.mock.calls[0]![1],
        ).toHaveLength(80);
    });

    it("includes transfer-side activity through the cutoff and excludes future postings", async () => {
        const included = {
            ...reconciliationTransaction("transfer-side"),
            referenceAccountId: "account-2",
        };
        const futureOccurredAt = "2026-07-19T00:00:00.000Z";
        const future = {
            ...reconciliationTransaction("future"),
            occurredAt: futureOccurredAt,
            postings: reconciliationTransaction("future").postings.map(
                (posting) => ({ ...posting, occurredAt: futureOccurredAt }),
            ),
        };
        mocks.queryAllPages.mockResolvedValue([plaidLink(10_001)]);
        mocks.listLedgerPostingsForLedgerAccount.mockResolvedValue([
            future.postings[0],
            included.postings[0],
        ]);
        const transactionsById = new Map([
            [included.transactionId, included],
            [future.transactionId, future],
        ]);
        mocks.listStoredTransactionsByPrimaryKeys.mockImplementation(
            async (keys: Iterable<{ transactionId: string }>) => ({
                transactions: [...keys].map(
                    (key) => transactionsById.get(key.transactionId)!,
                ),
                unprocessedKeys: [],
            }),
        );
        mocks.listTransactionChildrenByTransactionId.mockResolvedValue({
            linesByTransactionId: new Map([
                [included.transactionId, included.lines],
            ]),
            postingsByTransactionId: new Map([
                [included.transactionId, included.postings],
            ]),
        });
        const preview = await getAccountReconciliationPreview(
            "ledger-1",
            "account-1",
        );

        const result = await commitAccountReconciliationWithWorkspaceChanges({
            accountId: "account-1",
            actorUserId: "owner-1",
            commit: { previewRevision: preview.previewRevision },
            ledgerId: "ledger-1",
            mutationId: "cutoff-reconciliation",
        });

        expect(
            [
                ...mocks.listStoredTransactionsByPrimaryKeys.mock.calls[1]![0],
            ].map((key) => key.transactionId),
        ).toEqual(["transfer-side"]);
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ transactionIds: ["transfer-side"] }),
        );
        expect(result.reconciledCount).toBe(1);
    });

    it("resumes after completed chunks without rewriting them", async () => {
        const targets = Array.from({ length: 45 }, (_, index) =>
            reconciliationTransaction(
                `pending-${String(index).padStart(2, "0")}`,
            ),
        );
        const operation = {
            accountId: "account-1",
            cutoffDate: "2026-07-18",
            differenceCents: 0,
            ledgerBalanceCents: 10_045,
            operationVersion: 1,
            previewRevision: "preview-1",
            targets: targets.map((record) => ({
                aggregateRevision: record.aggregateRevision,
                occurredAt: record.occurredAt,
                transactionId: record.transactionId,
                updatedAt: record.updatedAt,
            })),
        };
        mocks.findWorkspaceMutationOperation.mockResolvedValue({
            completedStepCount: 40,
            createdAt: "2026-07-18T10:00:00.000Z",
            expiresAt: 1_800_000_000,
            ledgerId: "ledger-1",
            mutationId: "resumable-reconciliation",
            mutationType: "account.reconcile",
            operation,
            status: "running",
            updatedAt: "2026-07-18T10:01:00.000Z",
        });
        mocks.findWorkspaceMutationBatch.mockResolvedValue({
            changes: [{ entityId: "completed-chunk" }],
        });
        const transactionsById = new Map(
            targets.map((record) => [record.transactionId, record]),
        );
        mocks.listStoredTransactionsByPrimaryKeys.mockImplementation(
            async (keys: Iterable<{ transactionId: string }>) => ({
                transactions: [...keys].map(
                    (key) => transactionsById.get(key.transactionId)!,
                ),
                unprocessedKeys: [],
            }),
        );
        mocks.listTransactionChildrenByTransactionId.mockImplementation(
            async (_ledgerId: string, transactionIds: string[]) => ({
                linesByTransactionId: new Map(
                    transactionIds.map((transactionId) => [
                        transactionId,
                        transactionsById.get(transactionId)!.lines,
                    ]),
                ),
                postingsByTransactionId: new Map(
                    transactionIds.map((transactionId) => [
                        transactionId,
                        transactionsById.get(transactionId)!.postings,
                    ]),
                ),
            }),
        );
        mocks.updateTransactionsStatusWithWorkspaceChanges.mockResolvedValue({
            updatedCount: 5,
            workspaceChanges: [{ entityId: "pending-chunk" }],
        });

        const result = await commitAccountReconciliationWithWorkspaceChanges({
            accountId: "account-1",
            actorUserId: "owner-1",
            commit: { previewRevision: "preview-1" },
            ledgerId: "ledger-1",
            mutationId: "resumable-reconciliation",
        });

        expect(mocks.getAccountRecord).not.toHaveBeenCalled();
        expect(mocks.listStoredTransactionsByPrimaryKeys).toHaveBeenCalledTimes(
            1,
        );
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges.mock.calls[0]![0]
                .transactionIds,
        ).toHaveLength(5);
        expect(result).toMatchObject({
            reconciledCount: 45,
            workspaceChanges: [
                { entityId: "completed-chunk" },
                { entityId: "pending-chunk" },
            ],
        });

        vi.clearAllMocks();
        mocks.findWorkspaceMutationOperation.mockResolvedValue({
            completedStepCount: 40,
            createdAt: "2026-07-18T10:00:00.000Z",
            expiresAt: 1_800_000_000,
            ledgerId: "ledger-1",
            mutationId: "resumable-reconciliation",
            mutationType: "account.reconcile",
            operation,
            status: "running",
            updatedAt: "2026-07-18T10:01:00.000Z",
        });
        mocks.findWorkspaceMutationBatch.mockResolvedValue({
            changes: [{ entityId: "completed-chunk" }],
        });
        mocks.listStoredTransactionsByPrimaryKeys.mockImplementation(
            async (keys: Iterable<{ transactionId: string }>) => ({
                transactions: [...keys].map((key, index) => ({
                    ...transactionsById.get(key.transactionId)!,
                    ...(index === 0
                        ? { updatedAt: "2026-07-18T12:00:00.000Z" }
                        : {}),
                })),
                unprocessedKeys: [],
            }),
        );

        await expect(
            commitAccountReconciliationWithWorkspaceChanges({
                accountId: "account-1",
                actorUserId: "owner-1",
                commit: { previewRevision: "preview-1" },
                ledgerId: "ledger-1",
                mutationId: "resumable-reconciliation",
            }),
        ).rejects.toMatchObject({
            code: "account_reconciliation_stale",
            status: 409,
        });
        expect(mocks.findWorkspaceMutationBatch).toHaveBeenCalledTimes(1);
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).not.toHaveBeenCalled();
    });

    it("replays a completed reconciliation response without reading transactions", async () => {
        const target = reconciliationTransaction("completed-1");
        mocks.findWorkspaceMutationOperation.mockResolvedValue({
            completedStepCount: 1,
            createdAt: "2026-07-18T10:00:00.000Z",
            expiresAt: 1_800_000_000,
            ledgerId: "ledger-1",
            mutationId: "completed-reconciliation",
            mutationType: "account.reconcile",
            operation: {
                accountId: "account-1",
                cutoffDate: "2026-07-18",
                differenceCents: 0,
                ledgerBalanceCents: 10_001,
                operationVersion: 1,
                previewRevision: "preview-1",
                targets: [
                    {
                        aggregateRevision: target.aggregateRevision,
                        occurredAt: target.occurredAt,
                        transactionId: target.transactionId,
                        updatedAt: target.updatedAt,
                    },
                ],
            },
            status: "completed",
            updatedAt: "2026-07-18T10:01:00.000Z",
        });
        mocks.findWorkspaceMutationBatch.mockResolvedValue({
            changes: [{ entityId: "completed-1" }],
        });

        const result = await commitAccountReconciliationWithWorkspaceChanges({
            accountId: "account-1",
            actorUserId: "owner-1",
            commit: { previewRevision: "preview-1" },
            ledgerId: "ledger-1",
            mutationId: "completed-reconciliation",
        });

        expect(mocks.listStoredTransactionsByPrimaryKeys).not.toHaveBeenCalled();
        expect(
            mocks.listTransactionChildrenByTransactionId,
        ).not.toHaveBeenCalled();
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            reconciledCount: 1,
            workspaceChanges: [{ entityId: "completed-1" }],
        });
    });

    it("creates an adjustment transaction and locks it with eligible transactions", async () => {
        mocks.queryAllPages.mockResolvedValue([]);
        const preview = await getAccountReconciliationPreview(
            "ledger-1",
            "account-1",
            { manualBalanceCents: 12_500 },
        );
        const adjustmentTransaction = {
            ...transaction,
            aggregateRevision: "aggregate-adjustment-1",
            displayAmountCents: 500,
            lines: [
                {
                    amountCents: 500,
                    toAccountId: "account-1",
                },
            ],
            kind: "adjustment" as const,
            occurredAt: "2026-07-18",
            payee: "Reconciliation adjustment",
            postings: [],
            transactionId: "adjustment-1",
            updatedAt: "2026-07-18T11:00:00.000Z",
        };
        mocks.upsertTransactionWithWorkspaceChanges.mockResolvedValue({
            transaction: adjustmentTransaction,
            workspaceChanges: [{ entityId: "adjustment-1" }],
        });
        mocks.listStoredTransactionsByPrimaryKeys.mockImplementation(
            async (keys: Iterable<{ transactionId: string }>) => {
                const ids = [...keys].map((key) => key.transactionId);

                return {
                    transactions: ids.map((transactionId) =>
                        transactionId === "adjustment-1"
                            ? adjustmentTransaction
                            : transaction,
                    ),
                    unprocessedKeys: [],
                };
            },
        );
        mocks.listTransactionChildrenByTransactionId.mockResolvedValue({
            linesByTransactionId: new Map([
                [transaction.transactionId, transaction.lines],
                [adjustmentTransaction.transactionId, adjustmentTransaction.lines],
            ]),
            postingsByTransactionId: new Map([
                [transaction.transactionId, transaction.postings],
                [
                    adjustmentTransaction.transactionId,
                    adjustmentTransaction.postings,
                ],
            ]),
        });
        mocks.updateTransactionsStatusWithWorkspaceChanges.mockResolvedValue({
            updatedCount: 2,
            workspaceChanges: [{ entityId: "transaction-1" }],
        });

        const result = await commitAccountReconciliationWithWorkspaceChanges({
            accountId: "account-1",
            actorUserId: "owner-1",
            commit: {
                adjustment: {
                    confirmedDifferenceCents: 500,
                    kind: "adjustment",
                },
                manualBalanceCents: 12_500,
                previewRevision: preview.previewRevision,
            },
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
        });

        expect(mocks.upsertTransactionWithWorkspaceChanges).toHaveBeenCalledWith(
            "ledger-1",
            expect.objectContaining({
                accountId: "account-1",
                kind: "adjustment",
                occurredAt: expect.any(String),
                payee: "Reconciliation adjustment",
                lines: [
                    {
                        amountCents: 500,
                        toAccountId: "account-1",
                    },
                ],
            }),
        );
        expect(mocks.getBudgetCategoryRecord).not.toHaveBeenCalled();
        expect(
            mocks.updateTransactionsStatusWithWorkspaceChanges,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                knownTransactions: [
                    expect.objectContaining({ transactionId: "transaction-1" }),
                    expect.objectContaining({ transactionId: "adjustment-1" }),
                ],
                skipExistingBatchLookup: true,
                status: "reconciled",
                transactionIds: ["transaction-1", "adjustment-1"],
                workspaceMutationOperation: expect.objectContaining({
                    completedStepCount: 2,
                    status: "completed",
                }),
            }),
        );
        expect(mocks.persistWorkspaceMutationOperation).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({
            adjustmentTransactionId: "adjustment-1",
            reconciledCount: 2,
        });
    });

});
