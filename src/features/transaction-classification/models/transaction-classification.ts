import { z } from "zod";

export const TRANSACTION_CLASSIFICATION_BATCH_LIMIT = 25;

export const transactionClassificationPromptVersion = "2026-08-07.v1";

export const TRANSACTION_CLASSIFICATION_OPENAI_MODEL_ID = "gpt-5.6-luna";

export const transactionClassificationModelProviderSchema = z.enum([
    "google",
    "openai",
]);

export const transactionClassificationSuggestionTypeSchema = z.enum([
    "category",
    "noSuggestion",
]);

export const transactionClassificationPendingSourceSchema = z.enum([
    "manual",
    "background",
]);

export const transactionClassificationPendingStatusSchema = z.enum([
    "pending",
    "rejected",
]);

export const transactionClassificationLineAssignmentSchema = z
    .object({
        categoryId: z.string().trim().min(1),
        lineId: z.string().trim().min(1),
    })
    .strict();

export const transactionClassificationSuggestionSchema = z
    .object({
        confidence: z.number().min(0).max(1),
        lineAssignments: z
            .array(transactionClassificationLineAssignmentSchema)
            .default([]),
        matchingMethod: z
            .enum(["deterministic", "semantic", "model"])
            .optional(),
        reason: z.string().trim().max(500),
        suggestedMemo: z.string().trim().max(500).nullish(),
        suggestedPayee: z.string().trim().max(120).nullish(),
        targetLineIds: z.array(z.string().trim().min(1)).min(1),
        transactionId: z.string().trim().min(1),
        transactionUpdatedAt: z.string().trim().min(1),
        type: transactionClassificationSuggestionTypeSchema,
    })
    .strict()
    .superRefine((value, context) => {
        if (value.type === "category" && value.lineAssignments.length === 0) {
            context.addIssue({
                code: "custom",
                message: "Category suggestions require line assignments.",
                path: ["lineAssignments"],
            });
        }

    });

export const transactionClassificationSuggestionsRequestSchema = z
    .object({
        transactionIds: z
            .array(z.string().trim().min(1))
            .max(TRANSACTION_CLASSIFICATION_BATCH_LIMIT)
            .optional(),
    })
    .strict();

export const transactionClassificationFieldSelectionSchema = z
    .object({
        applySuggestedMemo: z.boolean().default(false),
        applySuggestedPayee: z.boolean().default(false),
        transactionId: z.string().trim().min(1),
    })
    .strict();

export const transactionClassificationApplyRequestSchema = z
    .object({
        fieldSelections: z
            .array(transactionClassificationFieldSelectionSchema)
            .max(TRANSACTION_CLASSIFICATION_BATCH_LIMIT)
            .default([]),
        modelId: z.string().trim().min(1).optional(),
        mutationId: z.string().trim().min(1).max(128).optional(),
        suggestions: z
            .array(transactionClassificationSuggestionSchema)
            .min(1)
            .max(TRANSACTION_CLASSIFICATION_BATCH_LIMIT),
    })
    .strict();

export const transactionClassificationSettingsInputSchema = z
    .object({
        modelId: z.string().trim().min(1).optional(),
        systemInstructions: z.string().trim().max(4_000).optional(),
    })
    .strict();

export const transactionClassificationDebugSelectionSchema = z
    .object({
        transactionIds: z
            .array(z.string().trim().min(1))
            .min(1)
            .max(TRANSACTION_CLASSIFICATION_BATCH_LIMIT),
    })
    .strict();

export const transactionClassificationClassifyNowRequestSchema = z
    .object({
        accountId: z.string().trim().min(1),
    })
    .strict();

const transactionClassificationPendingFetchByTransactionIdsRequestSchema = z
    .object({
        transactionIds: z
            .array(z.string().trim().min(1))
            .min(1)
            .max(500),
    })
    .strict();

const transactionClassificationPendingFetchByAccountRequestSchema = z
    .object({
        accountId: z.string().trim().min(1),
    })
    .strict();

export const transactionClassificationPendingFetchRequestSchema = z.union([
    transactionClassificationPendingFetchByAccountRequestSchema,
    transactionClassificationPendingFetchByTransactionIdsRequestSchema,
]);

export const transactionClassificationPendingFieldSelectionSchema = z
    .object({
        applySuggestedMemo: z.boolean().default(false),
        applySuggestedPayee: z.boolean().default(false),
    })
    .strict();

export const transactionClassificationPendingApplyRequestSchema = z
    .object({
        fieldSelection:
            transactionClassificationPendingFieldSelectionSchema.optional(),
        transactionId: z.string().trim().min(1),
        mutationId: z.string().trim().min(1).max(128).optional(),
    })
    .strict();

export const transactionClassificationPendingRejectRequestSchema = z
    .object({
        transactionId: z.string().trim().min(1),
    })
    .strict();

export const transactionClassificationPendingPublicSchema = z
    .object({
        accountId: z.string(),
        createdAt: z.string(),
        expiresAt: z.number(),
        modelId: z.string(),
        promptVersion: z.string(),
        rejectedAt: z.string().nullable(),
        source: transactionClassificationPendingSourceSchema,
        suggestion: transactionClassificationSuggestionSchema,
        status: transactionClassificationPendingStatusSchema,
        suggestionType: transactionClassificationSuggestionTypeSchema,
        transactionId: z.string(),
        transactionUpdatedAt: z.string(),
        updatedAt: z.string(),
    })
    .strict();

export type TransactionClassificationModelProvider = z.infer<
    typeof transactionClassificationModelProviderSchema
>;

export type TransactionClassificationModelOption = {
    label: string;
    modelId: string;
    provider: TransactionClassificationModelProvider;
};

export type TransactionClassificationSuggestion = z.infer<
    typeof transactionClassificationSuggestionSchema
>;

export type TransactionClassificationPendingSource = z.infer<
    typeof transactionClassificationPendingSourceSchema
>;

export type TransactionClassificationPendingStatus = z.infer<
    typeof transactionClassificationPendingStatusSchema
>;

export type TransactionClassificationFieldSelection = z.infer<
    typeof transactionClassificationFieldSelectionSchema
>;

export type TransactionClassificationPendingPublic = z.infer<
    typeof transactionClassificationPendingPublicSchema
>;

export type TransactionClassificationSettingsInput = z.infer<
    typeof transactionClassificationSettingsInputSchema
>;

export type TransactionClassificationDebugSelection = z.infer<
    typeof transactionClassificationDebugSelectionSchema
>;
