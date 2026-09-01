import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionClassificationPendingEntity(
    options: EntityOptions,
) {
    return new Entity(
        {
            model: {
                entity: "transactionClassificationPending",
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
                expiresAt: { type: "number", required: true },
                ledgerId: { type: "string", required: true },
                modelId: { type: "string", required: true },
                promptVersion: { type: "string", required: true },
                rejectedAt: { type: "string" },
                source: {
                    type: ["manual", "background"] as const,
                    required: true,
                },
                suggestionJson: { type: "string", required: true },
                suggestionType: {
                    type: ["category", "noSuggestion"] as const,
                    required: true,
                },
                status: {
                    type: ["pending", "rejected"] as const,
                    required: true,
                    default: "pending",
                },
                transactionId: { type: "string", required: true },
                transactionUpdatedAt: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byTransaction: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: {
                        field: "sk",
                        composite: ["transactionId"],
                    },
                },
                byAccount: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["ledgerId", "accountId"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["updatedAt", "transactionId"],
                    },
                },
            },
        },
        options,
    );
}
