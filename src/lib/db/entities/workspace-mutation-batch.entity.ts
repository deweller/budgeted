import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createWorkspaceMutationBatchEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "workspaceMutationBatch",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                batchId: { type: "string", required: true },
                changeCursor: { type: "string", required: true },
                changeCount: { type: "number" },
                changesJson: { type: "string", required: true },
                createdAt: { type: "string", required: true },
                expiresAt: { type: "number", required: true },
                ledgerId: { type: "string", required: true },
                mutationId: { type: "string", required: true },
                mutationType: { type: "string", required: true },
                responseJson: { type: "string", required: true },
                workspaceGeneration: { type: "number", required: true },
                workspaceRevision: { type: "number", required: true },
                workspaceRevisionKey: { type: "string", required: true },
                workspaceId: {
                    type: "string",
                    required: true,
                    default: () => "global",
                },
            },
            indexes: {
                byBatch: {
                    pk: {
                        field: "pk",
                        composite: ["workspaceId", "ledgerId"],
                    },
                    sk: {
                        field: "sk",
                        composite: ["changeCursor", "batchId"],
                    },
                },
                byRevision: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["workspaceId", "ledgerId"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["workspaceRevisionKey", "batchId"],
                    },
                },
            },
        },
        options,
    );
}
