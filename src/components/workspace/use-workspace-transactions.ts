"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import { parseWorkspaceCursor } from "@/lib/workspace/cursor";
import type { OptimisticWorkspaceChange } from "@/lib/workspace/optimistic-changes";
import {
    WORKSPACE_CACHE_SCHEMA_VERSION,
    type CachedTransactionQueryResultIdentity,
} from "@/lib/workspace/repository";
import {
    applyWorkspaceChanges,
    createEmptyWorkspaceSnapshotRecords,
} from "@/lib/workspace/snapshot-utils";
import {
    getWorkspaceTransactionQueryKey,
    isTransactionFamilyFullyHydrated,
    transactionMatchesWorkspaceQuery,
    type WorkspaceTransactionQuery as CachedTransactionQuery,
} from "@/lib/workspace/workspace-protocol";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

type TransactionQueryState = {
    identity: CachedTransactionQueryResultIdentity;
    plaidTransactionSyncs: WorkspaceSnapshot["plaidTransactionSyncs"];
    transactions: WorkspaceSnapshot["transactions"];
};

type OptimisticTransactionProjection = TransactionQueryState & {
    changes: OptimisticWorkspaceChange[];
};

const EMPTY_OPTIMISTIC_TRANSACTION_CHANGES: OptimisticWorkspaceChange[] = [];

export function createBudgetContinuityTransactionQuery(periodThrough: string) {
    return { periodThrough } satisfies CachedTransactionQuery;
}

