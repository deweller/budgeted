import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { createTransactionAggregateMetadata } from "@/features/transactions/models/transaction-aggregate-revision";
import {
    applyWorkspaceRepositoryChanges,
} from "@/lib/workspace/repository/apply";
import {
    readCachedTransactions,
    readCachedTransactionChildren,
    readWorkspaceCache,
    readWorkspaceCacheConfiguration,
    readWorkspaceCacheMetadata,
} from "@/lib/workspace/repository/queries";
import { replaceWorkspaceRepository } from "@/lib/workspace/repository/replace";
import {
    getWorkspaceRepositoryDatabase,
    resetWorkspaceRepositoryDatabaseForTests,
} from "@/lib/workspace/repository/schema";
import {
    WORKSPACE_CACHE_DATABASE_NAME,
    WORKSPACE_CACHE_SCHEMA_VERSION,
} from "@/lib/workspace/repository/types";
import {
    calculateWorkspaceEntityCounts,
    calculateWorkspaceEntityDigests,
    createWorkspaceEntityRevisionTokens,
} from "@/lib/workspace/revision";
import { toWorkspaceSnapshotRecords } from "@/lib/workspace/snapshot-utils";
import type {
    WorkspaceChange,
    WorkspaceKnowledge,
    WorkspaceSnapshotPayload,
} from "@/lib/workspace/sync-types";

const identity = { cacheOwnerId: "owner-1", ledgerId: "ledger-1" };
const now = "2026-08-01T12:00:00.000Z";

function createKnowledge(
    snapshot: WorkspaceSnapshotPayload,
    revision: number,
): WorkspaceKnowledge {
    const records = toWorkspaceSnapshotRecords(snapshot);
    return {
        activeLedgerId: "ledger-1",
        changeCursor: `g1:r${revision}`,
        entityCounts: calculateWorkspaceEntityCounts(records),
        entityDigests: calculateWorkspaceEntityDigests(records),
        entityRevisions: createWorkspaceEntityRevisionTokens({
            generation: 1,
            revision,
        }),
        generatedAt: now,
        oldestRetainedWorkspaceRevision: 0,
        retainedChangesAfter: "2026-07-01T00:00:00.000Z",
        revision: `g1:r${revision}`,
        workspaceGeneration: 1,
        workspaceRevision: revision,
    };
}

function createSnapshot(revision = 1): WorkspaceSnapshotPayload {
    const transaction = {
        displayAmountCents: -250,
        enteredAt: now,
        kind: "standard" as const,
        ledgerId: "ledger-1",
        occurredAt: now,
        periodId: "2026-08",
        referenceAccountId: "account-1",
        source: "manual" as const,
        status: "entered" as const,
        transactionId: "transaction-1",
        updatedAt: now,
    };
    const line = {
        amountCents: -250,
        createdAt: now,
        fromAccountId: "account-1",
        ledgerId: "ledger-1",
        lineId: "line-1",
        sortOrder: 0,
        transactionId: "transaction-1",
        updatedAt: now,
    };
    const posting = {
        amountCents: 250,
        createdAt: now,
        direction: "debit" as const,
        ledgerAccountId: "financial-checking",
        ledgerAccountKind: "financial" as const,
        ledgerId: "ledger-1",
        occurredAt: now,
        periodId: "2026-08",
        postingId: "posting-1",
        transactionId: "transaction-1",
    };
    const snapshot = {
        accounts: [
            {
                accountId: "account-1",
                accountType: "checking" as const,
                balanceCents: 1_250,
                createdAt: now,
                ledgerAccountId: "financial-checking",
                ledgerId: "ledger-1",
                name: "Checking",
                openedOn: "2026-01-01",
                openingBalanceCents: 1_000,
                updatedAt: now,
            },
        ],
        activeLedgerId: "ledger-1",
        activeLedgerName: "Household",
        allocationFundingSources: [],
        amazonOrderIntegrations: [],
        amazonOrderSyncRuns: [],
        amazonOrders: [],
        baseChangeCursor: `g1:r${revision}`,
        budgetAllocations: [],
        budgetCategories: [],
        budgetGroups: [],
        budgetPeriods: [],
        knowledge: {} as WorkspaceKnowledge,
        ledgerPostings: [posting],
        ledgers: [],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionAutoMatchRejections: [],
        transactionImportActivities: [],
        transactionLines: [line],
        transactionTemplates: [],
        transactions: [
            {
                ...transaction,
                ...createTransactionAggregateMetadata({
                    ledgerPostings: [posting],
                    plaidTransactionSyncs: [],
                    transaction,
                    transactionLines: [line],
                }),
            },
        ],
        venmoAccountMappings: [],
        venmoIntegrations: [],
    } satisfies WorkspaceSnapshotPayload;
    snapshot.knowledge = createKnowledge(snapshot, revision);
    return snapshot;
}

