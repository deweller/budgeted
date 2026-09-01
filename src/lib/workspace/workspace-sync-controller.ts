import { hasValidWorkspaceTransactionAggregates } from "@/features/transactions/models/transaction-aggregate-revision";
import { isWorkspaceTransitionError } from "@/lib/workspace/change-transition";
import {
    encodeWorkspaceCursor,
    parseWorkspaceCursor,
} from "@/lib/workspace/cursor";
import {
    WORKSPACE_ENTITY_TYPES,
    isWorkspaceTransactionEntityType,
} from "@/lib/workspace/entity-config";
import {
    applyWorkspaceChanges,
    createWorkspaceKnowledgeFromSnapshot,
    isKnowledgeTooOldForDelta,
    rebuildWorkspaceSnapshot,
} from "@/lib/workspace/snapshot-utils";
import {
    getWorkspaceEntityArrayKey,
    getWorkspaceEntityId,
} from "@/lib/workspace/entity-config";
import {
    calculateWorkspaceRecordDigest,
    createWorkspaceEntityRevisionTokens,
} from "@/lib/workspace/revision";
import type {
    WorkspaceChange,
    WorkspaceKnowledge,
    WorkspaceSnapshot,
    WorkspaceReplicaSnapshotPayload,
    WorkspaceSnapshotPayload,
    WorkspaceSyncResult,
    WorkspaceCommit,
    WorkspaceSyncEnvelope,
    WorkspaceCommitSyncResult,
    WorkspaceVersion,
    WorkspaceVersionResult,
} from "@/lib/workspace/sync-types";
import {
    compareWorkspaceVersions,
    workspaceKnowledgeToVersionResult,
} from "@/lib/workspace/sync-v2";
import type {
    WorkspaceCacheIdentity,
    WorkspaceCacheWriteResult,
    WorkspaceRepository,
} from "@/lib/workspace/repository";
import {
    areWorkspaceEntityDigestsEqual,
    getContiguousCommittedWorkspaceChanges,
    getWorkspaceGeneration,
    isTransactionFamilyFullyHydrated,
    isWorkspaceDeltaContiguous,
    isWorkspaceKnowledgeEquivalent,
    isWorkspaceKnowledgeNewer,
    type WorkspaceTransactionQuery,
} from "@/lib/workspace/workspace-protocol";

export type WorkspaceSyncStatus = "error" | "idle" | "syncing";

export type TransactionRepositoryState =
    | "initializing"
    | "configurationReady"
    | "repositoryReady"
    | "recovering"
    | "memoryFallback"
    | "unavailable";

export type WorkspacePersistenceOutcome =
    | "committed"
    | "superseded"
    | "fallback"
    | "failed";

export type WorkspaceSyncControllerState = {
    isReady: boolean;
    snapshot: WorkspaceSnapshot;
    syncStatus: WorkspaceSyncStatus;
    transactionRepositoryRevision: number;
    transactionRepositoryState: TransactionRepositoryState;
};

export type WorkspaceSyncControllerEvent =
    | { type: "bootstrap" }
    | { knowledge: WorkspaceKnowledge; type: "knowledgeReceived" }
    | { type: "versionReceived"; version: WorkspaceVersionResult }
    | { delta: WorkspaceSyncResult; type: "deltaReceived" }
    | {
          changes: WorkspaceChange[];
          knowledge: WorkspaceKnowledge;
          type: "committedMutationReceived";
      }
    | {
          outcome: WorkspacePersistenceOutcome;
          type: "cacheWriteCompleted";
      }
    | { type: "snapshotRecoveryStarted" }
    | { type: "snapshotRecoveryCompleted" }
    | { error: unknown; type: "snapshotRecoveryFailed" }
    | {
          mutationId: string;
          type:
              | "optimisticOverlayStarted"
              | "optimisticOverlayCommitted"
              | "optimisticOverlayDiscarded";
      }
    | {
          changeCursor: string;
          ledgerId: string;
          type: "crossTabKnowledgeReceived";
      };

export type WorkspaceSyncControllerPorts = {
    fetchCommits?: (after: string) => Promise<WorkspaceCommitSyncResult>;
    fetchChanges: (after: string) => Promise<WorkspaceSyncResult>;
    fetchKnowledge: () => Promise<WorkspaceKnowledge>;
    fetchSnapshot: () => Promise<
        WorkspaceReplicaSnapshotPayload | WorkspaceSnapshotPayload
    >;
    fetchVersion?: () => Promise<WorkspaceVersionResult>;
    observeEvent?: (event: WorkspaceSyncControllerEvent) => void;
    publishKnowledge: (knowledge: WorkspaceKnowledge) => void;
    publishSync?: (sync: WorkspaceSyncEnvelope) => void;
    repository: WorkspaceRepository;
};

export type WorkspaceSyncControllerOptions = {
    cacheOwnerId?: string;
    initialSnapshot: WorkspaceSnapshot;
    initialSnapshotProvided: boolean;
    ports: WorkspaceSyncControllerPorts;
};

function replicaPayloadToWorkspaceSnapshot(
    payload: WorkspaceReplicaSnapshotPayload | WorkspaceSnapshotPayload,
) {
    if ("knowledge" in payload) {
        return rebuildWorkspaceSnapshot(payload);
    }

    const version = payload.version;
    const generatedAt = new Date().toISOString();
    const provisional = rebuildWorkspaceSnapshot({
        ...payload,
        baseChangeCursor: version.cursor,
        knowledge: {
            activeLedgerId: payload.activeLedgerId,
            changeCursor: version.cursor,
            entityCounts: {},
            entityDigests: {},
            entityRevisions: {},
            generatedAt,
            oldestRetainedWorkspaceRevision: 0,
            retainedChangesAfter: new Date(0).toISOString(),
            revision: version.cursor,
            workspaceGeneration: version.generation,
            workspaceRevision: version.revision,
        },
    });
    const knowledge = createWorkspaceKnowledgeFromSnapshot({
        changeCursor: version.cursor,
        entityRevisions: createWorkspaceEntityRevisionTokens({
            generation: version.generation,
            revision: version.revision,
        }),
        generatedAt,
        retainedChangesAfter: new Date(0).toISOString(),
        snapshot: provisional,
        workspaceGeneration: version.generation,
        workspaceRevision: version.revision,
    });

    return { ...provisional, knowledge };
}

