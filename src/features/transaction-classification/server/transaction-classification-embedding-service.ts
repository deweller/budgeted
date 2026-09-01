import { createOpenAI, type OpenAIEmbeddingModelOptions } from "@ai-sdk/openai";
import { embedMany } from "ai";

import {
    listTransactionClassificationSourceRecords,
    getTransactionClassificationSourceStatus,
    loadTransactionClassificationSourceSnapshot,
    reconcileTransactionClassificationSourceRecords,
    type TransactionClassificationSourceRecord,
    type TransactionClassificationSourceSnapshot,
} from "@/features/transaction-classification/server/transaction-classification-source-service";
import { writeChunkedRecords } from "@/lib/db/chunked-write";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { resolveNodeEnv, resolveOpenAiApiKey } from "@/lib/env/server";
import { normalizeOptionalString } from "@/lib/strings";
import type { WorkspacePlaidTransactionSyncRecord } from "@/lib/workspace/sync-types";

export const TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID =
    "text-embedding-3-small";
export const TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS = 256;
export const TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY = 10;

export type EmbeddingSourceType = "transaction" | "transactionTemplate";

export type TransactionClassificationEmbeddingRecord = {
    createdAt: string;
    dimensions: number;
    embeddingId: string;
    embeddingTextHash: string;
    ledgerId: string;
    modelId: string;
    sourceId: string;
    sourceType: EmbeddingSourceType;
    sourceUpdatedAt: string;
    updatedAt: string;
    vectorBase64: string;
};

export type TransactionClassificationEmbeddingSource = {
    sourceId: string;
    sourceType: EmbeddingSourceType;
    sourceUpdatedAt: string;
    text: string;
};

export type EmbeddingMatch = {
    record: TransactionClassificationEmbeddingRecord;
    score: number;
    sourceId: string;
    sourceType: EmbeddingSourceType;
};

type TransactionEmbeddingInput = {
    memo?: string | null;
    payee?: string | null;
    plaidCategoryText?: string | null;
    plaidMerchantName?: string | null;
    plaidName?: string | null;
    plaidPersonalFinanceCategoryDetailed?: string | null;
    plaidPersonalFinanceCategoryPrimary?: string | null;
};

type RebuildEmbeddingsDeps = {
    embedValues?: (values: string[]) => Promise<number[][]>;
};

type ResolveEmbeddingVectorsInput = {
    existingRecords?: TransactionClassificationEmbeddingRecord[];
    ledgerId?: string;
    texts: string[];
};

type ResolvedEmbeddingVector = {
    textHash: string;
    vector: number[];
    vectorBase64: string;
};

type SourceSnapshot = {
    sources: TransactionClassificationEmbeddingSource[];
    sourceIds: Set<string>;
    staleSourceIds: Set<string>;
};

function normalizeEmbeddingTextPart(value?: string | null) {
    return (normalizeOptionalString(value) ?? "")
        .toLocaleLowerCase()
        .replaceAll(/[^a-z0-9]+/g, " ")
        .trim();
}

function uniqueNonEmptyParts(values: Array<string | null | undefined>) {
    const seen = new Set<string>();
    const parts: string[] = [];

    for (const value of values) {
        const normalized = normalizeEmbeddingTextPart(value);

        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        parts.push(normalized);
    }

    return parts;
}

export function buildTransactionClassificationEmbeddingText(
    input: TransactionEmbeddingInput,
) {
    return uniqueNonEmptyParts([
        input.payee,
        input.memo,
        input.plaidMerchantName,
        input.plaidName,
        input.plaidCategoryText,
        input.plaidPersonalFinanceCategoryPrimary,
        input.plaidPersonalFinanceCategoryDetailed,
    ]).join("\n");
}


