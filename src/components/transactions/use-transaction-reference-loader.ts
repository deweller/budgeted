"use client";

import { useCallback } from "react";

import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";
import {
    toTransactionReference,
    type TransactionReference,
} from "@/features/transactions/models/transaction-reference";
import { isCurrentCachedTransactionQueryResult } from "@/lib/workspace/cached-transaction-query-result";

const serverReferenceBatchSize = 100;

function chunkTransactionIds(transactionIds: string[]) {
    return Array.from(
        { length: Math.ceil(transactionIds.length / serverReferenceBatchSize) },
        (_, index) =>
            transactionIds.slice(
                index * serverReferenceBatchSize,
                (index + 1) * serverReferenceBatchSize,
            ),
    );
}

export function useTransactionReferenceLoader() {
    const {
        getWorkspaceCacheIdentity,
        readCachedTransactions,
        snapshot,
    } = useWorkspaceStore();

    const loadTransactionReferences = useCallback(
        async (transactionIds: readonly string[]) => {
            const ids = [...new Set(transactionIds.filter(Boolean))];
            const requestedIds = new Set(ids);
            const referencesById = new Map<string, TransactionReference>();

            for (const transaction of snapshot.transactions) {
                if (requestedIds.has(transaction.transactionId)) {
                    referencesById.set(
                        transaction.transactionId,
                        toTransactionReference(transaction),
                    );
                }
            }

            const identity = getWorkspaceCacheIdentity(snapshot.activeLedgerId);
            const missingFromSnapshot = ids.filter(
                (transactionId) => !referencesById.has(transactionId),
            );

            if (identity && missingFromSnapshot.length > 0) {
                const cachedResults = await Promise.all(
                    missingFromSnapshot.map(async (transactionId) => {
                        const query = { transactionId };
                        const result = await readCachedTransactions({
                            identity,
                            query,
                        });

                        return result &&
                            isCurrentCachedTransactionQueryResult({
                                identity,
                                knowledge: snapshot.knowledge,
                                query,
                                result,
                            })
                            ? result
                            : null;
                    }),
                );

                for (const result of cachedResults) {
                    const transaction = result?.transactions[0];

                    if (transaction) {
                        referencesById.set(
                            transaction.transactionId,
                            toTransactionReference(transaction),
                        );
                    }
                }
            }

            const missingFromCache = ids.filter(
                (transactionId) => !referencesById.has(transactionId),
            );

            await Promise.all(
                chunkTransactionIds(missingFromCache).map(async (transactionIds) => {
                    const requestedBatchIds = new Set(transactionIds);

                    try {
                        const response = await fetch(
                            "/api/transactions/references",
                            {
                                body: JSON.stringify({ transactionIds }),
                                headers: { "content-type": "application/json" },
                                method: "POST",
                            },
                        );

                        if (!response.ok) {
                            return;
                        }

                        const payload = (await response.json()) as {
                            references?: TransactionReference[];
                        };

                        for (const reference of payload.references ?? []) {
                            if (requestedBatchIds.has(reference.transactionId)) {
                                referencesById.set(
                                    reference.transactionId,
                                    reference,
                                );
                            }
                        }
                    } catch {
                        // Callers retain their safe missing-reference UI or
                        // all-accounts navigation fallback.
                    }
                }),
            );

            return referencesById;
        },
        [
            getWorkspaceCacheIdentity,
            readCachedTransactions,
            snapshot.activeLedgerId,
            snapshot.knowledge,
            snapshot.transactions,
        ],
    );

    const loadTransactionReference = useCallback(
        async (transactionId: string) =>
            (await loadTransactionReferences([transactionId])).get(
                transactionId,
            ) ?? null,
        [loadTransactionReferences],
    );

    return { loadTransactionReference, loadTransactionReferences };
}
