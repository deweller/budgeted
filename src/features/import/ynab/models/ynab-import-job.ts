import { z } from "zod";

import { accountTypeValues } from "@/modules/accounts/account-types";

export const ynabImportRoleSchema = z.enum(["budget", "tracking", "exclude"]);

export const ynabAccountMappingSchema = z
    .object({
        accountId: z.string().min(1),
        accountName: z.string().min(1),
        accountType: z.enum(accountTypeValues),
        importRole: ynabImportRoleSchema,
        reason: z.string(),
    })
    .strict();

const ynabUploadFileSchema = z
    .object({
        contentType: z.string().min(1),
        kind: z.enum(["plan", "register", "zip"]),
        name: z.string().min(1),
        size: z.number().int().positive().max(100 * 1024 * 1024),
    })
    .strict();

export const createYnabImportUploadSchema = z
    .object({ files: z.array(ynabUploadFileSchema).min(1).max(2) })
    .strict()
    .superRefine((input, context) => {
        const kinds = input.files.map((file) => file.kind).sort();
        const valid =
            (kinds.length === 1 && kinds[0] === "zip") ||
            (kinds.length === 2 && kinds[0] === "plan" && kinds[1] === "register");

        if (!valid) {
            context.addIssue({
                code: "custom",
                message: "Choose one YNAB ZIP or one Plan and one Register CSV.",
                path: ["files"],
            });
        }
    });

export const previewYnabImportSchema = z
    .object({
        accountMappings: z.array(ynabAccountMappingSchema).optional(),
        endMonth: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
            .optional(),
        ledgerName: z.string().trim().min(1).max(120),
    })
    .strict();

export const startYnabImportSchema = z
    .object({ previewRevision: z.number().int().positive() })
    .strict();

export type CreateYnabImportUploadInput = z.infer<
    typeof createYnabImportUploadSchema
>;
export type PreviewYnabImportInput = z.infer<typeof previewYnabImportSchema>;

export type YnabImportJobStatus =
    | "analyzing"
    | "completed"
    | "failed"
    | "importing"
    | "ready"
    | "uploading";

export type YnabImportJobPublic = {
    accountMappings: z.infer<typeof ynabAccountMappingSchema>[];
    completedAt?: string;
    createdAt: string;
    endMonth?: string;
    error?: string;
    jobId: string;
    ledgerName?: string;
    previewRevision: number;
    recordCount?: number;
    status: YnabImportJobStatus;
    summary?: {
        accountCountByRole: Record<"budget" | "exclude" | "tracking", number>;
        budgetCategoryCount: number;
        budgetGroupCount: number;
        firstMonth: string | null;
        lastMonth: string | null;
        multiLineTransactionCount: number;
        skippedSyntheticAccountCount: number;
        transactionCount: number;
        transactionLineCount: number;
        warnings: Array<{ message: string }>;
    };
    targetLedgerId: string;
    updatedAt: string;
};
