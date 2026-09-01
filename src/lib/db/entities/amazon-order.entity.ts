import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createAmazonOrderEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "amazonOrder",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                amazonOrderId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                orderNumber: { type: "string", required: true },
                orderPlacedDate: { type: "string" },
                grandTotalCents: { type: "number" },
                itemSummary: { type: "string", required: true },
                itemTitlesJson: { type: "string", required: true },
                sourcePayloadJson: { type: "string", required: true },
                sourceSyncId: { type: "string" },
                firstImportedAt: { type: "string", required: true },
                lastImportedAt: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byOrder: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["amazonOrderId"] },
                },
            },
        },
        options,
    );
}
