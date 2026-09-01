import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createVenmoIntegrationEntity(options: EntityOptions) {
    return new Entity(
        {
            model: { entity: "venmoIntegration", version: "1", service: "budgeted" },
            attributes: {
                integrationId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                venmoAccountId: { type: "string" },
                inboundRecipient: { type: "string", required: true },
                inboxEnabled: { type: "boolean", required: true, default: false },
                latestProcessingAt: { type: "string" },
                latestProcessingStatus: {
                    type: ["never", "succeeded", "failed"] as const,
                    required: true,
                    default: "never",
                },
                lastError: { type: "string" },
                createdAt: { type: "string", required: true, default: () => new Date().toISOString() },
                updatedAt: { type: "string", required: true, default: () => new Date().toISOString() },
            },
            indexes: {
                byIntegration: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["integrationId"] },
                },
                byRecipient: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["inboundRecipient"] },
                    sk: { field: "gsi1sk", composite: ["ledgerId", "integrationId"] },
                },
            },
        },
        options,
    );
}
