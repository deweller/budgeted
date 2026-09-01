import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export const WORKSPACE_STATE_ID = "default";

export function createWorkspaceStateEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "workspaceState",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                stateId: {
                    type: "string",
                    required: true,
                    default: () => WORKSPACE_STATE_ID,
                },
                workspaceId: {
                    type: "string",
                    required: true,
                    default: () => "global",
                },
                ledgerId: { type: "string", required: true },
                workspaceGeneration: { type: "number", required: true },
                workspaceRevision: { type: "number", required: true },
                oldestRetainedWorkspaceRevision: {
                    type: "number",
                    required: true,
                },
                entityCountsJson: { type: "string", required: true },
                entityDigestAccumulatorsJson: { type: "string" },
                entityDigestsJson: { type: "string" },
                entityRevisionsJson: { type: "string", required: true },
                createdAt: { type: "string", required: true },
                updatedAt: { type: "string", required: true },
            },
            indexes: {
                byState: {
                    pk: {
                        field: "pk",
                        composite: ["workspaceId", "ledgerId"],
                    },
                    sk: { field: "sk", composite: ["stateId"] },
                },
            },
        },
        options,
    );
}
