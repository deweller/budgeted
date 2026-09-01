import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createAmazonOrderSyncRunEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "amazonOrderSyncRun",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                syncRunId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                mode: { type: ["latest", "launch"] as const, required: true },
                status: {
                    type: [
                        "running",
                        "succeeded",
                        "failed",
                        "waitingForScraper",
                    ] as const,
                    required: true,
                },
                scraperSyncId: { type: "string" },
                scraperTaskArn: { type: "string" },
                scraperTaskStatus: { type: "string" },
                scraperState: { type: "string" },
                startedAt: { type: "string", required: true },
                completedAt: { type: "string" },
                importedAt: { type: "string" },
                orderCount: { type: "number" },
                paymentCount: { type: "number" },
                autoMatchedCount: { type: "number" },
                conflictCount: { type: "number" },
                unmatchedCount: { type: "number" },
                error: { type: "string" },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                bySyncRun: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["syncRunId"] },
                },
            },
        },
        options,
    );
}
