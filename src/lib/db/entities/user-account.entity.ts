import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createUserAccountEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "userAccount",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                userId: { type: "string", required: true },
                workspaceId: {
                    type: "string",
                    required: true,
                    default: () => "global",
                },
                email: { type: "string", required: true },
                passwordHash: { type: "string", required: true },
                displayName: { type: "string", required: true },
                role: {
                    type: ["normal", "super"] as const,
                    required: true,
                    default: () => "normal",
                },
                activeLedgerId: { type: "string" },
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
                byUser: {
                    pk: { field: "pk", composite: ["userId"] },
                    sk: { field: "sk", composite: [] },
                },
                byEmail: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["email"] },
                    sk: { field: "gsi1sk", composite: ["userId"] },
                },
                byWorkspace: {
                    index: "gsi2",
                    pk: { field: "gsi2pk", composite: ["workspaceId"] },
                    sk: {
                        field: "gsi2sk",
                        composite: ["role", "email", "userId"],
                    },
                },
            },
        },
        options,
    );
}
