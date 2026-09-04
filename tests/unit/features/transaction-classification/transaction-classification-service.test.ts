// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
    accountsGo: vi.fn(),
    categoriesGo: vi.fn(),
    embeddingsGo: vi.fn(),
    embeddingsPut: vi.fn(),
    embeddingsPutGo: vi.fn(),
    getTransactionWithPostings: vi.fn(),
    interactionPut: vi.fn(),
    interactionPutGo: vi.fn(),
    listTransactionsWithPostings: vi.fn(),
    plaidSyncsGo: vi.fn(),
    plaidSyncsByTransactionGo: vi.fn(),
    settingsGet: vi.fn(),
    settingsGetGo: vi.fn(),
    settingsPut: vi.fn(),
    settingsPutGo: vi.fn(),
    sourcesGo: vi.fn(),
    templateGet: vi.fn(),
    templateGetGo: vi.fn(),
    templatesGo: vi.fn(),
    upsertTransactionWithWorkspaceChanges: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: {
                query: {
                    byAccount: () => ({ go: mocks.accountsGo }),
                },
            },
            budgetCategories: {
                query: {
                    byCategory: () => ({ go: mocks.categoriesGo }),
                },
            },
            plaidTransactionSyncs: {
                query: {
                    bySync: () => ({ go: mocks.plaidSyncsGo }),
                    byTransaction: () => ({
                        go: mocks.plaidSyncsByTransactionGo,
                    }),
                },
            },
            transactionClassificationEmbeddings: {
                put: mocks.embeddingsPut,
                query: {
                    byEmbedding: () => ({ go: mocks.embeddingsGo }),
                },
            },
            transactionClassificationInteractions: {
                put: mocks.interactionPut,
            },
            transactionClassificationSettings: {
                get: mocks.settingsGet,
                put: mocks.settingsPut,
                query: {
                    bySettings: () => ({ go: vi.fn() }),
                },
            },
            transactionClassificationSources: {
                query: {
                    bySource: () => ({ go: mocks.sourcesGo }),
                },
            },
            transactionTemplates: {
                get: mocks.templateGet,
                query: {
                    byTemplate: () => ({ go: mocks.templatesGo }),
                },
            },
        },
    }),
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    getTransactionWithPostings: mocks.getTransactionWithPostings,
    listTransactionsWithPostings: mocks.listTransactionsWithPostings,
}));

vi.mock("@/features/transactions/server/transaction-save-service", () => ({
    upsertTransactionWithWorkspaceChanges:
        mocks.upsertTransactionWithWorkspaceChanges,
}));

import {
    aiClassificationOutputSchema,
    applyTransactionClassificationSuggestions,
    generateTransactionClassificationDebugRun,
    generateTransactionClassificationSuggestions,
} from "@/features/transaction-classification/server/transaction-classification-service";
import {
    buildTransactionClassificationEmbeddingText,
    createEmbeddingTextHash,
    TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS,
    TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID,
} from "@/features/transaction-classification/server/transaction-classification-embedding-service";

const account = {
    accountId: "checking",
    accountType: "checking" as const,
    ledgerAccountId: "acct_checking",
    name: "Checking",
};

const groceries = {
    categoryId: "groceries",
    defaultAssignedCents: 0,
    groupId: "daily",
    isIncomeCategory: false,
    ledgerAccountId: "cat_groceries",
    name: "Groceries",
    sortOrder: 1,
    status: "active" as const,
};

const utilities = {
    categoryId: "utilities",
    defaultAssignedCents: 0,
    groupId: "daily",
    isIncomeCategory: false,
    ledgerAccountId: "cat_utilities",
    name: "Utilities",
    sortOrder: 2,
    status: "active" as const,
};

const income = {
    categoryId: "income",
    defaultAssignedCents: 0,
    groupId: "income-group",
    isIncomeCategory: true,
    ledgerAccountId: "cat_income",
    name: "Income",
    sortOrder: 3,
    status: "active" as const,
};

function makeTransaction(overrides = {}) {
    return {
        displayAmountCents: -4_200,
        enteredAt: "2026-07-01T00:00:00.000Z",
        kind: "standard" as const,
        ledgerId: "ledger-1",
        lines: [
            {
                amountCents: 4_200,
                createdAt: "2026-07-01T00:00:00.000Z",
                fromAccountId: "checking",
                lineId: "line-1",
                ledgerId: "ledger-1",
                sortOrder: 0,
                transactionId: "transaction-1",
                updatedAt: "2026-07-01T00:00:00.000Z",
            },
        ],
        memo: "Weekly food",
        occurredAt: "2026-07-01T00:00:00.000Z",
        payee: "Market",
        periodId: "2026-07",
        postings: [],
        referenceAccountId: "checking",
        status: "entered" as const,
        transactionId: "transaction-1",
        updatedAt: "2026-07-01T00:00:00.000Z",
        ...overrides,
    };
}

function encodeTestVector(vector: number[]) {
    return Buffer.from(new Float32Array(vector).buffer).toString("base64");
}

function makeEmbeddingRecord(input: {
    sourceId: string;
    sourceType?: "transaction" | "transactionTemplate";
    sourceUpdatedAt: string;
    text: string;
    vector: number[];
}) {
    const sourceType = input.sourceType ?? "transaction";

    return {
        createdAt: "2026-07-01T00:00:00.000Z",
        dimensions: TRANSACTION_CLASSIFICATION_EMBEDDING_DIMENSIONS,
        embeddingId: `${sourceType}:${input.sourceId}`,
        embeddingTextHash: createEmbeddingTextHash(input.text),
        ledgerId: "ledger-1",
        modelId: TRANSACTION_CLASSIFICATION_EMBEDDING_MODEL_ID,
        sourceId: input.sourceId,
        sourceType,
        sourceUpdatedAt: input.sourceUpdatedAt,
        updatedAt: "2026-07-01T00:00:00.000Z",
        vectorBase64: encodeTestVector(input.vector),
    };
}

function makeSourceRecord(
    transaction: ReturnType<typeof makeTransaction>,
    plaid: {
        categoryText?: string;
        merchantName?: string;
        name?: string;
        originalDescription?: string;
        personalFinanceCategoryDetailed?: string;
        personalFinanceCategoryPrimary?: string;
    } = {},
) {
    const normalize = (value?: string) =>
        value
            ?.toLocaleLowerCase()
            .replaceAll(/[^a-z0-9]+/g, " ")
            .trim() || undefined;

    return {
        accountId: transaction.referenceAccountId,
        amountCents: transaction.displayAmountCents,
        categoryAssignmentsJson: JSON.stringify(
            transaction.lines.flatMap((line) => {
                const categoryId =
                    "categoryId" in line ? line.categoryId : undefined;

                return categoryId
                    ? [
                          {
                              amountCents: line.amountCents,
                              categoryId,
                          },
                      ]
                    : [];
            }),
        ),
        createdAt: transaction.updatedAt,
        hasMemo: Boolean(transaction.memo?.trim()),
        indexVersion: "2",
        ledgerId: transaction.ledgerId,
        memo: transaction.memo,
        normalizedPayee: normalize(transaction.payee),
        normalizedPlaidCategoryText: normalize(plaid.categoryText),
        normalizedPlaidMerchantName: normalize(plaid.merchantName),
        normalizedPlaidName: normalize(plaid.name),
        normalizedPlaidOriginalDescription: normalize(
            plaid.originalDescription,
        ),
        normalizedPlaidPfcDetailed: normalize(
            plaid.personalFinanceCategoryDetailed,
        ),
        normalizedPlaidPfcPrimary: normalize(
            plaid.personalFinanceCategoryPrimary,
        ),
        occurredAt: transaction.occurredAt,
        payee: transaction.payee,
        plaidCategoryText: plaid.categoryText,
        plaidMerchantName: plaid.merchantName,
        plaidName: plaid.name,
        plaidOriginalDescription: plaid.originalDescription,
        plaidPfcDetailed: plaid.personalFinanceCategoryDetailed,
        plaidPfcPrimary: plaid.personalFinanceCategoryPrimary,
        sourceUpdatedAt: transaction.updatedAt,
        transactionId: transaction.transactionId,
        updatedAt: transaction.updatedAt,
    };
}

