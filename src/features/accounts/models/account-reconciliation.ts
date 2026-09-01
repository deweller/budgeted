import { z } from "zod";

export const accountReconciliationPreviewQuerySchema = z.object({
    manualBalanceCents: z.coerce.number().int().optional(),
});

export const accountReconciliationCommitSchema = z.object({
    adjustment: z
        .object({
            categoryId: z.string().trim().min(1).optional(),
            confirmedDifferenceCents: z.number().int(),
            kind: z.enum(["adjustment", "standard"]).optional(),
        })
        .optional(),
    mutationId: z.string().trim().min(1).max(128).optional(),
    manualBalanceCents: z.number().int().optional(),
    previewRevision: z.string().trim().min(1),
});

export type AccountReconciliationPreview = {
    accountId: string;
    accountName: string;
    alreadyReconciledCount: number;
    cutoffDate: string;
    differenceCents: number;
    eligibleTransactionCount: number;
    institutionBalanceCents?: number;
    ledgerBalanceCents: number;
    manualBalanceCents?: number;
    mismatchSuggestions: AccountReconciliationMismatchSuggestion[];
    mode: "manual" | "plaid";
    previewRevision: string;
};

export type AccountReconciliationMismatchTransaction = {
    amountCents: number;
    occurredAt: string;
    payee?: string;
    source: "manual" | "plaid" | "venmo";
    status: "entered" | "cleared";
};

export type AccountReconciliationMismatchSuggestion = {
    apparentDuplicateCount?: number;
    confidence: "high" | "medium" | "low";
    reason:
        | "possibleDuplicateGroup"
        | "includedActivity"
        | "cutoffActivity"
        | "similarAmount";
    transactions: AccountReconciliationMismatchTransaction[];
};

export type AccountReconciliationCommitInput = z.infer<
    typeof accountReconciliationCommitSchema
>;
