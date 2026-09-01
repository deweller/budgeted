import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createCategoryAllocationEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "categoryAllocation",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                allocationId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                periodId: { type: "string", required: true },
                categoryId: { type: "string", required: true },
                assignedCents: { type: "number", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byAllocation: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["periodId", "categoryId"] },
                },
                byPeriod: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["ledgerId", "periodId"] },
                    sk: { field: "gsi1sk", composite: ["categoryId"] },
                },
                byCategory: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "categoryId"],
                    },
                    sk: { field: "gsi2sk", composite: ["periodId"] },
                },
            },
        },
        options,
    );
}
