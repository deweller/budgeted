import { describe, expect, it } from "vitest";

import { evaluateWorkspaceProtocolReadiness } from "@/features/workspace/server/workspace-protocol-diagnostic";
import { WORKSPACE_ENTITY_TYPES } from "@/lib/workspace/entity-config";
import { encodeWorkspaceCursor } from "@/lib/workspace/cursor";

function createProofRecord(value: (entityType: string) => unknown) {
    return JSON.stringify(
        Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [
                entityType,
                value(entityType),
            ]),
        ),
    );
}

function createReadyItems() {
    const change = {
        batchId: "batch-1",
        changedAt: "2026-07-17T00:00:00.000Z",
        changeCount: 1,
        changeId: "change-1",
        changeIndex: 0,
        entityId: "transaction-1",
        entityType: "transaction",
        expiresAt: 2_000_000_000,
        operation: "upsert",
        previousRecordDigest: null,
        record: { transactionId: "transaction-1" },
        workspaceGeneration: 2,
        workspaceRevision: 4,
    };

    return [
        {
            __edb_e__: "ledger" as const,
            ledgerId: "ledger-1",
            status: "active" as const,
            workspaceGeneration: 2,
            workspaceRevision: 4,
        },
        {
            __edb_e__: "workspaceState" as const,
            entityCountsJson: createProofRecord(() => 0),
            entityDigestsJson: createProofRecord(() => "a".repeat(64)),
            entityRevisionsJson: createProofRecord(() =>
                encodeWorkspaceCursor({ generation: 2, revision: 4 }),
            ),
            ledgerId: "ledger-1",
            oldestRetainedWorkspaceRevision: 3,
            stateId: "default",
            workspaceGeneration: 2,
            workspaceRevision: 4,
        },
        {
            __edb_e__: "workspaceMutationBatch" as const,
            changeCount: 1,
            changesJson: JSON.stringify([change]),
            expiresAt: 2_000_000_000,
            ledgerId: "ledger-1",
            workspaceGeneration: 2,
            workspaceRevision: 4,
        },
    ];
}

describe("workspace protocol cleanup diagnostic", () => {
    it("accepts complete revisioned state and retained batches", () => {
        expect(
            evaluateWorkspaceProtocolReadiness({
                items: createReadyItems(),
                now: new Date("2026-07-17T00:00:00.000Z"),
            }),
        ).toMatchObject({
            readyForLegacyCleanup: true,
            ledgerResults: [
                {
                    invalidRetainedBatchCount: 0,
                    ledgerWorkspaceGeneration: 2,
                    ledgerWorkspaceRevision: 4,
                    revisionStateValid: true,
                    stateEntityProofsComplete: true,
                    stateWorkspaceGeneration: 2,
                    stateWorkspaceRevision: 4,
                    workspaceStateExists: true,
                },
            ],
        });
    });

    it("refuses cleanup for invalid state or deprecated route imports", () => {
        const items = createReadyItems();
        items[1]!.entityDigestsJson = undefined;

        expect(
            evaluateWorkspaceProtocolReadiness({
                deprecatedRouteImports: ["src/app/api/example/route.ts"],
                items,
                now: new Date("2026-07-17T00:00:00.000Z"),
            }),
        ).toMatchObject({
            deprecatedRouteImports: ["src/app/api/example/route.ts"],
            readyForLegacyCleanup: false,
            ledgerResults: [
                {
                    revisionStateValid: false,
                    stateEntityProofsComplete: false,
                },
            ],
        });
    });

    it("reports missing ledger and state revision metadata explicitly", () => {
        expect(
            evaluateWorkspaceProtocolReadiness({
                items: [
                    {
                        __edb_e__: "ledger",
                        ledgerId: "ledger-1",
                        status: "active",
                    },
                ],
                now: new Date("2026-07-17T00:00:00.000Z"),
            }),
        ).toMatchObject({
            readyForLegacyCleanup: false,
            ledgerResults: [
                {
                    revisionStateValid: false,
                    stateEntityProofsComplete: false,
                    workspaceStateExists: false,
                },
            ],
        });
    });

    it("reports legacy rows without treating them as authoritative cursors", () => {
        const items = [
            ...createReadyItems(),
            {
                __edb_e__: "workspaceChange" as const,
                ledgerId: "ledger-1",
            },
        ];

        expect(
            evaluateWorkspaceProtocolReadiness({
                items,
                now: new Date("2026-07-17T00:00:00.000Z"),
            }),
        ).toMatchObject({
            readyForLegacyCleanup: true,
            ledgerResults: [{ legacyWorkspaceChangeCount: 1 }],
        });
    });
});
