"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";

import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { controlClassNames } from "@/lib/theme/theme-recipes";

type EmbeddingStatusResponse = {
    dimensions: number;
    indexedSourceCount: number;
    indexedTransactionCount: number;
    modelId: string;
    orphanCount: number;
    sourceCount: number;
    sourceOrphanCount: number;
    sourceStaleCount: number;
    sourceTransactionCount: number;
    staleCount: number;
};

export function TransactionClassificationEmbeddingIndexPanel() {
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [embeddingStatus, setEmbeddingStatus] =
        useState<EmbeddingStatusResponse | null>(null);
    const [isLoadingStatus, setIsLoadingStatus] = useState(false);
    const [isRebuilding, setIsRebuilding] = useState(false);

    async function loadStatus() {
        setIsLoadingStatus(true);

        try {
            const response = await fetch(
                "/api/utilities/transaction-classification-embeddings/status",
            );

            if (!response.ok) {
                throw response;
            }

            setEmbeddingStatus(
                (await response.json()) as EmbeddingStatusResponse,
            );
        } catch (error) {
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to load embedding index status.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to load embedding index status.",
                title: "Embedding status could not be loaded.",
            });
        } finally {
            setIsLoadingStatus(false);
        }
    }

    async function rebuildEmbeddings() {
        setIsRebuilding(true);
        const activity = startActivity({
            completedLabel: "Embeddings rebuilt.",
            pendingLabel: "Rebuilding embeddings…",
        });

        try {
            const response = await fetch(
                "/api/utilities/transaction-classification-embeddings/rebuild",
                { method: "POST" },
            );

            if (!response.ok) {
                throw response;
            }

            await loadStatus();
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Response
                        ? await parseApiErrorMessage(
                              error,
                              "Unable to rebuild embedding index.",
                          )
                        : error instanceof Error
                          ? error.message
                          : "Unable to rebuild embedding index.",
                title: "Embedding rebuild failed.",
            });
        } finally {
            setIsRebuilding(false);
        }
    }

    return (
        <section className="grid gap-3 border border-[var(--color-border)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                    <h2 className="text-lg font-semibold">Embedding index</h2>
                    <p className="text-xs text-[var(--color-muted)]">
                        Derived matching cache; not exported or synced.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={isLoadingStatus}
                        onClick={() => void loadStatus()}
                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionCompact}`}
                    >
                        <FontAwesomeIcon aria-hidden icon={faRotateRight} />
                        Status
                    </button>
                    <button
                        type="button"
                        disabled={isRebuilding}
                        onClick={() => void rebuildEmbeddings()}
                        className={`inline-flex cursor-pointer items-center gap-2 ${controlClassNames.secondaryActionCompact}`}
                    >
                        <FontAwesomeIcon aria-hidden icon={faRotateRight} />
                        Rebuild embeddings
                    </button>
                </div>
            </div>

            {embeddingStatus ? (
                <dl className="grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-4">
                    <EmbeddingStatusItem
                        label="Transactions"
                        value={`${embeddingStatus.indexedTransactionCount.toLocaleString()} / ${embeddingStatus.sourceTransactionCount.toLocaleString()}`}
                    />
                    <EmbeddingStatusItem
                        label="Source cache"
                        value={`${embeddingStatus.indexedSourceCount.toLocaleString()} / ${embeddingStatus.sourceCount.toLocaleString()}`}
                    />
                    <EmbeddingStatusItem
                        label="Stale / orphan"
                        value={`${(embeddingStatus.staleCount + embeddingStatus.sourceStaleCount).toLocaleString()} / ${(embeddingStatus.orphanCount + embeddingStatus.sourceOrphanCount).toLocaleString()}`}
                    />
                    <EmbeddingStatusItem
                        label="Model"
                        value={`${embeddingStatus.modelId}, ${embeddingStatus.dimensions}d`}
                    />
                </dl>
            ) : null}
        </section>
    );
}

function EmbeddingStatusItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="font-semibold text-[var(--color-ink)]">{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}
