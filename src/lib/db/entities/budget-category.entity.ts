import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createBudgetCategoryEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "budgetCategory",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                categoryId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                name: { type: "string", required: true },
                groupId: { type: "string", required: true },
                defaultAssignedCents: {
                    type: "number",
                    required: true,
                    default: () => 0,
                },
                allocationCadence: {
                    type: ["monthly", "yearly"] as const,
                    required: true,
                    default: () => "monthly",
                },
                allocationStartMonth: {
                    type: "number",
                },
                categoryType: {
                    type: ["spending", "savings"] as const,
                    default: () => "spending",
                },
                isIncomeCategory: {
                    type: "boolean",
                    required: true,
                    default: () => false,
                },
                autoAssignSourceEnabled: {
                    type: "boolean",
                },
                autoAssignSourceSortOrder: {
                    type: "number",
                },
                systemCategoryKey: {
                    type: ["startingBalances"] as const,
                },
                ledgerAccountId: { type: "string", required: true },
                status: {
                    type: ["active", "archived"] as const,
                    required: true,
                },
                sortOrder: { type: "number", required: true },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byCategory: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["categoryId"] },
                },
                byStatus: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["ledgerId"] },
                    sk: {
                        field: "gsi1sk",
                        composite: ["status", "sortOrder", "categoryId"],
                    },
                },
            },
        },
        options,
    );
}
