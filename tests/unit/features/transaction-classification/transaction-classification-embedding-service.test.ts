// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    embeddingDelete: vi.fn(),
    embeddingDeleteGo: vi.fn(),
    embeddingGet: vi.fn(),
    embeddingGetGo: vi.fn(),
    embeddingPut: vi.fn(),
    embeddingPutGo: vi.fn(),
    embeddingsByTextHash: vi.fn(),
    embeddingsByTextHashGo: vi.fn(),
    embeddingsGo: vi.fn(),
    linesGo: vi.fn(),
    plaidSyncsGo: vi.fn(),
    sourceDelete: vi.fn(),
    sourceDeleteGo: vi.fn(),
    sourceGet: vi.fn(),
    sourceGetGo: vi.fn(),
    sourcePut: vi.fn(),
    sourcePutGo: vi.fn(),
    sourcesGo: vi.fn(),
    templatesGo: vi.fn(),
    transactionsGo: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            plaidTransactionSyncs: {
                query: {
                    bySync: () => ({ go: mocks.plaidSyncsGo }),
                },
            },
            transactionClassificationEmbeddings: {
                delete: mocks.embeddingDelete,
                get: mocks.embeddingGet,
                put: mocks.embeddingPut,
                query: {
                    byEmbedding: () => ({ go: mocks.embeddingsGo }),
                    byEmbeddingTextHash: mocks.embeddingsByTextHash,
                },
            },
            transactionClassificationSources: {
                delete: mocks.sourceDelete,
                get: mocks.sourceGet,
                put: mocks.sourcePut,
                query: {
                    bySource: () => ({ go: mocks.sourcesGo }),
                },
            },
            transactionLines: {
                query: {
                    byLine: () => ({ go: mocks.linesGo }),
                },
            },
            transactionTemplates: {
                query: {
                    byTemplate: () => ({ go: mocks.templatesGo }),
                },
            },
            transactions: {
                query: {
                    byTransaction: () => ({ go: mocks.transactionsGo }),
                },
            },
        },
    }),
}));

import {
    buildEmbeddingMatches,
    buildTransactionClassificationEmbeddingText,
    cosineSimilarity,
    createEmbeddingTextHash,
    embedTransactionClassificationTexts,
    ensureTransactionClassificationEmbeddings,
    rebuildTransactionClassificationEmbeddings,
    TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
    type TransactionClassificationEmbeddingRecord,
    type TransactionClassificationEmbeddingSource,
} from "@/features/transaction-classification/server/transaction-classification-embedding-service";

function vector(value: number) {
    return Array.from({ length: 256 }, () => value);
}

function makeEmbeddingRecord(
    sourceId: string,
): TransactionClassificationEmbeddingRecord {
    return {
        createdAt: "2026-07-01T00:00:00.000Z",
        dimensions: 256,
        embeddingId: `transaction:${sourceId}`,
        embeddingTextHash: createEmbeddingTextHash(sourceId),
        ledgerId: "ledger-1",
        modelId: "text-embedding-3-small",
        sourceId,
        sourceType: "transaction",
        sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        vectorBase64: Buffer.from(new Float32Array(vector(1)).buffer).toString(
            "base64",
        ),
    };
}

function makeEmbeddingSource(
    index: number,
): TransactionClassificationEmbeddingSource {
    return {
        sourceId: `transaction-${index}`,
        sourceType: "transaction",
        sourceUpdatedAt: "2026-07-02T00:00:00.000Z",
        text: `merchant ${index}`,
    };
}

