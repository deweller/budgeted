import { z } from "zod";

export const amazonOrderSettingsInputSchema = z.object({
    accountId: z.string().trim().min(1),
});

export const amazonOrderSyncInputSchema = z.object({
    mode: z.enum(["latest", "launch"]),
});

export const amazonOrderManualMatchInputSchema = z.object({
    transactionId: z.string().trim().min(1),
});

export type AmazonOrderSettingsInput = z.infer<
    typeof amazonOrderSettingsInputSchema
>;
export type AmazonOrderSyncInput = z.infer<typeof amazonOrderSyncInputSchema>;
export type AmazonOrderManualMatchInput = z.infer<
    typeof amazonOrderManualMatchInputSchema
>;
