import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionClassificationSettingsEntity(
    options: EntityOptions,
) {
    return new Entity(
        {
            model: {
                entity: "transactionClassificationSettings",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                ledgerId: { type: "string", required: true },
                modelId: { type: "string" },
                settingsId: { type: "string", required: true },
                systemInstructions: { type: "string" },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                bySettings: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["settingsId"] },
                },
            },
        },
        options,
    );
}