export type CommittedWorkspaceControllerInput = {
    changes: WorkspaceChange[];
    knowledge?: WorkspaceKnowledge;
};

export type CommittedWorkspaceControllerOutcome = "committed" | "reconciled";

type WorkspaceRecoveryResult = {
    persistenceOutcome: Exclude<WorkspacePersistenceOutcome, "failed">;
    snapshot: WorkspaceSnapshot;
};

export class WorkspaceCachePersistenceError extends Error {
    constructor() {
        super("The recovered workspace could not be persisted safely.");
        this.name = "WorkspaceCachePersistenceError";
    }
}

function rebuildSnapshotForHydration(
    snapshot: WorkspaceSnapshot | WorkspaceSnapshotPayload,
) {
    return rebuildWorkspaceSnapshot(snapshot, {
        deriveAccountBalances:
            snapshot.transactionHydration !== "configuration",
    });
}

function createKnowledgeForSnapshot(input: {
    knowledge: WorkspaceKnowledge;
    snapshot: WorkspaceSnapshot;
}) {
    return createWorkspaceKnowledgeFromSnapshot({
        changeCursor: input.knowledge.changeCursor,
        entityRevisions: input.knowledge.entityRevisions,
        generatedAt: input.knowledge.generatedAt,
        retainedChangesAfter: input.knowledge.retainedChangesAfter,
        snapshot: {
            ...input.snapshot,
            knowledge: input.knowledge,
        },
        workspaceGeneration: input.knowledge.workspaceGeneration,
        workspaceRevision: input.knowledge.workspaceRevision,
    });
}

function isSnapshotValidatedByKnowledge(
    snapshot: WorkspaceSnapshot,
    knowledge: WorkspaceKnowledge,
) {
    if (!isTransactionFamilyFullyHydrated(snapshot)) {
        return false;
    }

    const calculatedKnowledge = createKnowledgeForSnapshot({
        knowledge,
        snapshot,
    });

    return (
        hasValidWorkspaceTransactionAggregates({
            ledgerPostings: snapshot.ledgerPostings,
            plaidTransactionSyncs: snapshot.plaidTransactionSyncs,
            transactionLines: snapshot.transactionLines,
            transactions: snapshot.transactions,
        }) &&
        isWorkspaceKnowledgeEquivalent(calculatedKnowledge, knowledge) &&
        (!knowledge.entityDigests ||
            areWorkspaceEntityDigestsEqual(
                calculatedKnowledge.entityDigests,
                knowledge.entityDigests,
            ))
    );
}

function getConfigurationWorkspaceChanges(changes: WorkspaceChange[]) {
    return changes.filter(
        (change) => !isWorkspaceTransactionEntityType(change.entityType),
    );
}

function isConfigurationSnapshotValidatedByKnowledge(
    snapshot: WorkspaceSnapshot,
    knowledge: WorkspaceKnowledge,
) {
    const calculatedKnowledge = createKnowledgeForSnapshot({
        knowledge,
        snapshot,
    });

    return WORKSPACE_ENTITY_TYPES.filter(
        (entityType) => !isWorkspaceTransactionEntityType(entityType),
    ).every(
        (entityType) =>
            calculatedKnowledge.entityCounts[entityType] ===
                knowledge.entityCounts[entityType] &&
            calculatedKnowledge.entityDigests?.[entityType] ===
                knowledge.entityDigests?.[entityType],
    );
}

function createSnapshotWithKnowledge(
    snapshot: WorkspaceSnapshot,
    knowledge: WorkspaceKnowledge,
) {
    if (!isTransactionFamilyFullyHydrated(snapshot)) {
        return {
            ...snapshot,
            knowledge,
            transactionHydration:
                snapshot.transactionHydration ?? "configuration",
        };
    }

    return {
        ...snapshot,
        knowledge,
        transactionHydration: snapshot.transactionHydration ?? "full",
    };
}

function hasUsableMemorySnapshot(snapshot: WorkspaceSnapshot) {
    return (
        snapshot.ledgers.length > 0 &&
        isTransactionFamilyFullyHydrated(snapshot)
    );
}

function snapshotToWorkspaceVersion(snapshot: WorkspaceSnapshot): WorkspaceVersion {
    return {
        cursor: snapshot.knowledge.changeCursor,
        generation: snapshot.knowledge.workspaceGeneration,
        ledgerId: snapshot.activeLedgerId,
        protocolVersion: 2,
        revision: snapshot.knowledge.workspaceRevision,
    };
}

function toLegacyWorkspaceChanges(input: {
    commit: WorkspaceCommit;
    snapshot: WorkspaceSnapshot;
}): WorkspaceChange[] {
    const recordsByIdentity = new Map<string, unknown>();

    for (const entityType of WORKSPACE_ENTITY_TYPES) {
        const records = input.snapshot[getWorkspaceEntityArrayKey(entityType)] ?? [];
        for (const record of records) {
            recordsByIdentity.set(
                `${entityType}:${getWorkspaceEntityId(entityType, record)}`,
                record,
            );
        }
    }

    return input.commit.changes.map((change, changeIndex) => {
        const identity = `${change.entityType}:${change.entityId}`;
        const previousRecord = recordsByIdentity.get(identity);
        const previousRecordDigest = previousRecord
            ? calculateWorkspaceRecordDigest({
                  entityType: change.entityType,
                  record: previousRecord,
              })
            : null;

        if (change.operation === "delete") {
            recordsByIdentity.delete(identity);
        } else {
            recordsByIdentity.set(identity, change.record);
        }

        return {
            ...change,
            batchId: input.commit.commitId,
            changedAt: input.commit.committedAt,
            changeCount: input.commit.changes.length,
            changeId: `${input.commit.commitId}:${changeIndex}`,
            changeIndex,
            expiresAt: 0,
            previousRecordDigest,
            workspaceGeneration: input.commit.toVersion.generation,
            workspaceRevision: input.commit.toVersion.revision,
        };
    });
}