function createDeferred<TValue = void>() {
    let resolve!: (value: TValue | PromiseLike<TValue>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<TValue>((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });

    return { promise, reject, resolve };
}

describe("transaction classification embedding service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.embeddingDelete.mockReturnValue({ go: mocks.embeddingDeleteGo });
        mocks.embeddingDeleteGo.mockResolvedValue({});
        mocks.embeddingGet.mockReturnValue({ go: mocks.embeddingGetGo });
        mocks.embeddingGetGo.mockResolvedValue({ data: null });
        mocks.embeddingPut.mockReturnValue({ go: mocks.embeddingPutGo });
        mocks.embeddingPutGo.mockResolvedValue({});
        mocks.embeddingsByTextHash.mockReturnValue({
            go: mocks.embeddingsByTextHashGo,
        });
        mocks.embeddingsByTextHashGo.mockResolvedValue({ data: [] });
        mocks.embeddingsGo.mockResolvedValue({ data: [] });
        mocks.linesGo.mockResolvedValue({ data: [] });
        mocks.sourceDelete.mockReturnValue({ go: mocks.sourceDeleteGo });
        mocks.sourceDeleteGo.mockResolvedValue({});
        mocks.sourceGet.mockReturnValue({ go: mocks.sourceGetGo });
        mocks.sourceGetGo.mockResolvedValue({ data: null });
        mocks.sourcePut.mockReturnValue({ go: mocks.sourcePutGo });
        mocks.sourcePutGo.mockResolvedValue({});
        mocks.sourcesGo.mockResolvedValue({ data: [] });
        mocks.plaidSyncsGo.mockResolvedValue({ data: [] });
        mocks.templatesGo.mockResolvedValue({ data: [] });
        mocks.transactionsGo.mockResolvedValue({ data: [] });
    });

    it("builds normalized transaction text only from payee, memo, and Plaid merchant/category fields", () => {
        expect(
            buildTransactionClassificationEmbeddingText({
                memo: "Weekly Food Run",
                payee: "FRESH MARKET #123",
                plaidCategoryText: "Shops, Supermarkets and Groceries",
                plaidMerchantName: "Fresh Market",
                plaidName: "POS PURCHASE FRESH MARKET",
                plaidPersonalFinanceCategoryDetailed: "FOOD_AND_DRINK_GROCERIES",
                plaidPersonalFinanceCategoryPrimary: "FOOD_AND_DRINK",
            }),
        ).toBe(
            [
                "fresh market 123",
                "weekly food run",
                "fresh market",
                "pos purchase fresh market",
                "shops supermarkets and groceries",
                "food and drink",
                "food and drink groceries",
            ].join("\n"),
        );
    });

    it("keeps account, amount, category output, and raw Plaid payload out of embedding text", () => {
        const text = buildTransactionClassificationEmbeddingText({
            memo: "Taproom",
            payee: "Neighborhood Beer",
            plaidCategoryText: "Restaurants",
            plaidMerchantName: "Neighborhood Beer",
            plaidName: "Neighborhood Beer",
            plaidPersonalFinanceCategoryDetailed: "FOOD_AND_DRINK_RESTAURANT",
            plaidPersonalFinanceCategoryPrimary: "FOOD_AND_DRINK",
        });

        expect(text).not.toContain("checking");
        expect(text).not.toContain("4200");
        expect(text).not.toContain("groceries");
        expect(text).not.toContain("plaidPayloadJson");
    });

    it("creates a fast deterministic embedding text hash", () => {
        expect(createEmbeddingTextHash("fresh market")).toBe(
            createEmbeddingTextHash("fresh market"),
        );
        expect(createEmbeddingTextHash("fresh market")).not.toBe(
            createEmbeddingTextHash("fresh market weekly food"),
        );
        expect(createEmbeddingTextHash("fresh market")).not.toHaveLength(64);
    });

    it("computes vector similarity rankings", async () => {
        const one = vector(1);
        const near = vector(0.9);
        const opposite = vector(-1);

        expect(cosineSimilarity(one, near)).toBeCloseTo(1);
        expect(cosineSimilarity(one, opposite)).toBeCloseTo(-1);

        const matches = await buildEmbeddingMatches({
            embeddingRecords: [
                {
                    createdAt: "2026-07-01T00:00:00.000Z",
                    dimensions: 256,
                    embeddingId: "transaction:one",
                    embeddingTextHash: "hash",
                    ledgerId: "ledger-1",
                    modelId: "text-embedding-3-small",
                    sourceId: "one",
                    sourceType: "transaction",
                    sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                    vectorBase64: Buffer.from(
                        new Float32Array(near).buffer,
                    ).toString("base64"),
                },
                {
                    createdAt: "2026-07-01T00:00:00.000Z",
                    dimensions: 256,
                    embeddingId: "transaction:two",
                    embeddingTextHash: "hash",
                    ledgerId: "ledger-1",
                    modelId: "text-embedding-3-small",
                    sourceId: "two",
                    sourceType: "transaction",
                    sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                    vectorBase64: Buffer.from(
                        new Float32Array(opposite).buffer,
                    ).toString("base64"),
                },
            ],
            maxMatches: 1,
            targetEmbedding: one,
        });

        expect(matches).toEqual([
            expect.objectContaining({
                sourceId: "one",
            }),
        ]);
    });

    it("skips refreshes when OpenAI is unavailable and no embedding dependency is injected", async () => {
        await expect(
            ensureTransactionClassificationEmbeddings({
                ledgerId: "ledger-1",
                sources: [
                    {
                        sourceId: "transaction-1",
                        sourceType: "transaction",
                        sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
                        text: "fresh market",
                    },
                ],
            }),
        ).resolves.toMatchObject({
            createdCount: 0,
            refreshedCount: 0,
            skippedCount: 1,
        });
        expect(mocks.embeddingPut).not.toHaveBeenCalled();
    });

    it("dedupes repeated source text before requesting embeddings", async () => {
        const embedValues = vi
            .fn<(values: string[]) => Promise<number[][]>>()
            .mockImplementation(async (values) => values.map(() => vector(1)));

        await expect(
            ensureTransactionClassificationEmbeddings(
                {
                    ledgerId: "ledger-1",
                    sources: [
                        {
                            sourceId: "transaction-1",
                            sourceType: "transaction",
                            sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
                            text: "fresh market",
                        },
                        {
                            sourceId: "transaction-2",
                            sourceType: "transaction",
                            sourceUpdatedAt: "2026-07-02T00:00:00.000Z",
                            text: "fresh market",
                        },
                    ],
                },
                { embedValues },
            ),
        ).resolves.toMatchObject({
            createdCount: 2,
            refreshedCount: 0,
            skippedCount: 0,
        });
        expect(embedValues).toHaveBeenCalledOnce();
        expect(embedValues).toHaveBeenCalledWith(["fresh market"]);
        expect(mocks.embeddingsByTextHash).toHaveBeenCalledOnce();
        expect(mocks.embeddingsByTextHash).toHaveBeenCalledWith({
            embeddingTextHash: createEmbeddingTextHash("fresh market"),
            ledgerId: "ledger-1",
        });
        expect(mocks.embeddingPut).toHaveBeenCalledTimes(2);
        expect(mocks.embeddingPut).toHaveBeenCalledWith(
            expect.objectContaining({
                embeddingId: "transaction:transaction-1",
                embeddingTextHash: createEmbeddingTextHash("fresh market"),
            }),
        );
        expect(mocks.embeddingPut).toHaveBeenCalledWith(
            expect.objectContaining({
                embeddingId: "transaction:transaction-2",
                embeddingTextHash: createEmbeddingTextHash("fresh market"),
            }),
        );
    });

    it("reuses an existing source-hash embedding before requesting a new one", async () => {
        const reusedVectorBase64 = Buffer.from(
            new Float32Array(vector(0.5)).buffer,
        ).toString("base64");
        const embedValues = vi
            .fn<(values: string[]) => Promise<number[][]>>()
            .mockResolvedValue([vector(1)]);

        mocks.embeddingsByTextHashGo.mockResolvedValue({
            data: [
                {
                    createdAt: "2026-07-01T00:00:00.000Z",
                    dimensions: 256,
                    embeddingId: "transaction:transaction-1",
                    embeddingTextHash: createEmbeddingTextHash("fresh market"),
                    ledgerId: "ledger-1",
                    modelId: "text-embedding-3-small",
                    sourceId: "transaction-1",
                    sourceType: "transaction",
                    sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                    vectorBase64: reusedVectorBase64,
                },
            ],
        });

        await expect(
            ensureTransactionClassificationEmbeddings(
                {
                    ledgerId: "ledger-1",
                    sources: [
                        {
                            sourceId: "transaction-2",
                            sourceType: "transaction",
                            sourceUpdatedAt: "2026-07-02T00:00:00.000Z",
                            text: "fresh market",
                        },
                    ],
                },
                { embedValues },
            ),
        ).resolves.toMatchObject({
            createdCount: 1,
            refreshedCount: 0,
            skippedCount: 0,
        });
        expect(embedValues).not.toHaveBeenCalled();
        expect(mocks.embeddingPut).toHaveBeenCalledWith(
            expect.objectContaining({
                embeddingId: "transaction:transaction-2",
                embeddingTextHash: createEmbeddingTextHash("fresh market"),
                vectorBase64: reusedVectorBase64,
            }),
        );
    });

    it("dedupes repeated target text before requesting embeddings", async () => {
        const embedValues = vi
            .fn<(values: string[]) => Promise<number[][]>>()
            .mockImplementation(async (values) => values.map(() => vector(1)));

        await expect(
            embedTransactionClassificationTexts(
                ["fresh market", "fresh market"],
                { embedValues },
            ),
        ).resolves.toEqual([vector(1), vector(1)]);
        expect(embedValues).toHaveBeenCalledOnce();
        expect(embedValues).toHaveBeenCalledWith(["fresh market"]);
    });

    it("reuses source-hash embeddings for target text before requesting embeddings", async () => {
        const embedValues = vi
            .fn<(values: string[]) => Promise<number[][]>>()
            .mockResolvedValue([vector(1)]);
        const reusedVector = vector(0.25);

        mocks.embeddingsByTextHashGo.mockResolvedValue({
            data: [
                {
                    createdAt: "2026-07-01T00:00:00.000Z",
                    dimensions: 256,
                    embeddingId: "transaction:transaction-1",
                    embeddingTextHash: createEmbeddingTextHash("fresh market"),
                    ledgerId: "ledger-1",
                    modelId: "text-embedding-3-small",
                    sourceId: "transaction-1",
                    sourceType: "transaction",
                    sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                    vectorBase64: Buffer.from(
                        new Float32Array(reusedVector).buffer,
                    ).toString("base64"),
                },
            ],
        });

        await expect(
            embedTransactionClassificationTexts(["fresh market"], {
                embedValues,
                ledgerId: "ledger-1",
            }),
        ).resolves.toEqual([reusedVector]);
        expect(embedValues).not.toHaveBeenCalled();
        expect(mocks.embeddingsByTextHash).toHaveBeenCalledWith({
            embeddingTextHash: createEmbeddingTextHash("fresh market"),
            ledgerId: "ledger-1",
        });
    });

    it("refreshes stale source embeddings and deletes orphan embeddings during rebuild", async () => {
        mocks.embeddingsGo.mockResolvedValue({
            data: [
                {
                    createdAt: "2026-07-01T00:00:00.000Z",
                    dimensions: 256,
                    embeddingId: "transaction:transaction-1",
                    embeddingTextHash: "old-hash",
                    ledgerId: "ledger-1",
                    modelId: "text-embedding-3-small",
                    sourceId: "transaction-1",
                    sourceType: "transaction",
                    sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                    vectorBase64: Buffer.from(
                        new Float32Array(vector(0)).buffer,
                    ).toString("base64"),
                },
                {
                    createdAt: "2026-07-01T00:00:00.000Z",
                    dimensions: 256,
                    embeddingId: "transaction:deleted",
                    embeddingTextHash: "hash",
                    ledgerId: "ledger-1",
                    modelId: "text-embedding-3-small",
                    sourceId: "deleted",
                    sourceType: "transaction",
                    sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                    vectorBase64: Buffer.from(
                        new Float32Array(vector(0)).buffer,
                    ).toString("base64"),
                },
                {
                    ...makeEmbeddingRecord("obsolete-template"),
                    embeddingId: "transactionTemplate:obsolete-template",
                    sourceType: "transactionTemplate" as const,
                },
            ],
        });
        mocks.transactionsGo.mockResolvedValue({
            data: [
                {
                    displayAmountCents: -4200,
                    enteredAt: "2026-07-01T00:00:00.000Z",
                    kind: "standard",
                    ledgerId: "ledger-1",
                    memo: "Weekly food",
                    occurredAt: "2026-07-01T00:00:00.000Z",
                    payee: "Fresh Market",
                    periodId: "2026-07",
                    plaidTransactionSyncId: "plaid-1",
                    referenceAccountId: "checking",
                    status: "entered",
                    transactionId: "transaction-1",
                    updatedAt: "2026-07-02T00:00:00.000Z",
                },
            ],
        });
        mocks.linesGo.mockResolvedValue({
            data: [
                {
                    amountCents: 4200,
                    categoryId: "groceries",
                    createdAt: "2026-07-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    ledgerId: "ledger-1",
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
        });
        mocks.plaidSyncsGo.mockResolvedValue({
            data: [
                {
                    categoryText: "Shops, Groceries",
                    firstSyncedAt: "2026-07-01T00:00:00.000Z",
                    lastSyncedAt: "2026-07-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                    merchantName: "Fresh Market",
                    name: "POS FRESH MARKET",
                    pending: false,
                    plaidAccountId: "plaid-account",
                    plaidAccountLinkId: "link",
                    plaidAmountCents: 4200,
                    plaidDate: "2026-07-01",
                    plaidItemId: "item",
                    plaidPayloadJson: "{}",
                    plaidTransactionId: "plaid-transaction",
                    plaidTransactionSyncId: "plaid-1",
                    status: "active",
                    transactionId: "transaction-1",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
        });

        await expect(
            rebuildTransactionClassificationEmbeddings("ledger-1", {
                embedValues: async (values) => values.map(() => vector(1)),
            }),
        ).resolves.toMatchObject({
            deletedOrphanCount: 2,
            refreshedCount: 1,
            sourceCount: 1,
        });
        expect(mocks.embeddingDelete).toHaveBeenCalledWith({
            embeddingId: "transaction:deleted",
            ledgerId: "ledger-1",
        });
        expect(mocks.embeddingDelete).toHaveBeenCalledWith({
            embeddingId: "transactionTemplate:obsolete-template",
            ledgerId: "ledger-1",
        });
        expect(mocks.embeddingPut).toHaveBeenCalledWith(
            expect.objectContaining({
                dimensions: 256,
                embeddingId: "transaction:transaction-1",
                ledgerId: "ledger-1",
                modelId: "text-embedding-3-small",
                sourceId: "transaction-1",
                sourceType: "transaction",
                sourceUpdatedAt: "2026-07-02T00:00:00.000Z",
                vectorBase64: expect.any(String),
            }),
        );
    });

    it("limits stale embedding writes to configured concurrency chunks", async () => {
        const sources = Array.from({ length: 11 }, (_, index) =>
            makeEmbeddingSource(index),
        );
        const deferredWrites = sources.map(() => createDeferred());

        mocks.embeddingPutGo.mockImplementation(() => {
            const deferred = deferredWrites[mocks.embeddingPutGo.mock.calls.length - 1];

            return deferred?.promise ?? Promise.resolve();
        });

        const result = ensureTransactionClassificationEmbeddings(
            {
                existingRecords: [],
                ledgerId: "ledger-1",
                sources,
            },
            {
                embedValues: async (values) =>
                    values.map((_, index) => vector(index + 1)),
            },
        );

        await vi.waitFor(() =>
            expect(mocks.embeddingPut).toHaveBeenCalledTimes(
                TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
            ),
        );
        expect(mocks.embeddingPut).not.toHaveBeenCalledWith(
            expect.objectContaining({
                embeddingId: "transaction:transaction-10",
            }),
        );

        for (const deferred of deferredWrites.slice(
            0,
            TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
        )) {
            deferred.resolve();
        }

        await vi.waitFor(() =>
            expect(mocks.embeddingPut).toHaveBeenCalledTimes(11),
        );
        deferredWrites[10]?.resolve();

        await expect(result).resolves.toMatchObject({
            createdCount: 11,
            refreshedCount: 0,
            skippedCount: 0,
        });
    });

    it("limits orphan embedding deletes to configured concurrency chunks", async () => {
        const records = Array.from({ length: 11 }, (_, index) =>
            makeEmbeddingRecord(`deleted-${index}`),
        );
        const deferredDeletes = records.map(() => createDeferred());

        mocks.embeddingsGo.mockResolvedValue({ data: records });
        mocks.embeddingDeleteGo.mockImplementation(() => {
            const deferred =
                deferredDeletes[mocks.embeddingDeleteGo.mock.calls.length - 1];

            return deferred?.promise ?? Promise.resolve();
        });

        const result = rebuildTransactionClassificationEmbeddings("ledger-1", {
            embedValues: async (values) => values.map(() => vector(1)),
        });

        await vi.waitFor(() =>
            expect(mocks.embeddingDelete).toHaveBeenCalledTimes(
                TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
            ),
        );
        expect(mocks.embeddingDelete).not.toHaveBeenCalledWith({
            embeddingId: "transaction:deleted-10",
            ledgerId: "ledger-1",
        });

        for (const deferred of deferredDeletes.slice(
            0,
            TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
        )) {
            deferred.resolve();
        }

        await vi.waitFor(() =>
            expect(mocks.embeddingDelete).toHaveBeenCalledTimes(11),
        );
        deferredDeletes[10]?.resolve();

        await expect(result).resolves.toMatchObject({
            deletedOrphanCount: 11,
            sourceCount: 0,
        });
    });

    it("rejects rebuild when a chunked DynamoDB write rejects", async () => {
        const sources = Array.from({ length: 11 }, (_, index) =>
            makeEmbeddingSource(index),
        );
        const deferredWrites = sources.map(() => createDeferred());

        mocks.embeddingPutGo.mockImplementation(() => {
            const deferred = deferredWrites[mocks.embeddingPutGo.mock.calls.length - 1];

            return deferred?.promise ?? Promise.resolve();
        });

        const result = ensureTransactionClassificationEmbeddings(
            {
                existingRecords: [],
                ledgerId: "ledger-1",
                sources,
            },
            {
                embedValues: async (values) =>
                    values.map((_, index) => vector(index + 1)),
            },
        );
        const observedError = result.catch((error: unknown) => error);

        await vi.waitFor(() =>
            expect(mocks.embeddingPut).toHaveBeenCalledTimes(
                TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
            ),
        );

        deferredWrites[0]?.reject(new Error("DynamoDB throttled"));
        for (const deferred of deferredWrites.slice(
            1,
            TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
        )) {
            deferred.resolve();
        }

        await expect(observedError).resolves.toMatchObject({
            message: "DynamoDB throttled",
        });
        expect(mocks.embeddingPut).toHaveBeenCalledTimes(
            TRANSACTION_CLASSIFICATION_EMBEDDING_WRITE_CONCURRENCY,
        );
    });
});
