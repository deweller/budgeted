import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionAutoMatchRejectionEntity(
    options: EntityOptions,
) {
    return new Entity(
        {
            model: {
                entity: "transactionAutoMatchRejection",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                accountId: { type: "string", required: true },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                ledgerId: { type: "string", required: true },
                leftTransactionId: { type: "string", required: true },
                matchDecisionId: { type: "string", required: true },
                matchFingerprint: { type: "string", required: true },
                rejectedAt: { type: "string", required: true },
                rightTransactionId: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byRejection: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["matchDecisionId"] },
                },
            },
        },
        options,
    );
}