function getLatestChangeCursor(
    changes: WorkspaceChange[],
    fallback: string,
) {
    const revisionedChanges = changes.filter(
        (change) =>
            change.workspaceGeneration !== undefined &&
            change.workspaceRevision !== undefined,
    );

    if (revisionedChanges.length > 0) {
        const latest = revisionedChanges.reduce((current, change) => {
            if (
                change.workspaceGeneration! > current.workspaceGeneration! ||
                (change.workspaceGeneration === current.workspaceGeneration &&
                    change.workspaceRevision! > current.workspaceRevision!)
            ) {
                return change;
            }

            return current;
        });

        return encodeWorkspaceCursor({
            generation: latest.workspaceGeneration!,
            revision: latest.workspaceRevision!,
        });
    }

    return changes.reduce(
        (latest, change) =>
            change.changeId.localeCompare(latest) > 0
                ? change.changeId
                : latest,
        fallback,
    );
}

function getLatestWorkspaceRevision(
    changes: WorkspaceChange[],
    fallback: WorkspaceKnowledge,
) {
    const latestCursor = parseWorkspaceCursor(
        getLatestChangeCursor(changes, fallback.changeCursor),
    );

    return latestCursor
        ? {
              workspaceGeneration: latestCursor.generation,
              workspaceRevision: latestCursor.revision,
          }
        : {
              workspaceGeneration: fallback.workspaceGeneration,
              workspaceRevision: fallback.workspaceRevision,
          };
}

export class WorkspaceSyncController {
    private cachePersistenceQueue: Promise<void> = Promise.resolve();
    private committedReconciliationPromise: Promise<void> | null = null;
    private disposed = false;
    private listeners = new Set<(state: WorkspaceSyncControllerState) => void>();
    private persistenceUnavailable = false;
    private recoveryPromise: Promise<WorkspaceSnapshot | null> | null = null;
    private state: WorkspaceSyncControllerState;
    private syncPromise: Promise<boolean> | null = null;

    constructor(private readonly options: WorkspaceSyncControllerOptions) {
        this.state = {
            isReady: options.initialSnapshotProvided,
            snapshot: rebuildSnapshotForHydration(options.initialSnapshot),
            syncStatus: "idle",
            transactionRepositoryRevision: 0,
            transactionRepositoryState: options.initialSnapshotProvided
                ? isTransactionFamilyFullyHydrated(options.initialSnapshot)
                    ? "repositoryReady"
                    : "configurationReady"
                : "initializing",
        };
        this.emitEvent({ type: "bootstrap" });
    }

    activate() {
        this.disposed = false;
    }

    dispose() {
        this.disposed = true;
        this.listeners.clear();
    }

    getCacheIdentity(ledgerId: string): WorkspaceCacheIdentity | null {
        if (!this.options.cacheOwnerId || !ledgerId) {
            return null;
        }

        return {
            cacheOwnerId: this.options.cacheOwnerId,
            ledgerId,
        };
    }

    getState() {
        return this.state;
    }

    recordOptimisticOverlayEvent(
        type:
            | "optimisticOverlayStarted"
            | "optimisticOverlayCommitted"
            | "optimisticOverlayDiscarded",
        mutationId: string,
    ) {
        this.emitEvent({ mutationId, type });
    }

    receiveCrossTabKnowledge(input: {
        changeCursor: string;
        ledgerId: string;
        workspaceGeneration: number;
        workspaceRevision: number;
    }) {
        this.emitEvent({
            changeCursor: input.changeCursor,
            ledgerId: input.ledgerId,
            type: "crossTabKnowledgeReceived",
        });

        if (
            input.ledgerId !== this.state.snapshot.activeLedgerId ||
            !isWorkspaceKnowledgeNewer(input, this.state.snapshot.knowledge)
        ) {
            return Promise.resolve(false);
        }

        return this.syncWorkspaceWithResult();
    }

