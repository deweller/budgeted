import { z } from "zod";

export const deletionConfirmationSchema = z.object({
    mutationId: z.string().trim().min(1).max(128).optional(),
    previewRevision: z.string().trim().min(1),
});

export type DeletionConfirmationInput = z.infer<
    typeof deletionConfirmationSchema
>;
