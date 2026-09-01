import { z } from "zod";

export const allocationFundingSourceInputSchema = z
    .object({
        amountCents: z.number().int().positive(),
        sourceId: z.string().trim().min(1),
        sourceType: z.literal("budgetCategory"),
    })
    .strict();

export const allocationWithFundingSchema = z
    .object({
        assignedCents: z.number().int(),
        categoryId: z.string().trim().min(1),
        fundingSources: z.array(allocationFundingSourceInputSchema).optional(),
    })
    .strict();

export function createAllocationFundingSourceId(input: {
    categoryId: string;
    periodId: string;
    sourceId: string;
    sourceType: "budgetCategory";
}) {
    return [
        input.periodId,
        input.categoryId,
        input.sourceType,
        input.sourceId,
    ].join(":");
}

export type AllocationWithFundingInput = z.infer<
    typeof allocationWithFundingSchema
>;

export type AllocationFundingSourceInput = z.infer<
    typeof allocationFundingSourceInputSchema
>;
