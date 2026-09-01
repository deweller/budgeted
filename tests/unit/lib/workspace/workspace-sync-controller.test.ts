import { describe, expect, it, vi } from "vitest";

import { WORKSPACE_ENTITY_TYPES } from "@/lib/workspace/entity-config";
import { createOptimisticWorkspaceUpsert } from "@/lib/workspace/optimistic-changes";
import {
    applyWorkspaceChanges,
    createWorkspaceKnowledgeFromSnapshot,
} from "@/lib/workspace/snapshot-utils";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import type {
    WorkspaceChange,
    WorkspaceKnowledge,
    WorkspaceSnapshot,
    WorkspaceSyncEnvelope,
} from "@/lib/workspace/sync-types";
import { createWorkspaceVersion } from "@/lib/workspace/sync-v2";
import {
    WorkspaceSyncController,
    type WorkspaceSyncControllerEvent,
    type WorkspaceSyncControllerPorts,
} from "@/lib/workspace/workspace-sync-controller";
import type { WorkspaceRepository } from "@/lib/workspace/repository";

function createDeferredPromise<Result>() {
    let resolve: ((result: Result) => void) | undefined;
    let reject: ((error: unknown) => void) | undefined;
    const promise = new Promise<Result>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });

    return {
        promise,
        reject: (error: unknown) => reject?.(error),
        resolve: (result: Result) => resolve?.(result),
    };
}

