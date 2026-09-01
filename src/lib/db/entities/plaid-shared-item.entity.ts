import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createPlaidSharedItemEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "plaidSharedItem",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                sharedScope: {
                    type: "string",
                    required: true,
                    default: () => "global",
                },
                plaidItemId: { type: "string", required: true },
                accessToken: { type: "string", required: true },
                institutionId: { type: "string" },
                institutionName: { type: "string" },
                status: {
                    type: ["active", "error"] as const,
                    required: true,
                },
                lastSyncError: { type: "string" },
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
                byItem: {
                    pk: { field: "pk", composite: ["sharedScope"] },
                    sk: { field: "sk", composite: ["plaidItemId"] },
                },
                byInstitution: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["sharedScope", "institutionId"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["status", "updatedAt", "plaidItemId"],
                    },
                },
            },
        },
        options,
    );
}