export function createEmbeddingTextHash(text: string) {
    let first = 0xdeadbeef ^ text.length;
    let second = 0x41c6ce57 ^ text.length;

    for (let index = 0; index < text.length; index += 1) {
        const character = text.charCodeAt(index);

        first = Math.imul(first ^ character, 2654435761);
        second = Math.imul(second ^ character, 1597334677);
    }

    first =
        Math.imul(first ^ (first >>> 16), 2246822507) ^
        Math.imul(second ^ (second >>> 13), 3266489909);
    second =
        Math.imul(second ^ (second >>> 16), 2246822507) ^
        Math.imul(first ^ (first >>> 13), 3266489909);

    return `${(second >>> 0).toString(36).padStart(7, "0")}${(
        first >>> 0
    )
        .toString(36)
        .padStart(7, "0")}`;
}

export function createEmbeddingId(input: {
    sourceId: string;
    sourceType: EmbeddingSourceType;
}) {
    return `${input.sourceType}:${input.sourceId}`;
}

function encodeVector(vector: number[]) {
    const values = new Float32Array(vector);

    return Buffer.from(values.buffer).toString("base64");
}

export function decodeEmbeddingVector(vectorBase64: string) {
    const bytes = Buffer.from(vectorBase64, "base64");
    const copied = new Uint8Array(bytes.length);

    copied.set(bytes);

    return Array.from(new Float32Array(copied.buffer));
}

export function cosineSimilarity(left: number[], right: number[]) {
    const length = Math.min(left.length, right.length);
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < length; index += 1) {
        const leftValue = left[index] ?? 0;
        const rightValue = right[index] ?? 0;

        dot += leftValue * rightValue;
        leftMagnitude += leftValue * leftValue;
        rightMagnitude += rightValue * rightValue;
    }

    if (leftMagnitude === 0 || rightMagnitude === 0) {
        return 0;
    }

    return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function isEmbeddingCurrent(input: {
    record?: TransactionClassificationEmbeddingRecord;
    source: TransactionClassificationEmbeddingSource;
}) {
    const textHash = createEmbeddingTextHash(input.source.text);

    return (
        input.record?.modelId === TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID &&
        input.record.dimensions ===
            TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS &&
        input.record.sourceUpdatedAt === input.source.sourceUpdatedAt &&
        input.record.embeddingTextHash === textHash
    );
}

function getEmbeddingSourceKey(source: {
    sourceId: string;
    sourceType: EmbeddingSourceType;
}) {
    return createEmbeddingId(source);
}

function embeddingRecordToSourceKey(
    record: Pick<
        TransactionClassificationEmbeddingRecord,
        "sourceId" | "sourceType"
    >,
) {
    return createEmbeddingId(record);
}

async function embedSourceTexts(values: string[]) {
    const apiKey = resolveOpenAiApiKey();

    if (!apiKey || values.length === 0 || resolveNodeEnv() === "test") {
        return [];
    }

    const provider = createOpenAI({ apiKey });
    const result = await embedMany({
        model: provider.embedding(TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID),
        providerOptions: {
            openai: {
                dimensions: TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS,
            } satisfies OpenAIEmbeddingModelOptions,
        },
        values,
    });

    return result.embeddings;
}

function isReusableEmbeddingRecord(
    record: TransactionClassificationEmbeddingRecord,
    textHash: string,
) {
    return (
        record.modelId === TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID &&
        record.dimensions === TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS &&
        record.embeddingTextHash === textHash &&
        record.vectorBase64.length > 0
    );
}

function toResolvedEmbeddingVector(
    record: TransactionClassificationEmbeddingRecord,
): ResolvedEmbeddingVector {
    return {
        textHash: record.embeddingTextHash,
        vector: decodeEmbeddingVector(record.vectorBase64),
        vectorBase64: record.vectorBase64,
    };
}

function addReusableRecordsByHash(
    recordsByHash: Map<string, TransactionClassificationEmbeddingRecord>,
    records: TransactionClassificationEmbeddingRecord[],
) {
    for (const record of records) {
        if (!isReusableEmbeddingRecord(record, record.embeddingTextHash)) {
            continue;
        }

        recordsByHash.set(record.embeddingTextHash, record);
    }
}