    subscribe(listener: (state: WorkspaceSyncControllerState) => void) {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    async readCachedTransactions(input: {
        identity: WorkspaceCacheIdentity;
        query?: WorkspaceTransactionQuery;
    }) {
        if (
            this.state.transactionRepositoryState === "unavailable" ||
            this.state.transactionRepositoryState === "memoryFallback" ||
            this.state.transactionRepositoryState === "recovering"
        ) {
            return null;
        }

        try {
            const result =
                await this.options.ports.repository.readTransactions(input);

            if (!result) {
                void this.recoverTransactionRepository();
            }

            return result;
        } catch {
            void this.recoverTransactionRepository();
            return null;
        }
    }

    async syncWorkspace() {
        await this.syncWorkspaceWithResult();
    }

    syncWorkspaceWithResult() {
        if (this.syncPromise) {
            return this.syncPromise;
        }

        this.updateState({ syncStatus: "syncing" });
        const syncPromise = (async () => {
            try {
                await this.hydrateCachedSnapshot();
                await this.syncToVersion(await this.fetchWorkspaceVersion());
                this.updateState({ isReady: true, syncStatus: "idle" });
                return true;
            } catch (error) {
                this.reportSynchronizationFailure(error);
                const snapshot = this.state.snapshot;
                const usableMemory = hasUsableMemorySnapshot(snapshot);

                this.updateState({
                    isReady: this.options.initialSnapshotProvided
                        ? this.state.isReady
                        : false,
                    syncStatus: "error",
                    transactionRepositoryState:
                        error instanceof WorkspaceCachePersistenceError ||
                        !usableMemory
                            ? "unavailable"
                            : "memoryFallback",
                });
                return false;
            } finally {
                this.syncPromise = null;
            }
        })();

        this.syncPromise = syncPromise;
        return syncPromise;
    }

    async refreshWorkspaceSnapshot() {
        await this.recoverTransactionRepository();
    }

    async requestTransactionRepositoryRecovery() {
        await this.recoverTransactionRepository();
    }

    reconcileCommittedResponse() {
        if (this.committedReconciliationPromise) {
            return this.committedReconciliationPromise;
        }

        const reconciliation = (async () => {
            try {
                this.updateState({ syncStatus: "syncing" });
                await this.syncToVersion(await this.fetchWorkspaceVersion());
                this.updateState({ syncStatus: "idle" });
            } catch (error) {
                const usableMemory = hasUsableMemorySnapshot(
                    this.state.snapshot,
                );

                this.updateState({
                    isReady: usableMemory ? this.state.isReady : false,
                    syncStatus: "error",
                    transactionRepositoryState:
                        error instanceof WorkspaceCachePersistenceError ||
                        !usableMemory
                            ? "unavailable"
                            : "memoryFallback",
                });
                throw error;
            }
        })().finally(() => {
            this.committedReconciliationPromise = null;
        });

        this.committedReconciliationPromise = reconciliation;
        return reconciliation;
    }

    async applyCommittedWorkspaceChanges(
        input: CommittedWorkspaceControllerInput,
    ): Promise<CommittedWorkspaceControllerOutcome> {
        const currentSnapshot = this.state.snapshot;
        const authoritativeKnowledge = input.knowledge;

        this.emitEvent({
            changes: input.changes,
            knowledge: authoritativeKnowledge ?? currentSnapshot.knowledge,
            type: "committedMutationReceived",
        });

        if (!authoritativeKnowledge) {
            await this.reconcileCommittedResponse();
            return "reconciled";
        }

        const committedChanges = getContiguousCommittedWorkspaceChanges({
            changes: input.changes,
            knowledge: currentSnapshot.knowledge,
        });

        if (committedChanges.requiresReconciliation) {
            await this.reconcileCommittedResponse();
            return "reconciled";
        }

        const changes = committedChanges.changes;

        if (changes.length === 0) {
            if (
                isWorkspaceKnowledgeNewer(
                    authoritativeKnowledge,
                    currentSnapshot.knowledge,
                )
            ) {
                await this.reconcileCommittedResponse();
                return "reconciled";
            }
            return "committed";
        }

        const latestRevision = getLatestWorkspaceRevision(
            changes,
            currentSnapshot.knowledge,
        );
        if (
            authoritativeKnowledge.activeLedgerId !==
                currentSnapshot.activeLedgerId ||
            authoritativeKnowledge.workspaceGeneration !==
                latestRevision.workspaceGeneration ||
            authoritativeKnowledge.workspaceRevision !==
                latestRevision.workspaceRevision
        ) {
            await this.reconcileCommittedResponse();
            return "reconciled";
        }

        if (!isTransactionFamilyFullyHydrated(currentSnapshot)) {
            return this.applyCommittedConfigurationChanges({
                changes,
                currentSnapshot,
                knowledge: authoritativeKnowledge,
            });
        }

        let nextSnapshotWithoutKnowledge: WorkspaceSnapshot;

        try {
            nextSnapshotWithoutKnowledge = applyWorkspaceChanges(
                currentSnapshot,
                changes,
            );
        } catch (error) {
            if (isWorkspaceTransitionError(error)) {
                await this.recoverFromWorkspaceTransitionFailure();
            } else {
                await this.reconcileCommittedResponse();
            }
            return "reconciled";
        }

        const nextSnapshot = createSnapshotWithKnowledge(
            nextSnapshotWithoutKnowledge,
            authoritativeKnowledge,
        );

        if (
            !isSnapshotValidatedByKnowledge(
                nextSnapshot,
                authoritativeKnowledge,
            )
        ) {
            await this.recoverFromWorkspaceTransitionFailure();
            return "reconciled";
        }

        this.commitSnapshot(nextSnapshot);
        this.publishKnowledge(nextSnapshot.knowledge);
        const persistenceOutcome = await this.persistChanges(
            nextSnapshot,
            changes,
        );

        if (persistenceOutcome === "failed") {
            this.updateState({
                syncStatus: "error",
                transactionRepositoryState: "memoryFallback",
            });
            return "committed";
        }

        if (persistenceOutcome === "superseded") {
            await this.reconcileCommittedResponse();
            return "reconciled";
        }

        this.updateState({
            transactionRepositoryState:
                persistenceOutcome === "fallback"
                    ? "memoryFallback"
                    : "repositoryReady",
        });
        return "committed";
    }

    async applyWorkspaceSync(
        sync: WorkspaceSyncEnvelope,
    ): Promise<CommittedWorkspaceControllerOutcome> {
        let currentSnapshot = this.state.snapshot;
        let usedMemoryFallback = this.persistenceUnavailable;
        const localVersion = {
            cursor: currentSnapshot.knowledge.changeCursor,
            generation: currentSnapshot.knowledge.workspaceGeneration,
            ledgerId: currentSnapshot.activeLedgerId,
            protocolVersion: 2 as const,
            revision: currentSnapshot.knowledge.workspaceRevision,
        };

        if (compareWorkspaceVersions(localVersion, sync.toVersion) >= 0) {
            return "committed";
        }

        for (const commit of sync.commits) {
            const currentVersion = {
                cursor: currentSnapshot.knowledge.changeCursor,
                generation: currentSnapshot.knowledge.workspaceGeneration,
                ledgerId: currentSnapshot.activeLedgerId,
                protocolVersion: 2 as const,
                revision: currentSnapshot.knowledge.workspaceRevision,
            };

            if (compareWorkspaceVersions(currentVersion, commit.toVersion) >= 0) {
                continue;
            }
            if (compareWorkspaceVersions(currentVersion, commit.fromVersion) !== 0) {
                await this.reconcileCommittedResponse();
                return "reconciled";
            }

            const changes = toLegacyWorkspaceChanges({ commit, snapshot: currentSnapshot });
            const projected = applyWorkspaceChanges(currentSnapshot, changes, {
                validateTransitions: false,
            });
            const knowledge = createWorkspaceKnowledgeFromSnapshot({
                changeCursor: commit.toVersion.cursor,
                entityRevisions: createWorkspaceEntityRevisionTokens({
                    generation: commit.toVersion.generation,
                    revision: commit.toVersion.revision,
                }),
                generatedAt: commit.committedAt,
                retainedChangesAfter:
                    currentSnapshot.knowledge.retainedChangesAfter,
                snapshot: projected,
                workspaceGeneration: commit.toVersion.generation,
                workspaceRevision: commit.toVersion.revision,
            });
            const nextSnapshot = createSnapshotWithKnowledge(projected, knowledge);

            this.commitSnapshot(nextSnapshot);
            currentSnapshot = nextSnapshot;
            const persistenceOutcome = this.persistenceUnavailable
                ? "failed"
                : await this.persistChanges(nextSnapshot, changes);

            if (
                persistenceOutcome === "failed" ||
                persistenceOutcome === "fallback"
            ) {
                usedMemoryFallback = true;
                this.updateState({
                    syncStatus: "error",
                    transactionRepositoryState: "memoryFallback",
                });
                continue;
            }
            if (persistenceOutcome === "superseded") {
                await this.reconcileCommittedResponse();
                return "reconciled";
            }
        }

        if (
            compareWorkspaceVersions(
                {
                    cursor: currentSnapshot.knowledge.changeCursor,
                    generation: currentSnapshot.knowledge.workspaceGeneration,
                    ledgerId: currentSnapshot.activeLedgerId,
                    protocolVersion: 2,
                    revision: currentSnapshot.knowledge.workspaceRevision,
                },
                sync.toVersion,
            ) < 0
        ) {
            await this.reconcileCommittedResponse();
            return "reconciled";
        }

        this.updateState({
            transactionRepositoryState: usedMemoryFallback
                ? "memoryFallback"
                : "repositoryReady",
        });
        this.options.ports.publishSync?.(sync);
        return "committed";
    }

    async reconcileFullWorkspaceMutation() {
        await this.syncToVersion(await this.fetchWorkspaceVersion());
    }

    private async applyCommittedConfigurationChanges(input: {
        changes: WorkspaceChange[];
        currentSnapshot: WorkspaceSnapshot;
        knowledge: WorkspaceKnowledge;
    }): Promise<CommittedWorkspaceControllerOutcome> {
        let nextSnapshot: WorkspaceSnapshot;

        try {
            nextSnapshot = createSnapshotWithKnowledge(
                applyWorkspaceChanges(
                    input.currentSnapshot,
                    getConfigurationWorkspaceChanges(input.changes),
                    { deriveAccountBalances: false },
                ),
                input.knowledge,
            );
        } catch (error) {
            if (isWorkspaceTransitionError(error)) {
                await this.recoverFromWorkspaceTransitionFailure();
            } else {
                await this.reconcileCommittedResponse();
            }
            return "reconciled";
        }

        if (
            !isConfigurationSnapshotValidatedByKnowledge(
                nextSnapshot,
                input.knowledge,
            )
        ) {
            await this.recoverFromWorkspaceTransitionFailure();
            return "reconciled";
        }

        const persistenceOutcome = await this.persistChanges(
            nextSnapshot,
            input.changes,
        );

        if (persistenceOutcome === "failed") {
            await this.rejectCachePersistence(nextSnapshot.activeLedgerId);
            const recovered = await this.recoverTransactionRepository();

            if (!recovered) {
                throw new WorkspaceCachePersistenceError();
            }
            return "reconciled";
        }

        if (
            persistenceOutcome === "fallback" ||
            persistenceOutcome === "superseded"
        ) {
            if (persistenceOutcome === "fallback") {
                const recovered = await this.recoverTransactionRepository();

                if (!recovered) {
                    throw new WorkspaceCachePersistenceError();
                }
            } else {
                await this.reconcileCommittedResponse();
            }
            return "reconciled";
        }

        if (
            !isWorkspaceKnowledgeEquivalent(
                this.state.snapshot.knowledge,
                input.currentSnapshot.knowledge,
            )
        ) {
            await this.reconcileCommittedResponse();
            return "reconciled";
        }

        const committedSnapshot = await this.readCommittedConfigurationSnapshot({
            knowledge: input.knowledge,
            ledgerId: nextSnapshot.activeLedgerId,
        });

        if (!committedSnapshot) {
            const recovered = await this.recoverTransactionRepository();

            if (!recovered) {
                throw new WorkspaceCachePersistenceError();
            }
            return "reconciled";
        }

        this.commitSnapshot(committedSnapshot);
        this.publishKnowledge(committedSnapshot.knowledge);
        return "committed";
    }

    private emitEvent(event: WorkspaceSyncControllerEvent) {
        if (this.disposed) {
            return;
        }

        this.options.ports.observeEvent?.(event);
    }

    private reportSynchronizationFailure(error: unknown) {
        if (process.env.NODE_ENV === "test") {
            return;
        }

        const snapshot = this.state.snapshot;
        console.error("[workspace-sync] Synchronization failed.", {
            activeLedgerId: snapshot.activeLedgerId,
            activeLedgerName: snapshot.activeLedgerName,
            error,
            initialSnapshotProvided: this.options.initialSnapshotProvided,
            isReady: this.state.isReady,
            localKnowledge: {
                changeCursor: snapshot.knowledge.changeCursor,
                workspaceGeneration: getWorkspaceGeneration(snapshot.knowledge),
                workspaceRevision: snapshot.knowledge.workspaceRevision,
            },
            transactionHydration: snapshot.transactionHydration,
            transactionRepositoryState: this.state.transactionRepositoryState,
            visible: typeof document === "undefined"
                ? undefined
                : document.visibilityState,
        });
    }

    private updateState(patch: Partial<WorkspaceSyncControllerState>) {
        if (this.disposed) {
            return;
        }

        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) {
            listener(this.state);
        }
    }

