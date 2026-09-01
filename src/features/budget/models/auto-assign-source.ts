import { z } from "zod";

export const autoAssignSourceUpdateSchema = z
    .object({
        sources: z.array(
            z
                .object({
                    categoryId: z.string().trim().min(1),
                    sortOrder: z.number().int().nonnegative(),
                })
                .strict(),
        ),
    })
    .strict();

export type AutoAssignSourceUpdateInput = z.infer<
    typeof autoAssignSourceUpdateSchema
>;
