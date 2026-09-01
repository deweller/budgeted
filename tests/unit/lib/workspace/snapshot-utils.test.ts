import { describe, expect, it } from "vitest";

import {
    applyWorkspaceChanges,
    createWorkspaceKnowledgeFromSnapshot,
    rebuildWorkspaceSnapshotRecords,
} from "@/lib/workspace/snapshot-utils";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";
import { WorkspaceTransitionError } from "@/lib/workspace/change-transition";
import type {
    WorkspaceChange,
    WorkspaceSnapshot,
} from "@/lib/workspace/sync-types";

function createSnapshot(): WorkspaceSnapshot {
    return {
        accounts: [
            {
                accountId: "acct-1",
                accountType: "checking",
                balanceCents: 1000,
                createdAt: "2026-01-01T00:00:00.000Z",
                ledgerAccountId: "ledger-acct-1",
                name: "Checking",
                openedOn: "2026-01-01",
                openingBalanceCents: 1000,
                updatedAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        activeLedgerId: "ledger-1",
        activeLedgerName: "Ledger",
        allocationFundingSources: [
            {
                allocationId: "2026-01:food",
                amountCents: 100,
                categoryId: "food",
                createdAt: "2026-01-01T00:00:00.000Z",
                fundingSourceId: "funding-1",
                periodId: "2026-01",
                sourceId: "acct-1",
                sourceType: "account",
                updatedAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        budgetAllocations: [
            {
                allocationId: "2026-01:food",
                assignedCents: 100,
                categoryId: "food",
                periodId: "2026-01",
                updatedAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        budgetCategories: [
            {
                categoryId: "food",
                createdAt: "2026-01-01T00:00:00.000Z",
                defaultAssignedCents: 100,
                groupId: "everyday",
                isIncomeCategory: false,
                ledgerAccountId: "category-food",
                name: "Food",
                sortOrder: 1,
                status: "active",
                updatedAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        budgetGroups: [
            {
                createdAt: "2026-01-01T00:00:00.000Z",
                groupId: "everyday",
                name: "Everyday",
                sortOrder: 0,
                status: "active",
                updatedAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        budgetPeriods: [
            {
                availableToBudgetCents: 900,
                createdAt: "2026-01-01T00:00:00.000Z",
                currency: "USD",
                endsOn: "2026-01-31",
                periodId: "2026-01",
                startsOn: "2026-01-01",
                status: "open",
                updatedAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: "ledger-1",
            changeCursor: "01HZ0000000000000000000000",
            entityCounts: {
                account: 1,
                allocationFundingSource: 1,
                budgetCategory: 1,
                budgetGroup: 1,
                budgetPeriod: 1,
                categoryAllocation: 1,
                ledger: 1,
                ledgerPosting: 1,
                plaidAccountLink: 0,
                plaidTransactionSync: 0,
                transaction: 1,
                transactionLine: 0,
            },
            generatedAt: "2026-01-01T00:00:00.000Z",
            retainedChangesAfter: "2025-12-02T00:00:00.000Z",
            revision: "",
        },
        ledgerPostings: [
            {
                amountCents: 100,
                createdAt: "2026-01-01T00:00:00.000Z",
                direction: "debit",
                ledgerAccountId: "ledger-acct-1",
                ledgerAccountKind: "financial",
                occurredAt: "2026-01-01T00:00:00.000Z",
                periodId: "2026-01",
                postingId: "posting-1",
                transactionId: "txn-1",
                ledgerId: "ledger-1",
            },
        ],
        transactionLines: [],
        ledgers: [
            {
                createdAt: "2026-01-01T00:00:00.000Z",
                isDefault: false,
                ledgerId: "ledger-1",
                workspaceId: "global",
                name: "Ledger",
                status: "active",
                updatedAt: "2026-01-01T00:00:00.000Z",
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactions: [
            {
                displayAmountCents: -100,
                enteredAt: "2026-01-01T00:00:00.000Z",
                occurredAt: "2026-01-01T00:00:00.000Z",
                periodId: "2026-01",
                postings: [],
                referenceAccountId: "acct-1",
                referenceCategoryId: "food",
                status: "entered",
                lines: [],
                transactionId: "txn-1",
                kind: "standard",
                updatedAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
    };
}

function change(
    input: Pick<
        WorkspaceChange,
        "entityId" | "entityType" | "operation" | "record"
    >,
): WorkspaceChange {
    return {
        batchId: "batch-1",
        changedAt: "2026-01-02T00:00:00.000Z",
        changeCount: 1,
        changeId: "01HZ0000000000000000000001",
        changeIndex: 0,
        expiresAt: 1,
        previousRecordDigest: null,
        workspaceGeneration: 1,
        workspaceRevision: 2,
        ...input,
    };
}

describe("workspace snapshot utils", () => {
    it("applies upsert and delete changes across workspace entity records", () => {
        const snapshot = createSnapshot();
        const next = applyWorkspaceChanges(
            snapshot,
            [
                change({
                    entityType: "account",
                    entityId: "acct-1",
                    operation: "upsert",
                    record: {
                        ...snapshot.accounts[0],
                        name: "Main Checking",
                        updatedAt: "2026-01-02T00:00:00.000Z",
                    },
                }),
                change({
                    entityType: "budgetCategory",
                    entityId: "food",
                    operation: "delete",
                    record: null,
                }),
                change({
                    entityType: "ledger",
                    entityId: "ledger-1",
                    operation: "upsert",
                    record: {
                        ...snapshot.ledgers[0],
                        name: "2026 Ledger",
                        updatedAt: "2026-01-02T00:00:00.000Z",
                    },
                }),
            ],
            { validateTransitions: false },
        );

        expect(next.accounts[0].name).toBe("Main Checking");
        expect(next.budgetCategories).toHaveLength(0);
        expect(next.activeLedgerName).toBe("2026 Ledger");
    });

    it("rejects revisioned changes that do not prove the snapshot record they replace", () => {
        const snapshot = createSnapshot();

        expect(() =>
            applyWorkspaceChanges(snapshot, [
                {
                    ...change({
                        entityType: "account",
                        entityId: "acct-1",
                        operation: "upsert",
                        record: {
                            ...snapshot.accounts[0],
                            name: "Main Checking",
                        },
                    }),
                    changeCount: 1,
                    changeIndex: 0,
                    previousRecordDigest: "f".repeat(64),
                    workspaceGeneration: 1,
                    workspaceRevision: 2,
                } as WorkspaceChange,
            ]),
        ).toThrow(WorkspaceTransitionError);

        expect(
            applyWorkspaceChanges(snapshot, [
                {
                    ...change({
                        entityType: "account",
                        entityId: "acct-1",
                        operation: "upsert",
                        record: {
                            ...snapshot.accounts[0],
                            name: "Main Checking",
                        },
                    }),
                    changeCount: 1,
                    changeIndex: 0,
                    previousRecordDigest: calculateWorkspaceRecordDigest({
                        entityType: "account",
                        record: snapshot.accounts[0],
                    }),
                    workspaceGeneration: 1,
                    workspaceRevision: 2,
                } as WorkspaceChange,
            ]).accounts[0]?.name,
        ).toBe("Main Checking");
    });

    it("preserves a committed balance when applying changes to a partial transaction snapshot", () => {
        const snapshot = createSnapshot();
        const partialSnapshot = {
            ...snapshot,
            accounts: [{ ...snapshot.accounts[0], balanceCents: 7_500 }],
            ledgerPostings: [],
            transactions: [],
        };

        const changeSet = [
            change({
                entityType: "budgetCategory",
                entityId: "food",
                operation: "upsert",
                record: {
                    ...snapshot.budgetCategories[0],
                    name: "Groceries",
                },
            }),
        ];

        expect(
            applyWorkspaceChanges(partialSnapshot, changeSet, {
                validateTransitions: false,
            }).accounts[0],
        ).toMatchObject({ balanceCents: 1_000 });
        expect(
            applyWorkspaceChanges(partialSnapshot, changeSet, {
                deriveAccountBalances: false,
                validateTransitions: false,
            }).accounts[0],
        ).toMatchObject({ balanceCents: 7_500 });
    });

    it("rebuilds transaction postings and local knowledge after deltas", () => {
        const snapshot = createSnapshot();
        const next = applyWorkspaceChanges(snapshot, [
            change({
                entityType: "ledgerPosting",
                entityId: "posting-2",
                operation: "upsert",
                record: {
                    ...snapshot.ledgerPostings[0],
                    postingId: "posting-2",
                    direction: "credit",
                },
            }),
        ]);
        const knowledge = createWorkspaceKnowledgeFromSnapshot({
            changeCursor: "01HZ0000000000000000000002",
            generatedAt: "2026-01-02T00:00:00.000Z",
            retainedChangesAfter: "2025-12-03T00:00:00.000Z",
            snapshot: next,
        });

        expect(next.transactions[0].postings).toHaveLength(2);
        expect(knowledge.entityCounts.ledgerPosting).toBe(2);
        expect(knowledge.revision).not.toBe("");
    });

    it("attaches canonical importer activities to their linked transactions", () => {
        const next = applyWorkspaceChanges(
            createSnapshot(),
            [
                change({
                    entityType: "transactionImportActivity",
                    entityId: "venmo:provider-1",
                    operation: "upsert",
                    record: {
                        activityId: "venmo:provider-1",
                        createdAt: "2026-01-01T00:00:00.000Z",
                        detailsJson: "{}",
                        detailsVersion: 1,
                        direction: "outflow",
                        financialFingerprint: "fingerprint-1",
                        ledgerId: "ledger-1",
                        linkedTransactionId: "txn-1",
                        occurredDate: "2026-01-01",
                        provider: "venmo",
                        providerAmountCents: 100,
                        providerRecordId: "provider-1",
                        state: "posted",
                        updatedAt: "2026-01-01T00:00:00.000Z",
                    },
                }),
            ],
            { validateTransitions: false },
        );

        expect(next.transactions[0].importActivities).toEqual([
            expect.objectContaining({
                activityId: "venmo:provider-1",
                linkedTransactionId: "txn-1",
            }),
        ]);
        expect(next.transactionImportActivities).toHaveLength(1);
    });

    it("preserves server revision tokens while calculating separate content digests", () => {
        const snapshot = createSnapshot();
        snapshot.knowledge.entityRevisions = {
            account: "g3:r8",
            transaction: "g3:r7",
        };
        const initial = createWorkspaceKnowledgeFromSnapshot({
            changeCursor: "g3:r8",
            generatedAt: "2026-01-02T00:00:00.000Z",
            retainedChangesAfter: "2025-12-03T00:00:00.000Z",
            snapshot,
            workspaceGeneration: 3,
            workspaceRevision: 8,
        });

        snapshot.accounts[0] = {
            ...snapshot.accounts[0],
            name: "Everyday Checking",
        };
        const changed = createWorkspaceKnowledgeFromSnapshot({
            changeCursor: "g3:r8",
            generatedAt: "2026-01-02T00:00:00.000Z",
            retainedChangesAfter: "2025-12-03T00:00:00.000Z",
            snapshot,
            workspaceGeneration: 3,
            workspaceRevision: 8,
        });

        expect(changed.entityRevisions).toEqual(initial.entityRevisions);
        expect(changed.entityDigests?.account).not.toBe(
            initial.entityDigests?.account,
        );
    });

    it("applies line deltas and attaches them to parent transactions", () => {
        const snapshot = createSnapshot();
        const next = applyWorkspaceChanges(snapshot, [
            change({
                entityType: "transactionLine",
                entityId: "subtxn-1",
                operation: "upsert",
                record: {
                    amountCents: -100,
                    categoryId: "food",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    sortOrder: 0,
                    lineId: "subtxn-1",
                    transactionId: "txn-1",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            }),
        ]);
        const knowledge = createWorkspaceKnowledgeFromSnapshot({
            changeCursor: "01HZ0000000000000000000002",
            generatedAt: "2026-01-02T00:00:00.000Z",
            retainedChangesAfter: "2025-12-03T00:00:00.000Z",
            snapshot: next,
        });

        expect(next.transactions[0].lines).toHaveLength(1);
        expect(knowledge.entityCounts.transactionLine).toBe(1);
    });

    it("applies Plaid link and sync deltas without Plaid access tokens", () => {
        const snapshot = createSnapshot();
        const next = applyWorkspaceChanges(snapshot, [
            change({
                entityType: "plaidAccountLink",
                entityId: "link-1",
                operation: "upsert",
                record: {
                    accountId: "acct-1",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    institutionName: "Test Bank",
                    plaidAccountId: "plaid-acct-1",
                    plaidAccountLinkId: "link-1",
                    plaidItemId: "item-1",
                    syncStartDate: "2026-01-01",
                    syncStatus: "linked",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            }),
            change({
                entityType: "plaidTransactionSync",
                entityId: "sync-1",
                operation: "upsert",
                record: {
                    accountId: "acct-1",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    lastSyncedAt: "2026-01-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                    name: "Coffee",
                    plaidAccountId: "plaid-acct-1",
                    plaidAccountLinkId: "link-1",
                    plaidAmountCents: 500,
                    plaidDate: "2026-01-01",
                    plaidItemId: "item-1",
                    plaidPayloadJson: "{}",
                    plaidTransactionId: "plaid-txn-1",
                    plaidTransactionSyncId: "sync-1",
                    syncStatus: "active",
                    transactionId: "txn-1",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            }),
        ]);
        const knowledge = createWorkspaceKnowledgeFromSnapshot({
            changeCursor: "01HZ0000000000000000000002",
            generatedAt: "2026-01-02T00:00:00.000Z",
            retainedChangesAfter: "2025-12-03T00:00:00.000Z",
            snapshot: next,
        });

        expect(next.plaidAccountLinks).toHaveLength(1);
        expect(next.plaidTransactionSyncs).toHaveLength(1);
        expect("accessToken" in next.plaidAccountLinks[0]).toBe(false);
        expect(knowledge.entityCounts.plaidAccountLink).toBe(1);
        expect(knowledge.entityCounts.plaidTransactionSync).toBe(1);
    });

    it("rebuilds canonical records from raw workspace snapshot data", () => {
        const snapshot = createSnapshot();
        const records = rebuildWorkspaceSnapshotRecords({
            ...snapshot,
            accounts: [
                {
                    ...snapshot.accounts[0],
                    balanceCents: 0,
                },
            ],
            ledgerPostings: [
                {
                    ...snapshot.ledgerPostings[0],
                    postingId: "posting-2",
                },
                snapshot.ledgerPostings[0],
            ],
            transactionLines: [
                {
                    amountCents: 100,
                    categoryId: "__no_category__",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    fromAccountId: "__no_from_account__",
                    lineId: "line-2",
                    sortOrder: 1,
                    toAccountId: "acct-1",
                    transactionId: "txn-1",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    amountCents: 100,
                    categoryId: "food",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    fromAccountId: "acct-1",
                    lineId: "line-1",
                    sortOrder: 0,
                    toAccountId: "__no_to_account__",
                    transactionId: "txn-1",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactions: [
                {
                    ...snapshot.transactions[0],
                    lines: [],
                    postings: [],
                    referenceCategoryId: "__uncategorized__",
                },
            ],
        });

        expect(records.accounts[0].balanceCents).toBe(1200);
        expect(records.budgetAllocations[0]).not.toHaveProperty(
            "activityCents",
        );
        expect(records.budgetAllocations[0]).not.toHaveProperty(
            "availableCents",
        );
        expect(records.budgetPeriods[0]).not.toHaveProperty(
            "availableToBudgetCents",
        );
        expect(records.ledgerPostings.map((posting) => posting.postingId)).toEqual([
            "posting-1",
            "posting-2",
        ]);
        expect(records.transactionLines).toHaveLength(2);
        expect(records.transactionLines[0]).toMatchObject({
            categoryId: "food",
            fromAccountId: "acct-1",
            lineId: "line-1",
        });
        expect(records.transactionLines[0]).not.toHaveProperty("toAccountId");
        expect(records.transactionLines[1]).toMatchObject({
            lineId: "line-2",
            toAccountId: "acct-1",
        });
        expect(records.transactionLines[1]).not.toHaveProperty("categoryId");
        expect(records.transactionLines[1]).not.toHaveProperty("fromAccountId");
        expect(records.transactions[0]).not.toHaveProperty("lines");
        expect(records.transactions[0]).not.toHaveProperty("postings");
        expect(records.transactions[0]).not.toHaveProperty(
            "referenceCategoryId",
        );
    });
});