export function useWorkspaceTransactions(query: CachedTransactionQuery = {}) {
    const {
        getWorkspaceCacheIdentity,
        isReady,
        optimisticTransactionChanges = EMPTY_OPTIMISTIC_TRANSACTION_CHANGES,
        readCachedTransactions,
        requestTransactionRepositoryRecovery,
        snapshot,
        transactionRepositoryState,
        transactionRepositoryRevision,
    } = useWorkspaceStore();
    const queryKey = useMemo(
        () => getWorkspaceTransactionQueryKey(query),
        [query],
    );
    const stableQuery = useMemo(
        () => JSON.parse(queryKey) as CachedTransactionQuery,
        [queryKey],
    );
    const [state, setState] = useState<TransactionQueryState | null>(null);
    const requestTokenRef = useRef(0);
    const fullyHydrated = isTransactionFamilyFullyHydrated(snapshot);
    const queryIdentity = useMemo(() => {
        const cacheIdentity = getWorkspaceCacheIdentity(snapshot.activeLedgerId);

        return cacheIdentity
            ? {
                  ...cacheIdentity,
                  cacheSchemaVersion: WORKSPACE_CACHE_SCHEMA_VERSION,
                  changeCursor: snapshot.knowledge.changeCursor,
                  queryKey,
                  workspaceGeneration: snapshot.knowledge.workspaceGeneration ?? 1,
                  workspaceRevision: snapshot.knowledge.workspaceRevision,
              }
            : null;
    }, [
        getWorkspaceCacheIdentity,
        queryKey,
        snapshot.activeLedgerId,
        snapshot.knowledge.changeCursor,
        snapshot.knowledge.workspaceGeneration,
        snapshot.knowledge.workspaceRevision,
    ]);

    useEffect(() => {
        const requestToken = ++requestTokenRef.current;

        if (!isReady || fullyHydrated || !queryIdentity) {
            return;
        }

        void (async () => {
            try {
                const result = await readCachedTransactions({
                    identity: {
                        cacheOwnerId: queryIdentity.cacheOwnerId,
                        ledgerId: queryIdentity.ledgerId,
                    },
                    query: stableQuery,
                });

                if (requestToken !== requestTokenRef.current) {
                    return;
                }

                if (!result) {
                    void requestTransactionRepositoryRecovery();
                    return;
                }

                if (!areQueryIdentitiesEqual(result.identity, queryIdentity)) {
                    if (
                        isQueryResultAheadOfRender(
                            result.identity,
                            queryIdentity,
                        )
                    ) {
                        return;
                    }

                    void requestTransactionRepositoryRecovery();
                    return;
                }

                setState({
                    identity: result.identity,
                    plaidTransactionSyncs: result.plaidTransactionSyncs,
                    transactions: result.transactions,
                });
            } catch {
                if (requestToken !== requestTokenRef.current) {
                    return;
                }

                void requestTransactionRepositoryRecovery();
            }
        })();
    }, [
        fullyHydrated,
        isReady,
        queryIdentity,
        readCachedTransactions,
        requestTransactionRepositoryRecovery,
        stableQuery,
        transactionRepositoryState,
        transactionRepositoryRevision,
    ]);

    const currentState =
        queryIdentity &&
        state &&
        areQueryIdentitiesEqual(state.identity, queryIdentity)
            ? state
            : null;
    const retainedState =
        queryIdentity &&
        state &&
        isQueryResultBehindRender(state.identity, queryIdentity)
            ? state
            : null;
    const displayState =
        transactionRepositoryState === "recovering"
            ? null
            : (currentState ?? retainedState);
    const [lastOptimisticProjection, setLastOptimisticProjection] =
        useState<OptimisticTransactionProjection | null>(null);
    const optimisticProjection = useMemo(
        () => {
            if (
                fullyHydrated ||
                !displayState ||
                optimisticTransactionChanges.length === 0
            ) {
                return null;
            }

            const canContinueOptimisticHandoff =
                !currentState &&
                retainedState &&
                lastOptimisticProjection &&
                areQueryIdentitiesEqual(
                    lastOptimisticProjection.identity,
                    retainedState.identity,
                );

            if (
                canContinueOptimisticHandoff &&
                lastOptimisticProjection.changes ===
                    optimisticTransactionChanges
            ) {
                return lastOptimisticProjection;
            }

            const baseTransactions = canContinueOptimisticHandoff
                ? lastOptimisticProjection.transactions
                : displayState.transactions;
            const basePlaidTransactionSyncs = canContinueOptimisticHandoff
                ? lastOptimisticProjection.plaidTransactionSyncs
                : displayState.plaidTransactionSyncs;
            const projection = projectOptimisticTransactionState({
                changes: optimisticTransactionChanges,
                plaidTransactionSyncs: basePlaidTransactionSyncs,
                query: stableQuery,
                snapshot,
                transactions: baseTransactions,
            });

            return {
                changes: optimisticTransactionChanges,
                identity: displayState.identity,
                ...projection,
            };
        },
        [
            currentState,
            displayState,
            fullyHydrated,
            lastOptimisticProjection,
            optimisticTransactionChanges,
            retainedState,
            snapshot,
            stableQuery,
        ],
    );

    if (
        optimisticProjection &&
        (optimisticProjection.changes !== lastOptimisticProjection?.changes ||
            !lastOptimisticProjection ||
            !areQueryIdentitiesEqual(
                optimisticProjection.identity,
                lastOptimisticProjection.identity,
            ))
    ) {
        setLastOptimisticProjection(optimisticProjection);
    } else if (
        !optimisticProjection &&
        lastOptimisticProjection &&
        (currentState ||
            !retainedState ||
            !areQueryIdentitiesEqual(
                lastOptimisticProjection.identity,
                retainedState.identity,
            ))
    ) {
        setLastOptimisticProjection(null);
    }

    const retainedOptimisticProjection =
        !optimisticProjection &&
        retainedState &&
        lastOptimisticProjection &&
        areQueryIdentitiesEqual(
            lastOptimisticProjection.identity,
            retainedState.identity,
        )
            ? lastOptimisticProjection
            : null;
    const projectedDisplayState =
        optimisticProjection ?? retainedOptimisticProjection ?? displayState;

    let transactions: WorkspaceSnapshot["transactions"] = [];

    if (fullyHydrated) {
        transactions = snapshot.transactions.filter((transaction) =>
            transactionMatchesWorkspaceQuery(transaction, stableQuery),
        );
    } else if (optimisticProjection) {
        transactions = optimisticProjection.transactions;
    } else if (retainedOptimisticProjection) {
        transactions = retainedOptimisticProjection.transactions;
    } else if (displayState) {
        transactions = displayState.transactions;
    }

    return {
        isLoading:
            isReady &&
            !fullyHydrated &&
            transactionRepositoryState !== "unavailable" &&
            !displayState,
        plaidTransactionSyncs: fullyHydrated
            ? (snapshot.plaidTransactionSyncs ?? [])
            : (projectedDisplayState?.plaidTransactionSyncs ?? []),
        transactions,
    };
}

