import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
    WORKSPACE_CACHE_SCHEMA_VERSION,
    type CachedTransactionQueryResult,
    type WorkspaceCacheIdentity,
} from "@/lib/workspace/repository";
import {
    getWorkspaceTransactionQueryKey as getCachedTransactionQueryKey,
    type WorkspaceTransactionQuery as CachedTransactionQuery,
} from "@/lib/workspace/workspace-protocol";
import { useWorkspaceTransactions } from "@/components/workspace/use-workspace-transactions";
import { createOptimisticWorkspaceUpsert } from "@/lib/workspace/optimistic-changes";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

const useWorkspaceStoreMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/workspace/workspace-store-provider", () => ({
    useWorkspaceStore: useWorkspaceStoreMock,
}));

function createSnapshot(
    ledgerId = "ledger-1",
    workspaceRevision = 1,
): WorkspaceSnapshot {
    const changeCursor = `g1:r${workspaceRevision}`;

    return {
        activeLedgerId: ledgerId,
        knowledge: {
            activeLedgerId: ledgerId,
            changeCursor,
            entityCounts: {} as WorkspaceSnapshot["knowledge"]["entityCounts"],
            generatedAt: "2026-07-16T00:00:00.000Z",
            retainedChangesAfter: "2026-06-16T00:00:00.000Z",
            revision: changeCursor,
            workspaceGeneration: 1,
            workspaceRevision,
        },
        transactionHydration: "configuration",
        transactions: [],
    } as unknown as WorkspaceSnapshot;
}

function createTransaction(transactionId: string, ledgerId = "ledger-1") {
    return {
        displayAmountCents: -100,
        enteredAt: "2026-07-16T00:00:00.000Z",
        kind: "standard" as const,
        ledgerId,
        lines: [],
        occurredAt: "2026-07-16T00:00:00.000Z",
        periodId: "2026-07",
        postings: [],
        referenceAccountId: "account-1",
        status: "entered" as const,
        transactionId,
        updatedAt: "2026-07-16T00:00:00.000Z",
    };
}

function createQueryResult(
    query: CachedTransactionQuery,
    transactionId: string,
    ledgerId = "ledger-1",
    workspaceRevision = 1,
    payee?: string,
): CachedTransactionQueryResult {
    const changeCursor = `g1:r${workspaceRevision}`;

    return {
        identity: {
            cacheOwnerId: "owner-1",
            cacheSchemaVersion: WORKSPACE_CACHE_SCHEMA_VERSION,
            changeCursor,
            ledgerId,
            queryKey: getCachedTransactionQueryKey(query),
            workspaceGeneration: 1,
            workspaceRevision,
        },
        knowledge: createSnapshot(ledgerId, workspaceRevision).knowledge,
        plaidTransactionSyncs: [],
        transactions: [
            {
                ...createTransaction(transactionId, ledgerId),
                ...(payee ? { payee } : {}),
            },
        ],
    };
}

function createOptimisticPayeeChange(payee: string) {
    const transactionWithChildren = createTransaction("transaction-1");
    const transaction = {
        displayAmountCents: transactionWithChildren.displayAmountCents,
        enteredAt: transactionWithChildren.enteredAt,
        kind: transactionWithChildren.kind,
        ledgerId: transactionWithChildren.ledgerId,
        occurredAt: transactionWithChildren.occurredAt,
        periodId: transactionWithChildren.periodId,
        referenceAccountId: transactionWithChildren.referenceAccountId,
        status: transactionWithChildren.status,
        transactionId: transactionWithChildren.transactionId,
        updatedAt: transactionWithChildren.updatedAt,
    };

    return createOptimisticWorkspaceUpsert({
        entityId: transaction.transactionId,
        entityType: "transaction",
        record: {
            ...transaction,
            payee,
        },
    });
}

function createTransactionLine(memo: string) {
    return {
        amountCents: 100,
        createdAt: "2026-07-16T00:00:00.000Z",
        fromAccountId: "account-1",
        ledgerId: "ledger-1",
        lineId: "line-1",
        memo,
        sortOrder: 0,
        transactionId: "transaction-1",
        updatedAt: "2026-07-16T00:00:00.000Z",
    };
}

