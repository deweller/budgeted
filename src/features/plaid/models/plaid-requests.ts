import { z } from "zod";

import { isValidIsoDate } from "@/lib/api/date-validation";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const plaidLinkAccountSchema = z.object({
    id: z.string().trim().min(1),
    mask: z.string().trim().optional().nullable(),
    name: z.string().trim().optional().nullable(),
    subtype: z.string().trim().optional().nullable(),
    type: z.string().trim().optional().nullable(),
});

const plaidLinkInstitutionSchema = z
    .object({
        institution_id: z.string().trim().optional().nullable(),
        name: z.string().trim().optional().nullable(),
    })
    .optional()
    .nullable();

export const plaidLinkTokenRequestSchema = z.object({
    accountId: z.string().trim().min(1),
    accountSelectionEnabled: z.boolean().optional(),
    plaidItemId: z.string().trim().min(1).optional(),
});

export const plaidExchangeRequestSchema = z
    .object({
        accountId: z.string().trim().min(1),
        accounts: z.array(plaidLinkAccountSchema).optional(),
        institution: plaidLinkInstitutionSchema,
        plaidAccountId: z.string().trim().min(1).optional(),
        plaidItemId: z.string().trim().min(1).optional(),
        publicToken: z.string().trim().optional(),
        syncStartDate: z
            .string()
            .regex(isoDatePattern, "Sync start date must use YYYY-MM-DD.")
            .refine(
                isValidIsoDate,
                "Sync start date must be a valid calendar date.",
            ),
    })
    .superRefine((value, context) => {
        if (!value.plaidAccountId && value.accounts?.length !== 1) {
            context.addIssue({
                code: "custom",
                message: "Select exactly one Plaid account to link.",
                path: ["plaidAccountId"],
            });
        }

        if (!value.publicToken && !value.plaidItemId) {
            context.addIssue({
                code: "custom",
                message:
                    "Provide a Plaid public token or reusable Plaid item to link.",
                path: ["publicToken"],
            });
        }
    });

export const plaidSyncRequestSchema = z
    .object({
        syncStartDate: z
            .string()
            .regex(isoDatePattern, "Sync start date must use YYYY-MM-DD.")
            .refine(
                isValidIsoDate,
                "Sync start date must be a valid calendar date.",
            )
            .optional(),
    })
    .optional()
    .default({});

export type PlaidExchangeRequest = z.infer<typeof plaidExchangeRequestSchema>;
export type PlaidLinkAccount = z.infer<typeof plaidLinkAccountSchema>;
export type PlaidSyncRequest = z.infer<typeof plaidSyncRequestSchema>;
export type PlaidLinkTokenRequest = z.infer<
    typeof plaidLinkTokenRequestSchema
>;