    private commitSnapshot(nextSnapshot: WorkspaceSnapshot) {
        const currentSnapshot = this.state.snapshot;
        const sameLedger =
            currentSnapshot.activeLedgerId === nextSnapshot.activeLedgerId;
        const currentGeneration = getWorkspaceGeneration(
            currentSnapshot.knowledge,
        );
        const nextGeneration = getWorkspaceGeneration(nextSnapshot.knowledge);
        const currentRevision = currentSnapshot.knowledge.workspaceRevision;
        const nextRevision = nextSnapshot.knowledge.workspaceRevision;
        const movesBackward =
            nextGeneration < currentGeneration ||
            (nextGeneration === currentGeneration &&
                currentRevision !== undefined &&
                nextRevision !== undefined &&
                nextRevision < currentRevision) ||
            (nextGeneration === currentGeneration &&
                (currentRevision === undefined || nextRevision === undefined) &&
                nextSnapshot.knowledge.changeCursor.localeCompare(
                    currentSnapshot.knowledge.changeCursor,
                ) < 0);

        if (sameLedger && movesBackward) {
            return false;
        }

        this.updateState({ snapshot: nextSnapshot });
        return true;
    }

    private publishKnowledge(knowledge: WorkspaceKnowledge) {
        if (!this.disposed) {
            this.options.ports.publishKnowledge(knowledge);
        }
    }

