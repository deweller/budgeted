import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionLineEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "transactionLine",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                lineId: { type: "string", required: true },
                transactionId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                amountCents: { type: "number", required: true },
                fromAccountId: { type: "string" },
                toAccountId: { type: "string" },
                categoryId: { type: "string" },
                payee: { type: "string" },
                memo: { type: "string" },
                sortOrder: { type: "number", required: true },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byLine: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: {
                        field: "sk",
                        composite: ["transactionId", "lineId"],
                    },
                },
                byCategory: {
                    index: "gsi1",
                    pk: {
                        field: "gsi1pk",
                        composite: ["ledgerId", "categoryId"],
                    },
                    sk: {
                        field: "gsi1sk",
                        composite: ["transactionId", "lineId"],
                    },
                },
                byFromAccount: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "fromAccountId"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["transactionId", "lineId"],
                    },
                },
                byToAccount: {
                    index: "gsi3",
                    pk: {
                        field: "gsi3pk",
                        composite: ["ledgerId", "toAccountId"],
                    },
                    sk: {
                        field: "gsi3sk",
                        composite: ["transactionId", "lineId"],
                    },
                },
            },
        },
        options,
    );
}
