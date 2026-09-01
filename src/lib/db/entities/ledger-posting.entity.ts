import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createLedgerPostingEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "ledgerPosting",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                postingId: { type: "string", required: true },
                transactionId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                ledgerAccountId: { type: "string", required: true },
                ledgerAccountKind: {
                    type: ["financial", "category", "equity"] as const,
                    required: true,
                },
                direction: {
                    type: ["debit", "credit"] as const,
                    required: true,
                },
                amountCents: { type: "number", required: true },
                occurredAt: { type: "string", required: true },
                periodId: { type: "string", required: true },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byPosting: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: {
                        field: "sk",
                        composite: ["transactionId", "postingId"],
                    },
                },
                byPeriod: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["ledgerId", "periodId"] },
                    sk: {
                        field: "gsi1sk",
                        composite: [
                            "occurredAt",
                            "ledgerAccountId",
                            "postingId",
                        ],
                    },
                },
                byLedgerAccount: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "ledgerAccountId"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["occurredAt", "postingId"],
                    },
                },
            },
        },
        options,
    );
}
