import { z } from "zod";

import {
    BUDGET_CATEGORY_ALLOCATION_CADENCES,
    DEFAULT_BUDGET_CATEGORY_ALLOCATION_CADENCE,
    DEFAULT_BUDGET_CATEGORY_ALLOCATION_START_MONTH,
} from "@/modules/budgeting/allocation-schedule";
import {
    BUDGET_CATEGORY_TYPES,
    DEFAULT_BUDGET_CATEGORY_TYPE,
} from "@/modules/budgeting/category-type";

export const globalPlanCategoryInputSchema = z.object({
    allocationCadence: z
        .enum(BUDGET_CATEGORY_ALLOCATION_CADENCES)
        .default(DEFAULT_BUDGET_CATEGORY_ALLOCATION_CADENCE),
    allocationStartMonth: z
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .default(DEFAULT_BUDGET_CATEGORY_ALLOCATION_START_MONTH),
    categoryId: z.string().trim().min(1),
    categoryType: z
        .enum(BUDGET_CATEGORY_TYPES)
        .default(DEFAULT_BUDGET_CATEGORY_TYPE),
    defaultAssignedCents: z.number().int(),
    groupId: z.string().trim().min(1, "Group is required."),
    isIncomeCategory: z.boolean(),
    name: z.string().trim().min(1, "Category name is required."),
    sortOrder: z.number().int().nonnegative(),
    systemCategoryKey: z.enum(["startingBalances"]).optional(),
});

export const globalPlanGroupInputSchema = z.object({
    groupId: z.string().trim().min(1),
    name: z.string().trim().min(1, "Group name is required."),
    sortOrder: z.number().int().nonnegative(),
    status: z.enum(["active", "archived"]).default("active"),
});

export const globalPlanFormSchema = z.object({
    categories: z.array(globalPlanCategoryInputSchema),
    groups: z.array(globalPlanGroupInputSchema),
});

export type GlobalPlanCategoryInput = z.input<
    typeof globalPlanCategoryInputSchema
>;
export type GlobalPlanGroupInput = z.input<typeof globalPlanGroupInputSchema>;

export type GlobalPlanFormInput = z.input<typeof globalPlanFormSchema>;