function makeClassifiedHistory(input: {
    amountCents?: number;
    categoryId: string;
    memo?: string;
    occurredAt: string;
    payee?: string;
    transactionId: string;
}) {
    const amountCents = input.amountCents ?? -4_200;

    return makeTransaction({
        displayAmountCents: amountCents,
        lines: [
            {
                amountCents: Math.abs(amountCents),
                categoryId: input.categoryId,
                createdAt: input.occurredAt,
                fromAccountId: "checking",
                lineId: `${input.transactionId}-line`,
                ledgerId: "ledger-1",
                sortOrder: 0,
                transactionId: input.transactionId,
                updatedAt: input.occurredAt,
            },
        ],
        memo: input.memo ?? "",
        occurredAt: input.occurredAt,
        payee: input.payee ?? "Market",
        transactionId: input.transactionId,
        updatedAt: input.occurredAt,
    });
}

function configureSemanticHistory(input: {
    histories: Array<ReturnType<typeof makeTransaction>>;
    similarity?: number;
}) {
    const similarity = input.similarity ?? 0.7;

    mocks.sourcesGo.mockResolvedValue({
        data: input.histories.map((history) => makeSourceRecord(history)),
    });
    mocks.embeddingsGo.mockResolvedValue({
        data: input.histories.map((history) =>
            makeEmbeddingRecord({
                sourceId: history.transactionId,
                sourceUpdatedAt: history.updatedAt,
                text: buildTransactionClassificationEmbeddingText({
                    memo: history.memo,
                    payee: history.payee,
                }),
                vector: [similarity, Math.sqrt(1 - similarity * similarity)],
            }),
        ),
    });
}

