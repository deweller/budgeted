import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createAllocationFundingSourceEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "allocationFundingSource",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                fundingSourceId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                allocationId: { type: "string", required: true },
                periodId: { type: "string", required: true },
                categoryId: { type: "string", required: true },
                sourceType: {
                    type: ["account", "incomeCategory", "budgetCategory"] as const,
                    required: true,
                },
                sourceId: { type: "string", required: true },
                amountCents: { type: "number", required: true },
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
                byFundingSource: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["fundingSourceId"] },
                },
                byAllocation: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["ledgerId", "allocationId"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["sourceType", "sourceId"],
                    },
                },
                byPeriod: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "periodId"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["categoryId", "fundingSourceId"],
                    },
                },
            },
        },
        options,
    );
}
