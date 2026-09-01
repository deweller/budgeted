import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createYnabImportJobEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "ynabImportJob",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                accountMappingsJson: { type: "string" },
                completedAt: { type: "string" },
                createdAt: { type: "string", required: true },
                endMonth: { type: "string" },
                error: { type: "string" },
                expiresAt: { type: "number", required: true },
                filesJson: { type: "string", required: true },
                jobId: { type: "string", required: true },
                lastAction: {
                    type: ["analyze", "cleanup", "import"] as const,
                },
                leaseExpiresAt: { type: "number" },
                ledgerName: { type: "string" },
                previewRevision: {
                    type: "number",
                    required: true,
                    default: () => 0,
                },
                recordCount: { type: "number" },
                status: {
                    type: [
                        "analyzing",
                        "completed",
                        "failed",
                        "importing",
                        "ready",
                        "uploading",
                    ] as const,
                    required: true,
                },
                summaryJson: { type: "string" },
                targetLedgerId: { type: "string", required: true },
                updatedAt: { type: "string", required: true },
                userId: { type: "string", required: true },
                workspaceId: { type: "string", required: true },
            },
            indexes: {
                byJob: {
                    pk: { field: "pk", composite: ["workspaceId"] },
                    sk: { field: "sk", composite: ["jobId"] },
                },
                byUser: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["workspaceId", "userId"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["createdAt", "jobId"],
                    },
                },
            },
        },
        options,
    );
}