function createSnapshot(): WorkspaceSnapshot {
    const generatedAt = "2026-07-17T00:00:00.000Z";
    const placeholderKnowledge = {
        activeLedgerId: "ledger-1",
        changeCursor: "g1:r1",
        entityCounts: Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [entityType, 0]),
        ),
        entityDigests: Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [
                entityType,
                "0".repeat(64),
            ]),
        ),
        entityRevisions: Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [entityType, "g1:r1"]),
        ),
        generatedAt,
        oldestRetainedWorkspaceRevision: 0,
        retainedChangesAfter: "2026-06-17T00:00:00.000Z",
        revision: "g1:r1",
        workspaceGeneration: 1,
        workspaceRevision: 1,
    } satisfies WorkspaceKnowledge;
    const snapshot: WorkspaceSnapshot = {
        accounts: [
            {
                accountId: "account-1",
                accountType: "checking",
                balanceCents: 1_000,
                createdAt: generatedAt,
                ledgerAccountId: "financial-checking",
                ledgerId: "ledger-1",
                name: "Checking",
                openedOn: "2026-01-01",
                openingBalanceCents: 1_000,
                updatedAt: generatedAt,
            },
        ],
        activeLedgerId: "ledger-1",
        activeLedgerName: "Household",
        allocationFundingSources: [],
        amazonOrderIntegrations: [],
        amazonOrderSyncRuns: [],
        amazonOrders: [],
        budgetAllocations: [],
        budgetCategories: [],
        budgetGroups: [],
        budgetPeriods: [],
        knowledge: placeholderKnowledge,
        ledgerPostings: [],
        ledgers: [
            {
                createdAt: generatedAt,
                isDefault: true,
                ledgerId: "ledger-1",
                name: "Household",
                status: "active",
                updatedAt: generatedAt,
                workspaceId: "global",
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionAutoMatchRejections: [],
        transactionLines: [],
        transactionTemplates: [],
        transactions: [],
    };

    snapshot.knowledge = createKnowledge({
        cursor: "g1:r1",
        revision: 1,
        snapshot,
    });
    return snapshot;
}

function createKnowledge(input: {
    cursor: string;
    revision: number;
    snapshot: WorkspaceSnapshot;
}) {
    return createWorkspaceKnowledgeFromSnapshot({
        changeCursor: input.cursor,
        entityRevisions: Object.fromEntries(
            WORKSPACE_ENTITY_TYPES.map((entityType) => [
                entityType,
                entityType === "account" ? input.cursor : "g1:r1",
            ]),
        ),
        generatedAt: "2026-07-17T00:01:00.000Z",
        retainedChangesAfter: "2026-06-17T00:00:00.000Z",
        snapshot: input.snapshot,
        workspaceGeneration: 1,
        workspaceRevision: input.revision,
    });
}

function createAccountRenameCommit(
    snapshot: WorkspaceSnapshot,
    name = "Everyday",
) {
    const account = {
        ...snapshot.accounts[0],
        name,
        updatedAt: "2026-07-17T00:01:00.000Z",
    };
    const change: WorkspaceChange = {
        ...createOptimisticWorkspaceUpsert({
            batchId: "batch-2",
            changedAt: new Date("2026-07-17T00:01:00.000Z"),
            entityId: account.accountId,
            entityType: "account",
            record: account,
        }),
        changeCount: 1,
        changeId: "g1:r2",
        changeIndex: 0,
        previousRecordDigest: calculateWorkspaceRecordDigest({
            entityType: "account",
            record: snapshot.accounts[0],
        }),
        workspaceGeneration: 1,
        workspaceRevision: 2,
    };
    const nextSnapshot = applyWorkspaceChanges(snapshot, [change]);
    const knowledge = createKnowledge({
        cursor: "g1:r2",
        revision: 2,
        snapshot: nextSnapshot,
    });

    return { change, knowledge, nextSnapshot };
}

function createPorts(
    snapshot: WorkspaceSnapshot,
    overrides: Partial<WorkspaceSyncControllerPorts> = {},
    repositoryOverrides: Partial<WorkspaceRepository> = {},
) {
    const events: WorkspaceSyncControllerEvent[] = [];
    const ports: WorkspaceSyncControllerPorts = {
        fetchChanges: vi.fn().mockResolvedValue({
            changes: [],
            fromCursor: snapshot.knowledge.changeCursor,
            knowledge: snapshot.knowledge,
            requiresSnapshot: false,
            toCursor: snapshot.knowledge.changeCursor,
        }),
        fetchKnowledge: vi.fn().mockResolvedValue(snapshot.knowledge),
        fetchSnapshot: vi.fn().mockResolvedValue({
            ...snapshot,
            baseChangeCursor: snapshot.knowledge.changeCursor,
        }),
        observeEvent: (event) => events.push(event),
        publishKnowledge: vi.fn(),
        repository: {
            applyChanges: vi.fn().mockResolvedValue("committed"),
            invalidate: vi.fn().mockResolvedValue(undefined),
            read: vi.fn().mockResolvedValue(snapshot),
            readConfiguration: vi.fn().mockResolvedValue(snapshot),
            readMetadata: vi.fn().mockResolvedValue({
                knowledge: snapshot.knowledge,
            }),
            readTransactions: vi.fn().mockResolvedValue(null),
            replace: vi.fn().mockResolvedValue("committed"),
            ...repositoryOverrides,
        },
        ...overrides,
    };

    return { events, ports };
}

function createController(input?: {
    cacheOwnerId?: string;
    initialSnapshot?: WorkspaceSnapshot;
    ports?: Partial<WorkspaceSyncControllerPorts>;
    repository?: Partial<WorkspaceRepository>;
}) {
    const snapshot = input?.initialSnapshot ?? createSnapshot();
    const { events, ports } = createPorts(
        snapshot,
        input?.ports,
        input?.repository,
    );
    const controller = new WorkspaceSyncController({
        cacheOwnerId: input?.cacheOwnerId ?? "owner-1",
        initialSnapshot: snapshot,
        initialSnapshotProvided: true,
        ports,
    });

    return { controller, events, ports, snapshot };
}

describe("WorkspaceSyncController", () => {
    it("deduplicates concurrent synchronization requests", async () => {
        const knowledgeRequest = createDeferredPromise<WorkspaceKnowledge>();
        const { controller, events, ports, snapshot } = createController({
            ports: {
                fetchKnowledge: vi
                    .fn()
                    .mockReturnValue(knowledgeRequest.promise),
            },
        });

        const first = controller.syncWorkspaceWithResult();
        const second = controller.syncWorkspaceWithResult();

        expect(first).toBe(second);
        expect(controller.getState().syncStatus).toBe("syncing");
        await Promise.resolve();
        expect(ports.fetchKnowledge).toHaveBeenCalledTimes(1);

        knowledgeRequest.resolve(snapshot.knowledge);

        await expect(first).resolves.toBe(true);
        await expect(second).resolves.toBe(true);
        expect(controller.getState().syncStatus).toBe("idle");
        expect(events.map((event) => event.type)).toContain(
            "versionReceived",
        );
    });

    it("publishes committed state immediately but waits for cache acceptance", async () => {
        const cacheWrite = createDeferredPromise<"committed">();
        const { controller, events, ports, snapshot } = createController({
            repository: {
                applyChanges: vi.fn().mockReturnValue(cacheWrite.promise),
            },
        });
        const { change, knowledge } = createAccountRenameCommit(snapshot);
        const mutation = controller.applyCommittedWorkspaceChanges({
            changes: [change],
            knowledge,
        });

        expect(controller.getState().snapshot.accounts[0].name).toBe(
            "Everyday",
        );
        await Promise.resolve();
        expect(ports.repository.applyChanges).toHaveBeenCalledTimes(1);

        let settled = false;
        void mutation.finally(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        cacheWrite.resolve("committed");

        await expect(mutation).resolves.toBe("committed");
        expect(ports.publishKnowledge).toHaveBeenCalledWith(
            expect.objectContaining({
                changeCursor: knowledge.changeCursor,
                workspaceGeneration: 1,
                workspaceRevision: 2,
            }),
        );
        expect(events).toContainEqual({
            outcome: "committed",
            type: "cacheWriteCompleted",
        });
    });

    it("deduplicates concurrent repository recovery requests", async () => {
        const snapshotRequest =
            createDeferredPromise<WorkspaceSnapshot>();
        const { controller, events, ports, snapshot } = createController({
            ports: {
                fetchSnapshot: vi.fn().mockReturnValue(snapshotRequest.promise),
            },
        });

        const first = controller.refreshWorkspaceSnapshot();
        const second = controller.refreshWorkspaceSnapshot();

        expect(ports.fetchSnapshot).toHaveBeenCalledTimes(1);
        expect(controller.getState().transactionRepositoryState).toBe(
            "recovering",
        );

        snapshotRequest.resolve(snapshot);
        await Promise.all([first, second]);

        expect(ports.fetchSnapshot).toHaveBeenCalledTimes(1);
        expect(controller.getState().transactionRepositoryState).toBe(
            "repositoryReady",
        );
        expect(
            events.filter(
                (event) => event.type === "snapshotRecoveryStarted",
            ),
        ).toHaveLength(1);
        expect(
            events.filter(
                (event) => event.type === "snapshotRecoveryCompleted",
            ),
        ).toHaveLength(1);
    });

    it("syncs only for newer cross-tab knowledge in the active ledger", async () => {
        const { controller, events, ports } = createController();

        await expect(
            controller.receiveCrossTabKnowledge({
                changeCursor: "g1:r1",
                ledgerId: "ledger-1",
                workspaceGeneration: 1,
                workspaceRevision: 1,
            }),
        ).resolves.toBe(false);
        expect(ports.fetchKnowledge).not.toHaveBeenCalled();

        await controller.receiveCrossTabKnowledge({
            changeCursor: "g1:r2",
            ledgerId: "ledger-1",
            workspaceGeneration: 1,
            workspaceRevision: 2,
        });

        expect(ports.fetchKnowledge).toHaveBeenCalledTimes(1);
        expect(
            events.filter(
                (event) => event.type === "crossTabKnowledgeReceived",
            ),
        ).toHaveLength(2);
    });

    it("preserves a usable memory fallback when cache recovery fails", async () => {
        const { controller, ports, snapshot } = createController({
            repository: {
                applyChanges: vi.fn().mockResolvedValue("invalid"),
            },
            ports: {
                fetchSnapshot: vi.fn().mockRejectedValue(new Error("offline")),
            },
        });
        const { change, knowledge } = createAccountRenameCommit(snapshot);

        await expect(
            controller.applyCommittedWorkspaceChanges({
                changes: [change],
                knowledge,
            }),
        ).resolves.toBe("committed");
        expect(ports.repository.invalidate).not.toHaveBeenCalled();
        expect(controller.getState().transactionRepositoryState).toBe(
            "memoryFallback",
        );
        expect(controller.getState().syncStatus).toBe("error");
    });

    it("installs every committed chunk in memory after persistence becomes unavailable", async () => {
        const { controller, ports, snapshot } = createController({
            repository: {
                applyChanges: vi.fn().mockResolvedValue("failed"),
            },
        });
        const version = (revision: number) =>
            createWorkspaceVersion({
                generation: 1,
                ledgerId: "ledger-1",
                revision,
            });
        const accountChange = (name: string) => ({
            entityId: "account-1",
            entityType: "account" as const,
            operation: "upsert" as const,
            record: { ...snapshot.accounts[0], name },
        });
        const sync: WorkspaceSyncEnvelope = {
            commits: [
                {
                    changes: [accountChange("Everyday")],
                    commitId: "commit-2",
                    committedAt: "2026-07-17T00:02:00.000Z",
                    fromVersion: version(1),
                    toVersion: version(2),
                },
                {
                    changes: [accountChange("Household checking")],
                    commitId: "commit-3",
                    committedAt: "2026-07-17T00:03:00.000Z",
                    fromVersion: version(2),
                    toVersion: version(3),
                },
            ],
            fromVersion: version(1),
            toVersion: version(3),
        };

        await expect(controller.applyWorkspaceSync(sync)).resolves.toBe(
            "committed",
        );
        expect(controller.getState().snapshot.accounts[0].name).toBe(
            "Household checking",
        );
        expect(controller.getState().snapshot.knowledge.workspaceRevision).toBe(
            3,
        );
        expect(controller.getState().transactionRepositoryState).toBe(
            "memoryFallback",
        );
        expect(ports.repository.applyChanges).toHaveBeenCalledTimes(1);
        expect(ports.fetchSnapshot).not.toHaveBeenCalled();
    });

    it("stops notifying subscribers after disposal", () => {
        const { controller, events } = createController();
        const listener = vi.fn();
        const eventCount = events.length;

        controller.subscribe(listener);
        controller.dispose();
        controller.recordOptimisticOverlayEvent(
            "optimisticOverlayStarted",
            "mutation-1",
        );

        expect(listener).not.toHaveBeenCalled();
        expect(events).toHaveLength(eventCount);
    });
});