describe("transaction classification service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.accountsGo.mockResolvedValue({ data: [account] });
        mocks.categoriesGo.mockResolvedValue({ data: [groceries] });
        mocks.embeddingsGo.mockResolvedValue({ data: [] });
        mocks.embeddingsPut.mockReturnValue({ go: mocks.embeddingsPutGo });
        mocks.embeddingsPutGo.mockResolvedValue({});
        mocks.getTransactionWithPostings.mockImplementation(
            async (_ledgerId: string, transactionId: string) =>
                makeTransaction({ transactionId }),
        );
        mocks.interactionPut.mockReturnValue({ go: mocks.interactionPutGo });
        mocks.interactionPutGo.mockResolvedValue({});
        mocks.plaidSyncsByTransactionGo.mockResolvedValue({ data: [] });
        mocks.plaidSyncsGo.mockResolvedValue({ data: [] });
        mocks.settingsGet.mockReturnValue({ go: mocks.settingsGetGo });
        mocks.settingsGetGo.mockResolvedValue({ data: null });
        mocks.settingsPut.mockReturnValue({ go: mocks.settingsPutGo });
        mocks.settingsPutGo.mockResolvedValue({});
        mocks.sourcesGo.mockResolvedValue({ data: [] });
        mocks.templateGet.mockReturnValue({ go: mocks.templateGetGo });
        mocks.templateGetGo.mockResolvedValue({ data: null });
        mocks.templatesGo.mockResolvedValue({ data: [] });
        mocks.upsertTransactionWithWorkspaceChanges.mockResolvedValue({
            transaction: makeTransaction(),
            workspaceChanges: [
                {
                    entityId: "transaction-1",
                    entityType: "transaction",
                    operation: "upsert",
                    record: { transactionId: "transaction-1" },
                },
            ],
        });
    });

    it("uses an OpenAI-compatible required nullable response schema", () => {
        const schema = z.toJSONSchema(aiClassificationOutputSchema) as unknown as {
            properties: {
                suggestions: {
                    items: {
                        properties: Record<string, unknown>;
                        required: string[];
                    };
                };
            };
        };
        const suggestionSchema = schema.properties.suggestions.items;

        expect(suggestionSchema.required.sort()).toEqual(
            Object.keys(suggestionSchema.properties).sort(),
        );
        expect(suggestionSchema.required).toEqual(
            expect.arrayContaining([
                "confidence",
                "lineAssignments",
                "reason",
                "suggestedMemo",
                "suggestedPayee",
                "transactionId",
                "type",
            ]),
        );
        const suggestedMemoSchema = suggestionSchema.properties.suggestedMemo as {
            anyOf?: Array<{ type?: string }>;
            type?: string | string[];
        };
        const suggestedMemoAllowsNull =
            suggestedMemoSchema.anyOf?.some(
                (option) => option.type === "null",
            ) ||
            (Array.isArray(suggestedMemoSchema.type) &&
                suggestedMemoSchema.type.includes("null"));

        expect(suggestedMemoAllowsNull).toBe(true);
        expect(suggestionSchema.properties).not.toHaveProperty("templateId");
    });

    it("runs debug classification from targeted transactions and embedding matches", async () => {
        const target = makeTransaction({
            memo: "Weekly food",
            payee: "Fresh Market",
            transactionId: "transaction-1",
        });
        const matchedHistory = makeTransaction({
            lines: [
                {
                    amountCents: 4_200,
                    categoryId: "groceries",
                    createdAt: "2026-06-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "history-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "history-1",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
            memo: "Weekly food",
            occurredAt: "2026-06-01T00:00:00.000Z",
            payee: "Fresh Market",
            transactionId: "history-1",
            updatedAt: "2026-06-01T00:00:00.000Z",
        });
        const unrelatedHistory = makeTransaction({
            lines: [
                {
                    amountCents: 9_900,
                    categoryId: "utilities",
                    createdAt: "2026-06-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "unrelated-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "unrelated-1",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
            memo: "Power bill",
            payee: "Utility Co",
            transactionId: "unrelated-1",
        });
        const targetText = buildTransactionClassificationEmbeddingText({
            memo: target.memo,
            payee: target.payee,
        });
        const matchedText = buildTransactionClassificationEmbeddingText({
            memo: matchedHistory.memo,
            payee: matchedHistory.payee,
        });
        const unrelatedText = buildTransactionClassificationEmbeddingText({
            memo: unrelatedHistory.memo,
            payee: unrelatedHistory.payee,
        });

        mocks.categoriesGo.mockResolvedValue({ data: [groceries, utilities] });
        mocks.getTransactionWithPostings.mockImplementation(
            async (_ledgerId: string, transactionId: string) => {
                if (transactionId === "transaction-1") {
                    return target;
                }

                if (transactionId === "history-1") {
                    return matchedHistory;
                }

                if (transactionId === "unrelated-1") {
                    return unrelatedHistory;
                }

                throw new Error(`Unexpected transaction ${transactionId}`);
            },
        );
        mocks.embeddingsGo.mockResolvedValue({
            data: [
                makeEmbeddingRecord({
                    sourceId: "transaction-1",
                    sourceUpdatedAt: target.updatedAt,
                    text: targetText,
                    vector: [1, 0],
                }),
                makeEmbeddingRecord({
                    sourceId: "history-1",
                    sourceUpdatedAt: matchedHistory.updatedAt,
                    text: matchedText,
                    vector: [1, 0],
                }),
                makeEmbeddingRecord({
                    sourceId: "unrelated-1",
                    sourceUpdatedAt: unrelatedHistory.updatedAt,
                    text: unrelatedText,
                    vector: [0, 1],
                }),
            ],
        });
        mocks.sourcesGo.mockResolvedValue({
            data: [
                makeSourceRecord(matchedHistory),
                makeSourceRecord(unrelatedHistory),
            ],
        });

        const result = await generateTransactionClassificationDebugRun(
            "ledger-1",
            {
                transactionIds: ["transaction-1"],
            },
        );

        expect(mocks.listTransactionsWithPostings).not.toHaveBeenCalled();
        expect(mocks.embeddingsGo).toHaveBeenCalledTimes(1);
        expect(mocks.getTransactionWithPostings).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
        expect(mocks.getTransactionWithPostings).not.toHaveBeenCalledWith(
            "ledger-1",
            "unrelated-1",
        );
        expect(result).toMatchObject({
            eligibleCount: 1,
            llmInteraction: null,
            results: [
                {
                    chosenCategories: [
                        {
                            categoryId: "groceries",
                            lineId: "line-1",
                            name: "Groceries",
                        },
                    ],
                    matchingPath: expect.arrayContaining([
                        expect.stringContaining("Local semantic gate passed"),
                    ]),
                    matches: [
                        expect.objectContaining({
                            categories: [
                                expect.objectContaining({
                                    categoryId: "groceries",
                                    name: "Groceries",
                                }),
                            ],
                            exampleId: "example:history-1",
                            matchingEvidence: expect.arrayContaining([
                                expect.stringContaining("exact fingerprint"),
                            ]),
                        }),
                    ],
                    outcome: "local",
                    suggestion: {
                        lineAssignments: [
                            {
                                categoryId: "groceries",
                                lineId: "line-1",
                            },
                        ],
                        type: "category",
                    },
                    transactionId: "transaction-1",
                },
            ],
        });
        expect(result.results[0]?.explanations).toEqual(
            expect.arrayContaining([
                expect.stringContaining("example:history-1"),
            ]),
        );
    });

    it("reranks a wider debug embedding pool so exact amount can beat newer same-text matches", async () => {
        const target = makeTransaction({
            displayAmountCents: -30_000,
            lines: [
                {
                    amountCents: 30_000,
                    createdAt: "2026-07-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "line-1",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
            memo: "Wellness",
            occurredAt: "2026-07-15T00:00:00.000Z",
            payee: "Chelsea Laine Wellness",
            transactionId: "transaction-1",
            updatedAt: "2026-07-15T00:00:00.000Z",
        });
        const exactAmountHistory = makeTransaction({
            displayAmountCents: -30_000,
            lines: [
                {
                    amountCents: 30_000,
                    categoryId: "groceries",
                    createdAt: "2026-06-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "exact-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "exact-300",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
            memo: "Wellness",
            occurredAt: "2026-06-01T00:00:00.000Z",
            payee: "Chelsea Laine Wellness",
            transactionId: "exact-300",
            updatedAt: "2026-06-01T00:00:00.000Z",
        });
        const newerDifferentAmountHistory = Array.from(
            { length: 4 },
            (_, index) =>
                makeTransaction({
                    displayAmountCents: -40_000,
                    lines: [
                        {
                            amountCents: 40_000,
                            categoryId: "utilities",
                            createdAt: `2026-07-0${index + 1}T00:00:00.000Z`,
                            fromAccountId: "checking",
                            lineId: `different-line-${index + 1}`,
                            ledgerId: "ledger-1",
                            sortOrder: 0,
                            transactionId: `different-400-${index + 1}`,
                            updatedAt: `2026-07-0${index + 1}T00:00:00.000Z`,
                        },
                    ],
                    memo: "Wellness",
                    occurredAt: `2026-07-0${index + 1}T00:00:00.000Z`,
                    payee: "Chelsea Laine Wellness",
                    transactionId: `different-400-${index + 1}`,
                    updatedAt: `2026-07-0${index + 1}T00:00:00.000Z`,
                }),
        );
        const embeddingText = buildTransactionClassificationEmbeddingText({
            memo: target.memo,
            payee: target.payee,
        });
        const transactionsById = new Map(
            [target, exactAmountHistory, ...newerDifferentAmountHistory].map(
                (transaction) => [transaction.transactionId, transaction],
            ),
        );

        mocks.categoriesGo.mockResolvedValue({ data: [groceries, utilities] });
        mocks.getTransactionWithPostings.mockImplementation(
            async (_ledgerId: string, transactionId: string) => {
                const transaction = transactionsById.get(transactionId);

                if (!transaction) {
                    throw new Error(`Unexpected transaction ${transactionId}`);
                }

                return transaction;
            },
        );
        mocks.embeddingsGo.mockResolvedValue({
            data: [
                makeEmbeddingRecord({
                    sourceId: "transaction-1",
                    sourceUpdatedAt: target.updatedAt,
                    text: embeddingText,
                    vector: [1, 0],
                }),
                ...newerDifferentAmountHistory.map((transaction) =>
                    makeEmbeddingRecord({
                        sourceId: transaction.transactionId,
                        sourceUpdatedAt: transaction.updatedAt,
                        text: embeddingText,
                        vector: [1, 0],
                    }),
                ),
                makeEmbeddingRecord({
                    sourceId: "exact-300",
                    sourceUpdatedAt: exactAmountHistory.updatedAt,
                    text: embeddingText,
                    vector: [1, 0],
                }),
            ],
        });
        mocks.sourcesGo.mockResolvedValue({
            data: [
                makeSourceRecord(exactAmountHistory),
                ...newerDifferentAmountHistory.map((transaction) =>
                    makeSourceRecord(transaction),
                ),
            ],
        });

        const result = await generateTransactionClassificationDebugRun(
            "ledger-1",
            {
                transactionIds: ["transaction-1"],
            },
        );

        expect(result.results[0]).toMatchObject({
            outcome: "local",
            suggestion: {
                lineAssignments: [
                    {
                        categoryId: "groceries",
                        lineId: "line-1",
                    },
                ],
                type: "category",
            },
        });
        expect(result.results[0]?.explanations).toEqual(
            expect.arrayContaining([
                expect.stringContaining("example:exact-300"),
            ]),
        );
    });

    it("classifies eligible unclassified transaction lines", async () => {
        const target = makeTransaction();
        const history = makeTransaction({
                displayAmountCents: -8_400,
                lines: [
                    {
                        amountCents: 8_400,
                        categoryId: "groceries",
                        createdAt: "2026-06-01T00:00:00.000Z",
                        fromAccountId: "checking",
                        lineId: "history-line",
                        ledgerId: "ledger-1",
                        sortOrder: 0,
                        transactionId: "history-1",
                        updatedAt: "2026-06-01T00:00:00.000Z",
                    },
                ],
                payee: "Market Nearby",
                transactionId: "history-1",
            });
        mocks.listTransactionsWithPostings.mockResolvedValue([
            target,
            history,
            makeTransaction({
                kind: "adjustment",
                transactionId: "adjustment-1",
            }),
        ]);
        configureSemanticHistory({ histories: [history] });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            {
                embedValues: async () => [[1, 0]],
                generateModelSuggestions: async () => [
                    {
                        confidence: 0.86,
                        lineAssignments: [
                            {
                                categoryId: "groceries",
                                lineId: "line-1",
                            },
                        ],
                        reason: "Past market transactions use groceries.",
                        transactionId: "transaction-1",
                        type: "category",
                    },
                ],
            },
        );

        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0]).toMatchObject({
            confidence: 0.86,
            lineAssignments: [
                {
                    categoryId: "groceries",
                    lineId: "line-1",
                },
            ],
            transactionId: "transaction-1",
            type: "category",
        });
    });

    it("resolves a saved GPT-5 mini setting to Luna for model suggestions", async () => {
        const previousOpenAiApiKey = process.env.OPENAI_API_KEY;

        process.env.OPENAI_API_KEY = "test-openai-key";
        mocks.settingsGetGo.mockResolvedValue({
            data: {
                createdAt: "2026-07-01T00:00:00.000Z",
                ledgerId: "ledger-1",
                modelId: "gpt-5-mini",
                settingsId: "default",
                updatedAt: "2026-07-01T00:00:00.000Z",
            },
        });
        mocks.listTransactionsWithPostings.mockResolvedValue([
            makeTransaction({ memo: "Groceries", payee: "Market" }),
            makeTransaction({
                lines: [
                    {
                        amountCents: 8_400,
                        categoryId: "groceries",
                        fromAccountId: "checking",
                        lineId: "history-line",
                        ledgerId: "ledger-1",
                        sortOrder: 0,
                        transactionId: "history-1",
                    },
                ],
                memo: "Market food",
                payee: "Market Nearby",
                transactionId: "history-1",
            }),
        ]);
        configureSemanticHistory({
            histories: [
                makeTransaction({
                    lines: [
                        {
                            amountCents: 8_400,
                            categoryId: "groceries",
                            fromAccountId: "checking",
                            lineId: "history-line",
                            ledgerId: "ledger-1",
                            sortOrder: 0,
                            transactionId: "history-1",
                        },
                    ],
                    memo: "Market food",
                    payee: "Market Nearby",
                    transactionId: "history-1",
                }),
            ],
        });
        const generateModelSuggestions = vi.fn().mockResolvedValue([
            {
                confidence: 0.84,
                lineAssignments: [
                    {
                        categoryId: "groceries",
                        lineId: "line-1",
                    },
                ],
                reason: "Past market transactions use groceries.",
                transactionId: "transaction-1",
                type: "category",
            },
        ]);

        try {
            const result = await generateTransactionClassificationSuggestions(
                "ledger-1",
                {},
                {
                    embedValues: async () => [[1, 0]],
                    generateModelSuggestions,
                },
            );

            expect(result.modelId).toBe("gpt-5.6-luna");
            expect(generateModelSuggestions).toHaveBeenCalledWith(
                expect.objectContaining({
                    ledgerId: "ledger-1",
                    modelId: "gpt-5.6-luna",
                }),
            );
        } finally {
            if (previousOpenAiApiKey === undefined) {
                delete process.env.OPENAI_API_KEY;
            } else {
                process.env.OPENAI_API_KEY = previousOpenAiApiKey;
            }
        }
    });

    it("returns a service-unavailable error when Google AI is unavailable", async () => {
        const retryError = Object.assign(new Error("Failed after 3 attempts."), {
            lastError: {
                requestBodyValues: {
                    contents: [
                        {
                            parts: [{ text: "compact prompt body" }],
                            role: "user",
                        },
                    ],
                    systemInstruction: {
                        parts: [{ text: "system prompt body" }],
                    },
                },
                responseBody: JSON.stringify({
                    error: {
                        message:
                            "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
                    },
                }),
                statusCode: 503,
            },
        });
        const responseBody = retryError.lastError.responseBody;

        const target = makeTransaction();
        const history = makeTransaction({
                displayAmountCents: -8_400,
                lines: [
                    {
                        amountCents: 8_400,
                        categoryId: "groceries",
                        createdAt: "2026-06-01T00:00:00.000Z",
                        fromAccountId: "checking",
                        lineId: "history-line",
                        ledgerId: "ledger-1",
                        sortOrder: 0,
                        transactionId: "history-1",
                        updatedAt: "2026-06-01T00:00:00.000Z",
                    },
                ],
                payee: "Market Nearby",
                transactionId: "history-1",
            });
        mocks.listTransactionsWithPostings.mockResolvedValue([target, history]);
        configureSemanticHistory({ histories: [history] });

        await expect(
            generateTransactionClassificationSuggestions("ledger-1", {}, {
                embedValues: async () => [[1, 0]],
                generateModelSuggestions: async () => {
                    throw retryError;
                },
            }),
        ).rejects.toMatchObject({
            code: "google_ai_unavailable",
            message:
                "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
            status: 503,
        });
        expect(mocks.interactionPut).toHaveBeenCalledWith(
            expect.objectContaining({
                ledgerId: "ledger-1",
                modelId: "gemini-3.5-flash",
                requestText: expect.stringContaining("compact prompt body"),
                responseText: responseBody,
            }),
        );
    });

    it("sends candidate categories without merchant summaries or raw history", async () => {
        mocks.categoriesGo.mockResolvedValue({ data: [groceries, utilities] });
        const target = makeTransaction({
            importActivities: [{
                activityId: "amazon:amazon-payment-1",
                createdAt: "2026-07-01T00:00:00.000Z",
                detailsJson: JSON.stringify({
                    itemSummary: "Samsill recycled green binder",
                    orderNumber: "112-0098580-0769836",
                    paymentKind: "charge",
                }),
                detailsVersion: 2,
                direction: "outflow",
                financialFingerprint: "amazon-payment-1",
                ledgerId: "ledger-1",
                occurredDate: "2026-07-01",
                provider: "amazon",
                providerAmountCents: -2_500,
                providerRecordId: "amazon-payment-1",
                state: "autoMatched",
                updatedAt: "2026-07-01T00:00:00.000Z",
            }],
            payee: "Market Shop",
        });
        const exactMarketHistory = makeTransaction({
            displayAmountCents: -8_000,
            lines: [
                {
                    amountCents: 8_000,
                    categoryId: "groceries",
                    createdAt: "2026-04-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "history-market-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "history-market",
                    updatedAt: "2026-04-01T00:00:00.000Z",
                },
            ],
            memo: "Market snacks",
            occurredAt: "2026-04-01T00:00:00.000Z",
            payee: "Market",
            transactionId: "history-market",
        });
        const unrelatedRecentHistory = makeTransaction({
            lines: [
                {
                    amountCents: 4_200,
                    categoryId: "groceries",
                    createdAt: "2026-06-30T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "history-gas-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "history-gas",
                    updatedAt: "2026-06-30T00:00:00.000Z",
                },
            ],
            memo: "Fuel",
            occurredAt: "2026-06-30T00:00:00.000Z",
            payee: "Gas Station",
            transactionId: "history-gas",
        });
        let prompt: string | undefined;
        let promptPayload: Record<string, unknown> | undefined;

        mocks.listTransactionsWithPostings.mockResolvedValue([
            target,
            exactMarketHistory,
            unrelatedRecentHistory,
        ]);
        configureSemanticHistory({ histories: [exactMarketHistory] });

        const embedValues = vi.fn(async () => [[1, 0]]);

        await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            {
                embedValues,
                generateModelSuggestions: async (input) => {
                    prompt = input.prompt;
                    promptPayload = JSON.parse(input.prompt) as Record<
                        string,
                        unknown
                    >;

                    return [
                        {
                            confidence: 0,
                            reason: "No confident match.",
                            transactionId: "transaction-1",
                            type: "noSuggestion",
                        },
                    ];
                },
            },
        );

        expect(prompt).not.toContain("\n");
        expect(promptPayload).toBeDefined();
        expect(promptPayload).not.toHaveProperty("history");
        expect(promptPayload).not.toHaveProperty("examples");
        expect(promptPayload).not.toHaveProperty("s");
        expect(promptPayload).toMatchObject({
            categories: [["groceries", "Groceries", 0]],
            context: [
                {
                    categoryIds: ["groceries"],
                    targetIds: ["transaction-1"],
                },
            ],
        });
        expect(promptPayload).not.toHaveProperty("feedback");
        expect(promptPayload?.targets).toEqual([
            expect.objectContaining({
                om: {
                    provider: "amazon",
                    itemSummary: "Samsill recycled green binder",
                },
                tid: "transaction-1",
            }),
        ]);
        expect(JSON.stringify(promptPayload)).not.toContain("amazon-payment-1");
        expect(JSON.stringify(promptPayload)).not.toContain(
            "112-0098580-0769836",
        );
        expect(JSON.stringify(promptPayload)).not.toContain("paymentKind");
        expect(embedValues).toHaveBeenCalledWith([
            expect.not.stringContaining("Samsill recycled green binder"),
        ]);
        expect(promptPayload?.matches).toEqual([
            expect.objectContaining({
                c: ["groceries"],
                id: "example:history-market",
                tid: "history-market",
            }),
        ]);
        expect(promptPayload).not.toHaveProperty("templates");
        expect(JSON.stringify(promptPayload)).not.toContain(
            "plaidPayloadJson",
        );
        expect(JSON.stringify(promptPayload)).not.toContain("postings");
    });

    it("pre-classifies exact history matches without a model call", async () => {
        const generateModelSuggestions = vi.fn();

        mocks.listTransactionsWithPostings.mockResolvedValue([
            makeTransaction(),
            makeTransaction({
                lines: [
                    {
                        amountCents: 4_200,
                        categoryId: "groceries",
                        createdAt: "2026-06-01T00:00:00.000Z",
                        fromAccountId: "checking",
                        lineId: "history-line",
                        ledgerId: "ledger-1",
                        sortOrder: 0,
                        transactionId: "history-1",
                        updatedAt: "2026-06-01T00:00:00.000Z",
                    },
                ],
                transactionId: "history-1",
            }),
        ]);

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            { generateModelSuggestions },
        );

        expect(generateModelSuggestions).not.toHaveBeenCalled();
        expect(result.suggestions).toEqual([
            expect.objectContaining({
                confidence: 0.98,
                lineAssignments: [
                    {
                        categoryId: "groceries",
                        lineId: "line-1",
                    },
                ],
                transactionId: "transaction-1",
                type: "category",
            }),
        ]);
    });

    it("uses memo evidence and amount to disambiguate deterministic matches with the same payee", async () => {
        const generateModelSuggestions = vi.fn();
        const target = makeTransaction({
            displayAmountCents: -9_900,
            memo: "July utility bill",
            payee: "City Utility",
        });
        const makeHistory = (input: {
            amountCents: number;
            categoryId: string;
            memo: string;
            transactionId: string;
        }) =>
            makeTransaction({
                displayAmountCents: -input.amountCents,
                lines: [
                    {
                        amountCents: input.amountCents,
                        categoryId: input.categoryId,
                        createdAt: "2026-06-01T00:00:00.000Z",
                        fromAccountId: "checking",
                        lineId: `${input.transactionId}-line`,
                        ledgerId: "ledger-1",
                        sortOrder: 0,
                        transactionId: input.transactionId,
                        updatedAt: "2026-06-01T00:00:00.000Z",
                    },
                ],
                memo: input.memo,
                payee: "City Utility",
                transactionId: input.transactionId,
            });

        const histories = [
            makeHistory({
                amountCents: 9_900,
                categoryId: "utilities",
                memo: "June utility bill",
                transactionId: "history-utilities-1",
            }),
            makeHistory({
                amountCents: 9_900,
                categoryId: "utilities",
                memo: "May utility bill",
                transactionId: "history-utilities-2",
            }),
            makeHistory({
                amountCents: 1_200,
                categoryId: "groceries",
                memo: "City market kiosk",
                transactionId: "history-groceries-1",
            }),
        ];

        mocks.categoriesGo.mockResolvedValue({
            data: [groceries, utilities],
        });
        mocks.listTransactionsWithPostings.mockResolvedValue([
            target,
            ...histories,
        ]);

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            { generateModelSuggestions },
        );

        expect(generateModelSuggestions).not.toHaveBeenCalled();
        expect(result.suggestions).toEqual([
            expect.objectContaining({
                confidence: 0.98,
                lineAssignments: [
                    {
                        categoryId: "utilities",
                        lineId: "line-1",
                    },
                ],
                transactionId: "transaction-1",
                type: "category",
            }),
        ]);
    });

    it("uses deterministic exact-payee and exact-amount matching when semantic evidence is unavailable", async () => {
        const generateModelSuggestions = vi.fn().mockResolvedValue([
            {
                confidence: 0,
                reason: "No confident match.",
                transactionId: "transaction-1",
                type: "noSuggestion" as const,
            },
        ]);
        const target = makeTransaction({
            displayAmountCents: -1_365,
            memo: "Organic broccoli seeds and sprouts",
            payee: "Amazon",
        });
        const unrelatedSameAmount = makeTransaction({
            displayAmountCents: -1_365,
            lines: [
                {
                    amountCents: 1_365,
                    categoryId: "utilities",
                    createdAt: "2026-06-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "history-cable-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "history-cable",
                    updatedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
            memo: "USB charging cable",
            payee: "Amazon",
            transactionId: "history-cable",
        });

        mocks.categoriesGo.mockResolvedValue({
            data: [groceries, utilities],
        });
        mocks.listTransactionsWithPostings.mockResolvedValue([
            target,
            unrelatedSameAmount,
        ]);

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            { generateModelSuggestions },
        );

        expect(generateModelSuggestions).not.toHaveBeenCalled();
        expect(result.suggestions).toEqual([
            expect.objectContaining({
                lineAssignments: [
                    {
                        categoryId: "utilities",
                        lineId: "line-1",
                    },
                ],
                transactionId: "transaction-1",
                type: "category",
            }),
        ]);
    });

    it("uses semantic embedding evidence before same-payee exact-amount ranking", async () => {
        const target = makeTransaction({
            displayAmountCents: -1_365,
            memo: "Organic broccoli seeds and sprouts",
            payee: "Amazon",
            transactionId: "transaction-1",
        });
        const semanticHistory = makeTransaction({
            displayAmountCents: -2_200,
            lines: [
                {
                    amountCents: 2_200,
                    categoryId: "groceries",
                    createdAt: "2026-06-15T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "history-seeds-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "history-seeds",
                    updatedAt: "2026-06-15T00:00:00.000Z",
                },
            ],
            memo: "Organic seeds sprouts starter kit",
            occurredAt: "2026-06-15T00:00:00.000Z",
            payee: "Amazon",
            transactionId: "history-seeds",
            updatedAt: "2026-06-15T00:00:00.000Z",
        });
        const unrelatedSameAmount = makeTransaction({
            displayAmountCents: -1_365,
            lines: [
                {
                    amountCents: 1_365,
                    categoryId: "utilities",
                    createdAt: "2026-07-01T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "history-cable-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "history-cable",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
            memo: "USB charging cable",
            occurredAt: "2026-07-01T00:00:00.000Z",
            payee: "Amazon",
            transactionId: "history-cable",
            updatedAt: "2026-07-01T00:00:00.000Z",
        });
        const targetText = buildTransactionClassificationEmbeddingText({
            memo: target.memo,
            payee: target.payee,
        });
        const semanticText = buildTransactionClassificationEmbeddingText({
            memo: semanticHistory.memo,
            payee: semanticHistory.payee,
        });
        const unrelatedText = buildTransactionClassificationEmbeddingText({
            memo: unrelatedSameAmount.memo,
            payee: unrelatedSameAmount.payee,
        });
        const transactionsById = new Map(
            [target, semanticHistory, unrelatedSameAmount].map((transaction) => [
                transaction.transactionId,
                transaction,
            ]),
        );

        mocks.categoriesGo.mockResolvedValue({
            data: [groceries, utilities],
        });
        mocks.getTransactionWithPostings.mockImplementation(
            async (_ledgerId: string, transactionId: string) => {
                const transaction = transactionsById.get(transactionId);

                if (!transaction) {
                    throw new Error(`Unexpected transaction ${transactionId}`);
                }

                return transaction;
            },
        );
        mocks.embeddingsGo.mockResolvedValue({
            data: [
                makeEmbeddingRecord({
                    sourceId: "transaction-1",
                    sourceUpdatedAt: target.updatedAt,
                    text: targetText,
                    vector: [1, 0],
                }),
                makeEmbeddingRecord({
                    sourceId: "history-seeds",
                    sourceUpdatedAt: semanticHistory.updatedAt,
                    text: semanticText,
                    vector: [1, 0],
                }),
                makeEmbeddingRecord({
                    sourceId: "history-cable",
                    sourceUpdatedAt: unrelatedSameAmount.updatedAt,
                    text: unrelatedText,
                    vector: [0.75, 0.7],
                }),
            ],
        });
        mocks.sourcesGo.mockResolvedValue({
            data: [
                makeSourceRecord(semanticHistory),
                makeSourceRecord(unrelatedSameAmount),
            ],
        });

        const result = await generateTransactionClassificationDebugRun(
            "ledger-1",
            {
                transactionIds: ["transaction-1"],
            },
        );

        expect(result.results[0]).toMatchObject({
            outcome: "local",
            suggestion: {
                lineAssignments: [
                    {
                        categoryId: "groceries",
                        lineId: "line-1",
                    },
                ],
                type: "category",
            },
        });
        expect(result.results[0]?.explanations).toEqual(
            expect.arrayContaining([
                expect.stringContaining("example:history-seeds"),
            ]),
        );
    });

    it("sends moderate semantic embedding matches to the LLM without adding payee-only category fallbacks", async () => {
        const amazonVisa = {
            categoryId: "amazon-visa",
            defaultAssignedCents: 0,
            groupId: "daily",
            isIncomeCategory: false,
            ledgerAccountId: "cat_amazon_visa",
            name: "Amazon Visa",
            sortOrder: 3,
            status: "active" as const,
        };
        const target = makeTransaction({
            displayAmountCents: -1_970,
            memo: "Seedboy Organic Non-GMO Broccoli Seeds for Sprouting",
            payee: "Amazon",
            transactionId: "transaction-1",
        });
        const seedHistory = makeTransaction({
            displayAmountCents: -1_449,
            lines: [
                {
                    amountCents: 1_449,
                    categoryId: "groceries",
                    createdAt: "2026-06-15T00:00:00.000Z",
                    fromAccountId: "checking",
                    lineId: "history-seeds-line",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "history-seeds",
                    updatedAt: "2026-06-15T00:00:00.000Z",
                },
            ],
            memo: "Go Raw Organic Sprouted Pumpkin Seeds",
            occurredAt: "2026-06-15T00:00:00.000Z",
            payee: "Amazon",
            transactionId: "history-seeds",
            updatedAt: "2026-06-15T00:00:00.000Z",
        });
        const targetText = buildTransactionClassificationEmbeddingText({
            memo: target.memo,
            payee: target.payee,
        });
        const seedText = buildTransactionClassificationEmbeddingText({
            memo: seedHistory.memo,
            payee: seedHistory.payee,
        });
        const transactionsById = new Map(
            [target, seedHistory].map((transaction) => [
                transaction.transactionId,
                transaction,
            ]),
        );

        mocks.categoriesGo.mockResolvedValue({
            data: [groceries, utilities, amazonVisa],
        });
        mocks.plaidSyncsByTransactionGo.mockResolvedValue({
            data: [
                {
                    categoryText:
                        "GENERAL_MERCHANDISE / GENERAL_MERCHANDISE_ONLINE_MARKETPLACES",
                    ledgerId: "ledger-1",
                    merchantName: "Amazon",
                    name: "Amazon",
                    originalDescription: "Amazon",
                    personalFinanceCategoryDetailed:
                        "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES",
                    personalFinanceCategoryPrimary: "GENERAL_MERCHANDISE",
                    plaidTransactionId: "plaid-transaction-1",
                    status: "active",
                    transactionId: "transaction-1",
                },
            ],
        });
        mocks.getTransactionWithPostings.mockImplementation(
            async (_ledgerId: string, transactionId: string) => {
                const transaction = transactionsById.get(transactionId);

                if (!transaction) {
                    throw new Error(`Unexpected transaction ${transactionId}`);
                }

                return transaction;
            },
        );
        mocks.embeddingsGo.mockResolvedValue({
            data: [
                makeEmbeddingRecord({
                    sourceId: "transaction-1",
                    sourceUpdatedAt: target.updatedAt,
                    text: targetText,
                    vector: [1, 0],
                }),
                makeEmbeddingRecord({
                    sourceId: "history-seeds",
                    sourceUpdatedAt: seedHistory.updatedAt,
                    text: seedText,
                    vector: [0.69, 0.724],
                }),
            ],
        });
        mocks.sourcesGo.mockResolvedValue({
            data: [makeSourceRecord(seedHistory)],
        });

        const result = await generateTransactionClassificationDebugRun(
            "ledger-1",
            {
                transactionIds: ["transaction-1"],
            },
            { allowModelCall: false, deps: { embedValues: async () => [[1, 0]] } },
        );

        expect(result.results[0]).toMatchObject({
            candidateCategories: [
                {
                    categoryId: "groceries",
                    name: "Groceries",
                },
            ],
            matches: [
                expect.objectContaining({
                    categories: [
                        expect.objectContaining({
                            categoryId: "groceries",
                            name: "Groceries",
                        }),
                    ],
                    exampleId: "example:history-seeds",
                    matchingEvidence: expect.arrayContaining([
                        expect.stringContaining("semantic context embedding"),
                    ]),
                }),
            ],
            outcome: "llm",
        });
        expect(result.results[0]?.candidateCategories).not.toContainEqual(
            expect.objectContaining({ categoryId: "amazon-visa" }),
        );
    });

    it("falls back when strong semantic amount evidence points to conflicting categories", async () => {
        const generateModelSuggestions = vi.fn().mockResolvedValue([
            {
                confidence: 0,
                reason: "Conflicting prior categories.",
                transactionId: "transaction-1",
                type: "noSuggestion" as const,
            },
        ]);
        const target = makeTransaction({
            displayAmountCents: -30_000,
            memo: "July wellness visit",
            payee: "Chelsea Laine Wellness",
        });
        const makeHistory = (input: {
            categoryId: string;
            memo: string;
            occurredAt: string;
            transactionId: string;
        }) =>
            makeTransaction({
                displayAmountCents: -30_000,
                lines: [
                    {
                        amountCents: 30_000,
                        categoryId: input.categoryId,
                        createdAt: input.occurredAt,
                        fromAccountId: "checking",
                        lineId: `${input.transactionId}-line`,
                        ledgerId: "ledger-1",
                        sortOrder: 0,
                        transactionId: input.transactionId,
                        updatedAt: input.occurredAt,
                    },
                ],
                memo: input.memo,
                occurredAt: input.occurredAt,
                payee: "Chelsea Laine Wellness",
                transactionId: input.transactionId,
                updatedAt: input.occurredAt,
            });

        const histories = [
            makeHistory({
                categoryId: "groceries",
                memo: "June wellness visit",
                occurredAt: "2026-06-01T00:00:00.000Z",
                transactionId: "history-groceries-1",
            }),
            makeHistory({
                categoryId: "groceries",
                memo: "May wellness visit",
                occurredAt: "2026-05-01T00:00:00.000Z",
                transactionId: "history-groceries-2",
            }),
            makeHistory({
                categoryId: "utilities",
                memo: "April wellness visit",
                occurredAt: "2026-04-01T00:00:00.000Z",
                transactionId: "history-utilities-1",
            }),
        ];

        mocks.categoriesGo.mockResolvedValue({
            data: [groceries, utilities],
        });
        mocks.listTransactionsWithPostings.mockResolvedValue([
            target,
            ...histories,
        ]);
        configureSemanticHistory({ histories, similarity: 0.95 });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            {
                embedValues: async () => [[1, 0]],
                generateModelSuggestions,
            },
        );

        expect(generateModelSuggestions).toHaveBeenCalledTimes(1);
        expect(result.suggestions).toEqual([
            expect.objectContaining({
                transactionId: "transaction-1",
                type: "noSuggestion",
            }),
        ]);
    });

    it("calls the LLM fallback with all active categories when semantic matching has no context", async () => {
        const targets = Array.from({ length: 10 }, (_, targetIndex) =>
            makeTransaction({
                lines: [
                    {
                        amountCents: 4_200,
                        createdAt: "2026-07-01T00:00:00.000Z",
                        fromAccountId: "checking",
                        lineId: `target-${targetIndex}-line`,
                        ledgerId: "ledger-1",
                        sortOrder: 0,
                        transactionId: `target-${targetIndex}`,
                        updatedAt: "2026-07-01T00:00:00.000Z",
                    },
                ],
                memo: `VendorAlpha${targetIndex} purchase`,
                payee: `VendorAlpha${targetIndex} store`,
                transactionId: `target-${targetIndex}`,
            }),
        );
        const history = targets.flatMap((target, targetIndex) =>
            Array.from({ length: 4 }, (_, historyIndex) =>
                makeTransaction({
                    lines: [
                        {
                            amountCents: 4_200,
                            categoryId: "groceries",
                            createdAt: "2026-06-01T00:00:00.000Z",
                            fromAccountId: "checking",
                            lineId: `history-${targetIndex}-${historyIndex}-line`,
                            ledgerId: "ledger-1",
                            sortOrder: 0,
                            transactionId: `history-${targetIndex}-${historyIndex}`,
                            updatedAt: "2026-06-01T00:00:00.000Z",
                        },
                    ],
                    memo: target.memo,
                    occurredAt: `2026-06-${String(historyIndex + 1).padStart(
                        2,
                        "0",
                    )}T00:00:00.000Z`,
                    payee: `VendorAlpha${targetIndex} market ${historyIndex}`,
                    transactionId: `history-${targetIndex}-${historyIndex}`,
                }),
            ),
        );
        const generateModelSuggestions = vi.fn().mockResolvedValue([]);

        mocks.categoriesGo.mockResolvedValue({
            data: [groceries, utilities, income],
        });
        mocks.listTransactionsWithPostings.mockResolvedValue([
            ...targets,
            ...history,
        ]);

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            {
                generateModelSuggestions,
            },
        );

        expect(generateModelSuggestions).toHaveBeenCalledTimes(1);
        const prompt = JSON.parse(
            generateModelSuggestions.mock.calls[0][0].prompt,
        ) as {
            categories: Array<[string, string, number]>;
            context: Array<{
                categoryIds: string[];
                mode: string;
            }>;
        };

        expect(prompt.categories.map(([categoryId]) => categoryId)).toEqual([
            "groceries",
            "utilities",
            "income",
        ]);
        expect(prompt.context).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    categoryIds: ["groceries", "utilities", "income"],
                    mode: "fallback",
                }),
            ]),
        );
        expect(result.suggestions).toHaveLength(10);
        expect(
            result.suggestions.every(
                (suggestion) => suggestion.type === "noSuggestion",
            ),
        ).toBe(true);
    });

    it("adds distinct Plaid fields and category-diverse same-merchant history to fallback prompts", async () => {
        const target = makeTransaction({
            lines: [
                {
                    amountCents: 2_100,
                    fromAccountId: "checking",
                    lineId: "line-1",
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                },
                {
                    amountCents: 2_100,
                    fromAccountId: "checking",
                    lineId: "line-2",
                    ledgerId: "ledger-1",
                    sortOrder: 1,
                    transactionId: "transaction-1",
                },
            ],
            memo: "",
            payee: "Fresh Market",
            plaidTransactionSyncId: "plaid-target",
        });
        const groceryHistory = Array.from({ length: 9 }, (_, index) =>
            makeClassifiedHistory({
                categoryId: "groceries",
                occurredAt: `2026-07-${String(18 - index).padStart(2, "0")}T00:00:00.000Z`,
                payee: "Fresh Market",
                transactionId: `grocery-${index}`,
            }),
        );
        const utilityHistory = makeClassifiedHistory({
            categoryId: "utilities",
            occurredAt: "2026-05-01T00:00:00.000Z",
            payee: "Fresh Market",
            transactionId: "utility-history",
        });
        const histories = [...groceryHistory, utilityHistory];
        const unrelatedHistory = makeClassifiedHistory({
            categoryId: "utilities",
            occurredAt: "2026-07-19T00:00:00.000Z",
            payee: "Other Shop",
            transactionId: "unrelated-history",
        });
        const generateModelSuggestions = vi.fn().mockResolvedValue([]);

        mocks.categoriesGo.mockResolvedValue({ data: [groceries, utilities] });
        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.plaidSyncsGo.mockResolvedValue({
            data: [
                {
                    categoryText: "Food and Drink",
                    ledgerId: "ledger-1",
                    merchantName: "Fresh Market",
                    name: "fresh-market",
                    originalDescription: "SQ FRESH MARKET 123",
                    personalFinanceCategoryDetailed:
                        "FOOD_AND_DRINK_GROCERIES",
                    personalFinanceCategoryPrimary: "FOOD_AND_DRINK",
                    plaidTransactionSyncId: "plaid-target",
                    status: "active",
                    transactionId: "transaction-1",
                },
            ],
        });
        mocks.sourcesGo.mockResolvedValue({
            data: [
                ...histories.map((history) => {
                    const record = makeSourceRecord(history, {
                        merchantName: "Fresh Market",
                        originalDescription: "SQ FRESH MARKET STORE",
                    });

                    return history.transactionId === "utility-history"
                        ? {
                              ...record,
                              categoryAssignmentsJson: JSON.stringify([
                                  {
                                      amountCents: 2_100,
                                      categoryId: "groceries",
                                  },
                                  {
                                      amountCents: 2_100,
                                      categoryId: "utilities",
                                  },
                              ]),
                          }
                        : record;
                }),
                makeSourceRecord(unrelatedHistory, {
                    merchantName: "Other Shop",
                }),
            ],
        });

        await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            { generateModelSuggestions },
        );

        const prompt = JSON.parse(
            generateModelSuggestions.mock.calls[0][0].prompt,
        ) as {
            matches: Array<{
                a: number;
                c: string[];
                dt: string;
                id: string;
                pl?: Record<string, string>;
            }>;
            targets: Array<{ pl: Record<string, string> }>;
        };
        const targetPlaid = prompt.targets[0].pl;

        expect(targetPlaid).toEqual({
            c: "Food and Drink",
            d: "FOOD_AND_DRINK_GROCERIES",
            m: "Fresh Market",
            o: "SQ FRESH MARKET 123",
        });
        expect(prompt.matches).toHaveLength(8);
        expect(
            prompt.matches.some(
                (match) => match.id === "example:unrelated-history",
            ),
        ).toBe(false);
        expect(prompt.matches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    c: ["groceries", "utilities"],
                }),
            ]),
        );
        expect(prompt.matches[0]).toEqual(
            expect.objectContaining({
                a: -4_200,
                dt: expect.any(String),
                pl: expect.objectContaining({
                    m: "Fresh Market",
                    o: "SQ FRESH MARKET STORE",
                }),
            }),
        );
    });

    it("normalizes invalid fallback category assignments to noSuggestion", async () => {
        mocks.listTransactionsWithPostings.mockResolvedValue([
            makeTransaction({ memo: "", payee: "Unknown Vendor" }),
        ]);

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            {
                generateModelSuggestions: async () => [
                    {
                        confidence: 0.8,
                        lineAssignments: [
                            {
                                categoryId: "missing-category",
                                lineId: "line-1",
                            },
                        ],
                        reason: "Invalid test assignment.",
                        transactionId: "transaction-1",
                        type: "category",
                    },
                ],
            },
        );

        expect(result.suggestions[0]).toMatchObject({
            reason: expect.stringContaining("valid category"),
            type: "noSuggestion",
        });
    });

    it("classifies memo-less targets deterministically without embeddings or an LLM", async () => {
        const target = makeTransaction({ memo: "" });
        const history = makeClassifiedHistory({
            categoryId: "groceries",
            occurredAt: "2026-06-01T00:00:00.000Z",
            transactionId: "history-1",
        });
        const embedValues = vi.fn();
        const generateModelSuggestions = vi.fn();

        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.sourcesGo.mockResolvedValue({
            data: [makeSourceRecord(history)],
        });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            { embedValues, generateModelSuggestions },
        );

        expect(embedValues).not.toHaveBeenCalled();
        expect(generateModelSuggestions).not.toHaveBeenCalled();
        expect(result.suggestions[0]).toMatchObject({
            confidence: 0.98,
            lineAssignments: [{ categoryId: "groceries", lineId: "line-1" }],
            type: "category",
        });
    });

    it("skips semantic retrieval when only memo-less source transactions exist", async () => {
        const target = makeTransaction({ memo: "Seeds and sprouts" });
        const history = makeClassifiedHistory({
            categoryId: "groceries",
            memo: "",
            occurredAt: "2026-06-01T00:00:00.000Z",
            transactionId: "history-1",
        });
        const embedValues = vi.fn();
        const generateModelSuggestions = vi.fn();

        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.sourcesGo.mockResolvedValue({
            data: [makeSourceRecord(history)],
        });
        mocks.embeddingsGo.mockResolvedValue({
            data: [
                makeEmbeddingRecord({
                    sourceId: history.transactionId,
                    sourceUpdatedAt: history.updatedAt,
                    text: "legacy memo-less embedding",
                    vector: [1, 0],
                }),
            ],
        });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            { embedValues, generateModelSuggestions },
        );

        expect(embedValues).not.toHaveBeenCalled();
        expect(generateModelSuggestions).not.toHaveBeenCalled();
        expect(result.suggestions[0]).toMatchObject({
            lineAssignments: [{ categoryId: "groceries" }],
            type: "category",
        });
    });

    it("limits deterministic voting to the ten most recent identity matches", async () => {
        const target = makeTransaction({
            displayAmountCents: -999,
            memo: "",
        });
        const recent = Array.from({ length: 10 }, (_, index) =>
            makeClassifiedHistory({
                categoryId: "utilities",
                occurredAt: `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
                transactionId: `recent-${index}`,
            }),
        );
        const oldExactAmount = makeClassifiedHistory({
            amountCents: -999,
            categoryId: "groceries",
            occurredAt: "2026-05-01T00:00:00.000Z",
            transactionId: "old-exact",
        });

        mocks.categoriesGo.mockResolvedValue({ data: [groceries, utilities] });
        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.sourcesGo.mockResolvedValue({
            data: [...recent, oldExactAmount].map((transaction) =>
                makeSourceRecord(transaction),
            ),
        });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
        );

        expect(result.suggestions[0]).toMatchObject({
            confidence: 0.98,
            lineAssignments: [{ categoryId: "utilities" }],
            type: "category",
        });
    });

    it("narrows deterministic voting to exact amounts before category voting", async () => {
        const target = makeTransaction({
            displayAmountCents: -999,
            memo: "",
        });
        const histories = [
            makeClassifiedHistory({
                categoryId: "utilities",
                occurredAt: "2026-06-03T00:00:00.000Z",
                transactionId: "recent-utilities-1",
            }),
            makeClassifiedHistory({
                categoryId: "utilities",
                occurredAt: "2026-06-02T00:00:00.000Z",
                transactionId: "recent-utilities-2",
            }),
            makeClassifiedHistory({
                amountCents: -999,
                categoryId: "groceries",
                occurredAt: "2026-06-01T00:00:00.000Z",
                transactionId: "exact-groceries",
            }),
        ];

        mocks.categoriesGo.mockResolvedValue({ data: [groceries, utilities] });
        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.sourcesGo.mockResolvedValue({
            data: histories.map((transaction) => makeSourceRecord(transaction)),
        });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
        );

        expect(result.suggestions[0]).toMatchObject({
            confidence: 0.98,
            lineAssignments: [{ categoryId: "groceries" }],
            type: "category",
        });
    });

    it("uses the most recent transaction to resolve tied deterministic votes", async () => {
        const target = makeTransaction({ memo: "" });
        const histories = [
            makeClassifiedHistory({
                categoryId: "groceries",
                occurredAt: "2026-06-02T00:00:00.000Z",
                transactionId: "recent-groceries",
            }),
            makeClassifiedHistory({
                categoryId: "utilities",
                occurredAt: "2026-06-01T00:00:00.000Z",
                transactionId: "older-utilities",
            }),
        ];

        mocks.categoriesGo.mockResolvedValue({ data: [groceries, utilities] });
        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.sourcesGo.mockResolvedValue({
            data: histories.map((transaction) => makeSourceRecord(transaction)),
        });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
        );

        expect(result.suggestions[0]).toMatchObject({
            confidence: 0.9,
            lineAssignments: [{ categoryId: "groceries" }],
            type: "category",
        });
    });

    it("does not qualify unrelated merchants from Plaid category overlap alone", async () => {
        const target = makeTransaction({
            memo: "",
            payee: "Merchant A",
            plaidTransactionSyncId: "plaid-target",
        });
        const history = makeClassifiedHistory({
            categoryId: "groceries",
            occurredAt: "2026-06-01T00:00:00.000Z",
            payee: "Merchant B",
            transactionId: "history-1",
        });

        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.plaidSyncsGo.mockResolvedValue({
            data: [
                {
                    categoryText: "Shops, Groceries",
                    ledgerId: "ledger-1",
                    plaidTransactionSyncId: "plaid-target",
                    status: "active",
                    transactionId: "transaction-1",
                },
            ],
        });
        mocks.sourcesGo.mockResolvedValue({
            data: [
                makeSourceRecord(history, {
                    categoryText: "Shops, Groceries",
                }),
            ],
        });

        const generateModelSuggestions = vi.fn().mockResolvedValue([]);
        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
            {},
            { generateModelSuggestions },
        );

        expect(generateModelSuggestions).toHaveBeenCalledTimes(1);
        expect(result.suggestions[0]).toMatchObject({ type: "noSuggestion" });
    });

    it("qualifies exact cross-matches between payee and Plaid merchant identity", async () => {
        const target = makeTransaction({
            memo: "",
            payee: "Card purchase",
            plaidTransactionSyncId: "plaid-target",
        });
        const history = makeClassifiedHistory({
            categoryId: "groceries",
            occurredAt: "2026-06-01T00:00:00.000Z",
            payee: "Coffee House",
            transactionId: "history-1",
        });

        mocks.listTransactionsWithPostings.mockResolvedValue([target]);
        mocks.plaidSyncsGo.mockResolvedValue({
            data: [
                {
                    categoryText: "Food and Drink",
                    ledgerId: "ledger-1",
                    merchantName: "Coffee House",
                    plaidTransactionSyncId: "plaid-target",
                    status: "active",
                    transactionId: "transaction-1",
                },
            ],
        });
        mocks.sourcesGo.mockResolvedValue({
            data: [makeSourceRecord(history)],
        });

        const result = await generateTransactionClassificationSuggestions(
            "ledger-1",
        );

        expect(result.suggestions[0]).toMatchObject({
            lineAssignments: [{ categoryId: "groceries" }],
            type: "category",
        });
    });

    it("applies a category suggestion through the transaction write path", async () => {
        mocks.listTransactionsWithPostings.mockResolvedValue([
            makeTransaction(),
        ]);

        const result = await applyTransactionClassificationSuggestions({
            actorUserId: "owner",
            ledgerId: "ledger-1",
            modelId: "gemini-3.5-flash",
            suggestions: [
                {
                    confidence: 0.9,
                    lineAssignments: [
                        {
                            categoryId: "groceries",
                            lineId: "line-1",
                        },
                    ],
                    reason: "Market history.",
                    suggestedMemo: "Weekly groceries",
                    suggestedPayee: "Fresh Market",
                    targetLineIds: ["line-1"],
                    transactionId: "transaction-1",
                    transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                    type: "category",
                },
            ],
        });

        expect(result.appliedCount).toBe(1);
        expect(
            mocks.upsertTransactionWithWorkspaceChanges,
        ).toHaveBeenCalledWith(
            "ledger-1",
            expect.objectContaining({
                audit: expect.objectContaining({
                    actorUserId: "owner",
                    source: "aiClassification",
                }),
                lines: [
                    expect.objectContaining({
                        categoryId: "groceries",
                        lineId: "line-1",
                    }),
                ],
                memo: "Weekly food",
                payee: "Market",
                transactionId: "transaction-1",
            }),
        );
    });

    it("applies selected suggested payee and memo fields", async () => {
        mocks.listTransactionsWithPostings.mockResolvedValue([
            makeTransaction(),
        ]);

        await applyTransactionClassificationSuggestions({
            actorUserId: "owner",
            fieldSelections: [
                {
                    applySuggestedMemo: true,
                    applySuggestedPayee: true,
                    transactionId: "transaction-1",
                },
            ],
            ledgerId: "ledger-1",
            suggestions: [
                {
                    confidence: 0.9,
                    lineAssignments: [
                        {
                            categoryId: "groceries",
                            lineId: "line-1",
                        },
                    ],
                    reason: "Market history.",
                    suggestedMemo: "Weekly groceries",
                    suggestedPayee: "Fresh Market",
                    targetLineIds: ["line-1"],
                    transactionId: "transaction-1",
                    transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                    type: "category",
                },
            ],
        });

        expect(
            mocks.upsertTransactionWithWorkspaceChanges,
        ).toHaveBeenCalledWith(
            "ledger-1",
            expect.objectContaining({
                memo: "Weekly groceries",
                payee: "Fresh Market",
            }),
        );
    });

    it("rejects stale suggestions before writing", async () => {
        mocks.listTransactionsWithPostings.mockResolvedValue([
            makeTransaction({ updatedAt: "2026-07-02T00:00:00.000Z" }),
        ]);

        await expect(
            applyTransactionClassificationSuggestions({
                actorUserId: "owner",
                ledgerId: "ledger-1",
                suggestions: [
                    {
                        confidence: 0.9,
                        lineAssignments: [
                            {
                                categoryId: "groceries",
                                lineId: "line-1",
                            },
                        ],
                        reason: "Market history.",
                        targetLineIds: ["line-1"],
                        transactionId: "transaction-1",
                        transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                        type: "category",
                    },
                ],
            }),
        ).rejects.toMatchObject({
            code: "classification_suggestion_stale",
            status: 409,
        });
        expect(
            mocks.upsertTransactionWithWorkspaceChanges,
        ).not.toHaveBeenCalled();
    });

    it("does not apply suggested payee or memo without a classification suggestion", async () => {
        mocks.listTransactionsWithPostings.mockResolvedValue([
            makeTransaction(),
        ]);

        await expect(
            applyTransactionClassificationSuggestions({
                actorUserId: "owner",
                fieldSelections: [
                    {
                        applySuggestedMemo: true,
                        applySuggestedPayee: true,
                        transactionId: "transaction-1",
                    },
                ],
                ledgerId: "ledger-1",
                suggestions: [
                    {
                        confidence: 0,
                        lineAssignments: [],
                        reason: "No category confidence.",
                        suggestedMemo: "Weekly groceries",
                        suggestedPayee: "Fresh Market",
                        targetLineIds: ["line-1"],
                        transactionId: "transaction-1",
                        transactionUpdatedAt: "2026-07-01T00:00:00.000Z",
                        type: "noSuggestion",
                    },
                ],
            }),
        ).rejects.toMatchObject({
            code: "classification_no_suggestion",
            status: 422,
        });
        expect(
            mocks.upsertTransactionWithWorkspaceChanges,
        ).not.toHaveBeenCalled();
    });

});
