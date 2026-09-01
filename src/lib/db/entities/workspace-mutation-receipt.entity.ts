import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createWorkspaceMutationReceiptEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "workspaceMutationReceipt",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                batchId: { type: "string", required: true },
                changeCursor: { type: "string", required: true },
                expiresAt: { type: "number", required: true },
                ledgerId: { type: "string", required: true },
                mutationId: { type: "string", required: true },
                mutationType: { type: "string", required: true },
                workspaceId: {
                    type: "string",
                    required: true,
                    default: () => "global",
                },
            },
            indexes: {
                byMutation: {
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
