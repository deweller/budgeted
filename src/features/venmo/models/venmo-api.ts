import { z } from "zod";

export const venmoSettingsInputSchema = z.object({
    inboxEnabled: z.boolean(),
    venmoAccountId: z.string().trim().min(1),
});

export const venmoAccountMappingInputSchema = z.object({
    accountId: z.string().trim().min(1),
    externalAccountKey: z.string().trim().min(3).max(256),
});

export const venmoManualMatchInputSchema = z.object({
    transactionId: z.string().trim().min(1),
});
