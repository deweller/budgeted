import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { amazonTransactionImporter } from "@/features/transaction-importers/models/amazon-transaction-importer";

import {
    TRANSACTION_CLASSIFICATION_BATCH_LIMIT,
    transactionClassificationPromptVersion,
    type TransactionClassificationFieldSelection,
    type TransactionClassificationSuggestion,
} from "@/features/transaction-classification/models/transaction-classification";
import {
    buildEmbeddingMatches,
    buildTransactionClassificationEmbeddingText,
    embedTransactionClassificationTexts,
    listTransactionClassificationEmbeddingRecords,
    type EmbeddingMatch,
    type TransactionClassificationEmbeddingRecord,
} from "@/features/transaction-classification/server/transaction-classification-embedding-service";
import {
    formatTransactionClassificationRequestText,
    formatTransactionClassificationResponseText,
    recordTransactionClassificationInteraction,
} from "@/features/transaction-classification/server/transaction-classification-interaction-service";
import {
    getTransactionClassificationGenerationOptions,
    getTransactionClassificationModelProvider,
    resolveTransactionClassificationModelId,
} from "@/features/transaction-classification/server/transaction-classification-models";
import {
    getTransactionClassificationSettings,
    type TransactionClassificationSettings,
} from "@/features/transaction-classification/server/transaction-classification-settings-service";
import {
    listTransactionClassificationSourceRecords,
    normalizeTransactionClassificationSourceText,
    parseTransactionClassificationSourceCategories,
    type TransactionClassificationSourceRecord,
} from "@/features/transaction-classification/server/transaction-classification-source-service";
import { listPlaidTransactionSyncsForTransaction } from "@/features/plaid/server/plaid-transaction-sync-record-service";
import {
    isUncategorizedAccountMovementLine,
    toDisplayTransactionLineCategoryId,
} from "@/features/transactions/models/transaction-line-normalization";
import {
    hasTransferTransactionLine,
} from "@/features/transactions/models/transaction-shape";
import {
    getTransactionWithPostings,
    listTransactionsWithPostings,
} from "@/features/transactions/server/transaction-query-service";
import { upsertTransactionWithWorkspaceChanges } from "@/features/transactions/server/transaction-save-service";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { HttpError } from "@/lib/api/errors";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import {
    resolveGoogleGenerativeAiApiKey,
    resolveNodeEnv,
    resolveOpenAiApiKey,
} from "@/lib/env/server";
import { normalizeOptionalString } from "@/lib/strings";
import type {
    WorkspaceAccountRecord,
    WorkspaceBudgetCategoryRecord,
    WorkspacePlaidTransactionSyncRecord,
} from "@/lib/workspace/sync-types";
import { isUserVisibleBudgetCategory } from "@/modules/budgeting";

type CategoryRecord = Pick<
    WorkspaceBudgetCategoryRecord,
    "categoryId" | "groupId" | "isIncomeCategory" | "name" | "status"
>;

type AccountRecord = Pick<
    WorkspaceAccountRecord,
    "accountId" | "accountType" | "name"
>;

type ClassificationReferenceRecords = {
    accountById: Map<string, AccountRecord>;
    activeCategoryById: Map<string, CategoryRecord>;
    categories: CategoryRecord[];
    plaidSyncByTransactionId: Map<string, WorkspacePlaidTransactionSyncRecord>;
};

type ClassificationTarget = {
    accountName: string;
    accountType: string | null;
    fingerprint: string;
    plaidSync?: WorkspacePlaidTransactionSyncRecord;
    targetLineIds: string[];
    transaction: TransactionWithPostings;
};

function createTransactionClassificationFingerprint(input: {
    accountName?: string;
    amountCents: number;
    memo?: string;
    payee?: string;
    plaidCategoryText?: string;
    plaidMerchantName?: string;
}) {
    const parts = [
        input.accountName,
        input.payee,
        input.memo,
        input.plaidMerchantName,
        input.plaidCategoryText,
    ]
        .map((part) =>
            (part ?? "")
                .trim()
                .toLocaleLowerCase()
                .replaceAll(/\s+/g, " "),
        )
        .filter(Boolean);
    const sign = input.amountCents < 0 ? "outflow" : "inflow";

    return `${sign}:${parts.join("|")}`;
}

type AiModelSuggestion = {
    confidence: number;
    lineAssignments?: Array<{ categoryId: string; lineId: string }>;
    reason: string;
    suggestedMemo?: string | null;
    suggestedPayee?: string | null;
    transactionId: string;
    type: "category" | "noSuggestion";
};

type AiModelSuggestionResult = {
    requestText: string;
    responseText: string;
    suggestions: AiModelSuggestion[];
};

type PromptHistoryMatch = ReturnType<typeof toPromptHistoryMatch>;

type PromptMerchantSummary = {
    categories: Array<{
        categoryId: string;
        count: number;
        lastUsedAt: string;
    }>;
    lastMemo?: string;
    lastPayee?: string;
    merchant?: string;
    summaryId: string;
    totalMatches: number;
};

type PromptTargetCluster = {
    candidateCategoryIds: string[];
    clusterId: string;
    matchIds: string[];
    mode: "fallback" | "semantic";
    transactionIds: string[];
    wantsTextSuggestions: boolean;
};

type PreparedClassificationRun = {
    aiTargets: ClassificationTarget[];
    candidateCategoryIds: string[];
    debugByTransactionId: Map<string, PreparedDebugContext>;
    localSuggestionsByTransactionId: Map<
        string,
        TransactionClassificationSuggestion
    >;
    noSuggestionByTransactionId: Map<string, TransactionClassificationSuggestion>;
    promptContext: {
        clusters: PromptTargetCluster[];
        matches: PromptHistoryMatch[];
    };
};

type DebugHistoryMatch = ReturnType<typeof toDebugHistoryMatch>;

type PreparedDebugContext = {
    candidateCategoryIds: string[];
    matches: DebugHistoryMatch[];
    matchIds: string[];
    matchingPath: string[];
};

type LocalHistorySuggestionResult = {
    matches: DebugHistoryMatch[];
    matchIds: string[];
    matchingPath: string[];
    suggestion: TransactionClassificationSuggestion;
};

type SelectedEmbeddingMatches = {
    candidatesByTargetId: Map<string, HistoryCandidate[]>;
};

type HistoryCandidate = {
    accountId: string;
    accountName: string;
    accountType: string | null;
    amountBucket: string;
    amountCents: number;
    amountSign: "inflow" | "outflow";
    categories: Array<{
        amountCents: number;
        categoryId: string;
        categoryName: string;
    }>;
    exampleId: string;
    embeddingSimilarity?: number;
    fingerprint: string;
    memo: string | null;
    occurredAt: string;
    payee: string | null;
    plaidCategoryText: string | null;
    plaidMerchantName: string | null;
    plaidName: string | null;
    plaidOriginalDescription: string | null;
    plaidPersonalFinanceCategoryDetailed: string | null;
    plaidPersonalFinanceCategoryPrimary: string | null;
    tokens: Set<string>;
    transactionId: string;
    updatedAt: string;
};

type GenerateSuggestionsDeps = {
    embedValues?: (values: string[]) => Promise<number[][]>;
    generateModelSuggestions?: (input: {
        ledgerId: string;
        modelId: string;
        prompt: string;
        system: string;
    }) => Promise<AiModelSuggestion[]>;
};

export type TransactionClassificationPreloadedRunContext = {
    accountAndCategoryRecords: Awaited<
        ReturnType<typeof loadClassificationAccountAndCategoryRecords>
    >;
    embeddingRecords: TransactionClassificationEmbeddingRecord[];
    settings: TransactionClassificationSettings;
    sourceRecords: TransactionClassificationSourceRecord[];
};

export type TransactionClassificationDebugRun = {
    eligibleCount: number;
    llmInteraction: {
        errorMessage?: string;
        requestText: string;
        responseText: string;
        sent: boolean;
    } | null;
    modelId: string;
    promptVersion: string;
    results: Array<{
        candidateCategories: Array<{
            categoryId: string;
            name: string;
        }>;
        chosenCategories: Array<{
            categoryId: string;
            lineId: string;
            name: string;
        }>;
        cluster?: PromptTargetCluster;
        explanations: string[];
        matches: DebugHistoryMatch[];
        matchingPath: string[];
        merchantSummaries: PromptMerchantSummary[];
        outcome: "llm" | "local" | "noSuggestion" | "notEligible";
        promptTarget?: ReturnType<typeof toPromptTarget>;
        rawSuggestion?: AiModelSuggestion;
        suggestion?: TransactionClassificationSuggestion;
        transactionId: string;
    }>;
};

const aiModelSuggestionOutputSchema = z
    .object({
        confidence: z.number().min(0).max(1),
        lineAssignments: z.array(
            z
                .object({
                    categoryId: z.string(),
                    lineId: z.string(),
                })
                .strict(),
        ),
        reason: z.string(),
        suggestedMemo: z.string().nullable(),
        suggestedPayee: z.string().nullable(),
        transactionId: z.string(),
        type: z.enum(["category", "noSuggestion"]),
    })
    .strict();

export const aiClassificationOutputSchema = z
    .object({
        suggestions: z.array(aiModelSuggestionOutputSchema),
    })
    .strict();

type AiModelSuggestionOutput = z.infer<typeof aiModelSuggestionOutputSchema>;

const EMBEDDING_CONTEXT_MINIMUM_SCORE = 0.55;
const EMBEDDING_LOCAL_SUGGESTION_SCORE = 0.9;
const EMBEDDING_MATCH_SCAN_LIMIT = 75;
const EMBEDDING_CANDIDATE_MATCH_LIMIT = 8;
const LOCAL_MEMO_TOKEN_OVERLAP_THRESHOLD = 2;
const DEBUG_EMBEDDING_MATCH_SCAN_LIMIT = 100;
const DEBUG_EMBEDDING_TRANSACTION_MATCHES_PER_TARGET = 20;
const DEBUG_EMBEDDING_GLOBAL_TRANSACTION_MATCH_LIMIT = 75;
const EMBEDDING_CONTEXT_LABEL_SCORE = 0.5;
const FALLBACK_MERCHANT_HISTORY_LIMIT = 8;

function normalizeAiModelSuggestionOutput(
    raw: AiModelSuggestionOutput,
): AiModelSuggestion {
    return {
        confidence: raw.confidence,
        lineAssignments: raw.lineAssignments,
        reason: raw.reason,
        ...(raw.suggestedMemo ? { suggestedMemo: raw.suggestedMemo } : {}),
        ...(raw.suggestedPayee ? { suggestedPayee: raw.suggestedPayee } : {}),
        transactionId: raw.transactionId,
        type: raw.type,
    };
}

function getTransactionPlaidSync(
    transaction: TransactionWithPostings,
    references: ClassificationReferenceRecords,
) {
    return transaction.plaidTransactionSyncId
        ? references.plaidSyncByTransactionId.get(transaction.transactionId)
        : undefined;
}

function getAccountName(
    transaction: TransactionWithPostings,
    references: ClassificationReferenceRecords,
) {
    return (
        references.accountById.get(transaction.referenceAccountId)?.name ??
        transaction.referenceAccountId
    );
}

export function getUnclassifiedTransactionLineIds(
    transaction: TransactionWithPostings,
) {
    if (
        transaction.kind !== "standard" ||
        transaction.status === "voided" ||
        transaction.displayAmountCents === 0 ||
        hasTransferTransactionLine(transaction)
    ) {
        return [];
    }

    return transaction.lines
        .filter(isUncategorizedAccountMovementLine)
        .map((line) => line.lineId);
}

export function isTransactionClassificationEligible(
    transaction: TransactionWithPostings,
) {
    return getUnclassifiedTransactionLineIds(transaction).length > 0;
}

async function loadClassificationReferenceRecords(
    ledgerId: string,
): Promise<ClassificationReferenceRecords> {
    const { entities } = getBudgetedSchema();
    const [accounts, categories, plaidSyncs] = await Promise.all([
        queryAllPages(entities.accounts.query.byAccount({ ledgerId }), {
            consistent: true,
        }),
        queryAllPages(entities.budgetCategories.query.byCategory({ ledgerId }), {
            consistent: true,
        }),
        queryAllPages(entities.plaidTransactionSyncs.query.bySync({ ledgerId }), {
            consistent: true,
        }),
    ]);

    return buildClassificationReferenceRecords({
        accounts: accounts as WorkspaceAccountRecord[],
        categories: categories as WorkspaceBudgetCategoryRecord[],
        plaidSyncs: plaidSyncs as WorkspacePlaidTransactionSyncRecord[],
    });
}

async function loadClassificationAccountAndCategoryRecords(ledgerId: string) {
    const { entities } = getBudgetedSchema();
    const [accounts, categories] = await Promise.all([
        queryAllPages(entities.accounts.query.byAccount({ ledgerId }), {
            consistent: true,
        }),
        queryAllPages(entities.budgetCategories.query.byCategory({ ledgerId }), {
            consistent: true,
        }),
    ]);

    return {
        accounts: accounts as WorkspaceAccountRecord[],
        categories: categories as WorkspaceBudgetCategoryRecord[],
    };
}

export async function loadTransactionClassificationPreloadedRunContext(
    ledgerId: string,
): Promise<TransactionClassificationPreloadedRunContext> {
    const [
        accountAndCategoryRecords,
        settings,
        embeddingRecords,
        sourceRecords,
    ] =
        await Promise.all([
            loadClassificationAccountAndCategoryRecords(ledgerId),
            getTransactionClassificationSettings(ledgerId),
            listTransactionClassificationEmbeddingRecords(ledgerId),
            listTransactionClassificationSourceRecords(ledgerId),
        ]);

    return {
        accountAndCategoryRecords,
        embeddingRecords,
        settings,
        sourceRecords,
    };
}

