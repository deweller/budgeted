import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionAuditLogEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "transactionAuditLog",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                action: {
                    type: [
                        "bulkDelete",
                        "create",
                        "delete",
                        "importOrSync",
                        "lock",
                        "memoUpdate",
                        "merge",
                        "reconcile",
                        "rewrite",
                        "unlock",
                        "update",
                        "void",
                    ] as const,
                    required: true,
                },
                actorUserId: { type: "string" },
                afterJson: { type: "string" },
                auditLogId: { type: "string", required: true },
                beforeJson: { type: "string" },
                ledgerId: { type: "string", required: true },
                occurredAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                source: {
                    type: [
                        "accountDeleteRewrite",
                        "amazonOrders",
                        "aiClassification",
                        "categoryDeleteRewrite",
                        "manual",
                        "merge",
                        "plaidSync",
                        "system",
                        "venmoEmail",
                    ] as const,
                    required: true,
                },
                summaryJson: { type: "string", required: true },
                transactionId: { type: "string" },
                transactionIdsJson: { type: "string" },
            },
            indexes: {
                byAuditLog: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["occurredAt", "auditLogId"] },
                },
            },
        },
        options,
    );
}
