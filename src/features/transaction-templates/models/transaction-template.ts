import { z } from "zod";

import {
    assertValidTransactionTemplateFormula,
    type TransactionTemplateLineDefinition,
} from "@/features/transaction-templates/models/formula";
import type { WorkspaceTransactionTemplateRecord } from "@/lib/workspace/sync-types";

export const transactionTemplateLineInputSchema = z
    .object({
        categoryId: z.string().trim().min(1),
        formula: z
            .string()
            .trim()
            .min(1, "Formula is required.")
            .refine((formula) => {
                try {
                    assertValidTransactionTemplateFormula(formula);
                    return true;
                } catch {
                    return false;
                }
            }, "Formula must use arithmetic with total and remainder only."),
        lineId: z.string().trim().min(1).optional(),
        sortOrder: z.number().int().nonnegative(),
    })
    .strict();

export const transactionTemplateInputSchema = z
    .object({
        accountId: z.string().trim().min(1).nullish(),
        defaultAmountCents: z.number().int().nullish(),
        lines: z.array(transactionTemplateLineInputSchema).min(1),
        memo: z.string().trim().nullish(),
        name: z.string().trim().min(1, "Template name is required."),
        payee: z.string().trim().nullish(),
    })
    .strict();

export type TransactionTemplateInput = z.infer<
    typeof transactionTemplateInputSchema
>;

export type TransactionTemplateLineInput = z.infer<
    typeof transactionTemplateLineInputSchema
>;

export function parseTransactionTemplateLines(
    template: Pick<WorkspaceTransactionTemplateRecord, "linesJson">,
): TransactionTemplateLineDefinition[] {
    const parsed = z
        .array(
            z.object({
                categoryId: z.string().min(1),
                formula: z.string().min(1),
                lineId: z.string().min(1),
                sortOrder: z.number().int().nonnegative(),
            }),
        )
        .parse(JSON.parse(template.linesJson));

    return parsed;
}
