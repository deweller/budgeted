import { z } from "zod";

export const groupFormSchema = z.object({
    name: z.string().trim().min(1, "Group name is required."),
    sortOrder: z.number().int().nonnegative().optional(),
    status: z.enum(["active", "archived"]).default("active"),
});

export type GroupFormInput = z.infer<typeof groupFormSchema>;