export async function listTransactionClassificationEmbeddingRecords(
    ledgerId: string,
) {
    const { entities } = getBudgetedSchema();

    return queryAllPages(
        entities.transactionClassificationEmbeddings.query.byEmbedding({
            ledgerId,
        }),
        { consistent: true },
    ) as Promise<TransactionClassificationEmbeddingRecord[]>;
}

async function listTransactionClassificationEmbeddingRecordsByTextHash(input: {
    embeddingTextHash: string;
    ledgerId: string;
}) {
    const { entities } = getBudgetedSchema();

    return queryAllPages(
        entities.transactionClassificationEmbeddings.query.byEmbeddingTextHash({
            embeddingTextHash: input.embeddingTextHash,
            ledgerId: input.ledgerId,
        }),
    ) as Promise<TransactionClassificationEmbeddingRecord[]>;
}

async function getTransactionClassificationEmbeddingRecordsForSources(input: {
    ledgerId: string;
    sources: TransactionClassificationEmbeddingSource[];
}) {
    const { entities } = getBudgetedSchema();
    const uniqueSources = Array.from(
        new Map(
            input.sources.map((source) => [getEmbeddingSourceKey(source), source]),
        ).values(),
    );
    const records = await Promise.all(
        uniqueSources.map(async (source) => {
            const result = await entities.transactionClassificationEmbeddings
                .get({
                    embeddingId: createEmbeddingId(source),
                    ledgerId: input.ledgerId,
                })
                .go();

            return result.data as TransactionClassificationEmbeddingRecord | null;
        }),
    );

    return records.filter(
        (record): record is TransactionClassificationEmbeddingRecord =>
            Boolean(record),
    );
}

async function findReusableEmbeddingRecordsByHash(input: {
    existingRecords?: TransactionClassificationEmbeddingRecord[];
    ledgerId?: string;
    textHashes: string[];
}) {
    const uniqueHashes = Array.from(new Set(input.textHashes));
    const recordsByHash = new Map<string, TransactionClassificationEmbeddingRecord>();

    if (input.existingRecords) {
        addReusableRecordsByHash(recordsByHash, input.existingRecords);

        return recordsByHash;
    }

    if (!input.ledgerId || uniqueHashes.length === 0) {
        return recordsByHash;
    }

    const ledgerId = input.ledgerId;
    const records = await Promise.all(
        uniqueHashes.map((embeddingTextHash) =>
            listTransactionClassificationEmbeddingRecordsByTextHash({
                embeddingTextHash,
                ledgerId,
            }),
        ),
    );

    addReusableRecordsByHash(recordsByHash, records.flat());

    return recordsByHash;
}

async function resolveEmbeddingVectorsForTexts(
    input: ResolveEmbeddingVectorsInput,
    deps: RebuildEmbeddingsDeps = {},
) {
    const uniqueTexts = Array.from(new Set(input.texts.filter(Boolean)));
    const textHashByText = new Map(
        uniqueTexts.map((text) => [text, createEmbeddingTextHash(text)]),
    );
    const reusableRecordsByHash = await findReusableEmbeddingRecordsByHash({
        existingRecords: input.existingRecords,
        ledgerId: input.ledgerId,
        textHashes: Array.from(textHashByText.values()),
    });
    const resolvedByText = new Map<string, ResolvedEmbeddingVector>();

    for (const [text, textHash] of textHashByText) {
        const reusableRecord = reusableRecordsByHash.get(textHash);

        if (reusableRecord && isReusableEmbeddingRecord(reusableRecord, textHash)) {
            resolvedByText.set(text, toResolvedEmbeddingVector(reusableRecord));
        }
    }

    const textsToEmbed = uniqueTexts.filter((text) => !resolvedByText.has(text));

    if (
        textsToEmbed.length > 0 &&
        (deps.embedValues || (resolveOpenAiApiKey() && resolveNodeEnv() !== "test"))
    ) {
        const embeddings = await (deps.embedValues ?? embedSourceTexts)(textsToEmbed);

        textsToEmbed.forEach((text, index) => {
            const vector = embeddings[index];

            if (!vector) {
                return;
            }

            resolvedByText.set(text, {
                textHash: textHashByText.get(text) ?? createEmbeddingTextHash(text),
                vector,
                vectorBase64: encodeVector(vector),
            });
        });
    }

    return input.texts.map((text) => resolvedByText.get(text));
}

