import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionTemplateEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "transactionTemplate",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                accountId: { type: "string" },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                defaultAmountCents: { type: "number" },
                ledgerId: { type: "string", required: true },
                linesJson: { type: "string", required: true },
                memo: { type: "string" },
                name: { type: "string", required: true },
                payee: { type: "string" },
                templateId: { type: "string", required: true },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byTemplate: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["templateId"] },
                },
            },
        },
        options,
    );
}
