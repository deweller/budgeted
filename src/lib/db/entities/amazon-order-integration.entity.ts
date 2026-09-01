import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createAmazonOrderIntegrationEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "amazonOrderIntegration",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                integrationId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                accountId: { type: "string" },
                latestBudgetedImportAt: { type: "string" },
                latestBudgetedImportStatus: {
                    type: ["never", "running", "succeeded", "failed"] as const,
                    required: true,
                    default: "never",
                },
                latestScraperState: { type: "string" },
                latestScraperSyncId: { type: "string" },
                latestScraperSyncedAt: { type: "string" },
                latestSyncRunId: { type: "string" },
                lastError: { type: "string" },
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
                byIntegration: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["integrationId"] },
                },
            },
        },
        options,
    );
}