function buildClassificationReferenceRecords(input: {
    accounts: WorkspaceAccountRecord[];
    categories: WorkspaceBudgetCategoryRecord[];
    plaidSyncs: WorkspacePlaidTransactionSyncRecord[];
}): ClassificationReferenceRecords {
    const activeCategories = input.categories
        .filter(
            (category) =>
                category.status === "active" &&
                isUserVisibleBudgetCategory(category),
        )
        .map((category) => ({
            categoryId: category.categoryId,
            groupId: category.groupId,
            isIncomeCategory: category.isIncomeCategory,
            name: category.name,
            status: category.status,
        }));

    return {
        accountById: new Map(
            input.accounts.map((account) => [
                account.accountId,
                {
                    accountId: account.accountId,
                    accountType: account.accountType,
                    name: account.name,
                },
            ]),
        ),
        activeCategoryById: new Map(
            activeCategories.map((category) => [category.categoryId, category]),
        ),
        categories: activeCategories,
        plaidSyncByTransactionId: new Map(
            input.plaidSyncs
                .filter((record) => record.status === "active")
                .map((record) => [record.transactionId, record]),
        ),
    };
}

function buildTarget(
    transaction: TransactionWithPostings,
    references: ClassificationReferenceRecords,
): ClassificationTarget | null {
    const targetLineIds = getUnclassifiedTransactionLineIds(transaction);

    if (targetLineIds.length === 0) {
        return null;
    }

    const plaidSync = getTransactionPlaidSync(transaction, references);
    const accountName = getAccountName(transaction, references);
    const accountType =
        references.accountById.get(transaction.referenceAccountId)
            ?.accountType ?? null;

    return {
        accountName,
        accountType,
        fingerprint: createTransactionClassificationFingerprint({
            accountName,
            amountCents: transaction.displayAmountCents,
            memo: transaction.memo,
            payee: transaction.payee,
            plaidCategoryText: plaidSync?.categoryText,
            plaidMerchantName: plaidSync?.merchantName,
        }),
        plaidSync,
        targetLineIds,
        transaction,
    };
}

function getSelectedTargets(input: {
    references: ClassificationReferenceRecords;
    transactionIds?: string[];
    transactions: TransactionWithPostings[];
}) {
    const requestedIds = input.transactionIds
        ? new Set(input.transactionIds)
        : undefined;

    return input.transactions
        .filter(
            (transaction) =>
                !requestedIds || requestedIds.has(transaction.transactionId),
        )
        .map((transaction) => buildTarget(transaction, input.references))
        .filter((target): target is ClassificationTarget => Boolean(target))
        .slice(0, TRANSACTION_CLASSIFICATION_BATCH_LIMIT);
}

function getLineDirection(line: TransactionWithPostings["lines"][number]) {
    if (line.fromAccountId && !line.toAccountId) {
        return "outflow";
    }

    if (line.toAccountId && !line.fromAccountId) {
        return "inflow";
    }

    return "unknown";
}

function getTargetTextSuggestionFields(target: ClassificationTarget) {
    const fields: Array<"memo" | "payee"> = [];
    const payee = normalizeOptionalString(target.transaction.payee);
    const memo = normalizeOptionalString(target.transaction.memo);
    const plaidMerchant = normalizeOptionalString(target.plaidSync?.merchantName);

    if (
        !payee ||
        isNoisyTransactionText(payee) ||
        (payee &&
            plaidMerchant &&
            normalizeContextText(payee) !== normalizeContextText(plaidMerchant))
    ) {
        fields.push("payee");
    }

    if (isNoisyTransactionText(memo) || (!payee && !memo)) {
        fields.push("memo");
    }

    return fields;
}

function getDistinctPlaidPromptFields(input: {
    categoryText?: string | null;
    merchantName?: string | null;
    name?: string | null;
    originalDescription?: string | null;
    personalFinanceCategoryDetailed?: string | null;
    personalFinanceCategoryPrimary?: string | null;
}) {
    const seen = new Set<string>();

    const includeDistinct = (value?: string | null) => {
        const displayValue = normalizeOptionalString(value);
        const normalizedValue = normalizeContextText(displayValue);

        if (!displayValue || !normalizedValue || seen.has(normalizedValue)) {
            return undefined;
        }

        seen.add(normalizedValue);
        return displayValue;
    };

    return compactObject({
        m: includeDistinct(input.merchantName),
        n: includeDistinct(input.name),
        o: includeDistinct(input.originalDescription),
        c: includeDistinct(input.categoryText),
        p: includeDistinct(input.personalFinanceCategoryPrimary),
        d: includeDistinct(input.personalFinanceCategoryDetailed),
    });
}

function getAmazonItemSummary(target: ClassificationTarget) {
    const activity = target.transaction.importActivities?.find(
        (candidate) => candidate.provider === "amazon",
    );
    if (!activity) return undefined;

    try {
        const details = amazonTransactionImporter.detailsSchema.safeParse(
            JSON.parse(activity.detailsJson),
        );
        return details.success
            ? { activity, itemSummary: details.data.itemSummary }
            : undefined;
    } catch {
        return undefined;
    }
}

function toPromptTarget(target: ClassificationTarget) {
    const plaidFields = target.plaidSync
        ? getDistinctPlaidPromptFields({
              categoryText: target.plaidSync.categoryText,
              merchantName: target.plaidSync.merchantName,
              name: target.plaidSync.name,
              originalDescription: target.plaidSync.originalDescription,
              personalFinanceCategoryDetailed:
                  target.plaidSync.personalFinanceCategoryDetailed,
              personalFinanceCategoryPrimary:
                  target.plaidSync.personalFinanceCategoryPrimary,
          })
        : undefined;

    const amazonContext = getAmazonItemSummary(target);

    return compactObject({
        a: target.transaction.displayAmountCents,
        ab: getAmountBucket(target.transaction.displayAmountCents),
        acct: target.accountName,
        as: getAmountSign(target.transaction.displayAmountCents),
        at: target.accountType,
        l: target.transaction.lines
            .filter((line) => target.targetLineIds.includes(line.lineId))
            .map((line) =>
                compactObject({
                    a: line.amountCents,
                    d: getLineDirection(line),
                    id: line.lineId,
                    m: line.memo,
                    p: line.payee,
                }),
            ),
        m: target.transaction.memo,
        om: amazonContext
            ? {
                  provider: amazonContext.activity.provider,
                  itemSummary: amazonContext.itemSummary,
              }
            : undefined,
        p: target.transaction.payee,
        pl:
            plaidFields && Object.keys(plaidFields).length > 0
                ? plaidFields
                : undefined,
        tid: target.transaction.transactionId,
        txt: getTargetTextSuggestionFields(target),
    });
}

function toPromptHistoryMatch(candidate: HistoryCandidate) {
    const plaidFields = getDistinctPlaidPromptFields({
        categoryText: candidate.plaidCategoryText,
        merchantName: candidate.plaidMerchantName,
        name: candidate.plaidName,
        originalDescription: candidate.plaidOriginalDescription,
        personalFinanceCategoryDetailed:
            candidate.plaidPersonalFinanceCategoryDetailed,
        personalFinanceCategoryPrimary:
            candidate.plaidPersonalFinanceCategoryPrimary,
    });

    return compactObject({
        a: candidate.amountCents,
        c: Array.from(
            new Set(candidate.categories.map((category) => category.categoryId)),
        ),
        dt: candidate.occurredAt,
        id: candidate.exampleId,
        m: candidate.memo,
        p: candidate.payee,
        pl: Object.keys(plaidFields).length > 0 ? plaidFields : undefined,
        s:
            candidate.embeddingSimilarity !== undefined
                ? Number(candidate.embeddingSimilarity.toFixed(3))
                : undefined,
        tid: candidate.transactionId,
    });
}

const CLASSIFICATION_STOP_WORDS = new Set([
    "and",
    "card",
    "co",
    "company",
    "credit",
    "debit",
    "inc",
    "llc",
    "online",
    "pay",
    "payment",
    "plaid",
    "pos",
    "purchase",
    "shop",
    "store",
    "the",
]);

function normalizeContextText(value?: string | null) {
    return (normalizeOptionalString(value) ?? "")
        .toLocaleLowerCase()
        .replaceAll(/[^a-z0-9]+/g, " ")
        .trim();
}

function getTextTokens(...values: Array<string | null | undefined>) {
    const tokens = new Set<string>();

    for (const value of values) {
        for (const token of normalizeContextText(value).split(/\s+/g)) {
            if (token.length >= 3 && !CLASSIFICATION_STOP_WORDS.has(token)) {
                tokens.add(token);
            }
        }
    }

    return tokens;
}

function getOverlapCount(left: Set<string>, right: Set<string>) {
    const [smaller, larger] =
        left.size <= right.size ? [left, right] : [right, left];
    let count = 0;

    for (const token of smaller) {
        if (larger.has(token)) {
            count += 1;
        }
    }

    return count;
}

function compactObject<T>(value: T): T {
    if (Array.isArray(value)) {
        return value
            .map((item) => compactObject(item))
            .filter((item) => item !== undefined) as T;
    }

    if (value && typeof value === "object") {
        const entries = Object.entries(value).flatMap(([key, entryValue]) => {
            if (
                entryValue === undefined ||
                entryValue === null ||
                (Array.isArray(entryValue) && entryValue.length === 0) ||
                entryValue === ""
            ) {
                return [];
            }

            const compacted = compactObject(entryValue);

            if (
                compacted === undefined ||
                compacted === null ||
                (Array.isArray(compacted) && compacted.length === 0)
            ) {
                return [];
            }

            return [[key, compacted] as const];
        });

        return Object.fromEntries(entries) as T;
    }

    return value;
}

function toCompactJson(value: unknown) {
    return JSON.stringify(compactObject(value));
}

function getAmountSign(amountCents: number): "inflow" | "outflow" {
    return amountCents < 0 ? "outflow" : "inflow";
}

function getAmountBucket(amountCents: number) {
    const absoluteCents = Math.abs(amountCents);

    if (absoluteCents < 1_000) {
        return "under_10";
    }

    if (absoluteCents < 2_500) {
        return "10_to_25";
    }

    if (absoluteCents < 5_000) {
        return "25_to_50";
    }

    if (absoluteCents < 10_000) {
        return "50_to_100";
    }

    if (absoluteCents < 25_000) {
        return "100_to_250";
    }

    if (absoluteCents < 50_000) {
        return "250_to_500";
    }

    if (absoluteCents < 100_000) {
        return "500_to_1000";
    }

    return "over_1000";
}

function getPlaidCategoryTokens(
    plaidSync: WorkspacePlaidTransactionSyncRecord | undefined,
) {
    return getTextTokens(
        plaidSync?.categoryText,
        plaidSync?.personalFinanceCategoryPrimary,
        plaidSync?.personalFinanceCategoryDetailed,
    );
}

function getCandidatePlaidCategoryTokens(candidate: HistoryCandidate) {
    return getTextTokens(
        candidate.plaidCategoryText,
        candidate.plaidPersonalFinanceCategoryPrimary,
        candidate.plaidPersonalFinanceCategoryDetailed,
    );
}

function getTargetSemanticDetailTokens(target: ClassificationTarget) {
    return getTextTokens(
        target.transaction.memo,
        target.plaidSync?.name,
        target.plaidSync?.originalDescription,
    );
}

function getCandidateSemanticDetailTokens(candidate: HistoryCandidate) {
    return getTextTokens(
        candidate.memo,
        candidate.plaidName,
        candidate.plaidOriginalDescription,
    );
}

function hasExactPlaidMerchantMatch(input: {
    candidate: HistoryCandidate;
    target: ClassificationTarget;
}) {
    const targetMerchant = normalizeContextText(
        input.target.plaidSync?.merchantName ?? input.target.plaidSync?.name,
    );
    const candidateMerchant = normalizeContextText(
        input.candidate.plaidMerchantName ?? input.candidate.plaidName,
    );

    return Boolean(
        targetMerchant &&
            candidateMerchant &&
            targetMerchant === candidateMerchant,
    );
}

function getLocalSemanticEvidence(input: {
    candidate: HistoryCandidate;
    target: ClassificationTarget;
}) {
    const { candidate, target } = input;
    const exactAmount =
        candidate.amountCents === target.transaction.displayAmountCents;
    const compatibleSign =
        candidate.amountSign ===
        getAmountSign(target.transaction.displayAmountCents);
    const memoTokenOverlap = getOverlapCount(
        getTargetSemanticDetailTokens(target),
        getCandidateSemanticDetailTokens(candidate),
    );
    const plaidCategoryOverlap = getOverlapCount(
        getPlaidCategoryTokens(target.plaidSync),
        getCandidatePlaidCategoryTokens(candidate),
    );
    const plaidMerchantMatch = hasExactPlaidMerchantMatch(input);
    const embeddingSimilarity = candidate.embeddingSimilarity ?? 0;
    const strongEmbedding =
        embeddingSimilarity >= EMBEDDING_LOCAL_SUGGESTION_SCORE &&
        compatibleSign;
    const meaningfulMemoAmountMatch =
        exactAmount && memoTokenOverlap >= LOCAL_MEMO_TOKEN_OVERLAP_THRESHOLD;
    const plaidContextAmountMatch =
        exactAmount && plaidMerchantMatch && plaidCategoryOverlap > 0;
    const exactFingerprint = candidate.fingerprint === target.fingerprint;

    return {
        compatibleSign,
        embeddingSimilarity,
        exactFingerprint,
        exactAmount,
        hasLocalMatch:
            exactFingerprint ||
            strongEmbedding ||
            meaningfulMemoAmountMatch ||
            plaidContextAmountMatch,
        meaningfulMemoAmountMatch,
        memoTokenOverlap,
        plaidCategoryOverlap,
        plaidContextAmountMatch,
        plaidMerchantMatch,
        strongEmbedding,
    };
}

function getTargetTokens(target: ClassificationTarget) {
    return getTextTokens(
        target.transaction.payee,
        target.transaction.memo,
        target.plaidSync?.categoryText,
        target.plaidSync?.merchantName,
        target.plaidSync?.name,
        target.plaidSync?.originalDescription,
        target.plaidSync?.personalFinanceCategoryPrimary,
        target.plaidSync?.personalFinanceCategoryDetailed,
    );
}

function getHistoryCategories(input: {
    references: ClassificationReferenceRecords;
    transaction: TransactionWithPostings;
}) {
    return input.transaction.lines
        .map((line) => {
            const categoryId = toDisplayTransactionLineCategoryId(
                line.categoryId,
            );

            if (!categoryId) {
                return null;
            }

            const category = input.references.activeCategoryById.get(categoryId);

            if (!category) {
                return null;
            }

            return {
                amountCents: line.amountCents,
                categoryId,
                categoryName: category.name,
            };
        })
        .filter((category): category is NonNullable<typeof category> =>
            Boolean(category),
        );
}