function projectOptimisticTransactionState(input: {
    changes: OptimisticWorkspaceChange[];
    plaidTransactionSyncs: WorkspaceSnapshot["plaidTransactionSyncs"];
    query: CachedTransactionQuery;
    snapshot: WorkspaceSnapshot;
    transactions: WorkspaceSnapshot["transactions"];
}) {
    const transactionSnapshot: WorkspaceSnapshot = {
        ...createEmptyWorkspaceSnapshotRecords(),
        ...input.snapshot,
        ledgerPostings: input.transactions.flatMap(
            (transaction) => transaction.postings,
        ),
        plaidTransactionSyncs: input.plaidTransactionSyncs,
        transactionHydration: "full",
        transactionLines: input.transactions.flatMap(
            (transaction) => transaction.lines,
        ),
        transactions: input.transactions,
    };

    const projected = applyWorkspaceChanges(transactionSnapshot, input.changes, {
        deriveAccountBalances: false,
        validateTransitions: false,
    });
    const transactions = projected.transactions.filter((transaction) =>
        transactionMatchesWorkspaceQuery(transaction, input.query),
    );
    const transactionIds = new Set(
        transactions.map((transaction) => transaction.transactionId),
    );

    return {
        plaidTransactionSyncs: projected.plaidTransactionSyncs.filter((record) =>
            transactionIds.has(record.transactionId),
        ),
        transactions,
    };
}

function isQueryResultBehindRender(
    result: CachedTransactionQueryResultIdentity,
    render: CachedTransactionQueryResultIdentity,
) {
    return (
        haveSameQueryScope(result, render) &&
        compareQueryRevisions(result, render) < 0
    );
}

function isQueryResultAheadOfRender(
    result: CachedTransactionQueryResultIdentity,
    render: CachedTransactionQueryResultIdentity,
) {
    return (
        haveSameQueryScope(result, render) &&
        compareQueryRevisions(result, render) > 0
    );
}

function haveSameQueryScope(
    left: CachedTransactionQueryResultIdentity,
    right: CachedTransactionQueryResultIdentity,
) {
    if (
        left.cacheOwnerId !== right.cacheOwnerId ||
        left.ledgerId !== right.ledgerId ||
        left.cacheSchemaVersion !== right.cacheSchemaVersion ||
        left.queryKey !== right.queryKey ||
        left.workspaceGeneration !== right.workspaceGeneration
    ) {
        return false;
    }

    return true;
}

function compareQueryRevisions(
    left: CachedTransactionQueryResultIdentity,
    right: CachedTransactionQueryResultIdentity,
) {
    if (
        left.workspaceRevision !== undefined &&
        right.workspaceRevision !== undefined
    ) {
        return left.workspaceRevision - right.workspaceRevision;
    }

    const leftCursor = parseWorkspaceCursor(left.changeCursor);
    const rightCursor = parseWorkspaceCursor(right.changeCursor);

    if (
        leftCursor &&
        rightCursor &&
        leftCursor.generation === rightCursor.generation
    ) {
        return leftCursor.revision - rightCursor.revision;
    }

    return left.changeCursor.localeCompare(right.changeCursor);
}

function areQueryIdentitiesEqual(
    left: CachedTransactionQueryResultIdentity,
    right: CachedTransactionQueryResultIdentity,
) {
    return (
        left.cacheOwnerId === right.cacheOwnerId &&
        left.ledgerId === right.ledgerId &&
        left.cacheSchemaVersion === right.cacheSchemaVersion &&
        left.changeCursor === right.changeCursor &&
        left.queryKey === right.queryKey &&
        left.workspaceGeneration === right.workspaceGeneration &&
        left.workspaceRevision === right.workspaceRevision
    );
}
