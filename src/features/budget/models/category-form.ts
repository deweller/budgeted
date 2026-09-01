import { z } from "zod";

import {
    BUDGET_CATEGORY_TYPES,
    DEFAULT_BUDGET_CATEGORY_TYPE,
} from "@/modules/budgeting/category-type";

export const categoryFormSchema = z.object({
    categoryId: z.string().optional(),
    categoryType: z
        .enum(BUDGET_CATEGORY_TYPES)
        .default(DEFAULT_BUDGET_CATEGORY_TYPE),
    groupId: z.string().trim().min(1, "Group is required."),
    name: z.string().trim().min(1, "Category name is required."),
    sortOrder: z.number().int().nonnegative().optional(),
    status: z.enum(["active", "archived"]).default("active"),
});

export type CategoryFormInput = z.infer<typeof categoryFormSchema>;