function buildHistoryCandidates(input: {
    references: ClassificationReferenceRecords;
    targetTransactionIds: Set<string>;
    transactions: TransactionWithPostings[];
}) {
    return input.transactions
        .filter(
            (transaction) =>
                !input.targetTransactionIds.has(transaction.transactionId) &&
                transaction.status !== "voided" &&
                transaction.kind === "standard" &&
                !hasTransferTransactionLine(transaction),
        )
        .map((transaction): HistoryCandidate | null => {
            const categories = getHistoryCategories({
                references: input.references,
                transaction,
            });

            if (categories.length === 0) {
                return null;
            }

            const plaidSync = getTransactionPlaidSync(
                transaction,
                input.references,
            );
            const account = input.references.accountById.get(
                transaction.referenceAccountId,
            );
            const accountName = account?.name ?? transaction.referenceAccountId;
            const fingerprint = createTransactionClassificationFingerprint({
                accountName,
                amountCents: transaction.displayAmountCents,
                memo: transaction.memo,
                payee: transaction.payee,
                plaidCategoryText: plaidSync?.categoryText,
                plaidMerchantName: plaidSync?.merchantName,
            });

            return {
                accountId: transaction.referenceAccountId,
                accountName,
                accountType: account?.accountType ?? null,
                amountBucket: getAmountBucket(transaction.displayAmountCents),
                amountCents: transaction.displayAmountCents,
                amountSign: getAmountSign(transaction.displayAmountCents),
                categories,
                exampleId: `example:${transaction.transactionId}`,
                fingerprint,
                memo: transaction.memo ?? null,
                occurredAt: transaction.occurredAt,
                payee: transaction.payee ?? null,
                plaidCategoryText: plaidSync?.categoryText ?? null,
                plaidMerchantName: plaidSync?.merchantName ?? null,
                plaidName: plaidSync?.name ?? null,
                plaidOriginalDescription:
                    plaidSync?.originalDescription ?? null,
                plaidPersonalFinanceCategoryDetailed:
                    plaidSync?.personalFinanceCategoryDetailed ?? null,
                plaidPersonalFinanceCategoryPrimary:
                    plaidSync?.personalFinanceCategoryPrimary ?? null,
                tokens: getTextTokens(
                    transaction.payee,
                    transaction.memo,
                    plaidSync?.categoryText,
                    plaidSync?.merchantName,
                    plaidSync?.name,
                    plaidSync?.originalDescription,
                    plaidSync?.personalFinanceCategoryPrimary,
                    plaidSync?.personalFinanceCategoryDetailed,
                    ...categories.map((category) => category.categoryName),
                ),
                transactionId: transaction.transactionId,
                updatedAt: transaction.updatedAt,
            };
        })
        .filter((candidate): candidate is HistoryCandidate => Boolean(candidate));
}

function buildHistoryCandidatesFromSourceRecords(input: {
    references: ClassificationReferenceRecords;
    sourceRecords: TransactionClassificationSourceRecord[];
    targetTransactionIds: Set<string>;
}) {
    return input.sourceRecords
        .filter(
            (record) => !input.targetTransactionIds.has(record.transactionId),
        )
        .map((record): HistoryCandidate | null => {
            const categories = parseTransactionClassificationSourceCategories(
                record,
            ).flatMap((category) => {
                const activeCategory = input.references.activeCategoryById.get(
                    category.categoryId,
                );

                return activeCategory
                    ? [{ ...category, categoryName: activeCategory.name }]
                    : [];
            });

            if (categories.length === 0) {
                return null;
            }

            const account = input.references.accountById.get(record.accountId);
            const accountName = account?.name ?? record.accountId;

            return {
                accountId: record.accountId,
                accountName,
                accountType: account?.accountType ?? null,
                amountBucket: getAmountBucket(record.amountCents),
                amountCents: record.amountCents,
                amountSign: getAmountSign(record.amountCents),
                categories,
                exampleId: `example:${record.transactionId}`,
                fingerprint: createTransactionClassificationFingerprint({
                    accountName,
                    amountCents: record.amountCents,
                    memo: record.memo,
                    payee: record.payee,
                    plaidCategoryText: record.plaidCategoryText,
                    plaidMerchantName: record.plaidMerchantName,
                }),
                memo: record.memo ?? null,
                occurredAt: record.occurredAt,
                payee: record.payee ?? null,
                plaidCategoryText: record.plaidCategoryText ?? null,
                plaidMerchantName: record.plaidMerchantName ?? null,
                plaidName: record.plaidName ?? null,
                plaidOriginalDescription:
                    record.plaidOriginalDescription ?? null,
                plaidPersonalFinanceCategoryDetailed:
                    record.plaidPfcDetailed ?? null,
                plaidPersonalFinanceCategoryPrimary:
                    record.plaidPfcPrimary ?? null,
                tokens: getTextTokens(
                    record.payee,
                    record.memo,
                    record.plaidCategoryText,
                    record.plaidMerchantName,
                    record.plaidName,
                    record.plaidOriginalDescription,
                    record.plaidPfcPrimary,
                    record.plaidPfcDetailed,
                    ...categories.map((category) => category.categoryName),
                ),
                transactionId: record.transactionId,
                updatedAt: record.sourceUpdatedAt,
            };
        })
        .filter((candidate): candidate is HistoryCandidate => Boolean(candidate));
}

function getRecencyScore(input: {
    candidateOccurredAt: string;
    targetOccurredAt: string;
}) {
    const candidateTime = Date.parse(input.candidateOccurredAt);
    const targetTime = Date.parse(input.targetOccurredAt);

    if (Number.isNaN(candidateTime) || Number.isNaN(targetTime)) {
        return 0;
    }

    const daysApart =
        Math.abs(targetTime - candidateTime) / (1000 * 60 * 60 * 24);

    return Math.max(0, 10 - daysApart / 30);
}

function scoreHistoryCandidateForTarget(input: {
    candidate: HistoryCandidate;
    target: ClassificationTarget;
}) {
    const { candidate, target } = input;
    const targetTokens = getTargetTokens(target);
    const tokenOverlap = getOverlapCount(targetTokens, candidate.tokens);
    const targetPayee = normalizeContextText(target.transaction.payee);
    const targetMerchant = normalizeContextText(
        target.plaidSync?.merchantName ?? target.plaidSync?.name,
    );
    const candidatePayee = normalizeContextText(candidate.payee);
    const candidateMerchant = normalizeContextText(
        candidate.plaidMerchantName,
    );
    const targetNames = new Set(
        [targetPayee, targetMerchant].filter((value) => value.length > 0),
    );
    const candidateNames = new Set(
        [candidatePayee, candidateMerchant].filter(
            (value) => value.length > 0,
        ),
    );
    const plaidCategoryMatches = getOverlapCount(
        getPlaidCategoryTokens(target.plaidSync),
        getTextTokens(
            candidate.plaidCategoryText,
            candidate.plaidPersonalFinanceCategoryPrimary,
            candidate.plaidPersonalFinanceCategoryDetailed,
        ),
    );
    let score = 0;
    let relevanceScore = 0;

    if (candidate.fingerprint === target.fingerprint) {
        score += 100;
        relevanceScore += 100;
    }

    if (targetPayee && candidatePayee && targetPayee === candidatePayee) {
        score += 45;
        relevanceScore += 45;
    }

    if (
        targetMerchant &&
        candidateMerchant &&
        targetMerchant === candidateMerchant
    ) {
        score += 40;
        relevanceScore += 40;
    }

    for (const targetName of targetNames) {
        if (candidateNames.has(targetName)) {
            score += 25;
            relevanceScore += 25;
            break;
        }
    }

    if (plaidCategoryMatches > 0) {
        const categoryScore = 18 + plaidCategoryMatches * 4;
        score += categoryScore;
        relevanceScore += categoryScore;
    }

    if (tokenOverlap > 0) {
        const tokenScore = Math.min(24, tokenOverlap * 4);
        score += tokenScore;
        relevanceScore += tokenScore;
    }

    if (relevanceScore === 0) {
        return 0;
    }

    if (candidate.accountId === target.transaction.referenceAccountId) {
        score += 10;
    }

    if (candidate.amountCents === target.transaction.displayAmountCents) {
        score += 18;
    }

    if (
        candidate.amountSign ===
        getAmountSign(target.transaction.displayAmountCents)
    ) {
        score += 6;
    }

    if (
        candidate.amountBucket ===
        getAmountBucket(target.transaction.displayAmountCents)
    ) {
        score += 6;
    }

    return (
        score +
        getRecencyScore({
            candidateOccurredAt: candidate.occurredAt,
            targetOccurredAt: target.transaction.occurredAt,
        })
    );
}

function scoreEmbeddingCandidateForTarget(input: {
    candidate: HistoryCandidate;
    target: ClassificationTarget;
}) {
    const { candidate, target } = input;
    const evidence = getLocalSemanticEvidence({ candidate, target });
    const semanticScore = (() => {
        let score = 0;

        if (evidence.exactFingerprint) {
            score += 160;
        }

        if (evidence.embeddingSimilarity >= EMBEDDING_CONTEXT_MINIMUM_SCORE) {
            score += 35 + evidence.embeddingSimilarity * 100;
        }

        if (evidence.memoTokenOverlap > 0) {
            score += Math.min(48, evidence.memoTokenOverlap * 12);
        }

        if (evidence.plaidCategoryOverlap > 0) {
            score += 10 + Math.min(24, evidence.plaidCategoryOverlap * 4);
        }

        return score;
    })();

    if (semanticScore === 0) {
        return scoreHistoryCandidateForTarget(input);
    }

    let score = semanticScore;

    if (candidate.accountId === target.transaction.referenceAccountId) {
        score += 8;
    }

    if (candidate.amountCents === target.transaction.displayAmountCents) {
        score += 18;
    } else if (
        candidate.amountBucket ===
        getAmountBucket(target.transaction.displayAmountCents)
    ) {
        score += 6;
    }

    if (evidence.compatibleSign) {
        score += 8;
    }

    if (evidence.plaidMerchantMatch) {
        score += 8;
    }

    const targetPayee = normalizeContextText(target.transaction.payee);
    const candidatePayee = normalizeContextText(candidate.payee);

    if (targetPayee && candidatePayee && targetPayee === candidatePayee) {
        score += 6;
    }

    return (
        score +
        getRecencyScore({
            candidateOccurredAt: candidate.occurredAt,
            targetOccurredAt: target.transaction.occurredAt,
        })
    );
}

function getTargetEmbeddingText(target: ClassificationTarget) {
    if (!normalizeOptionalString(target.transaction.memo)) {
        return "";
    }

    return buildTransactionClassificationEmbeddingText({
        memo: target.transaction.memo,
        payee: target.transaction.payee,
        plaidCategoryText: target.plaidSync?.categoryText,
        plaidMerchantName: target.plaidSync?.merchantName,
        plaidName: target.plaidSync?.name,
        plaidPersonalFinanceCategoryDetailed:
            target.plaidSync?.personalFinanceCategoryDetailed,
        plaidPersonalFinanceCategoryPrimary:
            target.plaidSync?.personalFinanceCategoryPrimary,
    });
}

function createSourceKey(input: {
    sourceId: string;
    sourceType: "transaction" | "transactionTemplate";
}) {
    return `${input.sourceType}:${input.sourceId}`;
}

function createEmptySelectedEmbeddingMatches(): SelectedEmbeddingMatches {
    return {
        candidatesByTargetId: new Map<string, HistoryCandidate[]>(),
    };
}

function selectGlobalEmbeddingMatchKeys(input: {
    globalLimit: number;
    matchesByTargetId: Map<string, EmbeddingMatch[]>;
    perTargetLimit: number;
    targets: ClassificationTarget[];
}) {
    const selectedKeys = new Set<string>();

    for (
        let rank = 0;
        rank < input.perTargetLimit && selectedKeys.size < input.globalLimit;
        rank += 1
    ) {
        for (const target of input.targets) {
            const match = input.matchesByTargetId.get(
                target.transaction.transactionId,
            )?.[rank];

            if (!match) {
                continue;
            }

            selectedKeys.add(createSourceKey(match));

            if (selectedKeys.size >= input.globalLimit) {
                break;
            }
        }
    }

    return selectedKeys;
}

function mergeEmbeddingCandidate(input: {
    candidate: HistoryCandidate;
    similarity: number;
}): HistoryCandidate {
    return {
        ...input.candidate,
        embeddingSimilarity: Math.max(
            input.candidate.embeddingSimilarity ?? 0,
            input.similarity,
        ),
    };
}

