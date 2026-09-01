import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createAutomationTaskRunEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "automationTaskRun",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                completedAt: { type: "string" },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                detailsJson: { type: "string", required: true },
                error: { type: "string" },
                expiresAt: { type: "number", required: true },
                ledgerId: { type: "string", required: true },
                scheduledDate: { type: "string", required: true },
                scheduledFor: { type: "string", required: true },
                startedAt: { type: "string", required: true },
                status: {
                    type: [
                        "failed",
                        "partial",
                        "queued",
                        "running",
                        "skipped",
                        "succeeded",
                    ] as const,
                    required: true,
                },
                taskRunId: { type: "string", required: true },
                taskType: {
                    type: [
                        "plaidSync",
                        "amazonScraper",
                        "amazonImport",
                        "aiClassification",
                    ] as const,
                    required: true,
                },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                workspaceId: { type: "string", required: true },
            },
            indexes: {
                byTaskRun: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["taskRunId"] },
                },
                byRecent: {
                    index: "gsi2",
                    pk: { field: "gsi2pk", composite: ["workspaceId"] },
                    sk: {
                        field: "gsi2sk",
                        composite: ["startedAt", "ledgerId", "taskRunId"],
                    },
                },
                byQueue: {
                    index: "gsi3",
                    pk: {
                        field: "gsi3pk",
                        composite: ["workspaceId", "status"],
                    },
                    sk: {
                        field: "gsi3sk",
                        composite: ["startedAt", "ledgerId", "taskRunId"],
                    },
                },
            },
        },
        options,
    );
}