function createOptimisticLineChange(memo: string) {
    const line = createTransactionLine(memo);

    return createOptimisticWorkspaceUpsert({
        entityId: line.lineId,
        entityType: "transactionLine",
        record: line,
    });
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((nextResolve) => {
        resolve = nextResolve;
    });

    return { promise, resolve };
}

describe("useWorkspaceTransactions", () => {
    it("returns scoped Plaid references with cached transactions", async () => {
        const query = { accountIds: ["account-1", "credit-card-1"] };
        const cachedResult = createQueryResult(
            query,
            "transaction-plaid",
        );
        cachedResult.plaidTransactionSyncs = [
            {
                plaidTransactionSyncId: "plaid-sync-1",
                transactionId: "transaction-plaid",
            } as WorkspaceSnapshot["plaidTransactionSyncs"][number],
        ];

        useWorkspaceStoreMock.mockReturnValue({
            getWorkspaceCacheIdentity: (ledgerId: string) => ({
                cacheOwnerId: "owner-1",
                ledgerId,
            }),
            isReady: true,
            readCachedTransactions: vi.fn().mockResolvedValue(cachedResult),
            refreshWorkspaceSnapshot: vi.fn(),
            requestTransactionRepositoryRecovery: vi.fn(),
            snapshot: createSnapshot(),
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: 0,
        });

        const { result } = renderHook(() =>
            useWorkspaceTransactions(query),
        );

        await waitFor(() =>
            expect(result.current.plaidTransactionSyncs).toMatchObject([
                {
                    plaidTransactionSyncId: "plaid-sync-1",
                    transactionId: "transaction-plaid",
                },
            ]),
        );
    });

    it("does not let an older asynchronous query overwrite a newer query", async () => {
        const firstQuery = { accountId: "account-1" };
        const secondQuery = { accountId: "account-2" };
        const firstRead = createDeferred<CachedTransactionQueryResult | null>();
        const secondRead = createDeferred<CachedTransactionQueryResult | null>();
        const readCachedTransactions = vi
            .fn()
            .mockReturnValueOnce(firstRead.promise)
            .mockReturnValueOnce(secondRead.promise);

        useWorkspaceStoreMock.mockReturnValue({
            getWorkspaceCacheIdentity: (ledgerId: string) => ({
                cacheOwnerId: "owner-1",
                ledgerId,
            }),
            isReady: true,
            readCachedTransactions,
            refreshWorkspaceSnapshot: vi.fn(),
            requestTransactionRepositoryRecovery: vi.fn(),
            snapshot: createSnapshot(),
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: 0,
        });

        const { result, rerender } = renderHook(
            ({ query }) => useWorkspaceTransactions(query),
            { initialProps: { query: firstQuery } },
        );

        rerender({ query: secondQuery });

        await act(async () => {
            secondRead.resolve(createQueryResult(secondQuery, "transaction-new"));
        });

        await waitFor(() => {
            expect(result.current.transactions).toMatchObject([
                { transactionId: "transaction-new" },
            ]);
        });

        await act(async () => {
            firstRead.resolve(createQueryResult(firstQuery, "transaction-old"));
        });

        await waitFor(() => {
            expect(result.current.transactions).toMatchObject([
                { transactionId: "transaction-new" },
            ]);
        });
    });

    it("reloads when the active ledger changes even if both ledgers have the same cursor", async () => {
        let snapshot = createSnapshot("ledger-1");
        const readCachedTransactions = vi.fn(
            async ({ identity, query }: {
                identity: WorkspaceCacheIdentity;
                query?: CachedTransactionQuery;
            }) =>
                createQueryResult(
                    query ?? {},
                    identity.ledgerId === "ledger-1"
                        ? "transaction-ledger-1"
                        : "transaction-ledger-2",
                    identity.ledgerId,
                ),
        );

        useWorkspaceStoreMock.mockImplementation(() => ({
            getWorkspaceCacheIdentity: (ledgerId: string) => ({
                cacheOwnerId: "owner-1",
                ledgerId,
            }),
            isReady: true,
            readCachedTransactions,
            refreshWorkspaceSnapshot: vi.fn(),
            requestTransactionRepositoryRecovery: vi.fn(),
            snapshot,
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: 0,
        }));

        const { result, rerender } = renderHook(
            () => useWorkspaceTransactions(),
        );

        await waitFor(() => {
            expect(result.current.transactions).toMatchObject([
                { transactionId: "transaction-ledger-1" },
            ]);
        });

        snapshot = createSnapshot("ledger-2");
        rerender();

        await waitFor(() => {
            expect(result.current.transactions).toMatchObject([
                { transactionId: "transaction-ledger-2", ledgerId: "ledger-2" },
            ]);
        });

        expect(readCachedTransactions).toHaveBeenLastCalledWith(
            expect.objectContaining({
                identity: { cacheOwnerId: "owner-1", ledgerId: "ledger-2" },
            }),
        );
    });

    it("delegates a cache miss to the provider recovery coordinator", async () => {
        const requestTransactionRepositoryRecovery = vi.fn().mockResolvedValue(undefined);

        useWorkspaceStoreMock.mockReturnValue({
            getWorkspaceCacheIdentity: (ledgerId: string) => ({
                cacheOwnerId: "owner-1",
                ledgerId,
            }),
            isReady: true,
            readCachedTransactions: vi.fn().mockResolvedValue(null),
            refreshWorkspaceSnapshot: vi.fn(),
            requestTransactionRepositoryRecovery,
            snapshot: createSnapshot(),
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: 0,
        });

        const { result } = renderHook(() => useWorkspaceTransactions());

        await waitFor(() =>
            expect(requestTransactionRepositoryRecovery).toHaveBeenCalledTimes(1),
        );
        expect(result.current.isLoading).toBe(true);
    });

    it("does not recover when IndexedDB is ahead of the current render", async () => {
        const requestTransactionRepositoryRecovery = vi.fn();
        const readCachedTransactions = vi.fn();
        const result = createQueryResult({}, "transaction-newer");

        result.identity.changeCursor = "g1:r2";
        result.identity.workspaceRevision = 2;
        result.knowledge = {
            ...result.knowledge,
            changeCursor: "g1:r2",
            revision: "g1:r2",
            workspaceRevision: 2,
        };
        readCachedTransactions.mockResolvedValue(result);

        useWorkspaceStoreMock.mockReturnValue({
            getWorkspaceCacheIdentity: (ledgerId: string) => ({
                cacheOwnerId: "owner-1",
                ledgerId,
            }),
            isReady: true,
            readCachedTransactions,
            refreshWorkspaceSnapshot: vi.fn(),
            requestTransactionRepositoryRecovery,
            snapshot: createSnapshot(),
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: 1,
        });

        const rendered = renderHook(() => useWorkspaceTransactions());

        await waitFor(() => expect(readCachedTransactions).toHaveBeenCalled());

        expect(requestTransactionRepositoryRecovery).not.toHaveBeenCalled();
        expect(rendered.result.current.transactions).toEqual([]);
    });

    it("retains the previous query result while a newer revision loads", async () => {
        let snapshot = createSnapshot("ledger-1", 1);
        let repositoryRevision = 1;
        const nextRead = createDeferred<CachedTransactionQueryResult | null>();
        const getWorkspaceCacheIdentity = (ledgerId: string) => ({
            cacheOwnerId: "owner-1",
            ledgerId,
        });
        const refreshWorkspaceSnapshot = vi.fn();
        const requestTransactionRepositoryRecovery = vi.fn();
        const readCachedTransactions = vi.fn(() =>
            snapshot.knowledge.workspaceRevision === 1
                ? Promise.resolve(
                      createQueryResult(
                          {},
                          "transaction-before",
                          "ledger-1",
                          1,
                      ),
                  )
                : nextRead.promise,
        );

        useWorkspaceStoreMock.mockImplementation(() => ({
            getWorkspaceCacheIdentity,
            isReady: true,
            readCachedTransactions,
            refreshWorkspaceSnapshot,
            requestTransactionRepositoryRecovery,
            snapshot,
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: repositoryRevision,
        }));

        const rendered = renderHook(() => useWorkspaceTransactions());

        await waitFor(() =>
            expect(rendered.result.current.transactions).toMatchObject([
                { transactionId: "transaction-before" },
            ]),
        );

        snapshot = createSnapshot("ledger-1", 2);
        repositoryRevision = 2;
        rendered.rerender();

        expect(rendered.result.current.isLoading).toBe(false);
        expect(rendered.result.current.transactions).toMatchObject([
            { transactionId: "transaction-before" },
        ]);

        await act(async () => {
            nextRead.resolve(
                createQueryResult({}, "transaction-after", "ledger-1", 2),
            );
        });

        await waitFor(() =>
            expect(rendered.result.current.transactions).toMatchObject([
                { transactionId: "transaction-after" },
            ]),
        );
    });

    it("projects optimistic transaction changes over the cached transaction result", async () => {
        let optimisticTransactionChanges = [
            createOptimisticPayeeChange("Optimistic payee"),
        ];
        const getWorkspaceCacheIdentity = (ledgerId: string) => ({
            cacheOwnerId: "owner-1",
            ledgerId,
        });
        const requestTransactionRepositoryRecovery = vi.fn();
        const readCachedTransactions = vi.fn().mockResolvedValue(
            createQueryResult(
                {},
                "transaction-1",
                "ledger-1",
                1,
                "Saved payee",
            ),
        );

        useWorkspaceStoreMock.mockImplementation(() => ({
            getWorkspaceCacheIdentity,
            isReady: true,
            optimisticTransactionChanges,
            readCachedTransactions,
            requestTransactionRepositoryRecovery,
            snapshot: createSnapshot(),
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: 1,
        }));

        const rendered = renderHook(() => useWorkspaceTransactions());

        await waitFor(() =>
            expect(rendered.result.current.transactions).toMatchObject([
                {
                    payee: "Optimistic payee",
                    transactionId: "transaction-1",
                },
            ]),
        );

        optimisticTransactionChanges = [];
        rendered.rerender();

        expect(rendered.result.current.transactions).toMatchObject([
            { payee: "Saved payee", transactionId: "transaction-1" },
        ]);
    });

    it("retains the optimistic transaction until the committed cache revision is available", async () => {
        let snapshot = createSnapshot("ledger-1", 1);
        let repositoryRevision = 1;
        let optimisticTransactionChanges = [
            createOptimisticPayeeChange("Optimistic payee"),
        ];
        const getWorkspaceCacheIdentity = (ledgerId: string) => ({
            cacheOwnerId: "owner-1",
            ledgerId,
        });
        const committedRead =
            createDeferred<CachedTransactionQueryResult | null>();
        const requestTransactionRepositoryRecovery = vi.fn();
        const readCachedTransactions = vi.fn(() =>
            snapshot.knowledge.workspaceRevision === 1
                ? Promise.resolve(
                      createQueryResult(
                          {},
                          "transaction-1",
                          "ledger-1",
                          1,
                          "Saved payee",
                      ),
                  )
                : committedRead.promise,
        );

        useWorkspaceStoreMock.mockImplementation(() => ({
            getWorkspaceCacheIdentity,
            isReady: true,
            optimisticTransactionChanges,
            readCachedTransactions,
            requestTransactionRepositoryRecovery,
            snapshot,
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: repositoryRevision,
        }));

        const rendered = renderHook(() => useWorkspaceTransactions());

        await waitFor(() =>
            expect(rendered.result.current.transactions).toMatchObject([
                { payee: "Optimistic payee" },
            ]),
        );

        optimisticTransactionChanges = [];
        snapshot = createSnapshot("ledger-1", 2);
        repositoryRevision = 2;
        rendered.rerender();

        expect(rendered.result.current.transactions).toMatchObject([
            { payee: "Optimistic payee" },
        ]);

        await act(async () => {
            committedRead.resolve(
                createQueryResult(
                    {},
                    "transaction-1",
                    "ledger-1",
                    2,
                    "Server-normalized payee",
                ),
            );
        });

        await waitFor(() =>
            expect(rendered.result.current.transactions).toMatchObject([
                { payee: "Server-normalized payee" },
            ]),
        );
    });

    it("retains a committed overlay while another transaction overlay remains pending", async () => {
        let snapshot = createSnapshot("ledger-1", 1);
        let repositoryRevision = 1;
        const optimisticPayeeChange =
            createOptimisticPayeeChange("Optimistic payee");
        let optimisticTransactionChanges = [
            createOptimisticLineChange("Optimistic line"),
            optimisticPayeeChange,
        ];
        const initialResult = createQueryResult(
            {},
            "transaction-1",
            "ledger-1",
            1,
            "Saved payee",
        );
        initialResult.transactions[0]!.lines = [
            createTransactionLine("Saved line"),
        ];
        const committedResult = createQueryResult(
            {},
            "transaction-1",
            "ledger-1",
            2,
            "Saved payee",
        );
        committedResult.transactions[0]!.lines = [
            createTransactionLine("Server-normalized line"),
        ];
        const committedRead =
            createDeferred<CachedTransactionQueryResult | null>();
        const getWorkspaceCacheIdentity = (ledgerId: string) => ({
            cacheOwnerId: "owner-1",
            ledgerId,
        });
        const readCachedTransactions = vi.fn(() =>
            snapshot.knowledge.workspaceRevision === 1
                ? Promise.resolve(initialResult)
                : committedRead.promise,
        );
        const requestTransactionRepositoryRecovery = vi.fn();

        useWorkspaceStoreMock.mockImplementation(() => ({
            getWorkspaceCacheIdentity,
            isReady: true,
            optimisticTransactionChanges,
            readCachedTransactions,
            requestTransactionRepositoryRecovery,
            snapshot,
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: repositoryRevision,
        }));

        const rendered = renderHook(() => useWorkspaceTransactions());

        await waitFor(() =>
            expect(rendered.result.current.transactions[0]).toMatchObject({
                lines: [{ memo: "Optimistic line" }],
                payee: "Optimistic payee",
            }),
        );

        optimisticTransactionChanges = [optimisticPayeeChange];
        snapshot = createSnapshot("ledger-1", 2);
        repositoryRevision = 2;
        rendered.rerender();

        expect(rendered.result.current.transactions[0]).toMatchObject({
            lines: [{ memo: "Optimistic line" }],
            payee: "Optimistic payee",
        });

        await act(async () => {
            committedRead.resolve(committedResult);
        });

        await waitFor(() =>
            expect(rendered.result.current.transactions[0]).toMatchObject({
                lines: [{ memo: "Server-normalized line" }],
                payee: "Optimistic payee",
            }),
        );
    });

    it("restores the cached transaction immediately when an optimistic mutation fails", async () => {
        let optimisticTransactionChanges = [
            createOptimisticPayeeChange("Optimistic payee"),
        ];
        const getWorkspaceCacheIdentity = (ledgerId: string) => ({
            cacheOwnerId: "owner-1",
            ledgerId,
        });
        const readCachedTransactions = vi.fn().mockResolvedValue(
            createQueryResult(
                {},
                "transaction-1",
                "ledger-1",
                1,
                "Saved payee",
            ),
        );
        const requestTransactionRepositoryRecovery = vi.fn();

        useWorkspaceStoreMock.mockImplementation(() => ({
            getWorkspaceCacheIdentity,
            isReady: true,
            optimisticTransactionChanges,
            readCachedTransactions,
            requestTransactionRepositoryRecovery,
            snapshot: createSnapshot(),
            transactionRepositoryState: "configurationReady",
            transactionRepositoryRevision: 1,
        }));

        const rendered = renderHook(() => useWorkspaceTransactions());

        await waitFor(() =>
            expect(rendered.result.current.transactions).toMatchObject([
                { payee: "Optimistic payee" },
            ]),
        );

        optimisticTransactionChanges = [];
        rendered.rerender();

        expect(rendered.result.current.transactions).toMatchObject([
            { payee: "Saved payee" },
        ]);
    });
});
