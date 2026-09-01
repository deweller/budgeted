import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "transaction",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                transactionId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                occurredAt: { type: "string", required: true },
                enteredAt: { type: "string", required: true },
                kind: {
                    type: ["standard", "adjustment"] as const,
                    required: true,
                },
                payee: { type: "string" },
                memo: { type: "string" },
                referenceAccountId: { type: "string", required: true },
                referenceCategoryId: { type: "string" },
                displayAmountCents: { type: "number", required: true },
                plaidTransactionSyncId: { type: "string" },
                source: {
                    type: ["manual", "plaid", "venmo"] as const,
                    default: "manual",
                },
                status: {
                    type: [
                        "entered",
                        "cleared",
                        "reconciled",
                        "voided",
                    ] as const,
                    required: true,
                },
                periodId: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                aggregateRevision: { type: "string" },
                aggregateLineCount: { type: "number" },
                aggregateLineDigest: { type: "string" },
                aggregatePostingCount: { type: "number" },
                aggregatePostingDigest: { type: "string" },
                aggregatePlaidSyncCount: { type: "number" },
                aggregatePlaidSyncDigest: { type: "string" },
            },
            indexes: {
                byTransaction: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: {
                        field: "sk",
                        composite: ["occurredAt", "transactionId"],
                    },
                },
                byAccount: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["ledgerId", "referenceAccountId"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["occurredAt", "transactionId"],
                    },
                },
                byCategory: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "referenceCategoryId"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["occurredAt", "transactionId"],
                    },
                },
                byId: {
                    index: "gsi3",
                    pk: {
                        field: "gsi3pk",
                        composite: ["ledgerId", "transactionId"],
                    },
                    sk: {
                        field: "gsi3sk",
                        composite: ["transactionId"],
                    },
                },
            },
        },
        options,
    );
}