function rankEmbeddingCandidatesForTarget(input: {
    candidates: HistoryCandidate[];
    limit: number;
    target: ClassificationTarget;
}) {
    return input.candidates
        .map((candidate) => ({
            candidate,
            score: scoreEmbeddingCandidateForTarget({
                candidate,
                target: input.target,
            }),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
            (left, right) =>
                right.score - left.score ||
                (right.candidate.embeddingSimilarity ?? 0) -
                    (left.candidate.embeddingSimilarity ?? 0) ||
                right.candidate.occurredAt.localeCompare(
                    left.candidate.occurredAt,
                ),
        )
        .slice(0, input.limit)
        .map((entry) => entry.candidate);
}

async function listTransactionsWithPostingsByIds(input: {
    ledgerId: string;
    transactionIds: string[];
}) {
    const uniqueIds = Array.from(new Set(input.transactionIds));
    const transactionEntries = await Promise.all(
        uniqueIds.map(async (transactionId) => {
            try {
                return [
                    transactionId,
                    await getTransactionWithPostings(
                        input.ledgerId,
                        transactionId,
                    ),
                ] as const;
            } catch (error) {
                if (error instanceof HttpError && error.status === 404) {
                    return [transactionId, null] as const;
                }

                throw error;
            }
        }),
    );
    const transactionById = new Map(transactionEntries);

    return input.transactionIds
        .map((transactionId) => transactionById.get(transactionId) ?? null)
        .filter(
            (transaction): transaction is TransactionWithPostings =>
                Boolean(transaction),
        );
}

async function listPlaidSyncsForTransactions(input: {
    ledgerId: string;
    transactions: TransactionWithPostings[];
}) {
    const transactionById = new Map(
        input.transactions.map((transaction) => [
            transaction.transactionId,
            transaction,
        ]),
    );
    const plaidSyncs = await Promise.all(
        [...transactionById.values()].map((transaction) =>
            listPlaidTransactionSyncsForTransaction(
                input.ledgerId,
                transaction.transactionId,
                transaction.plaidTransactionSyncId,
            ),
        ),
    );

    return plaidSyncs.flat() as WorkspacePlaidTransactionSyncRecord[];
}

function countCategoryMatches(candidates: HistoryCandidate[]) {
    const categoryStats = new Map<
        string,
        {
            categoryId: string;
            count: number;
            lastUsedAt: string;
        }
    >();

    for (const candidate of candidates) {
        const uniqueCategoryIds = new Set(
            candidate.categories.map((category) => category.categoryId),
        );

        for (const categoryId of uniqueCategoryIds) {
            const current = categoryStats.get(categoryId);

            categoryStats.set(categoryId, {
                categoryId,
                count: (current?.count ?? 0) + 1,
                lastUsedAt:
                    current && current.lastUsedAt > candidate.occurredAt
                        ? current.lastUsedAt
                        : candidate.occurredAt,
            });
        }
    }

    return Array.from(categoryStats.values()).sort(
        (left, right) =>
            right.count - left.count ||
            right.lastUsedAt.localeCompare(left.lastUsedAt),
    );
}

function getHistoryCandidateCategoryIds(candidate: HistoryCandidate) {
    return Array.from(
        new Set(candidate.categories.map((category) => category.categoryId)),
    );
}

function getLocalEvidenceLabels(
    evidence: ReturnType<typeof getLocalSemanticEvidence>,
) {
    const labels: string[] = [];

    if (evidence.exactFingerprint) {
        labels.push("exact fingerprint");
    }

    if (evidence.strongEmbedding) {
        labels.push(
            `strong embedding ${evidence.embeddingSimilarity.toFixed(3)} with compatible amount sign`,
        );
    } else if (evidence.embeddingSimilarity >= EMBEDDING_CONTEXT_LABEL_SCORE) {
        labels.push(
            `semantic context embedding ${evidence.embeddingSimilarity.toFixed(3)}`,
        );
    }

    if (evidence.meaningfulMemoAmountMatch) {
        labels.push(
            `memo overlap ${evidence.memoTokenOverlap.toLocaleString()} with exact amount`,
        );
    }

    if (evidence.plaidContextAmountMatch) {
        labels.push(
            `Plaid merchant/category overlap ${evidence.plaidCategoryOverlap.toLocaleString()} with exact amount`,
        );
    }

    if (labels.length === 0) {
        if (evidence.exactAmount) {
            labels.push("exact amount only; not enough for a local match");
        } else if (evidence.compatibleSign) {
            labels.push("compatible amount sign only");
        } else {
            labels.push("no local semantic gate matched");
        }
    }

    return labels;
}

function toDebugHistoryMatch(
    candidate: HistoryCandidate,
    target?: ClassificationTarget,
    matchingEvidence?: string[],
) {
    const evidence = target
        ? getLocalSemanticEvidence({ candidate, target })
        : null;

    return compactObject({
        amountCents: candidate.amountCents,
        amountSign: candidate.amountSign,
        categories: candidate.categories.map((category) => ({
            amountCents: category.amountCents,
            categoryId: category.categoryId,
            name: category.categoryName,
        })),
        embeddingSimilarity:
            candidate.embeddingSimilarity !== undefined
                ? Number(candidate.embeddingSimilarity.toFixed(3))
                : undefined,
        exampleId: candidate.exampleId,
        matchingEvidence:
            matchingEvidence ??
            (evidence ? getLocalEvidenceLabels(evidence) : undefined),
        memo: candidate.memo,
        occurredAt: candidate.occurredAt,
        payee: candidate.payee,
        transactionId: candidate.transactionId,
    });
}

function getLocalCandidateSummary(input: {
    candidate: HistoryCandidate;
    evidence: ReturnType<typeof getLocalSemanticEvidence>;
}) {
    const categories = input.candidate.categories
        .map((category) => category.categoryName)
        .join(", ");

    return `${input.candidate.exampleId}: ${input.candidate.payee ?? "No payee"} · ${input.candidate.memo ?? "No memo"} · ${input.candidate.amountCents.toLocaleString()} cents · ${categories || "No category"} · ${getLocalEvidenceLabels(input.evidence).join("; ")}.`;
}

function hasConflictingStrongCategory(input: {
    candidates: HistoryCandidate[];
    topCandidateCategoryIds: string[];
}) {
    const topCategoryIds = new Set(input.topCandidateCategoryIds);

    return input.candidates.slice(1).some((candidate) => {
        const candidateCategoryIds = getHistoryCandidateCategoryIds(candidate);

        return (
            candidateCategoryIds.length > 0 &&
            !candidateCategoryIds.some((categoryId) =>
                topCategoryIds.has(categoryId),
            )
        );
    });
}

function getLocalEvidenceReason(
    evidence: ReturnType<typeof getLocalSemanticEvidence>,
) {
    if (evidence.exactFingerprint) {
        return "Matched the highest-ranked prior transaction fingerprint locally.";
    }

    if (evidence.strongEmbedding) {
        return "Matched strong semantic similarity from prior transactions locally.";
    }

    if (evidence.meaningfulMemoAmountMatch) {
        return "Matched memo details and amount from prior transactions locally.";
    }

    return "Matched Plaid merchant/category details and amount from prior transactions locally.";
}

function getFallbackCategoryIdsByLabel(input: {
    references: ClassificationReferenceRecords;
    target: ClassificationTarget;
}) {
    const targetTokens = getTextTokens(
        input.target.transaction.memo,
        input.target.plaidSync?.categoryText,
        input.target.plaidSync?.personalFinanceCategoryPrimary,
        input.target.plaidSync?.personalFinanceCategoryDetailed,
    );

    return input.references.categories
        .map((category) => ({
            categoryId: category.categoryId,
            score: getOverlapCount(targetTokens, getTextTokens(category.name)),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3)
        .map((entry) => entry.categoryId);
}

function getCandidateCategoryIds(input: {
    candidates: HistoryCandidate[];
    references: ClassificationReferenceRecords;
    target: ClassificationTarget;
}) {
    const categoryIds = new Set<string>();

    for (const category of countCategoryMatches(input.candidates).slice(0, 4)) {
        categoryIds.add(category.categoryId);
    }

    for (const categoryId of getFallbackCategoryIdsByLabel({
        references: input.references,
        target: input.target,
    })) {
        categoryIds.add(categoryId);
    }

    return Array.from(categoryIds)
        .filter((categoryId) => input.references.activeCategoryById.has(categoryId))
        .slice(0, 6);
}

function getDeterministicTextSuggestions(input: {
    candidates: HistoryCandidate[];
    target: ClassificationTarget;
}) {
    const topCandidate = input.candidates[0];
    const payee = normalizeOptionalString(input.target.transaction.payee);
    const memo = normalizeOptionalString(input.target.transaction.memo);
    const plaidMerchant = normalizeOptionalString(
        input.target.plaidSync?.merchantName,
    );
    const suggestedPayee =
        !payee && plaidMerchant
            ? plaidMerchant
            : !payee && topCandidate?.payee
              ? topCandidate.payee
              : undefined;
    const suggestedMemo =
        !memo && topCandidate?.memo ? topCandidate.memo : undefined;

    return {
        ...(suggestedMemo ? { suggestedMemo } : {}),
        ...(suggestedPayee ? { suggestedPayee } : {}),
    };
}

function createLocalHistorySuggestion(input: {
    candidates: HistoryCandidate[];
    target: ClassificationTarget;
}): LocalHistorySuggestionResult | null {
    if (input.target.targetLineIds.length !== 1) {
        return null;
    }

    const evidenceByTransactionId = new Map(
        input.candidates.map((candidate) => [
            candidate.transactionId,
            getLocalSemanticEvidence({
                candidate,
                target: input.target,
            }),
        ]),
    );
    const strongCandidates = input.candidates
        .filter((candidate) =>
            Boolean(
                evidenceByTransactionId.get(candidate.transactionId)
                    ?.hasLocalMatch,
            ),
        )
        .slice(0, 8);

    if (strongCandidates.length === 0) {
        return null;
    }

    const topCandidate = strongCandidates[0];
    const topCandidateCategoryIds = topCandidate
        ? getHistoryCandidateCategoryIds(topCandidate)
        : [];
    const topCandidateEvidence = topCandidate
        ? evidenceByTransactionId.get(topCandidate.transactionId)
        : undefined;
    const hasStrongCategoryConflict =
        topCandidateCategoryIds.length > 0 &&
        hasConflictingStrongCategory({
            candidates: strongCandidates,
            topCandidateCategoryIds,
        });

    if (
        topCandidate &&
        topCandidateEvidence?.hasLocalMatch &&
        topCandidateCategoryIds.length === 1 &&
        (topCandidateEvidence.exactFingerprint || !hasStrongCategoryConflict)
    ) {
        return {
            matches: [toDebugHistoryMatch(topCandidate, input.target)],
            matchIds: [topCandidate.exampleId],
            matchingPath: [
                "Matching path: semantic.",
                `Local semantic gate passed: ${getLocalEvidenceLabels(topCandidateEvidence).join("; ")}.`,
                `Chosen category came from top local match ${getLocalCandidateSummary({ candidate: topCandidate, evidence: topCandidateEvidence })}`,
            ],
            suggestion: {
                confidence: 0.98,
                lineAssignments: [
                    {
                        categoryId: topCandidateCategoryIds[0],
                        lineId: input.target.targetLineIds[0],
                    },
                ],
                reason: getLocalEvidenceReason(topCandidateEvidence),
                ...getDeterministicTextSuggestions({
                    candidates: strongCandidates,
                    target: input.target,
                }),
                targetLineIds: input.target.targetLineIds,
                transactionId: input.target.transaction.transactionId,
                transactionUpdatedAt: input.target.transaction.updatedAt,
                type: "category",
            },
        };
    }

    if (
        hasStrongCategoryConflict &&
        !strongCandidates.some(
            (candidate) =>
                evidenceByTransactionId.get(candidate.transactionId)
                    ?.exactFingerprint,
        )
    ) {
        return null;
    }

    const categoryCounts = countCategoryMatches(strongCandidates);
    const topCategory = categoryCounts[0];
    const totalMatches = categoryCounts.reduce(
        (sum, category) => sum + category.count,
        0,
    );

    if (
        !topCategory ||
        (topCategory.count < 2 &&
            !strongCandidates.some(
                (candidate) => candidate.fingerprint === input.target.fingerprint,
            )) ||
        topCategory.count / Math.max(totalMatches, 1) < 0.67
    ) {
        return null;
    }

    return {
        matches: strongCandidates.map((candidate) =>
            toDebugHistoryMatch(candidate, input.target),
        ),
        matchIds: strongCandidates.map((candidate) => candidate.exampleId),
        matchingPath: [
            "Matching path: semantic.",
            "Local semantic gate passed for multiple prior transactions.",
            `Chosen category ${topCategory.categoryId} won ${topCategory.count.toLocaleString()} of ${totalMatches.toLocaleString()} semantic-gated category votes.`,
            ...strongCandidates
                .slice(0, 4)
                .map((candidate) => {
                    const evidence = evidenceByTransactionId.get(
                        candidate.transactionId,
                    );

                    return evidence
                        ? getLocalCandidateSummary({ candidate, evidence })
                        : `${candidate.exampleId}: included as a strong local candidate.`;
                }),
        ],
        suggestion: {
            confidence: topCategory.count === totalMatches ? 0.98 : 0.9,
            lineAssignments: [
                {
                    categoryId: topCategory.categoryId,
                    lineId: input.target.targetLineIds[0],
                },
            ],
            reason:
                topCategory.count === totalMatches
                    ? "Matched prior classified transactions locally."
                    : "Matched the dominant category from prior classified transactions locally.",
            ...getDeterministicTextSuggestions({
                candidates: strongCandidates,
                target: input.target,
            }),
            targetLineIds: input.target.targetLineIds,
            transactionId: input.target.transaction.transactionId,
            transactionUpdatedAt: input.target.transaction.updatedAt,
            type: "category",
        },
    };
}

function getTargetClusterKey(target: ClassificationTarget) {
    return [
        normalizeContextText(
            target.plaidSync?.merchantName ??
                target.plaidSync?.name ??
                target.transaction.payee,
        ) || target.transaction.transactionId,
        target.transaction.referenceAccountId,
        getAmountSign(target.transaction.displayAmountCents),
    ].join(":");
}

function isNoisyTransactionText(value?: string | null) {
    const normalized = normalizeContextText(value);

    return (
        normalized.length > 0 &&
        (/^\d+$/.test(normalized) ||
            /\b(pos|purchase|debit|credit|card|online)\b/.test(normalized))
    );
}

function shouldAskForTransactionTextSuggestions(target: ClassificationTarget) {
    return getTargetTextSuggestionFields(target).length > 0;
}

async function selectEmbeddingMatchesForTargets(input: {
    deps: GenerateSuggestionsDeps;
    historyCandidates: HistoryCandidate[];
    ledgerId: string;
    references: ClassificationReferenceRecords;
    targets: ClassificationTarget[];
}) {
    const targetTexts = input.targets.map((target) => ({
        target,
        text: getTargetEmbeddingText(target),
    }));
    const embeddableTargets = targetTexts.filter((entry) => entry.text);
    const memoHistoryCandidates = input.historyCandidates.filter((entry) =>
        Boolean(normalizeOptionalString(entry.memo)),
    );

    if (embeddableTargets.length === 0 || memoHistoryCandidates.length === 0) {
        return createEmptySelectedEmbeddingMatches();
    }

    if (
        !input.deps.embedValues &&
        (!resolveOpenAiApiKey() || resolveNodeEnv() === "test")
    ) {
        return createEmptySelectedEmbeddingMatches();
    }

    try {
        const candidateBySourceKey = new Map<string, HistoryCandidate>();
        for (const candidate of memoHistoryCandidates) {
            candidateBySourceKey.set(
                createSourceKey({
                    sourceId: candidate.transactionId,
                    sourceType: "transaction",
                }),
                candidate,
            );
        }

        const embeddingRecords =
            await listTransactionClassificationEmbeddingRecords(input.ledgerId);
        const targetEmbeddings = await embedTransactionClassificationTexts(
            embeddableTargets.map((entry) => entry.text),
            {
                embedValues: input.deps.embedValues,
                existingRecords: embeddingRecords,
                ledgerId: input.ledgerId,
            },
        );
        const candidatesByTargetId = new Map<string, HistoryCandidate[]>();

        await Promise.all(
            embeddableTargets.map(async (entry, index) => {
                const targetEmbedding = targetEmbeddings[index];

                if (!targetEmbedding) {
                    return;
                }

                const matches = await buildEmbeddingMatches({
                    embeddingRecords,
                    maxMatches: EMBEDDING_MATCH_SCAN_LIMIT,
                    sourceKeys: new Set(candidateBySourceKey.keys()),
                    targetEmbedding,
                });
                const transactionMatches = rankEmbeddingCandidatesForTarget({
                    candidates: matches
                        .filter(
                            (match) =>
                                match.sourceType === "transaction" &&
                                match.score >= EMBEDDING_CONTEXT_MINIMUM_SCORE,
                        )
                        .map((match) => {
                            const candidate = candidateBySourceKey.get(
                                createSourceKey(match),
                            );

                            return candidate
                                ? mergeEmbeddingCandidate({
                                      candidate,
                                      similarity: match.score,
                                  })
                                : null;
                        })
                        .filter(
                            (candidate): candidate is HistoryCandidate =>
                                Boolean(candidate),
                        ),
                    limit: EMBEDDING_CANDIDATE_MATCH_LIMIT,
                    target: entry.target,
                });
                candidatesByTargetId.set(
                    entry.target.transaction.transactionId,
                    transactionMatches,
                );
            }),
        );

        return {
            candidatesByTargetId,
        };
    } catch (error) {
        console.error(error);

        return createEmptySelectedEmbeddingMatches();
    }
}

async function selectDebugEmbeddingContext(input: {
    deps?: GenerateSuggestionsDeps;
    embeddingRecords: TransactionClassificationEmbeddingRecord[];
    ledgerId: string;
    references: ClassificationReferenceRecords;
    sourceRecords: TransactionClassificationSourceRecord[];
    targets: ClassificationTarget[];
}) {
    const historyCandidates = buildHistoryCandidatesFromSourceRecords({
        references: input.references,
        sourceRecords: input.sourceRecords,
        targetTransactionIds: new Set(
            input.targets.map((target) => target.transaction.transactionId),
        ),
    });
    const empty = {
        embeddingMatches: createEmptySelectedEmbeddingMatches(),
        historyCandidates,
        references: input.references,
    };
    const targetTexts = input.targets.map((target) => ({
        target,
        text: getTargetEmbeddingText(target),
    }));
    const embeddableTargets = targetTexts.filter((entry) => entry.text);
    const memoHistoryCandidates = historyCandidates.filter((candidate) =>
        Boolean(normalizeOptionalString(candidate.memo)),
    );

    if (
        embeddableTargets.length === 0 ||
        memoHistoryCandidates.length === 0 ||
        input.embeddingRecords.length === 0
    ) {
        return empty;
    }

    const candidateBySourceKey = new Map(
        memoHistoryCandidates.map((candidate) => [
            createSourceKey({
                sourceId: candidate.transactionId,
                sourceType: "transaction",
            }),
            candidate,
        ]),
    );

    const targetEmbeddings = await embedTransactionClassificationTexts(
        embeddableTargets.map((entry) => entry.text),
        {
            embedValues: input.deps?.embedValues,
            existingRecords: input.embeddingRecords,
            ledgerId: input.ledgerId,
        },
    );
    const transactionMatchesByTargetId = new Map<string, EmbeddingMatch[]>();

    await Promise.all(
        embeddableTargets.map(async (entry, index) => {
            const targetEmbedding = targetEmbeddings[index];

            if (!targetEmbedding) {
                return;
            }

            const matches = await buildEmbeddingMatches({
                embeddingRecords: input.embeddingRecords,
                maxMatches: DEBUG_EMBEDDING_MATCH_SCAN_LIMIT,
                targetEmbedding,
            });
            const targetId = entry.target.transaction.transactionId;

            transactionMatchesByTargetId.set(
                targetId,
                matches
                    .filter(
                        (match) =>
                            match.sourceType === "transaction" &&
                            match.sourceId !== targetId &&
                            candidateBySourceKey.has(createSourceKey(match)) &&
                            match.score >= EMBEDDING_CONTEXT_MINIMUM_SCORE,
                    )
                    .slice(0, DEBUG_EMBEDDING_TRANSACTION_MATCHES_PER_TARGET),
            );
        }),
    );
    const selectedTransactionKeys = selectGlobalEmbeddingMatchKeys({
        globalLimit: DEBUG_EMBEDDING_GLOBAL_TRANSACTION_MATCH_LIMIT,
        matchesByTargetId: transactionMatchesByTargetId,
        perTargetLimit: DEBUG_EMBEDDING_TRANSACTION_MATCHES_PER_TARGET,
        targets: input.targets,
    });
    const candidatesByTargetId = new Map<string, HistoryCandidate[]>();

    for (const target of input.targets) {
        const targetId = target.transaction.transactionId;

        candidatesByTargetId.set(
            targetId,
            rankEmbeddingCandidatesForTarget({
                candidates: (transactionMatchesByTargetId.get(targetId) ?? [])
                    .filter((match) =>
                        selectedTransactionKeys.has(createSourceKey(match)),
                    )
                    .map((match) => {
                        const candidate = candidateBySourceKey.get(
                            createSourceKey(match),
                        );

                        return candidate
                            ? mergeEmbeddingCandidate({
                                  candidate,
                                  similarity: match.score,
                              })
                            : null;
                    })
                    .filter(
                        (candidate): candidate is HistoryCandidate =>
                            Boolean(candidate),
                    ),
                limit: EMBEDDING_CANDIDATE_MATCH_LIMIT,
                target,
            }),
        );
    }

    return {
        embeddingMatches: {
            candidatesByTargetId,
        },
        historyCandidates,
        references: input.references,
    };
}

function mergeRankedCandidates(input: {
    deterministicCandidates: HistoryCandidate[];
    embeddingCandidates: HistoryCandidate[];
    target: ClassificationTarget;
}) {
    const candidateById = new Map<string, HistoryCandidate>();

    for (const candidate of [
        ...input.deterministicCandidates,
        ...input.embeddingCandidates,
    ]) {
        const existing = candidateById.get(candidate.transactionId);

        candidateById.set(
            candidate.transactionId,
            existing
                ? {
                      ...existing,
                      embeddingSimilarity: Math.max(
                          existing.embeddingSimilarity ?? 0,
                          candidate.embeddingSimilarity ?? 0,
                      ),
                  }
                : candidate,
        );
    }

    return Array.from(candidateById.values())
        .map((candidate) => ({
            candidate,
            score: candidate.embeddingSimilarity
                ? scoreEmbeddingCandidateForTarget({
                      candidate,
                      target: input.target,
                  })
                : scoreHistoryCandidateForTarget({
                      candidate,
                      target: input.target,
                  }),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
            (left, right) =>
                right.score - left.score ||
                (right.candidate.embeddingSimilarity ?? 0) -
                    (left.candidate.embeddingSimilarity ?? 0) ||
                right.candidate.occurredAt.localeCompare(
                    left.candidate.occurredAt,
                ),
        )
        .slice(0, 4)
        .map((entry) => entry.candidate);
}

function getDeterministicIdentityValues(input: {
    payee?: string | null;
    plaidMerchantName?: string | null;
    plaidName?: string | null;
}) {
    return new Set(
        [input.payee, input.plaidMerchantName, input.plaidName]
            .map(normalizeTransactionClassificationSourceText)
            .filter(Boolean),
    );
}

function getDeterministicIdentityMatches(input: {
    candidate: HistoryCandidate;
    target: ClassificationTarget;
}) {
    const targetIdentities = getDeterministicIdentityValues({
        payee: input.target.transaction.payee,
        plaidMerchantName: input.target.plaidSync?.merchantName,
        plaidName: input.target.plaidSync?.name,
    });
    const candidateIdentities = getDeterministicIdentityValues({
        payee: input.candidate.payee,
        plaidMerchantName: input.candidate.plaidMerchantName,
        plaidName: input.candidate.plaidName,
    });

    return Array.from(targetIdentities).filter((identity) =>
        candidateIdentities.has(identity),
    );
}

function getHistoryCategoryCombination(candidate: HistoryCandidate) {
    return getHistoryCandidateCategoryIds(candidate).sort().join("|");
}

function selectFallbackMerchantHistory(input: {
    candidates: HistoryCandidate[];
    target: ClassificationTarget;
}) {
    const matchingCandidates = input.candidates
        .filter(
            (candidate) =>
                getDeterministicIdentityMatches({
                    candidate,
                    target: input.target,
                }).length > 0,
        )
        .sort(
            (left, right) =>
                right.occurredAt.localeCompare(left.occurredAt) ||
                right.updatedAt.localeCompare(left.updatedAt),
        );
    const selected: HistoryCandidate[] = [];
    const selectedIds = new Set<string>();
    const selectedCategoryCombinations = new Set<string>();

    for (const candidate of matchingCandidates) {
        const combination = getHistoryCategoryCombination(candidate);

        if (!combination || selectedCategoryCombinations.has(combination)) {
            continue;
        }

        selected.push(candidate);
        selectedIds.add(candidate.exampleId);
        selectedCategoryCombinations.add(combination);

        if (selected.length >= FALLBACK_MERCHANT_HISTORY_LIMIT) {
            return selected;
        }
    }

    for (const candidate of matchingCandidates) {
        if (selectedIds.has(candidate.exampleId)) {
            continue;
        }

        selected.push(candidate);

        if (selected.length >= FALLBACK_MERCHANT_HISTORY_LIMIT) {
            break;
        }
    }

    return selected;
}

function hasDeterministicPlaidCompatibility(input: {
    candidate: HistoryCandidate;
    target: ClassificationTarget;
}) {
    return (
        getOverlapCount(
            getPlaidCategoryTokens(input.target.plaidSync),
            getCandidatePlaidCategoryTokens(input.candidate),
        ) > 0
    );
}

function createDeterministicHistorySuggestion(input: {
    candidates: HistoryCandidate[];
    target: ClassificationTarget;
}): LocalHistorySuggestionResult | null {
    if (input.target.targetLineIds.length !== 1) {
        return null;
    }

    const matchedCandidates = input.candidates
        .map((candidate) => ({
            candidate,
            identityMatches: getDeterministicIdentityMatches({
                candidate,
                target: input.target,
            }),
            plaidCompatible: hasDeterministicPlaidCompatibility({
                candidate,
                target: input.target,
            }),
        }))
        .filter(
            (entry) =>
                entry.identityMatches.length > 0 &&
                getHistoryCandidateCategoryIds(entry.candidate).length === 1,
        );
    const plaidCompatibleCandidates = matchedCandidates.filter(
        (entry) => entry.plaidCompatible,
    );
    const identityPool =
        plaidCompatibleCandidates.length > 0
            ? plaidCompatibleCandidates
            : matchedCandidates;
    const recentCandidates = identityPool
        .sort(
            (left, right) =>
                right.candidate.occurredAt.localeCompare(
                    left.candidate.occurredAt,
                ) ||
                right.candidate.transactionId.localeCompare(
                    left.candidate.transactionId,
                ),
        )
        .slice(0, 10);

    if (recentCandidates.length === 0) {
        return null;
    }

    const exactAmountCandidates = recentCandidates.filter(
        (entry) =>
            entry.candidate.amountCents ===
            input.target.transaction.displayAmountCents,
    );
    const votingCandidates =
        exactAmountCandidates.length > 0
            ? exactAmountCandidates
            : recentCandidates;
    const categoryCounts = countCategoryMatches(
        votingCandidates.map((entry) => entry.candidate),
    );
    const winner = categoryCounts[0];

    if (!winner) {
        return null;
    }

    const unanimous =
        categoryCounts.length === 1 &&
        winner.count === votingCandidates.length;
    const identityLabels = Array.from(
        new Set(recentCandidates.flatMap((entry) => entry.identityMatches)),
    );
    const matches = votingCandidates.map((entry) =>
        toDebugHistoryMatch(entry.candidate),
    );

    return {
        matches,
        matchIds: votingCandidates.map((entry) => entry.candidate.exampleId),
        matchingPath: [
            "Matching path: deterministic.",
            "Used deterministic payee/Plaid matching; embeddings and the LLM were not used.",
            `Matched normalized identity: ${identityLabels.join(", ")}.`,
            `Retained ${recentCandidates.length.toLocaleString()} of the 10 most recent qualifying transactions${plaidCompatibleCandidates.length > 0 ? " with compatible Plaid category/PFC data" : ""}.`,
            exactAmountCandidates.length > 0
                ? `Restricted voting to ${exactAmountCandidates.length.toLocaleString()} exact-amount match${exactAmountCandidates.length === 1 ? "" : "es"}.`
                : "No exact-amount match was found among the recent candidates; all recent candidates voted.",
            `Category ${winner.categoryId} won with ${winner.count.toLocaleString()} of ${votingCandidates.length.toLocaleString()} votes; equal counts are resolved by most recent use.`,
        ],
        suggestion: {
            confidence: unanimous ? 0.98 : 0.9,
            lineAssignments: [
                {
                    categoryId: winner.categoryId,
                    lineId: input.target.targetLineIds[0],
                },
            ],
            matchingMethod: "deterministic",
            reason: exactAmountCandidates.length > 0
                ? "Matched recent payee/Plaid history and exact amount locally."
                : "Matched the most common category in recent payee/Plaid history locally.",
            targetLineIds: input.target.targetLineIds,
            transactionId: input.target.transaction.transactionId,
            transactionUpdatedAt: input.target.transaction.updatedAt,
            type: "category",
        },
    };
}

export async function selectTransactionClassificationContext(input: {
    deps?: GenerateSuggestionsDeps;
    embeddingMatches?: SelectedEmbeddingMatches;
    ledgerId: string;
    historyCandidates?: HistoryCandidate[];
    references: ClassificationReferenceRecords;
    targets: ClassificationTarget[];
    transactions: TransactionWithPostings[];
}): Promise<PreparedClassificationRun> {
    const targetTransactionIds = new Set(
        input.targets.map((target) => target.transaction.transactionId),
    );
    const historyCandidates =
        input.historyCandidates ??
        buildHistoryCandidates({
            references: input.references,
            targetTransactionIds,
            transactions: input.transactions,
        });
    const rankedCandidatesByTargetId = new Map<string, HistoryCandidate[]>();
    const embeddingMatches =
        input.embeddingMatches ??
        (await selectEmbeddingMatchesForTargets({
            deps: input.deps ?? {},
            historyCandidates,
            ledgerId: input.ledgerId,
            references: input.references,
            targets: input.targets,
        }));

    for (const target of input.targets) {
        const transactionId = target.transaction.transactionId;

        rankedCandidatesByTargetId.set(
            transactionId,
            mergeRankedCandidates({
                deterministicCandidates: [],
                embeddingCandidates:
                    embeddingMatches.candidatesByTargetId.get(transactionId) ?? [],
                target,
            }),
        );
    }

    const selectedMatches = new Map<string, HistoryCandidate>();

    for (let rank = 0; rank < 3 && selectedMatches.size < 15; rank += 1) {
        for (const target of input.targets) {
            const candidate = embeddingMatches.candidatesByTargetId.get(
                target.transaction.transactionId,
            )?.[rank];

            if (!candidate || selectedMatches.has(candidate.exampleId)) {
                continue;
            }

            selectedMatches.set(candidate.exampleId, candidate);

            if (selectedMatches.size >= 15) {
                break;
            }
        }
    }

    const promptMatches = new Map<string, HistoryCandidate>();

    const localSuggestionsByTransactionId = new Map<
        string,
        TransactionClassificationSuggestion
    >();
    const noSuggestionByTransactionId = new Map<
        string,
        TransactionClassificationSuggestion
    >();
    const clusterByKey = new Map<
        string,
        {
            candidateCategoryIds: Set<string>;
            matchIds: Set<string>;
            mode: "fallback" | "semantic";
            targets: ClassificationTarget[];
            wantsTextSuggestions: boolean;
        }
    >();
    const debugByTransactionId = new Map<string, PreparedDebugContext>();

    for (const target of input.targets) {
        const rankedCandidates =
            rankedCandidatesByTargetId.get(target.transaction.transactionId) ??
            [];
        const selectedEmbeddingCandidates =
            embeddingMatches.candidatesByTargetId
                .get(target.transaction.transactionId)
                ?.filter((candidate) =>
                    selectedMatches.has(candidate.exampleId),
                ) ?? [];
        const hasSemanticContext =
            Boolean(normalizeOptionalString(target.transaction.memo)) &&
            selectedEmbeddingCandidates.length > 0;
        const localSuggestionResult = hasSemanticContext
            ? createLocalHistorySuggestion({
                  candidates: rankedCandidates,
                  target,
              })
            : createDeterministicHistorySuggestion({
                  candidates: historyCandidates,
                  target,
              });

        if (localSuggestionResult) {
            localSuggestionsByTransactionId.set(
                target.transaction.transactionId,
                localSuggestionResult.suggestion,
            );
            debugByTransactionId.set(target.transaction.transactionId, {
                candidateCategoryIds:
                    localSuggestionResult.suggestion.lineAssignments.map(
                        (assignment) => assignment.categoryId,
                    ),
                matches: localSuggestionResult.matches,
                matchIds: Array.from(
                    new Set([
                        ...localSuggestionResult.matchIds,
                        ...selectedEmbeddingCandidates.map(
                            (candidate) => candidate.exampleId,
                        ),
                    ]),
                ),
                matchingPath: localSuggestionResult.matchingPath,
            });
            continue;
        }

        const semanticCandidateCategoryIds = hasSemanticContext
            ? getCandidateCategoryIds({
                  candidates: rankedCandidates,
                  references: input.references,
                  target,
              })
            : [];
        const mode =
            hasSemanticContext && semanticCandidateCategoryIds.length > 0
                ? "semantic"
                : "fallback";
        const merchantHistory =
            mode === "fallback"
                ? selectFallbackMerchantHistory({
                      candidates: historyCandidates,
                      target,
                  })
                : [];
        const evidenceCandidates = Array.from(
            new Map(
                [...selectedEmbeddingCandidates, ...merchantHistory].map(
                    (candidate) => [candidate.exampleId, candidate],
                ),
            ).values(),
        );
        const candidateCategoryIds =
            mode === "fallback"
                ? input.references.categories.map(
                      (category) => category.categoryId,
                  )
                : semanticCandidateCategoryIds;

        if (candidateCategoryIds.length === 0) {
            noSuggestionByTransactionId.set(
                target.transaction.transactionId,
                createNoSuggestion(
                    target,
                    "No active categories are available for classification.",
                ),
            );
            debugByTransactionId.set(target.transaction.transactionId, {
                candidateCategoryIds: [],
                matches: evidenceCandidates.map((candidate) =>
                    toDebugHistoryMatch(candidate),
                ),
                matchIds: evidenceCandidates.map(
                    (candidate) => candidate.exampleId,
                ),
                matchingPath: [
                    "Matching path: noSuggestion.",
                    "Neither local matching path produced a category.",
                    "No active categories are available for the LLM fallback.",
                ],
            });
            continue;
        }

        const clusterKey = `${mode}:${getTargetClusterKey(target)}`;
        const cluster =
            clusterByKey.get(clusterKey) ??
            {
                candidateCategoryIds: new Set<string>(),
                matchIds: new Set<string>(),
                mode,
                targets: [],
                wantsTextSuggestions: false,
            };

        cluster.targets.push(target);
        cluster.wantsTextSuggestions =
            cluster.wantsTextSuggestions ||
            shouldAskForTransactionTextSuggestions(target);

        for (const categoryId of candidateCategoryIds) {
            cluster.candidateCategoryIds.add(categoryId);
        }

        for (const candidate of evidenceCandidates) {
            promptMatches.set(candidate.exampleId, candidate);
            cluster.matchIds.add(candidate.exampleId);
        }

        debugByTransactionId.set(target.transaction.transactionId, {
            candidateCategoryIds,
            matchIds: Array.from(cluster.matchIds),
            matches: evidenceCandidates.map((candidate) =>
                toDebugHistoryMatch(
                    candidate,
                    mode === "semantic" ? target : undefined,
                    mode === "fallback"
                        ? ["exact normalized merchant identity"]
                        : undefined,
                ),
            ),
            matchingPath: [
                mode === "semantic"
                    ? "Matching path: semantic LLM."
                    : "Matching path: LLM fallback.",
                mode === "semantic"
                    ? "No local semantic-gated category suggestion was accepted."
                    : hasSemanticContext
                      ? "Semantic context did not produce a valid local result or category shortlist."
                      : "Semantic and deterministic local matching did not produce a category.",
                mode === "semantic"
                    ? `Built compact LLM context from ${candidateCategoryIds.length.toLocaleString()} candidate categor${candidateCategoryIds.length === 1 ? "y" : "ies"} and ${selectedEmbeddingCandidates.length.toLocaleString()} memo-bearing embedding match${selectedEmbeddingCandidates.length === 1 ? "" : "es"}.`
                    : `Built fallback LLM context from all ${candidateCategoryIds.length.toLocaleString()} active categor${candidateCategoryIds.length === 1 ? "y" : "ies"} and ${merchantHistory.length.toLocaleString()} same-merchant histor${merchantHistory.length === 1 ? "y record" : "y records"}.`,
            ],
        });
        clusterByKey.set(clusterKey, cluster);
    }

    const aiTargets = input.targets.filter(
        (target) =>
            !localSuggestionsByTransactionId.has(
                target.transaction.transactionId,
            ) &&
            !noSuggestionByTransactionId.has(target.transaction.transactionId),
    );
    const clusters = Array.from(clusterByKey.values()).map(
        (cluster, index): PromptTargetCluster =>
            ({
                candidateCategoryIds: Array.from(cluster.candidateCategoryIds),
                clusterId: `c${index + 1}`,
                matchIds: Array.from(cluster.matchIds).filter((matchId) =>
                    promptMatches.has(matchId),
                ),
                mode: cluster.mode,
                transactionIds: cluster.targets.map(
                    (target) => target.transaction.transactionId,
                ),
                wantsTextSuggestions: cluster.wantsTextSuggestions,
            }),
    );
    const candidateCategoryIds = Array.from(
        new Set(clusters.flatMap((cluster) => cluster.candidateCategoryIds)),
    );

    return {
        aiTargets,
        candidateCategoryIds,
        debugByTransactionId,
        localSuggestionsByTransactionId,
        noSuggestionByTransactionId,
        promptContext: {
            clusters,
            matches: Array.from(promptMatches.values()).map(
                toPromptHistoryMatch,
            ),
        },
    };
}

function buildClassificationSystemPrompt(input: {
    customSystemInstructions: string;
}) {
    return [
        "Classify personal budget transactions. Return one suggestion per target tid.",
        "Use only ids in the prompt. Return transactionId from tid and lineAssignments.lineId from target l.id.",
        "For each target, use its context entry. Use category only from categoryIds. Use noSuggestion when unsure.",
        "Treat managed order metadata as classification evidence only. Do not copy it into suggestedPayee or suggestedMemo.",
        "Only return suggestedPayee/suggestedMemo for target txt fields.",
        "Always include confidence, lineAssignments, reason, suggestedMemo, suggestedPayee, transactionId, and type. Use null for unused suggestedMemo/suggestedPayee and [] for unused lineAssignments.",
        input.customSystemInstructions.trim(),
    ]
        .filter(Boolean)
        .join("\n");
}

function buildClassificationPrompt(input: {
    prepared: PreparedClassificationRun;
    references: ClassificationReferenceRecords;
    settings: Awaited<ReturnType<typeof getTransactionClassificationSettings>>;
    targets: ClassificationTarget[];
}) {
    const categoryIds = new Set(input.prepared.candidateCategoryIds);

    return toCompactJson({
        categories: input.references.categories
            .filter((category) => categoryIds.has(category.categoryId))
            .map((category) => [
                category.categoryId,
                category.name,
                category.isIncomeCategory ? 1 : 0,
            ]),
        context: input.prepared.promptContext.clusters.map((cluster) =>
            compactObject({
                categoryIds: cluster.candidateCategoryIds,
                id: cluster.clusterId,
                matchIds: cluster.matchIds,
                mode: cluster.mode,
                targetIds: cluster.transactionIds,
                textSuggestions: cluster.wantsTextSuggestions ? 1 : undefined,
            }),
        ),
        instructions: [
            "Target keys: tid id, p payee, m memo, a amount cents, l lines, pl Plaid, om managed order context, txt allowed text suggestions. om contains provider and itemSummary. Plaid keys are m merchant, n transaction name, o original description, c category text, p primary PFC, d detailed PFC.",
            "Category entries are [categoryId,name,isIncome]. Match keys include dt date, a amount cents, p payee, m memo, pl Plaid, and c prior category ids.",
            "Use the context entry whose targetIds includes the target tid.",
            "For mode fallback, local matching could not decide. Classify from transaction text, account, amount and direction, Plaid context, and same-merchant history; categoryIds contains every valid category.",
            "For mode semantic, use the compact category shortlist and semantic history evidence.",
            "For category suggestions, assign every target l.id using only context.categoryIds.",
            "Return noSuggestion when the available evidence is genuinely insufficient; do not invent a category.",
            "All response keys are required. Use null for unused suggestedPayee/suggestedMemo and [] for unused lineAssignments.",
        ],
        matches: input.prepared.promptContext.matches,
        targets: input.targets.map(toPromptTarget),
        v: transactionClassificationPromptVersion,
    });
}

async function generateAiModelSuggestionResult(input: {
    ledgerId: string;
    modelId: string;
    prompt: string;
    system: string;
}): Promise<AiModelSuggestionResult> {
    const providerType = getTransactionClassificationModelProvider(input.modelId);
    const apiKey =
        providerType === "openai"
            ? resolveOpenAiApiKey()
            : resolveGoogleGenerativeAiApiKey();

    if (!apiKey) {
        if (providerType === "openai") {
            throw new HttpError(
                503,
                "openai_key_missing",
                "OpenAI is not configured. Set OPENAI_API_KEY or link the OpenAiApiKey SST secret.",
            );
        }

        throw new HttpError(
            503,
            "google_ai_key_missing",
            "Google AI Studio is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY or link the GoogleGenerativeAiApiKey SST secret.",
        );
    }

    const model =
        providerType === "openai"
            ? createOpenAI({ apiKey }).responses(input.modelId)
            : createGoogle({ apiKey })(input.modelId);
    const result = await generateObject({
        model,
        prompt: input.prompt,
        ...getTransactionClassificationGenerationOptions(input.modelId),
        schema: aiClassificationOutputSchema,
        system: input.system,
    });
    const requestText = formatTransactionClassificationRequestText({
        body: result.request.body,
        prompt: input.prompt,
        system: input.system,
    });
    const responseText = formatTransactionClassificationResponseText({
        body: result.response.body,
        object: result.object,
    });

    await recordTransactionClassificationInteraction({
        ledgerId: input.ledgerId,
        modelId: input.modelId,
        requestText,
        responseText,
    });

    return {
        requestText,
        responseText,
        suggestions: result.object.suggestions.map(
            normalizeAiModelSuggestionOutput,
        ),
    };
}

async function generateAiModelSuggestions(input: {
    ledgerId: string;
    modelId: string;
    prompt: string;
    system: string;
}) {
    return (await generateAiModelSuggestionResult(input)).suggestions;
}

function getErrorRecord(error: unknown): Record<string, unknown> | null {
    return error && typeof error === "object"
        ? (error as Record<string, unknown>)
        : null;
}

function getAiProviderStatusCode(error: unknown): number | undefined {
    const record = getErrorRecord(error);

    if (!record) {
        return undefined;
    }

    if (typeof record.statusCode === "number") {
        return record.statusCode;
    }

    const lastErrorStatus = getAiProviderStatusCode(record.lastError);

    if (lastErrorStatus) {
        return lastErrorStatus;
    }

    const causeStatus = getAiProviderStatusCode(record.cause);

    if (causeStatus) {
        return causeStatus;
    }

    if (Array.isArray(record.errors)) {
        for (const nestedError of record.errors) {
            const nestedStatus = getAiProviderStatusCode(nestedError);

            if (nestedStatus) {
                return nestedStatus;
            }
        }
    }

    return undefined;
}

function getAiProviderRequestBody(error: unknown): unknown {
    const record = getErrorRecord(error);

    if (!record) {
        return undefined;
    }

    if (record.requestBodyValues !== undefined) {
        return record.requestBodyValues;
    }

    const lastErrorRequest = getAiProviderRequestBody(record.lastError);

    if (lastErrorRequest !== undefined) {
        return lastErrorRequest;
    }

    const causeRequest = getAiProviderRequestBody(record.cause);

    if (causeRequest !== undefined) {
        return causeRequest;
    }

    if (Array.isArray(record.errors)) {
        for (const nestedError of record.errors) {
            const nestedRequest = getAiProviderRequestBody(nestedError);

            if (nestedRequest !== undefined) {
                return nestedRequest;
            }
        }
    }

    return undefined;
}

function getAiProviderResponseBody(error: unknown): unknown {
    const record = getErrorRecord(error);

    if (!record) {
        return undefined;
    }

    if (record.responseBody !== undefined) {
        return record.responseBody;
    }

    const lastErrorResponse = getAiProviderResponseBody(record.lastError);

    if (lastErrorResponse !== undefined) {
        return lastErrorResponse;
    }

    const causeResponse = getAiProviderResponseBody(record.cause);

    if (causeResponse !== undefined) {
        return causeResponse;
    }

    if (Array.isArray(record.errors)) {
        for (const nestedError of record.errors) {
            const nestedResponse = getAiProviderResponseBody(nestedError);

            if (nestedResponse !== undefined) {
                return nestedResponse;
            }
        }
    }

    return undefined;
}

function getAiProviderResponseMessage(error: unknown): string | undefined {
    const record = getErrorRecord(error);

    if (!record) {
        return undefined;
    }

    const lastErrorMessage = getAiProviderResponseMessage(record.lastError);

    if (lastErrorMessage) {
        return lastErrorMessage;
    }

    if (typeof record.responseBody === "string") {
        try {
            const parsed = z
                .object({
                    error: z.object({
                        message: z.string(),
                    }),
                })
                .safeParse(JSON.parse(record.responseBody));

            if (parsed.success) {
                return parsed.data.error.message;
            }
        } catch {
            return undefined;
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return undefined;
}

function getAiProviderLabel(modelId: string) {
    return getTransactionClassificationModelProvider(modelId) === "openai"
        ? "OpenAI"
        : "Google AI Studio";
}

function getAiProviderErrorCodePrefix(modelId: string) {
    return getTransactionClassificationModelProvider(modelId) === "openai"
        ? "openai"
        : "google_ai";
}

function toAiProviderErrorInteractionBody(error: unknown) {
    return (
        getAiProviderResponseBody(error) ??
        (error instanceof Error
            ? {
                  error: {
                      message: error.message,
                      name: error.name,
                      statusCode: getAiProviderStatusCode(error),
                  },
              }
            : {
                  error: String(error),
              })
    );
}

async function recordFailedTransactionClassificationInteraction(input: {
    error: unknown;
    ledgerId: string;
    modelId: string;
    prompt: string;
    system: string;
}) {
    const requestText = formatTransactionClassificationRequestText({
        body: getAiProviderRequestBody(input.error),
        prompt: input.prompt,
        system: input.system,
    });
    const responseText = formatTransactionClassificationResponseText({
        body: toAiProviderErrorInteractionBody(input.error),
        object: input.error,
    });

    try {
        await recordTransactionClassificationInteraction({
            ledgerId: input.ledgerId,
            modelId: input.modelId,
            requestText,
            responseText,
        });
    } catch (recordError) {
        console.error(recordError);
    }

    return {
        requestText,
        responseText,
    };
}

function toAiProviderHttpError(error: unknown, modelId: string) {
    if (error instanceof HttpError) {
        return error;
    }

    const statusCode = getAiProviderStatusCode(error);
    const providerMessage = getAiProviderResponseMessage(error);
    const codePrefix = getAiProviderErrorCodePrefix(modelId);
    const providerLabel = getAiProviderLabel(modelId);

    if (statusCode === 503) {
        return new HttpError(
            503,
            `${codePrefix}_unavailable`,
            providerMessage ??
                `${providerLabel} is temporarily unavailable. Try again in a few minutes.`,
        );
    }

    if (statusCode === 429) {
        return new HttpError(
            429,
            `${codePrefix}_rate_limited`,
            providerMessage ??
                `${providerLabel} rate limited this classification request. Try again later.`,
        );
    }

    if (statusCode) {
        return new HttpError(
            502,
            `${codePrefix}_request_failed`,
            providerMessage ??
                `${providerLabel} rejected this classification request.`,
        );
    }

    return null;
}

function createNoSuggestion(
    target: ClassificationTarget,
    reason: string,
): TransactionClassificationSuggestion {
    return {
        confidence: 0,
        lineAssignments: [],
        reason,
        targetLineIds: target.targetLineIds,
        transactionId: target.transaction.transactionId,
        transactionUpdatedAt: target.transaction.updatedAt,
        type: "noSuggestion",
    };
}

function getSuggestedTransactionTextFields(input: {
    raw: AiModelSuggestion;
    target: ClassificationTarget;
}) {
    const allowedFields = new Set(getTargetTextSuggestionFields(input.target));
    const suggestedMemo = normalizeOptionalString(input.raw.suggestedMemo);
    const suggestedPayee = normalizeOptionalString(input.raw.suggestedPayee);

    return {
        ...(suggestedMemo && allowedFields.has("memo")
            ? { suggestedMemo: suggestedMemo.slice(0, 500) }
            : {}),
        ...(suggestedPayee && allowedFields.has("payee")
            ? { suggestedPayee: suggestedPayee.slice(0, 120) }
            : {}),
    };
}

function validateAiSuggestion(input: {
    raw?: AiModelSuggestion;
    references: ClassificationReferenceRecords;
    target: ClassificationTarget;
}): TransactionClassificationSuggestion {
    const { raw, references, target } = input;

    if (!raw) {
        return createNoSuggestion(target, "The model did not return a suggestion.");
    }

    if (raw.type === "category") {
        const targetLineIds = new Set(target.targetLineIds);
        const assignments = (raw.lineAssignments ?? []).filter(
            (assignment) =>
                targetLineIds.has(assignment.lineId) &&
                references.activeCategoryById.has(assignment.categoryId),
        );
        const assignedLineIds = new Set(
            assignments.map((assignment) => assignment.lineId),
        );

        if (
            assignments.length !== target.targetLineIds.length ||
            target.targetLineIds.some((lineId) => !assignedLineIds.has(lineId))
        ) {
            return createNoSuggestion(
                target,
                "The model did not assign every unclassified line to a valid category.",
            );
        }

        return {
            confidence: raw.confidence,
            lineAssignments: assignments,
            reason: raw.reason,
            ...getSuggestedTransactionTextFields({ raw, target }),
            targetLineIds: target.targetLineIds,
            transactionId: target.transaction.transactionId,
            transactionUpdatedAt: target.transaction.updatedAt,
            type: "category",
        };
    }

    return {
        ...createNoSuggestion(target, raw.reason || "No suggestion returned."),
        ...getSuggestedTransactionTextFields({ raw, target }),
    };
}

function getDebugCategoryReferences(input: {
    categoryIds: string[];
    references: ClassificationReferenceRecords;
}) {
    return input.categoryIds.map((categoryId) => ({
        categoryId,
        name: input.references.activeCategoryById.get(categoryId)?.name ?? categoryId,
    }));
}

function getDebugChosenCategories(input: {
    references: ClassificationReferenceRecords;
    suggestion: TransactionClassificationSuggestion;
}) {
    if (input.suggestion.type !== "category") {
        return [];
    }

    return input.suggestion.lineAssignments.map((assignment) => ({
        categoryId: assignment.categoryId,
        lineId: assignment.lineId,
        name:
            input.references.activeCategoryById.get(assignment.categoryId)
                ?.name ?? assignment.categoryId,
    }));
}

function getDebugExplanations(input: {
    cluster?: PromptTargetCluster;
    debugContext?: PreparedClassificationRun["debugByTransactionId"] extends Map<
        string,
        infer TDebug
    >
        ? TDebug
        : never;
    llmPrompt: string | null;
    outcome: TransactionClassificationDebugRun["results"][number]["outcome"];
    suggestion?: TransactionClassificationSuggestion;
    target: ClassificationTarget;
}) {
    const explanations = [
        `Found ${input.target.targetLineIds.length.toLocaleString()} unclassified one-sided line${input.target.targetLineIds.length === 1 ? "" : "s"}.`,
        `Fingerprint: ${input.target.fingerprint}.`,
    ];

    if (input.debugContext?.candidateCategoryIds.length) {
        explanations.push(
            `Candidate categories came from memo-bearing embedding matches or category-name overlap: ${input.debugContext.candidateCategoryIds.join(", ")}.`,
        );
    }

    if (input.debugContext?.matchIds.length) {
        explanations.push(
            `Selected matches were included: ${input.debugContext.matchIds.join(", ")}.`,
        );
    }

    if (input.debugContext?.matchingPath.length) {
        explanations.push(
            `Matching path: ${input.debugContext.matchingPath.join(" ")}`,
        );
    }

    if (input.outcome === "local") {
        explanations.push(
            `Classifier returned a local suggestion without sending this target to the LLM: ${input.suggestion?.reason ?? "local match"}`,
        );
    } else if (input.outcome === "noSuggestion") {
        explanations.push(
            `Classifier stopped before the LLM: ${input.suggestion?.reason ?? "no suggestion"}`,
        );
    } else if (input.outcome === "llm") {
        explanations.push(
            input.llmPrompt
                ? "Classifier sent compact target context to the LLM."
                : "Classifier marked this target for the LLM, but no prompt was built.",
        );
    }

    if (input.cluster) {
        explanations.push(
            `LLM ${input.cluster.mode} cluster ${input.cluster.clusterId} included ${input.cluster.candidateCategoryIds.length.toLocaleString()} candidate categor${input.cluster.candidateCategoryIds.length === 1 ? "y" : "ies"} and ${input.cluster.matchIds.length.toLocaleString()} history match${input.cluster.matchIds.length === 1 ? "" : "es"}.`,
        );
    }

    return explanations;
}

export async function generateTransactionClassificationDebugRun(
    ledgerId: string,
    input: { transactionIds: string[] },
    options: { allowModelCall?: boolean; deps?: GenerateSuggestionsDeps } = {},
): Promise<TransactionClassificationDebugRun> {
    const requestedIds = Array.from(new Set(input.transactionIds)).slice(
        0,
        TRANSACTION_CLASSIFICATION_BATCH_LIMIT,
    );
    const requestedTransactions = await listTransactionsWithPostingsByIds({
        ledgerId,
        transactionIds: requestedIds,
    });
    const [
        accountAndCategoryRecords,
        requestedPlaidSyncs,
        settings,
        sourceRecords,
    ] = await Promise.all([
        loadClassificationAccountAndCategoryRecords(ledgerId),
        listPlaidSyncsForTransactions({
            ledgerId,
            transactions: requestedTransactions,
        }),
        getTransactionClassificationSettings(ledgerId),
        listTransactionClassificationSourceRecords(ledgerId),
    ]);
    let references = buildClassificationReferenceRecords({
        ...accountAndCategoryRecords,
        plaidSyncs: requestedPlaidSyncs,
    });
    const targets = getSelectedTargets({
        references,
        transactionIds: requestedIds,
        transactions: requestedTransactions,
    });
    const targetByTransactionId = new Map(
        targets.map((target) => [target.transaction.transactionId, target]),
    );
    const modelId = resolveTransactionClassificationModelId(settings.modelId);
    const system = buildClassificationSystemPrompt({
        customSystemInstructions: settings.systemInstructions,
    });
    let prepared: PreparedClassificationRun | null = null;
    let prompt: string | null = null;

    if (targets.length > 0) {
        const embeddingRecords =
            await listTransactionClassificationEmbeddingRecords(ledgerId);
        const debugEmbeddingContext = await selectDebugEmbeddingContext({
            deps: options.deps,
            embeddingRecords,
            ledgerId,
            references,
            sourceRecords,
            targets,
        });

        references = debugEmbeddingContext.references;
        prepared = await selectTransactionClassificationContext({
            embeddingMatches: debugEmbeddingContext.embeddingMatches,
            historyCandidates: debugEmbeddingContext.historyCandidates,
            ledgerId,
            references,
            targets,
            transactions: requestedTransactions,
        });
        prompt =
            prepared.aiTargets.length > 0
                ? buildClassificationPrompt({
                      prepared,
                      references,
                      settings,
                      targets: prepared.aiTargets,
                  })
                : null;
    }
    let rawSuggestions: AiModelSuggestion[] = [];
    let llmInteraction: TransactionClassificationDebugRun["llmInteraction"] =
        null;

    if (prompt && options.allowModelCall !== false) {
        try {
            const result = await generateAiModelSuggestionResult({
                ledgerId,
                modelId,
                prompt,
                system,
            });

            rawSuggestions = result.suggestions;
            llmInteraction = {
                requestText: result.requestText,
                responseText: result.responseText,
                sent: true,
            };
        } catch (error) {
            const recorded = await recordFailedTransactionClassificationInteraction({
                error,
                ledgerId,
                modelId,
                prompt,
                system,
            });

            llmInteraction = {
                errorMessage:
                    getAiProviderResponseMessage(error) ??
                    (error instanceof Error ? error.message : String(error)),
                requestText: recorded.requestText,
                responseText: recorded.responseText,
                sent: true,
            };
        }
    }

    const rawByTransactionId = new Map(
        rawSuggestions.map((suggestion) => [
            suggestion.transactionId,
            suggestion,
        ]),
    );

    return {
        eligibleCount: targets.length,
        llmInteraction,
        modelId,
        promptVersion: transactionClassificationPromptVersion,
        results: requestedTransactions.map((transaction) => {
            const target = targetByTransactionId.get(transaction.transactionId);

            if (!target || !prepared) {
                return {
                    candidateCategories: [],
                    chosenCategories: [],
                    explanations: [
                        "This transaction is not currently eligible for classification. It may already be classified, voided, an adjustment, a transfer, zero amount, or missing an unclassified one-sided account line.",
                    ],
                    matches: [],
                    matchingPath: [],
                    merchantSummaries: [],
                    outcome: "notEligible" as const,
                    transactionId: transaction.transactionId,
                };
            }

            const localSuggestion =
                prepared.localSuggestionsByTransactionId.get(
                    transaction.transactionId,
                );
            const noSuggestion =
                prepared.noSuggestionByTransactionId.get(
                    transaction.transactionId,
                );
            const rawSuggestion = rawByTransactionId.get(transaction.transactionId);
            const suggestion =
                localSuggestion ??
                noSuggestion ??
                validateAiSuggestion({
                    raw: rawSuggestion,
                    references,
                    target,
                });
            const outcome = localSuggestion
                ? "local"
                : noSuggestion
                  ? "noSuggestion"
                  : "llm";
            const cluster = prepared.promptContext.clusters.find((entry) =>
                entry.transactionIds.includes(transaction.transactionId),
            );
            const debugContext = prepared.debugByTransactionId.get(
                transaction.transactionId,
            );
            return {
                candidateCategories: getDebugCategoryReferences({
                    categoryIds: debugContext?.candidateCategoryIds ?? [],
                    references,
                }),
                chosenCategories: getDebugChosenCategories({
                    references,
                    suggestion,
                }),
                cluster,
                explanations: getDebugExplanations({
                    cluster,
                    debugContext,
                    llmPrompt: prompt,
                    outcome,
                    suggestion,
                    target,
                }),
                matches: debugContext?.matches ?? [],
                matchingPath: debugContext?.matchingPath ?? [],
                merchantSummaries: [],
                outcome,
                promptTarget: toPromptTarget(target),
                rawSuggestion,
                suggestion,
                transactionId: transaction.transactionId,
            };
        }),
    };
}

export async function generateTransactionClassificationSuggestionsForPreloadedRun(
    ledgerId: string,
    input: {
        context: TransactionClassificationPreloadedRunContext;
        transactionIds?: string[];
        transactions: TransactionWithPostings[];
    },
    deps: GenerateSuggestionsDeps = {},
) {
    const selectedTransactionIds = input.transactionIds
        ? new Set(input.transactionIds)
        : null;
    const transactions = selectedTransactionIds
        ? input.transactions.filter((transaction) =>
              selectedTransactionIds.has(transaction.transactionId),
          )
        : input.transactions;
    const plaidSyncs = await listPlaidSyncsForTransactions({
        ledgerId,
        transactions,
    });
    let references = buildClassificationReferenceRecords({
        ...input.context.accountAndCategoryRecords,
        plaidSyncs,
    });
    const targets = getSelectedTargets({
        references,
        transactionIds: input.transactionIds,
        transactions,
    });
    const modelId = resolveTransactionClassificationModelId(
        input.context.settings.modelId,
    );

    if (targets.length === 0) {
        return {
            eligibleCount: 0,
            modelId,
            promptVersion: transactionClassificationPromptVersion,
            suggestions: [] as TransactionClassificationSuggestion[],
        };
    }

    const system = buildClassificationSystemPrompt({
        customSystemInstructions: input.context.settings.systemInstructions,
    });
    const embeddingContext = await selectDebugEmbeddingContext({
        deps,
        embeddingRecords: input.context.embeddingRecords,
        ledgerId,
        references,
        sourceRecords: input.context.sourceRecords,
        targets,
    });

    references = embeddingContext.references;

    const prepared = await selectTransactionClassificationContext({
        deps,
        embeddingMatches: embeddingContext.embeddingMatches,
        historyCandidates: embeddingContext.historyCandidates,
        ledgerId,
        references,
        targets,
        transactions,
    });
    const prompt =
        prepared.aiTargets.length > 0
            ? buildClassificationPrompt({
                  prepared,
                  references,
                  settings: input.context.settings,
                  targets: prepared.aiTargets,
              })
            : null;
    let rawSuggestions: AiModelSuggestion[] = [];

    if (prompt) {
        try {
            rawSuggestions = await (deps.generateModelSuggestions ??
                generateAiModelSuggestions)({
                ledgerId,
                modelId,
                prompt,
                system,
            });
        } catch (error) {
            await recordFailedTransactionClassificationInteraction({
                error,
                ledgerId,
                modelId,
                prompt,
                system,
            });
            throw toAiProviderHttpError(error, modelId) ?? error;
        }
    }

    const rawByTransactionId = new Map(
        rawSuggestions.map((suggestion) => [
            suggestion.transactionId,
            suggestion,
        ]),
    );

    return {
        eligibleCount: targets.length,
        modelId,
        promptVersion: transactionClassificationPromptVersion,
        suggestions: targets.map((target) =>
            prepared.localSuggestionsByTransactionId.get(
                target.transaction.transactionId,
            ) ??
            prepared.noSuggestionByTransactionId.get(
                target.transaction.transactionId,
            ) ??
            validateAiSuggestion({
                raw: rawByTransactionId.get(target.transaction.transactionId),
                references,
                target,
            }),
        ),
    };
}

export async function generateTransactionClassificationSuggestions(
    ledgerId: string,
    input: { transactionIds?: string[] } = {},
    deps: GenerateSuggestionsDeps = {},
) {
    const [transactions, references, settings, sourceRecords] =
        await Promise.all([
        listTransactionsWithPostings(ledgerId),
        loadClassificationReferenceRecords(ledgerId),
        getTransactionClassificationSettings(ledgerId),
        listTransactionClassificationSourceRecords(ledgerId),
    ]);
    const targets = getSelectedTargets({
        references,
        transactionIds: input.transactionIds,
        transactions,
    });
    const modelId = resolveTransactionClassificationModelId(settings.modelId);

    if (targets.length === 0) {
        return {
            eligibleCount: 0,
            modelId,
            promptVersion: transactionClassificationPromptVersion,
            suggestions: [] as TransactionClassificationSuggestion[],
        };
    }

    const system = buildClassificationSystemPrompt({
        customSystemInstructions: settings.systemInstructions,
    });
    const targetTransactionIds = new Set(
        targets.map((target) => target.transaction.transactionId),
    );
    const historyCandidates =
        sourceRecords.length > 0
            ? buildHistoryCandidatesFromSourceRecords({
                  references,
                  sourceRecords,
                  targetTransactionIds,
              })
            : buildHistoryCandidates({
                  references,
                  targetTransactionIds,
                  transactions,
              });
    const prepared = await selectTransactionClassificationContext({
        deps,
        historyCandidates,
        ledgerId,
        references,
        targets,
        transactions,
    });
    const prompt =
        prepared.aiTargets.length > 0
            ? buildClassificationPrompt({
                  prepared,
                  references,
                  settings,
                  targets: prepared.aiTargets,
              })
            : null;
    let rawSuggestions: AiModelSuggestion[] = [];

    if (prompt) {
        try {
            rawSuggestions = await (deps.generateModelSuggestions ??
                generateAiModelSuggestions)({
                ledgerId,
                modelId,
                prompt,
                system,
            });
        } catch (error) {
            await recordFailedTransactionClassificationInteraction({
                error,
                ledgerId,
                modelId,
                prompt,
                system,
            });
            throw toAiProviderHttpError(error, modelId) ?? error;
        }
    }
    const rawByTransactionId = new Map(
        rawSuggestions.map((suggestion) => [
            suggestion.transactionId,
            suggestion,
        ]),
    );

    return {
        eligibleCount: targets.length,
        modelId,
        promptVersion: transactionClassificationPromptVersion,
        suggestions: targets.map((target) =>
            prepared.localSuggestionsByTransactionId.get(
                target.transaction.transactionId,
            ) ??
            prepared.noSuggestionByTransactionId.get(
                target.transaction.transactionId,
            ) ??
            validateAiSuggestion({
                raw: rawByTransactionId.get(target.transaction.transactionId),
                references,
                target,
            }),
        ),
    };
}

function toTransactionLineInput(
    line: TransactionWithPostings["lines"][number],
) {
    return {
        amountCents: line.amountCents,
        categoryId: toDisplayTransactionLineCategoryId(line.categoryId),
        fromAccountId: line.fromAccountId,
        lineId: line.lineId,
        memo: line.memo,
        payee: line.payee,
        sortOrder: line.sortOrder,
        toAccountId: line.toAccountId,
    };
}

function assertSuggestionFresh(input: {
    suggestion: TransactionClassificationSuggestion;
    transaction: TransactionWithPostings;
}) {
    if (input.transaction.updatedAt !== input.suggestion.transactionUpdatedAt) {
        throw new HttpError(
            409,
            "classification_suggestion_stale",
            "The transaction changed after this classification was generated. Run classification again before applying it.",
        );
    }
}

function buildCategoryApplyLines(input: {
    suggestion: TransactionClassificationSuggestion;
    transaction: TransactionWithPostings;
}) {
    const targetLineIds = new Set(input.suggestion.targetLineIds);
    const assignmentsByLineId = new Map(
        input.suggestion.lineAssignments.map((assignment) => [
            assignment.lineId,
            assignment.categoryId,
        ]),
    );

    return input.transaction.lines.map((line) => {
        const lineInput = toTransactionLineInput(line);

        if (!targetLineIds.has(line.lineId)) {
            return lineInput;
        }

        if (!isUncategorizedAccountMovementLine(line)) {
            throw new HttpError(
                409,
                "classification_line_stale",
                "One or more classified lines are no longer unclassified.",
            );
        }

        return {
            ...lineInput,
            categoryId: assignmentsByLineId.get(line.lineId),
        };
    });
}

async function getFreshTransactionTarget(input: {
    ledgerId: string;
    references: ClassificationReferenceRecords;
    suggestion: TransactionClassificationSuggestion;
}) {
    const transactions = await listTransactionsWithPostings(input.ledgerId);
    const transaction = transactions.find(
        (candidate) =>
            candidate.transactionId === input.suggestion.transactionId,
    );

    if (!transaction) {
        throw new HttpError(
            404,
            "transaction_missing",
            "The transaction could not be found.",
        );
    }

    assertSuggestionFresh({ suggestion: input.suggestion, transaction });

    const target = buildTarget(transaction, input.references);

    if (!target) {
        throw new HttpError(
            409,
            "classification_target_stale",
            "The transaction is no longer eligible for classification.",
        );
    }

    return { target, transaction };
}

export async function applyTransactionClassificationSuggestionToTransaction(input: {
    actorUserId: string;
    fieldSelection?: TransactionClassificationFieldSelection;
    ledgerId: string;
    modelId?: string;
    mutationId?: string;
    suggestion: TransactionClassificationSuggestion;
    transaction: TransactionWithPostings;
}) {
    if (input.suggestion.type === "noSuggestion") {
        throw new HttpError(
            422,
            "classification_no_suggestion",
            "No-suggestion results cannot be applied.",
        );
    }

    assertSuggestionFresh({
        suggestion: input.suggestion,
        transaction: input.transaction,
    });

    if (!isTransactionClassificationEligible(input.transaction)) {
        throw new HttpError(
            409,
            "classification_target_stale",
            "The transaction is no longer eligible for classification.",
        );
    }

    const lines = buildCategoryApplyLines({
        suggestion: input.suggestion,
        transaction: input.transaction,
    });
    const applySuggestedMemo =
        Boolean(input.fieldSelection?.applySuggestedMemo) &&
        Boolean(input.suggestion.suggestedMemo);
    const applySuggestedPayee =
        Boolean(input.fieldSelection?.applySuggestedPayee) &&
        Boolean(input.suggestion.suggestedPayee);
    const result = await upsertTransactionWithWorkspaceChanges(input.ledgerId, {
        accountId: input.transaction.referenceAccountId,
        audit: {
            action: "update",
            actorUserId: input.actorUserId,
            source: "aiClassification",
        },
        kind: input.transaction.kind,
        lines,
        memo: applySuggestedMemo
            ? input.suggestion.suggestedMemo!
            : input.transaction.memo ?? "",
        occurredAt: input.transaction.occurredAt,
        payee: applySuggestedPayee
            ? input.suggestion.suggestedPayee!
            : input.transaction.payee ?? "",
        transactionId: input.transaction.transactionId,
        ...(input.mutationId
            ? {
                  workspaceMutation: {
                      mutationId: `${input.mutationId}:${input.transaction.transactionId}`,
                      mutationType: "transaction.classification.apply",
                  },
              }
            : {}),
    });

    return result.workspaceChanges;
}

async function applySingleSuggestion(input: {
    actorUserId: string;
    fieldSelection?: TransactionClassificationFieldSelection;
    ledgerId: string;
    modelId?: string;
    mutationId?: string;
    references: ClassificationReferenceRecords;
    suggestion: TransactionClassificationSuggestion;
}) {
    if (input.suggestion.type === "noSuggestion") {
        throw new HttpError(
            422,
            "classification_no_suggestion",
            "No-suggestion results cannot be applied.",
        );
    }

    const { transaction } = await getFreshTransactionTarget({
        ledgerId: input.ledgerId,
        references: input.references,
        suggestion: input.suggestion,
    });

    return applyTransactionClassificationSuggestionToTransaction({
        actorUserId: input.actorUserId,
        fieldSelection: input.fieldSelection,
        ledgerId: input.ledgerId,
        modelId: input.modelId,
        mutationId: input.mutationId,
        suggestion: input.suggestion,
        transaction,
    });
}

export async function applyTransactionClassificationSuggestions(input: {
    actorUserId: string;
    fieldSelections?: TransactionClassificationFieldSelection[];
    ledgerId: string;
    modelId?: string;
    mutationId?: string;
    suggestions: TransactionClassificationSuggestion[];
}) {
    const references = await loadClassificationReferenceRecords(input.ledgerId);
    const workspaceChanges: WorkspaceMutationChangeInput[] = [];
    const fieldSelectionByTransactionId = new Map(
        (input.fieldSelections ?? []).map((selection) => [
            selection.transactionId,
            selection,
        ]),
    );

    for (const suggestion of input.suggestions) {
        workspaceChanges.push(
            ...(await applySingleSuggestion({
                actorUserId: input.actorUserId,
                fieldSelection: fieldSelectionByTransactionId.get(
                    suggestion.transactionId,
                ),
                ledgerId: input.ledgerId,
                modelId: input.modelId,
                mutationId: input.mutationId,
                references,
                suggestion,
            })),
        );
    }

    return {
        appliedCount: input.suggestions.length,
        workspaceChanges,
    };
}