    private enqueueCachePersistence<Result>(
        operation: () => Promise<Result>,
    ) {
        const queuedOperation = this.cachePersistenceQueue.then(
            operation,
            operation,
        );

        this.cachePersistenceQueue = queuedOperation.then(
            () => undefined,
            () => undefined,
        );

        return queuedOperation;
    }

    private async invalidateTransactionRepository(
        identity: WorkspaceCacheIdentity,
        options: { requestRecovery?: boolean } = {},
    ) {
        this.updateState({
            transactionRepositoryRevision:
                this.state.transactionRepositoryRevision + 1,
        });
        await this.options.ports.repository
            .invalidate(identity)
            .catch(() => undefined);
        if (options.requestRecovery ?? true) {
            void this.recoverTransactionRepository();
        }
    }

    private async resolveCacheWriteOutcome(input: {
        identity: WorkspaceCacheIdentity;
        result: WorkspaceCacheWriteResult;
        writeKnowledge: WorkspaceKnowledge;
    }): Promise<WorkspacePersistenceOutcome> {
        if (input.result === "committed") {
            return "committed";
        }
        if (input.result === "unavailable") {
            return "fallback";
        }
        if (input.result !== "superseded") {
            return "failed";
        }

        const metadata = await this.options.ports
            .repository.readMetadata(input.identity)
            .catch(() => null);
        const storedVersion = metadata?.version;
        const writeVersion = workspaceKnowledgeToVersionResult(
            input.writeKnowledge,
        );

        if (
            storedVersion &&
            compareWorkspaceVersions(storedVersion, writeVersion) >= 0
        ) {
            return "superseded";
        }

        return "failed";
    }

    private async persistSnapshot(nextSnapshot: WorkspaceSnapshot) {
        const identity = this.getCacheIdentity(nextSnapshot.activeLedgerId);

        if (!identity) {
            this.emitEvent({
                outcome: "fallback",
                type: "cacheWriteCompleted",
            });
            return "fallback" as const;
        }

        const result = await this.enqueueCachePersistence(async () => {
            try {
                return await this.options.ports.repository.replace({
                    identity,
                    snapshot: {
                        ...nextSnapshot,
                        knowledge: nextSnapshot.knowledge,
                    },
                });
            } catch {
                return "failed" as const;
            }
        });
        if (result === "failed" || result === "unavailable") {
            this.persistenceUnavailable = true;
        }
        const outcome = await this.resolveCacheWriteOutcome({
            identity,
            result,
            writeKnowledge: nextSnapshot.knowledge,
        });

        if (outcome === "committed" || outcome === "superseded") {
            this.updateState({
                transactionRepositoryRevision:
                    this.state.transactionRepositoryRevision + 1,
            });
        }
        this.emitEvent({ outcome, type: "cacheWriteCompleted" });
        return outcome;
    }

    private async persistChanges(
        nextSnapshot: WorkspaceSnapshot,
        changes: WorkspaceChange[],
    ) {
        if (this.persistenceUnavailable) {
            this.emitEvent({
                outcome: "failed",
                type: "cacheWriteCompleted",
            });
            return "failed" as const;
        }

        const identity = this.getCacheIdentity(nextSnapshot.activeLedgerId);

        if (!identity) {
            this.emitEvent({
                outcome: "fallback",
                type: "cacheWriteCompleted",
            });
            return "fallback" as const;
        }

        const result = await this.enqueueCachePersistence(async () => {
            try {
                return await this.options.ports.repository.applyChanges({
                    activeLedgerName: nextSnapshot.activeLedgerName,
                    changes,
                    identity,
                    knowledge: nextSnapshot.knowledge,
                });
            } catch {
                return "failed" as const;
            }
        });
        if (result === "failed" || result === "unavailable") {
            this.persistenceUnavailable = true;
        }
        const outcome = await this.resolveCacheWriteOutcome({
            identity,
            result,
            writeKnowledge: nextSnapshot.knowledge,
        });

        if (outcome === "committed" || outcome === "superseded") {
            this.updateState({
                transactionRepositoryRevision:
                    this.state.transactionRepositoryRevision + 1,
            });
        }
        this.emitEvent({ outcome, type: "cacheWriteCompleted" });
        return outcome;
    }

    private async readCommittedConfigurationSnapshot(input: {
        knowledge: WorkspaceKnowledge;
        ledgerId: string;
    }): Promise<WorkspaceSnapshot | null> {
        const identity = this.getCacheIdentity(input.ledgerId);

        if (!identity) {
            return null;
        }

        const cachedSnapshot = await this.options.ports
            .repository.readConfiguration(identity)
            .catch(() => null);

        if (!cachedSnapshot) {
            return null;
        }

        const rebuiltSnapshot = rebuildSnapshotForHydration(cachedSnapshot);

        if (
            rebuiltSnapshot.activeLedgerId !== input.ledgerId ||
            !isWorkspaceKnowledgeEquivalent(
                rebuiltSnapshot.knowledge,
                input.knowledge,
            )
        ) {
            return null;
        }

        return createSnapshotWithKnowledge(rebuiltSnapshot, input.knowledge);
    }

    private commitRecoveredWorkspace(recovery: WorkspaceRecoveryResult) {
        this.commitSnapshot(recovery.snapshot);
        this.publishKnowledge(recovery.snapshot.knowledge);
        this.updateState({
            transactionRepositoryState:
                recovery.persistenceOutcome === "fallback"
                    ? "memoryFallback"
                    : "repositoryReady",
        });
    }

