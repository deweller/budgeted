// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    sourceDelete: vi.fn(),
    sourceDeleteGo: vi.fn(),
    sourcePut: vi.fn(),
    sourcePutGo: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            transactionClassificationSources: {
                delete: mocks.sourceDelete,
                put: mocks.sourcePut,
            },
        },
    }),
}));

import {
    buildTransactionClassificationSourceRecord,
    reconcileTransactionClassificationSourceRecords,
    type TransactionClassificationSourceRecord,
} from "@/features/transaction-classification/server/transaction-classification-source-service";
import type { PersistedTransactionLine } from "@/features/transactions/server/transaction-line-service";
import type {
    WorkspacePlaidTransactionSyncRecord,
    WorkspaceTransactionRecord,
} from "@/lib/workspace/sync-types";

const transaction: WorkspaceTransactionRecord = {
    displayAmountCents: -4_200,
    enteredAt: "2026-07-01T00:00:00.000Z",
    kind: "standard",
    ledgerId: "ledger-1",
    memo: "  Seeds & Sprouts  ",
    occurredAt: "2026-07-01T00:00:00.000Z",
    payee: "FRESH MARKET #123",
    periodId: "2026-07",
    referenceAccountId: "checking",
    status: "entered",
    transactionId: "transaction-1",
    updatedAt: "2026-07-02T00:00:00.000Z",
};

const categorizedLine: PersistedTransactionLine = {
    amountCents: 4_200,
    categoryId: "groceries",
    createdAt: "2026-07-01T00:00:00.000Z",
    fromAccountId: "checking",
    ledgerId: "ledger-1",
    lineId: "line-1",
    sortOrder: 0,
    transactionId: "transaction-1",
    updatedAt: "2026-07-01T00:00:00.000Z",
};

function makeSourceRecord(
    overrides: Partial<TransactionClassificationSourceRecord> = {},
): TransactionClassificationSourceRecord {
    return {
        accountId: "checking",
        amountCents: -4_200,
        categoryAssignmentsJson: JSON.stringify([
            { amountCents: 4_200, categoryId: "groceries" },
        ]),
        createdAt: "2026-07-01T00:00:00.000Z",
        hasMemo: true,
        indexVersion: "2",
        ledgerId: "ledger-1",
        memo: "Seeds and sprouts",
        normalizedPayee: "fresh market",
        occurredAt: "2026-07-01T00:00:00.000Z",
        payee: "Fresh Market",
        sourceUpdatedAt: "2026-07-02T00:00:00.000Z",
        transactionId: "transaction-1",
        updatedAt: "2026-07-02T00:00:00.000Z",
        ...overrides,
    };
}

describe("transaction classification source service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sourceDelete.mockReturnValue({ go: mocks.sourceDeleteGo });
        mocks.sourceDeleteGo.mockResolvedValue({});
        mocks.sourcePut.mockReturnValue({ go: mocks.sourcePutGo });
        mocks.sourcePutGo.mockResolvedValue({});
    });

    it("builds compact normalized classified transaction metadata", () => {
        const record = buildTransactionClassificationSourceRecord({
            ledgerId: "ledger-1",
            lines: [categorizedLine],
            now: "2026-07-03T00:00:00.000Z",
            plaidSync: {
                categoryText: "Shops, Groceries",
                merchantName: "Fresh Market",
                name: "POS FRESH MARKET 123",
                originalDescription: "FRESH MARKET STORE 123",
                personalFinanceCategoryDetailed: "FOOD_AND_DRINK_GROCERIES",
                personalFinanceCategoryPrimary: "FOOD_AND_DRINK",
                updatedAt: "2026-07-03T00:00:00.000Z",
            } as WorkspacePlaidTransactionSyncRecord,
            transaction,
        });

        expect(record).toMatchObject({
            categoryAssignmentsJson: JSON.stringify([
                { amountCents: 4_200, categoryId: "groceries" },
            ]),
            hasMemo: true,
            normalizedPayee: "fresh market 123",
            normalizedPlaidCategoryText: "shops groceries",
            normalizedPlaidMerchantName: "fresh market",
            normalizedPlaidName: "pos fresh market 123",
            normalizedPlaidOriginalDescription: "fresh market store 123",
            normalizedPlaidPfcDetailed: "food and drink groceries",
            normalizedPlaidPfcPrimary: "food and drink",
            sourceUpdatedAt: "2026-07-03T00:00:00.000Z",
            plaidOriginalDescription: "FRESH MARKET STORE 123",
        });
    });

    it("does not index partially categorized transactions", () => {
        expect(
            buildTransactionClassificationSourceRecord({
                ledgerId: "ledger-1",
                lines: [
                    categorizedLine,
                    {
                        ...categorizedLine,
                        categoryId: undefined,
                        lineId: "line-2",
                    },
                ],
                transaction,
            }),
        ).toBeNull();
    });

    it("refreshes stale records and deletes orphan records", async () => {
        const stale = makeSourceRecord({
            sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
        });
        const orphan = makeSourceRecord({
            transactionId: "deleted-transaction",
        });
        const desired = makeSourceRecord();

        await expect(
            reconcileTransactionClassificationSourceRecords({
                existingRecords: [stale, orphan],
                ledgerId: "ledger-1",
                snapshot: { records: [desired] },
            }),
        ).resolves.toEqual({
            createdCount: 0,
            deletedOrphanCount: 1,
            refreshedCount: 1,
            sourceCount: 1,
        });
        expect(mocks.sourceDelete).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            transactionId: "deleted-transaction",
        });
        expect(mocks.sourcePut).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceUpdatedAt: "2026-07-02T00:00:00.000Z",
                transactionId: "transaction-1",
            }),
        );
    });

    it("refreshes legacy source records to backfill the current index fields", async () => {
        const desired = makeSourceRecord();
        const legacy = makeSourceRecord({ indexVersion: "1" });

        await expect(
            reconcileTransactionClassificationSourceRecords({
                existingRecords: [legacy],
                ledgerId: "ledger-1",
                snapshot: { records: [desired] },
            }),
        ).resolves.toMatchObject({ refreshedCount: 1 });
        expect(mocks.sourcePut).toHaveBeenCalledWith(
            expect.objectContaining({
                indexVersion: "2",
                transactionId: "transaction-1",
            }),
        );
    });
});
