import { z } from "zod";

import {
    accountTypeSupportsOpeningBalance,
    accountTypeValues,
} from "@/modules/accounts/account-types";
import { isValidIsoDate } from "@/lib/api/date-validation";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const accountInputBaseSchema = z.object({
    accountType: z.enum(accountTypeValues),
    name: z.string().trim().min(1, "Account name is required."),
    openedOn: z
        .string()
        .regex(isoDatePattern, "Opened date must use YYYY-MM-DD.")
        .refine(isValidIsoDate, "Opened date must be a valid calendar date."),
    openingBalanceCents: z
        .number()
        .int("Opening balance must be stored as whole cents."),
});

function validateOpeningBalanceForAccountType(
    value: Partial<z.infer<typeof accountInputBaseSchema>>,
    context: z.RefinementCtx,
) {
    if (
        value.accountType &&
        !accountTypeSupportsOpeningBalance(value.accountType) &&
        value.openingBalanceCents !== undefined &&
        value.openingBalanceCents !== 0
    ) {
        context.addIssue({
            code: "custom",
            message: "Transfers accounts must have a zero opening balance.",
            path: ["openingBalanceCents"],
        });
    }
}

export const accountInputSchema = accountInputBaseSchema.superRefine(
    validateOpeningBalanceForAccountType,
);

export const accountUpdateSchema = accountInputBaseSchema
    .partial()
    .superRefine(validateOpeningBalanceForAccountType)
    .refine((value) => Object.keys(value).length > 0, {
        message: "At least one account field must be provided.",
    });

export type AccountInput = z.infer<typeof accountInputSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
