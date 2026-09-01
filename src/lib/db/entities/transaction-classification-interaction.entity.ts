import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionClassificationInteractionEntity(
    options: EntityOptions,
) {
    return new Entity(
        {
            model: {
                entity: "transactionClassificationInteraction",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                expiresAt: { type: "number", required: true },
                interactionId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                modelId: { type: "string", required: true },
                promptVersion: { type: "string", required: true },
                requestText: { type: "string", required: true },
                responseText: { type: "string", required: true },
            },
            indexes: {
                byInteraction: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: {
                        field: "sk",
                        composite: ["createdAt", "interactionId"],
                    },
                },
            },
        },
        options,
    );
}
