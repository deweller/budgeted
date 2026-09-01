import { describe, expect, it } from "vitest";

import {
    buildWorkspaceRevisionInput,
    calculateWorkspaceEntityCounts,
    calculateWorkspaceEntityDigests,
    createWorkspaceEntityRevisionTokens,
    createEmptyWorkspaceEntityCounts,
} from "@/lib/workspace/revision";
import { WORKSPACE_ENTITY_CONFIGS } from "@/lib/workspace/entity-config";
import type { WorkspaceSnapshotRecords } from "@/lib/workspace/sync-types";

function createRecord(idKey: string, id: string) {
    return {
        [idKey]: id,
    };
}

function createRecords(): WorkspaceSnapshotRecords {
    return Object.fromEntries(
        WORKSPACE_ENTITY_CONFIGS.map((config) => [
            config.arrayKey,
            [
                createRecord(config.idKey, `${config.entityType}-b`),
                createRecord(config.idKey, `${config.entityType}-a`),
            ],
        ]),
    ) as unknown as WorkspaceSnapshotRecords;
}

describe("workspace revision", () => {
    it("builds revision input from every configured workspace entity family", () => {
        const records = createRecords();
        const revisionInput = buildWorkspaceRevisionInput({
            activeLedgerId: "ledger-1",
            records,
        }) as Record<string, unknown>;

        expect(Object.keys(revisionInput).sort()).toEqual(
            [
                "activeLedgerId",
                ...WORKSPACE_ENTITY_CONFIGS.map((config) => config.arrayKey),
            ].sort(),
        );

        for (const config of WORKSPACE_ENTITY_CONFIGS) {
            expect(
                (revisionInput[config.arrayKey] as Record<string, unknown>[]).map(
                    (record) => record[config.idKey],
                ),
            ).toEqual([`${config.entityType}-a`, `${config.entityType}-b`]);
        }
    });

    it("excludes embedded transaction children from revision records", () => {
        const records = createRecords();
        records.transactions = [
            {
                transactionId: "transaction-1",
                lines: [{ lineId: "line-1" }],
                postings: [{ postingId: "posting-1" }],
            },
        ] as never;
        const revisionInput = buildWorkspaceRevisionInput({
            activeLedgerId: "ledger-1",
            records,
        }) as Record<string, unknown>;

        expect(revisionInput.transactions).toEqual([
            { transactionId: "transaction-1" },
        ]);
    });

    it("counts configured workspace entity records", () => {
        const records = createRecords();

        expect(calculateWorkspaceEntityCounts(records)).toEqual(
            Object.fromEntries(
                WORKSPACE_ENTITY_CONFIGS.map((config) => [
                    config.entityType,
                    2,
                ]),
            ),
        );
        expect(createEmptyWorkspaceEntityCounts()).toEqual(
            Object.fromEntries(
                WORKSPACE_ENTITY_CONFIGS.map((config) => [
                    config.entityType,
                    0,
                ]),
            ),
        );
    });

    it("changes an entity revision when a record timestamp changes", () => {
        const records = createRecords();
        records.accounts = [
            {
                accountId: "account-1",
                createdAt: "2026-07-01T00:00:00.000Z",
                updatedAt: "2026-07-01T00:00:00.000Z",
            },
        ] as never;
        const initial = calculateWorkspaceEntityDigests(records);

        records.accounts = [
            {
                ...records.accounts[0],
                updatedAt: "2026-07-02T00:00:00.000Z",
            },
        ];

        expect(calculateWorkspaceEntityDigests(records).account).not.toBe(
            initial.account,
        );
    });

    it("changes an entity revision when a record changes without a timestamp update", () => {
        const records = createRecords();
        records.accounts = [
            {
                accountId: "account-1",
                name: "Checking",
                updatedAt: "2026-07-01T00:00:00.000Z",
            },
        ] as never;
        const initial = calculateWorkspaceEntityDigests(records);

        records.accounts = [
            {
                ...records.accounts[0],
                name: "Everyday Checking",
            },
        ];

        expect(calculateWorkspaceEntityDigests(records).account).not.toBe(
            initial.account,
        );
    });

    it("excludes server-only workspace synchronization fields from ledger digests", () => {
        const records = createRecords();
        records.ledgers = [
            {
                ledgerId: "ledger-1",
                name: "Primary",
                workspaceGeneration: 1,
                workspaceRevision: 2,
                workspaceSyncProtocolVersion: 1,
            },
        ] as never;
        const initial = calculateWorkspaceEntityDigests(records);

        records.ledgers = [
            {
                ...records.ledgers[0],
                workspaceGeneration: 3,
                workspaceRevision: 0,
                workspaceSyncProtocolVersion: 2,
            },
        ] as never;

        expect(calculateWorkspaceEntityDigests(records).ledger).toBe(
            initial.ledger,
        );
    });

    it("creates cursor-based revision tokens for every entity family", () => {
        expect(
            createWorkspaceEntityRevisionTokens({
                generation: 2,
                revision: 14,
            }),
        ).toEqual(
            Object.fromEntries(
                WORKSPACE_ENTITY_CONFIGS.map((config) => [
                    config.entityType,
                    "g2:r14",
                ]),
            ),
        );
    });
});
