import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createVenmoAccountMappingEntity(options: EntityOptions) {
    return new Entity(
        {
            model: { entity: "venmoAccountMapping", version: "1", service: "budgeted" },
            attributes: {
                mappingId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                externalAccountKey: { type: "string", required: true },
                institution: { type: "string", required: true },
                last4: { type: "string", required: true },
                accountId: { type: "string", required: true },
                createdAt: { type: "string", required: true },
                updatedAt: { type: "string", required: true },
            },
            indexes: {
                byMapping: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["mappingId"] },
                },
                byExternalAccount: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["ledgerId", "externalAccountKey"] },
                    sk: { field: "gsi1sk", composite: ["mappingId"] },
                },
            },
        },
        options,
    );
}
