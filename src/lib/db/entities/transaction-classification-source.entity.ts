import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionClassificationSourceEntity(
    options: EntityOptions,
) {
    return new Entity(
        {
            model: {
                entity: "transactionClassificationSource",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                accountId: { type: "string", required: true },
                amountCents: { type: "number", required: true },
                categoryAssignmentsJson: { type: "string", required: true },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                hasMemo: { type: "boolean", required: true },
                indexVersion: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                memo: { type: "string" },
                normalizedPayee: { type: "string" },
                normalizedPlaidOriginalDescription: { type: "string" },
                normalizedPlaidCategoryText: { type: "string" },
                normalizedPlaidMerchantName: { type: "string" },
                normalizedPlaidName: { type: "string" },
                normalizedPlaidPfcDetailed: { type: "string" },
                normalizedPlaidPfcPrimary: { type: "string" },
                occurredAt: { type: "string", required: true },
                payee: { type: "string" },
                plaidCategoryText: { type: "string" },
                plaidMerchantName: { type: "string" },
                plaidName: { type: "string" },
                plaidOriginalDescription: { type: "string" },
                plaidPfcDetailed: { type: "string" },
                plaidPfcPrimary: { type: "string" },
                sourceUpdatedAt: { type: "string", required: true },
                transactionId: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                bySource: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["transactionId"] },
                },
            },
        },
        options,
    );
}
