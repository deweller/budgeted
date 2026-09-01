import { z } from "zod";

import {
    hasTransactionLineAccount,
    isTransferTransactionLine,
} from "@/features/transactions/models/transaction-shape";
import {
    isValidTransactionDate,
    toTransactionOccurredAt,
} from "@/features/transactions/models/transaction-date";
import { isValidIsoDate } from "@/lib/api/date-validation";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const ledgerAccountKindValues = [
    "financial",
    "category",
    "equity",
] as const;

export const transactionKindValues = ["standard", "adjustment"] as const;

export const transactionPostingSchema = z.object({
    amountCents: z.number().int().positive(),
    direction: z.enum(["debit", "credit"]),
    ledgerAccountId: z.string().min(1),
    ledgerAccountKind: z.enum(ledgerAccountKindValues),
});

export const transactionLineSchema = z
    .object({
        amountCents: z.number().int().positive(),
        categoryId: z.string().trim().min(1).optional(),
        fromAccountId: z.string().trim().min(1).optional(),
        lineId: z.string().trim().min(1).optional(),
        memo: z.string().trim().optional(),
        payee: z.string().trim().optional(),
        sortOrder: z.number().int().nonnegative().optional(),
        toAccountId: z.string().trim().min(1).optional(),
    })
    .superRefine((value, context) => {
        if (!hasTransactionLineAccount(value)) {
            context.addIssue({
                code: "custom",
                message:
                    "Transaction lines require a from account, a to account, or both.",
                path: ["fromAccountId"],
            });
        }

        if (value.categoryId && isTransferTransactionLine(value)) {
            context.addIssue({
                code: "custom",
                message:
                    "A transaction line cannot be both a transfer and category assignment.",
                path: ["categoryId"],
            });
        }
    });

export const transactionInputSchema = z.object({
    accountId: z.string().trim().min(1).optional(),
    kind: z.enum(transactionKindValues).default("standard"),
    lines: z.array(transactionLineSchema).min(1),
    memo: z.string().trim().optional(),
    mutationId: z.string().trim().min(1).max(128).optional(),
    occurredAt: z
        .string()
        .min(1)
        .refine(isValidTransactionDate, "Transaction date must be valid.")
        .transform(toTransactionOccurredAt),
    payee: z.string().trim().optional(),
});

export const transactionQuerySchema = z
    .object({
        accountId: z.string().optional(),
        endDate: z
            .string()
            .regex(isoDatePattern, "End date must use YYYY-MM-DD.")
            .refine(isValidIsoDate, "End date must be a valid calendar date.")
            .optional(),
        periodId: z.string().optional(),
        startDate: z
            .string()
            .regex(isoDatePattern, "Start date must use YYYY-MM-DD.")
            .refine(isValidIsoDate, "Start date must be a valid calendar date.")
            .optional(),
    })
    .refine(
        ({ startDate, endDate }) =>
            !startDate ||
            !endDate ||
            new Date(`${startDate}T00:00:00.000Z`) <=
                new Date(`${endDate}T23:59:59.999Z`),
        {
            message: "Start date must be on or before the end date.",
            path: ["endDate"],
        },
    );

export const transactionBulkDeletePreviewSchema = z.object({
    transactionIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

export const transactionBulkDeleteSchema =
    transactionBulkDeletePreviewSchema.extend({
        mutationId: z.string().trim().min(1).max(128).optional(),
        previewRevision: z.string().trim().min(1),
    });

export const transactionBulkCategorizeSchema = z.object({
    categoryId: z.string().trim().min(1),
    mutationId: z.string().trim().min(1).max(128).optional(),
    transactionIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

export const transactionBulkStatusSchema = z.object({
    mutationId: z.string().trim().min(1).max(128).optional(),
    status: z.enum(["cleared", "reconciled"]),
    transactionIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

export const transactionMergeSchema = z.object({
    expectedMatchType: z
        .enum(["bankTransfer", "creditCardPayment", "duplicate"])
        .optional(),
    mutationId: z.string().trim().min(1).max(128).optional(),
    transactionIds: z
        .array(z.string().trim().min(1))
        .length(2, "Select exactly two transactions to merge."),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type TransactionLineInput = z.infer<typeof transactionLineSchema>;
export type TransactionPostingInput = z.infer<typeof transactionPostingSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type TransactionBulkDeleteInput = z.infer<
    typeof transactionBulkDeleteSchema
>;
export type TransactionBulkCategorizeInput = z.infer<
    typeof transactionBulkCategorizeSchema
>;
export type TransactionBulkDeletePreviewInput = z.infer<
    typeof transactionBulkDeletePreviewSchema
>;
export type TransactionBulkStatusInput = z.infer<
    typeof transactionBulkStatusSchema
>;
export type TransactionMergeInput = z.infer<typeof transactionMergeSchema>;
