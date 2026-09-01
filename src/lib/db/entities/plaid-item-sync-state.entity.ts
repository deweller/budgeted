import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createPlaidItemSyncStateEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "plaidItemSyncState",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                plaidItemId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                syncCursor: { type: "string" },
                status: {
                    type: ["active", "error"] as const,
                    required: true,
                },
                lastSyncedAt: { type: "string" },
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
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["plaidItemId"] },
                },
            },
        },
        options,
    );
}