export async function deleteTransactionClassificationEmbeddingForSource(
    input: {
        ledgerId: string;
        sourceId: string;
        sourceType: EmbeddingSourceType;
    },
) {
    const { entities } = getBudgetedSchema();

    await entities.transactionClassificationEmbeddings
        .delete({
            embeddingId: createEmbeddingId(input),
            ledgerId: input.ledgerId,
        })
        .go();
}

async function deleteEmbeddingRecords(
    records: TransactionClassificationEmbeddingRecord[],
) {
    const { entities } = getBudgetedSchema();

    await writeChunkedRecords(
        records,
        (record) =>
            entities.transactionClassificationEmbeddings
                .delete({
                    embeddingId: record.embeddingId,
                    ledgerId: record.ledgerId,
                })
                .go(),
        TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
    );
}

export async function ensureTransactionClassificationEmbeddings(
    input: {
        existingRecords?: TransactionClassificationEmbeddingRecord[];
        ledgerId: string;
        sources: TransactionClassificationEmbeddingSource[];
    },
    deps: RebuildEmbeddingsDeps = {},
) {
    const sources = input.sources.filter((source) => source.text.length > 0);

    if (sources.length === 0) {
        return {
            createdCount: 0,
            refreshedCount: 0,
            skippedCount: input.sources.length,
        };
    }

    const existingRecords =
        input.existingRecords ??
        (await getTransactionClassificationEmbeddingRecordsForSources({
            ledgerId: input.ledgerId,
            sources,
        }));
    const existingBySource = new Map(
        existingRecords.map((record) => [embeddingRecordToSourceKey(record), record]),
    );
    const staleSources = sources.filter(
        (source) =>
            !isEmbeddingCurrent({
                record: existingBySource.get(getEmbeddingSourceKey(source)),
                source,
            }),
    );

    if (staleSources.length === 0) {
        return { createdCount: 0, refreshedCount: 0, skippedCount: 0 };
    }

    const embeddings = await resolveEmbeddingVectorsForTexts(
        {
            existingRecords: input.existingRecords ? existingRecords : undefined,
            ledgerId: input.ledgerId,
            texts: staleSources.map((source) => source.text),
        },
        deps,
    );
    const { entities } = getBudgetedSchema();
    const now = new Date().toISOString();
    let createdCount = 0;
    let refreshedCount = 0;
    let skippedCount = input.sources.length - sources.length;

    const writes = staleSources.flatMap((source, index) => {
        const existing = existingBySource.get(getEmbeddingSourceKey(source));
        const embedding = embeddings[index];

        if (!embedding) {
            skippedCount += 1;
            return [];
        }

        if (existing) {
            refreshedCount += 1;
        } else {
            createdCount += 1;
        }

        return [
            {
                createdAt: existing?.createdAt ?? now,
                dimensions: TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS,
                embeddingId: createEmbeddingId(source),
                embeddingTextHash: embedding.textHash,
                ledgerId: input.ledgerId,
                modelId: TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID,
                sourceId: source.sourceId,
                sourceType: source.sourceType,
                sourceUpdatedAt: source.sourceUpdatedAt,
                updatedAt: now,
                vectorBase64: embedding.vectorBase64,
            } satisfies TransactionClassificationEmbeddingRecord,
        ];
    });

    await writeChunkedRecords(
        writes,
        (record) =>
            entities.transactionClassificationEmbeddings.put(record).go(),
        TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
    );

    return {
        createdCount,
        refreshedCount,
        skippedCount,
    };
}

