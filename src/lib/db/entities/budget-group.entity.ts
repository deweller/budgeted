import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createBudgetGroupEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "budgetGroup",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                groupId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                name: { type: "string", required: true },
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
                byGroup: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["groupId"] },
                },
                byStatus: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["ledgerId"] },
                    sk: {
                        field: "gsi1sk",
                        composite: ["status", "sortOrder", "groupId"],
                    },
                },
            },
        },
        options,
    );
}
