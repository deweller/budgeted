import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionClassificationEmbeddingEntity(
    options: EntityOptions,
) {
    return new Entity(
        {
            model: {
                entity: "transactionClassificationEmbedding",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                dimensions: { type: "number", required: true },
                embeddingId: { type: "string", required: true },
                embeddingTextHash: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                modelId: { type: "string", required: true },
                sourceId: { type: "string", required: true },
                sourceType: {
                    type: ["transaction", "transactionTemplate"] as const,
                    required: true,
                },
                sourceUpdatedAt: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                vectorBase64: { type: "string", required: true },
            },
            indexes: {
                byEmbedding: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["embeddingId"] },
                },
                bySourceType: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["ledgerId", "sourceType"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["sourceId"],
                    },
                },
                byEmbeddingTextHash: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "embeddingTextHash"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["sourceType", "sourceId"],
                    },
                },
            },
        },
        options,
    );
}