async function deleteRepositoryDatabase() {
    const database = await getWorkspaceRepositoryDatabase();
    database?.close();
    resetWorkspaceRepositoryDatabaseForTests();
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(WORKSPACE_CACHE_DATABASE_NAME);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

afterEach(deleteRepositoryDatabase);

describe("Workspace Sync V2 repository", () => {
    it("stores a complete canonical replica with only version metadata", async () => {
        const snapshot = createSnapshot();

        await expect(
            replaceWorkspaceRepository({ identity, snapshot }),
        ).resolves.toBe("committed");
        await expect(readWorkspaceCacheMetadata(identity)).resolves.toEqual(
            expect.objectContaining({
                activeLedgerName: "Household",
                schemaVersion: WORKSPACE_CACHE_SCHEMA_VERSION,
                version: expect.objectContaining({
                    cursor: "g1:r1",
                    protocolVersion: 2,
                }),
            }),
        );
        await expect(readWorkspaceCacheConfiguration(identity)).resolves.toEqual(
            expect.objectContaining({
                ledgerPostings: [expect.objectContaining({ postingId: "posting-1" })],
                transactionHydration: "full",
                transactionLines: [expect.objectContaining({ lineId: "line-1" })],
                transactions: [
                    expect.objectContaining({
                        lines: [expect.objectContaining({ lineId: "line-1" })],
                        postings: [expect.objectContaining({ postingId: "posting-1" })],
                        transactionId: "transaction-1",
                    }),
                ],
            }),
        );
    });

    it("derives balances and account-scoped transaction queries from canonical records", async () => {
        await replaceWorkspaceRepository({ identity, snapshot: createSnapshot() });

        await expect(readWorkspaceCache(identity)).resolves.toMatchObject({
            accounts: [{ accountId: "account-1", balanceCents: 1_250 }],
        });
        await expect(
            readCachedTransactions({ identity, query: { accountId: "account-1" } }),
        ).resolves.toMatchObject({
            transactions: [{ transactionId: "transaction-1" }],
        });
        await expect(
            readCachedTransactionChildren({
                entityType: "transactionLine",
                identity,
                transactionId: "transaction-1",
            }),
        ).resolves.toEqual([expect.objectContaining({ lineId: "line-1" })]);
    });

    it("applies changed records and advances metadata in one transaction", async () => {
        const snapshot = createSnapshot();
        await replaceWorkspaceRepository({ identity, snapshot });
        const account = { ...snapshot.accounts[0]!, name: "Everyday" };
        const knowledge = { ...snapshot.knowledge, changeCursor: "g1:r2", revision: "g1:r2", workspaceRevision: 2 };
        const change: WorkspaceChange = {
            batchId: "batch-2",
            changedAt: now,
            changeCount: 1,
            changeId: "batch-2:0",
            changeIndex: 0,
            entityId: "account-1",
            entityType: "account",
            expiresAt: 0,
            operation: "upsert",
            previousRecordDigest: null,
            record: account,
            workspaceGeneration: 1,
            workspaceRevision: 2,
        };

        await expect(
            applyWorkspaceRepositoryChanges({
                activeLedgerName: "Household",
                changes: [change],
                identity,
                knowledge,
            }),
        ).resolves.toBe("committed");
        await expect(readWorkspaceCache(identity)).resolves.toMatchObject({
            accounts: [{ name: "Everyday" }],
            knowledge: { changeCursor: "g1:r2" },
        });
    });

    it("treats equal or older snapshot writes as idempotently superseded", async () => {
        const snapshot = createSnapshot();
        await replaceWorkspaceRepository({ identity, snapshot });

        await expect(
            replaceWorkspaceRepository({ identity, snapshot }),
        ).resolves.toBe("superseded");
    });

    it("does not create a partial replica when incremental metadata is missing", async () => {
        const snapshot = createSnapshot(2);
        const change = {
            batchId: "batch-2",
            changedAt: now,
            changeCount: 1,
            changeId: "batch-2:0",
            changeIndex: 0,
            entityId: "account-1",
            entityType: "account" as const,
            expiresAt: 0,
            operation: "upsert" as const,
            previousRecordDigest: null,
            record: snapshot.accounts[0],
            workspaceGeneration: 1,
            workspaceRevision: 2,
        };

        await expect(
            applyWorkspaceRepositoryChanges({
                activeLedgerName: "Household",
                changes: [change],
                identity,
                knowledge: snapshot.knowledge,
            }),
        ).resolves.toBe("invalid");
        await expect(readWorkspaceCache(identity)).resolves.toBeNull();
    });
});
