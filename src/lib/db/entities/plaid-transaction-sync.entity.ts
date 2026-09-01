import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createPlaidTransactionSyncEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "plaidTransactionSync",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                plaidTransactionSyncId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                accountId: { type: "string", required: true },
                plaidAccountId: { type: "string", required: true },
                plaidAccountLinkId: { type: "string", required: true },
                plaidItemId: { type: "string", required: true },
                plaidTransactionId: { type: "string", required: true },
                transactionId: { type: "string", required: true },
                authorizedDate: { type: "string" },
                categoryText: { type: "string" },
                isoCurrencyCode: { type: "string" },
                merchantName: { type: "string" },
                name: { type: "string", required: true },
                originalDescription: { type: "string" },
                pending: { type: "boolean", required: true },
                pendingTransactionId: { type: "string" },
                personalFinanceCategoryConfidence: { type: "string" },
                personalFinanceCategoryDetailed: { type: "string" },
                personalFinanceCategoryPrimary: { type: "string" },
                plaidAmountCents: { type: "number", required: true },
                plaidDate: { type: "string", required: true },
                plaidPayloadJson: { type: "string", required: true },
                status: {
                    type: ["active", "removed"] as const,
                    required: true,
                },
                removedAt: { type: "string" },
                firstSyncedAt: { type: "string", required: true },
                lastSyncedAt: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                bySync: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: {
                        field: "sk",
                        composite: ["plaidTransactionSyncId"],
                    },
                },
                byPlaidTransaction: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["ledgerId", "accountId"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["plaidTransactionId"],
                    },
                },
                byTransaction: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "transactionId"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["plaidTransactionSyncId"],
                    },
                },
            },
        },
        options,
    );
}