export function buildTransactionClassificationEmbeddingSourceForTransaction(input: {
    plaidSync?: WorkspacePlaidTransactionSyncRecord;
    transaction: {
        memo?: string | null;
        payee?: string | null;
        transactionId: string;
        updatedAt: string;
    };
}) {
    if (!normalizeOptionalString(input.transaction.memo)) {
        return null;
    }

    const text = buildTransactionClassificationEmbeddingText({
        memo: input.transaction.memo,
        payee: input.transaction.payee,
        plaidCategoryText: input.plaidSync?.categoryText,
        plaidMerchantName: input.plaidSync?.merchantName,
        plaidName: input.plaidSync?.name,
        plaidPersonalFinanceCategoryDetailed:
            input.plaidSync?.personalFinanceCategoryDetailed,
        plaidPersonalFinanceCategoryPrimary:
            input.plaidSync?.personalFinanceCategoryPrimary,
    });

    return text
        ? {
              sourceId: input.transaction.transactionId,
              sourceType: "transaction" as const,
              sourceUpdatedAt: input.transaction.updatedAt,
              text,
          }
        : null;
}

export function buildTransactionClassificationEmbeddingSourceForRecord(
    record: TransactionClassificationSourceRecord,
): TransactionClassificationEmbeddingSource | null {
    if (!record.hasMemo || !record.memo) {
        return null;
    }

    const text = buildTransactionClassificationEmbeddingText({
        memo: record.memo,
        payee: record.payee,
        plaidCategoryText: record.plaidCategoryText,
        plaidMerchantName: record.plaidMerchantName,
        plaidName: record.plaidName,
        plaidPersonalFinanceCategoryDetailed: record.plaidPfcDetailed,
        plaidPersonalFinanceCategoryPrimary: record.plaidPfcPrimary,
    });

    return text
        ? {
              sourceId: record.transactionId,
              sourceType: "transaction",
              sourceUpdatedAt: record.sourceUpdatedAt,
              text,
          }
        : null;
}

export async function syncTransactionClassificationEmbeddingForSourceRecord(input: {
    ledgerId: string;
    record: TransactionClassificationSourceRecord | null;
    transactionId: string;
}) {
    const source = input.record
        ? buildTransactionClassificationEmbeddingSourceForRecord(input.record)
        : null;

    if (!source) {
        await deleteTransactionClassificationEmbeddingForSource({
            ledgerId: input.ledgerId,
            sourceId: input.transactionId,
            sourceType: "transaction",
        });
        return;
    }

    await ensureTransactionClassificationEmbeddings({
        ledgerId: input.ledgerId,
        sources: [source],
    });
}

function toEmbeddingSourceSnapshot(
    snapshot: TransactionClassificationSourceSnapshot,
): SourceSnapshot {
    const sources = snapshot.records
        .map(buildTransactionClassificationEmbeddingSourceForRecord)
        .filter(
            (
                source,
            ): source is TransactionClassificationEmbeddingSource =>
                Boolean(source),
        );

    return {
        sources,
        sourceIds: new Set(sources.map(createEmbeddingId)),
        staleSourceIds: new Set(),
    };
}

function getOrphanEmbeddingRecords(input: {
    records: TransactionClassificationEmbeddingRecord[];
    sourceIds: Set<string>;
    staleSourceIds: Set<string>;
}) {
    return input.records.filter(
        (record) =>
            !input.sourceIds.has(embeddingRecordToSourceKey(record)) ||
            input.staleSourceIds.has(embeddingRecordToSourceKey(record)),
    );
}

function getStaleEmbeddingRecords(input: {
    records: TransactionClassificationEmbeddingRecord[];
    sources: TransactionClassificationEmbeddingSource[];
}) {
    const recordsBySource = new Map(
        input.records.map((record) => [embeddingRecordToSourceKey(record), record]),
    );

    return input.sources.filter(
        (source) =>
            !isEmbeddingCurrent({
                record: recordsBySource.get(getEmbeddingSourceKey(source)),
                source,
            }),
    );
}