    private async rejectCachePersistence(ledgerId: string) {
        const identity = this.getCacheIdentity(ledgerId);

        if (identity) {
            await this.invalidateTransactionRepository(identity, {
                requestRecovery: false,
            });
        }
        this.updateState({
            syncStatus: "error",
            transactionRepositoryState: "unavailable",
        });
    }

    private async recoverWorkspaceSnapshot(): Promise<WorkspaceRecoveryResult> {
        this.emitEvent({ type: "snapshotRecoveryStarted" });

        try {
            const recovery = await this.buildRecoveredWorkspaceSnapshot();
            this.emitEvent({ type: "snapshotRecoveryCompleted" });
            return recovery;
        } catch (error) {
            this.emitEvent({ error, type: "snapshotRecoveryFailed" });
            throw error;
        }
    }

    private async buildRecoveredWorkspaceSnapshot(): Promise<WorkspaceRecoveryResult> {
        const payload = await this.options.ports.fetchSnapshot();
        const nextSnapshot = replicaPayloadToWorkspaceSnapshot(payload);

        const persistenceOutcome = await this.persistSnapshot(nextSnapshot);

        if (persistenceOutcome === "failed") {
            return { persistenceOutcome: "fallback", snapshot: nextSnapshot };
        }

        if (persistenceOutcome === "superseded") {
            const identity = this.getCacheIdentity(nextSnapshot.activeLedgerId);
            const cachedSnapshot = identity
                ? await this.options.ports.repository
                      .read(identity)
                      .catch(() => null)
                : null;
            const rebuiltCachedSnapshot = cachedSnapshot
                ? rebuildWorkspaceSnapshot(cachedSnapshot)
                : null;

            if (
                !rebuiltCachedSnapshot ||
                !isSnapshotValidatedByKnowledge(
                    rebuiltCachedSnapshot,
                    rebuiltCachedSnapshot.knowledge,
                )
            ) {
                await this.rejectCachePersistence(nextSnapshot.activeLedgerId);
                throw new WorkspaceCachePersistenceError();
            }

            return {
                persistenceOutcome,
                snapshot: rebuiltCachedSnapshot,
            };
        }

        return { persistenceOutcome, snapshot: nextSnapshot };
    }

    private recoverTransactionRepository() {
        if (this.recoveryPromise) {
            return this.recoveryPromise;
        }

        const requestedLedgerId = this.state.snapshot.activeLedgerId;
        const requestedGeneration = getWorkspaceGeneration(
            this.state.snapshot.knowledge,
        );
        this.updateState({ transactionRepositoryState: "recovering" });

        const recovery = (async () => {
            try {
                const result = await this.recoverWorkspaceSnapshot();
                const currentSnapshot = this.state.snapshot;

                if (
                    currentSnapshot.activeLedgerId !== requestedLedgerId ||
                    getWorkspaceGeneration(currentSnapshot.knowledge) !==
                        requestedGeneration
                ) {
                    return null;
                }

                this.commitRecoveredWorkspace(result);
                this.updateState({ isReady: true, syncStatus: "idle" });
                return result.snapshot;
            } catch (error) {
                const currentSnapshot = this.state.snapshot;

                if (
                    currentSnapshot.activeLedgerId === requestedLedgerId &&
                    getWorkspaceGeneration(currentSnapshot.knowledge) ===
                        requestedGeneration
                ) {
                    const hydrated =
                        isTransactionFamilyFullyHydrated(currentSnapshot);
                    this.updateState({
                        isReady: hydrated ? this.state.isReady : false,
                        syncStatus: "error",
                        transactionRepositoryState:
                            error instanceof WorkspaceCachePersistenceError
                                ? "unavailable"
                                : currentSnapshot.ledgers.length > 0 && hydrated
                                  ? "memoryFallback"
                                  : "unavailable",
                    });
                }
                return null;
            }
        })().finally(() => {
            this.recoveryPromise = null;
        });

        this.recoveryPromise = recovery;
        return recovery;
    }

    private async recoverFromWorkspaceTransitionFailure() {
        const currentSnapshot = this.state.snapshot;
        const identity = this.getCacheIdentity(currentSnapshot.activeLedgerId);

        if (identity) {
            await this.invalidateTransactionRepository(identity);
        }

        const recovered = await this.recoverTransactionRepository();

        if (!recovered) {
            throw new WorkspaceCachePersistenceError();
        }
    }

    private async fetchWorkspaceVersion() {
        if (this.options.ports.fetchVersion) {
            return this.options.ports.fetchVersion();
        }

        return workspaceKnowledgeToVersionResult(
            await this.options.ports.fetchKnowledge(),
        );
    }

    private async hydrateCachedSnapshot() {
        if (hasUsableMemorySnapshot(this.state.snapshot)) {
            return;
        }

        const ledgerId = this.state.snapshot.activeLedgerId;
        const identity = this.getCacheIdentity(ledgerId);
        const cached = identity
            ? await this.options.ports.repository.read(identity).catch(() => null)
            : null;

        if (!cached) {
            return;
        }

        const snapshot = rebuildWorkspaceSnapshot(cached);
        this.commitSnapshot(snapshot);
        this.updateState({
            isReady: true,
            transactionRepositoryState: "repositoryReady",
        });
    }

    private async syncToVersion(serverVersion: WorkspaceVersionResult) {
        this.emitEvent({ type: "versionReceived", version: serverVersion });
        let localSnapshot = this.state.snapshot;

        if (
            !hasUsableMemorySnapshot(localSnapshot) ||
            localSnapshot.activeLedgerId !== serverVersion.ledgerId
        ) {
            const identity = this.getCacheIdentity(serverVersion.ledgerId);
            const cached = identity
                ? await this.options.ports.repository.read(identity).catch(() => null)
                : null;

            if (!cached) {
                this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
                return;
            }

            localSnapshot = rebuildWorkspaceSnapshot(cached);
            this.commitSnapshot(localSnapshot);
            this.updateState({ transactionRepositoryState: "repositoryReady" });
        }

        const localVersion = snapshotToWorkspaceVersion(localSnapshot);
        const comparison = compareWorkspaceVersions(localVersion, serverVersion);

        if (comparison === 0) {
            return;
        }

        if (
            localVersion.ledgerId !== serverVersion.ledgerId ||
            localVersion.generation !== serverVersion.generation ||
            comparison > 0 ||
            !this.options.ports.fetchCommits
        ) {
            if (!this.options.ports.fetchCommits) {
                await this.syncToKnowledge(await this.options.ports.fetchKnowledge());
                return;
            }
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }

        const delta = await this.options.ports.fetchCommits(localVersion.cursor);

        if (
            delta.requiresSnapshot ||
            compareWorkspaceVersions(delta.fromVersion, localVersion) !== 0 ||
            compareWorkspaceVersions(delta.toVersion, serverVersion) !== 0
        ) {
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }

        await this.applyWorkspaceSync({
            commits: delta.commits,
            fromVersion: delta.fromVersion,
            toVersion: delta.toVersion,
        });
    }

