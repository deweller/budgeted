import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createAutomationScheduleEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "automationSchedule",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                aiClassificationEnabled: { type: "boolean", required: true },
                aiClassificationTime: { type: "string", required: true },
                amazonImportEnabled: { type: "boolean", required: true },
                amazonImportTime: { type: "string", required: true },
                amazonScraperEnabled: { type: "boolean", required: true },
                amazonScraperTime: { type: "string", required: true },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                plaidSyncEnabled: { type: "boolean", required: true },
                plaidSyncTime: { type: "string", required: true },
                settingsId: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                workspaceId: { type: "string", required: true },
            },
            indexes: {
                bySettings: {
                    pk: { field: "pk", composite: ["workspaceId"] },
                    sk: { field: "sk", composite: ["settingsId"] },
                },
            },
        },
        options,
    );
}