export async function getTransactionClassificationEmbeddingStatus(
    ledgerId: string,
) {
    const [records, sourceRecords, sourceSnapshot] = await Promise.all([
        listTransactionClassificationEmbeddingRecords(ledgerId),
        listTransactionClassificationSourceRecords(ledgerId),
        loadTransactionClassificationSourceSnapshot(ledgerId),
    ]);
    const snapshot = toEmbeddingSourceSnapshot(sourceSnapshot);
    const orphanRecords = getOrphanEmbeddingRecords({
        records,
        sourceIds: snapshot.sourceIds,
        staleSourceIds: snapshot.staleSourceIds,
    });
    const staleSources = getStaleEmbeddingRecords({
        records,
        sources: snapshot.sources,
    });

    return {
        ...getTransactionClassificationSourceStatus({
            existingRecords: sourceRecords,
            snapshot: sourceSnapshot,
        }),
        dimensions: TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS,
        indexedTransactionCount: records.filter(
            (record) => record.sourceType === "transaction",
        ).length,
        modelId: TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID,
        orphanCount: orphanRecords.length,
        sourceTransactionCount: snapshot.sources.length,
        staleCount: staleSources.length,
    };
}

export async function rebuildTransactionClassificationEmbeddings(
    ledgerId: string,
    deps: RebuildEmbeddingsDeps = {},
) {
    const [records, sourceRecords, sourceSnapshot] = await Promise.all([
        listTransactionClassificationEmbeddingRecords(ledgerId),
        listTransactionClassificationSourceRecords(ledgerId),
        loadTransactionClassificationSourceSnapshot(ledgerId),
    ]);
    const sourceResult = await reconcileTransactionClassificationSourceRecords({
        existingRecords: sourceRecords,
        ledgerId,
        snapshot: sourceSnapshot,
    });
    const snapshot = toEmbeddingSourceSnapshot(sourceSnapshot);
    const orphanRecords = getOrphanEmbeddingRecords({
        records,
        sourceIds: snapshot.sourceIds,
        staleSourceIds: snapshot.staleSourceIds,
    });

    await deleteEmbeddingRecords(orphanRecords);

    const remainingRecords = records.filter(
        (record) => !orphanRecords.includes(record),
    );
    const result = await ensureTransactionClassificationEmbeddings(
        {
            existingRecords: remainingRecords,
            ledgerId,
            sources: snapshot.sources,
        },
        deps,
    );

    return {
        ...result,
        deletedOrphanCount: orphanRecords.length,
        dimensions: TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS,
        modelId: TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID,
        sourceIndex: sourceResult,
        sourceCount: snapshot.sources.length,
    };
}

export async function buildEmbeddingMatches(input: {
    embeddingRecords: TransactionClassificationEmbeddingRecord[];
    maxMatches: number;
    sourceKeys?: Set<string>;
    targetEmbedding: number[];
}) {
    return input.embeddingRecords
        .filter(
            (record) =>
                !input.sourceKeys ||
                input.sourceKeys.has(embeddingRecordToSourceKey(record)),
        )
        .map((record): EmbeddingMatch => ({
            record,
            score: cosineSimilarity(
                input.targetEmbedding,
                decodeEmbeddingVector(record.vectorBase64),
            ),
            sourceId: record.sourceId,
            sourceType: record.sourceType,
        }))
        .filter((match) => Number.isFinite(match.score) && match.score > 0)
        .sort(
            (left, right) =>
                right.score - left.score ||
                right.record.sourceUpdatedAt.localeCompare(
                    left.record.sourceUpdatedAt,
                ),
        )
        .slice(0, input.maxMatches);
}

export async function embedTransactionClassificationTexts(
    values: string[],
    deps: RebuildEmbeddingsDeps & {
        existingRecords?: TransactionClassificationEmbeddingRecord[];
        ledgerId?: string;
    } = {},
) {
    const resolved = await resolveEmbeddingVectorsForTexts(
        {
            existingRecords: deps.existingRecords,
            ledgerId: deps.ledgerId,
            texts: values,
        },
        deps,
    );

    return resolved.map((embedding) => embedding?.vector);
}