    private async syncToKnowledge(serverKnowledge: WorkspaceKnowledge) {
        this.emitEvent({
            knowledge: serverKnowledge,
            type: "knowledgeReceived",
        });
        const currentSnapshot = this.state.snapshot;
        let localSnapshot = currentSnapshot;
        const needsCachedSnapshot =
            currentSnapshot.ledgers.length === 0 ||
            currentSnapshot.activeLedgerId !== serverKnowledge.activeLedgerId;

        if (needsCachedSnapshot) {
            const identity = this.getCacheIdentity(
                serverKnowledge.activeLedgerId,
            );
            const cachedSnapshot = identity
                ? await this.options.ports.repository.read(identity).catch(() => null)
                : null;

            if (cachedSnapshot) {
                localSnapshot = rebuildSnapshotForHydration(cachedSnapshot);
                this.updateState({ transactionRepositoryState: "repositoryReady" });
            } else {
                this.commitRecoveredWorkspace(
                    await this.recoverWorkspaceSnapshot(),
                );
                return;
            }
        }

        const localKnowledge = isTransactionFamilyFullyHydrated(localSnapshot)
            ? createKnowledgeForSnapshot({
                  knowledge: localSnapshot.knowledge,
                  snapshot: localSnapshot,
              })
            : localSnapshot.knowledge;

        if (
            isWorkspaceKnowledgeEquivalent(localKnowledge, serverKnowledge)
        ) {
            this.commitSnapshot(
                createSnapshotWithKnowledge(localSnapshot, serverKnowledge),
            );
            if (!isTransactionFamilyFullyHydrated(localSnapshot)) {
                this.updateState({
                    transactionRepositoryState: "configurationReady",
                });
            } else if (
                this.state.transactionRepositoryState !== "memoryFallback" &&
                this.state.transactionRepositoryState !== "unavailable"
            ) {
                this.updateState({
                    transactionRepositoryState: "repositoryReady",
                });
            }
            return;
        }

        if (
            localKnowledge.activeLedgerId === serverKnowledge.activeLedgerId &&
            localKnowledge.changeCursor === serverKnowledge.changeCursor &&
            getWorkspaceGeneration(localKnowledge) ===
                getWorkspaceGeneration(serverKnowledge)
        ) {
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }

        if (
            localKnowledge.activeLedgerId !== serverKnowledge.activeLedgerId ||
            getWorkspaceGeneration(localKnowledge) !==
                getWorkspaceGeneration(serverKnowledge) ||
            isKnowledgeTooOldForDelta(localKnowledge, serverKnowledge)
        ) {
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }

        const delta = await this.options.ports.fetchChanges(
            localKnowledge.changeCursor,
        );
        this.emitEvent({ delta, type: "deltaReceived" });

        if (
            !isWorkspaceDeltaContiguous({
                after: localKnowledge.changeCursor,
                delta,
            })
        ) {
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }

        const isFullyHydrated =
            isTransactionFamilyFullyHydrated(localSnapshot);
        const projectedChanges = isFullyHydrated
            ? delta.changes
            : getConfigurationWorkspaceChanges(delta.changes);
        let nextSnapshot: WorkspaceSnapshot;

        try {
            nextSnapshot = createSnapshotWithKnowledge(
                applyWorkspaceChanges(localSnapshot, projectedChanges, {
                    deriveAccountBalances: isFullyHydrated,
                }),
                delta.knowledge,
            );
        } catch (error) {
            if (!isWorkspaceTransitionError(error)) {
                throw error;
            }

            await this.recoverFromWorkspaceTransitionFailure();
            return;
        }

        if (
            (isFullyHydrated &&
                !isSnapshotValidatedByKnowledge(
                    nextSnapshot,
                    delta.knowledge,
                )) ||
            (!isFullyHydrated &&
                !isConfigurationSnapshotValidatedByKnowledge(
                    nextSnapshot,
                    delta.knowledge,
                ))
        ) {
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }

        const persistenceOutcome = await this.persistChanges(
            nextSnapshot,
            delta.changes,
        );

        if (persistenceOutcome === "failed") {
            this.commitSnapshot(nextSnapshot);
            this.publishKnowledge(nextSnapshot.knowledge);
            this.updateState({
                transactionRepositoryState: "memoryFallback",
            });
            return;
        }
        if (persistenceOutcome === "superseded") {
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }
        if (!isFullyHydrated && persistenceOutcome === "fallback") {
            this.commitRecoveredWorkspace(await this.recoverWorkspaceSnapshot());
            return;
        }

        if (!isFullyHydrated) {
            const committedSnapshot =
                await this.readCommittedConfigurationSnapshot({
                    knowledge: nextSnapshot.knowledge,
                    ledgerId: nextSnapshot.activeLedgerId,
                });

            if (!committedSnapshot) {
                this.commitRecoveredWorkspace(
                    await this.recoverWorkspaceSnapshot(),
                );
                return;
            }

            this.commitSnapshot(committedSnapshot);
            this.publishKnowledge(committedSnapshot.knowledge);
            this.updateState({
                transactionRepositoryState: "configurationReady",
            });
            return;
        }

        this.commitSnapshot(nextSnapshot);
        this.publishKnowledge(nextSnapshot.knowledge);
        this.updateState({
            transactionRepositoryState:
                persistenceOutcome === "fallback"
                    ? "memoryFallback"
                    : "repositoryReady",
        });
    }
}
