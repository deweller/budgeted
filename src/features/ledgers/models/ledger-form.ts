import { z } from "zod";

export const ledgerInputSchema = z.object({
    name: z.string().trim().min(1, "Ledger name is required."),
});

export const ledgerUpdateSchema = ledgerInputSchema;

export const ledgerDeletionSchema = z.object({
    confirmationName: z.string().trim().min(1, "Ledger name is required."),
});

export type LedgerInput = z.infer<typeof ledgerInputSchema>;
export type LedgerUpdateInput = z.infer<typeof ledgerUpdateSchema>;
export type LedgerDeletionInput = z.infer<typeof ledgerDeletionSchema>;
