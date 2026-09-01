import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createWorkspaceMutationOperationEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "workspaceMutationOperation",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                completedStepCount: { type: "number", required: true },
                createdAt: { type: "string", required: true },
                expiresAt: { type: "number", required: true },
                ledgerId: { type: "string", required: true },
                mutationId: { type: "string", required: true },
                mutationType: { type: "string", required: true },
                operationJson: { type: "string", required: true },
                status: {
                    type: ["running", "completed", "failed"] as const,
                    required: true,
                },
                updatedAt: { type: "string", required: true },
                workspaceId: {
                    type: "string",
                    required: true,
                    default: () => "global",
                },
            },
            indexes: {
                byOperation: {
                    pk: {
                        field: "pk",
                        composite: ["workspaceId", "ledgerId"],
                    },
                    sk: { field: "sk", composite: ["mutationId"] },
                },
            },
        },
        options,
    );
}
