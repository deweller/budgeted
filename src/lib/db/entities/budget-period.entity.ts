import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createBudgetPeriodEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "budgetPeriod",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                periodId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                startsOn: { type: "string", required: true },
                endsOn: { type: "string", required: true },
                currency: { type: ["USD"] as const, required: true },
                availableToBudgetCents: { type: "number" },
                status: { type: ["open", "closed"] as const, required: true },
                carryForwardFromPeriodId: { type: "string" },
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
                byPeriod: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["periodId"] },
                },
                byStatus: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["ledgerId"] },
                    sk: { field: "gsi1sk", composite: ["status", "periodId"] },
                },
            },
        },
        options,
    );
}
