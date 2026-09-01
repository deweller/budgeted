// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaidTransactionSyncRecord } from "@/features/plaid/server/plaid-service";

const mocks = vi.hoisted(() => ({
    byTransaction: vi.fn(),
    byTransactionGo: vi.fn(),
    deleteGo: vi.fn(),
    deleteSync: vi.fn(),
    getGo: vi.fn(),
    getSync: vi.fn(),
    putGo: vi.fn(),
    putSync: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            plaidTransactionSyncs: {
                delete: mocks.deleteSync,
                get: mocks.getSync,
                put: mocks.putSync,
                query: {
                    byTransaction: mocks.byTransaction,
                },
            },
        },
    }),
}));

import {
    deletePlaidTransactionSyncRecords,
    deletePlaidTransactionSyncsForTransaction,
    listPlaidTransactionSyncsForTransaction,
    movePlaidTransactionSyncRecordsToTransaction,
    putPlaidTransactionSyncRecords,
} from "@/features/plaid/server/plaid-transaction-sync-record-service";

function createSyncRecord(
    overrides: Partial<PlaidTransactionSyncRecord> = {},
): PlaidTransactionSyncRecord {
    return {
        accountId: "account-1",
        firstSyncedAt: "2026-06-25T00:00:00.000Z",
        lastSyncedAt: "2026-06-25T00:00:00.000Z",
        ledgerId: "ledger-1",
        name: "Plaid transaction",
        pending: false,
        plaidAccountId: "plaid-account-1",
        plaidAccountLinkId: "link-1",
        plaidAmountCents: 1000,
        plaidDate: "2026-06-25",
        plaidItemId: "item-1",
        plaidPayloadJson: "{}",
        plaidTransactionId: "plaid-transaction-1",
        plaidTransactionSyncId: "sync-1",
        status: "active",
        transactionId: "transaction-1",
        updatedAt: "2026-06-25T00:00:00.000Z",
        ...overrides,
    };
}

describe("Plaid transaction sync record service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.byTransaction.mockReturnValue({ go: mocks.byTransactionGo });
        mocks.byTransactionGo.mockResolvedValue({
            data: [createSyncRecord()],
        });
        mocks.putSync.mockReturnValue({ go: mocks.putGo });
        mocks.deleteSync.mockReturnValue({ go: mocks.deleteGo });
        mocks.getSync.mockReturnValue({ go: mocks.getGo });
        mocks.getGo.mockResolvedValue({ data: null });
        mocks.putGo.mockResolvedValue(undefined);
        mocks.deleteGo.mockResolvedValue(undefined);
    });

    it("lists sync records for a Budgeted transaction", async () => {
        await expect(
            listPlaidTransactionSyncsForTransaction(
                "ledger-1",
                "transaction-1",
            ),
        ).resolves.toEqual([createSyncRecord()]);

        expect(mocks.byTransaction).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            transactionId: "transaction-1",
        });
        expect(mocks.byTransactionGo).toHaveBeenCalledWith({
            pages: "all",
        });
    });

    it("includes the consistently read referenced record when the index misses it", async () => {
        const referencedRecord = createSyncRecord({
            plaidTransactionSyncId: "sync-referenced",
            transactionId: "previous-transaction",
        });
        mocks.byTransactionGo.mockResolvedValue({ data: [] });
        mocks.getGo.mockResolvedValue({ data: referencedRecord });

        await expect(
            listPlaidTransactionSyncsForTransaction(
                "ledger-1",
                "transaction-1",
                "sync-referenced",
            ),
        ).resolves.toEqual([referencedRecord]);

        expect(mocks.getSync).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "sync-referenced",
        });
        expect(mocks.getGo).toHaveBeenCalledWith({ consistent: true });
    });

    it("uses the consistent referenced record over a stale indexed copy", async () => {
        const indexedRecord = createSyncRecord({
            name: "Stale name",
            plaidTransactionSyncId: "sync-1",
        });
        const referencedRecord = createSyncRecord({
            name: "Current name",
            plaidTransactionSyncId: "sync-1",
        });
        mocks.byTransactionGo.mockResolvedValue({ data: [indexedRecord] });
        mocks.getGo.mockResolvedValue({ data: referencedRecord });

        await expect(
            listPlaidTransactionSyncsForTransaction(
                "ledger-1",
                "transaction-1",
                "sync-1",
            ),
        ).resolves.toEqual([referencedRecord]);
    });

    it("puts and deletes sync record collections", async () => {
        const records = [
            createSyncRecord({ plaidTransactionSyncId: "sync-1" }),
            createSyncRecord({ plaidTransactionSyncId: "sync-2" }),
        ];

        await putPlaidTransactionSyncRecords(records);
        await deletePlaidTransactionSyncRecords(records);

        expect(mocks.putSync).toHaveBeenCalledWith(records[0]);
        expect(mocks.putSync).toHaveBeenCalledWith(records[1]);
        expect(mocks.deleteSync).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "sync-1",
        });
        expect(mocks.deleteSync).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "sync-2",
        });
    });

    it("deletes sync records for a Budgeted transaction", async () => {
        await deletePlaidTransactionSyncsForTransaction(
            "ledger-1",
            "transaction-1",
        );

        expect(mocks.byTransaction).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            transactionId: "transaction-1",
        });
        expect(mocks.deleteSync).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            plaidTransactionSyncId: "sync-1",
        });
    });

    it("moves sync records to the surviving Budgeted transaction", async () => {
        const survivor = createSyncRecord({
            plaidTransactionSyncId: "sync-survivor",
            transactionId: "survivor-transaction",
            updatedAt: "2026-06-24T00:00:00.000Z",
        });
        const duplicate = createSyncRecord({
            plaidTransactionSyncId: "sync-duplicate",
            transactionId: "duplicate-transaction",
            updatedAt: "2026-06-24T00:00:00.000Z",
        });

        await movePlaidTransactionSyncRecordsToTransaction({
            now: "2026-06-25T00:00:00.000Z",
            records: [survivor, duplicate],
            transactionId: "survivor-transaction",
        });

        expect(mocks.putSync).toHaveBeenCalledWith(survivor);
        expect(mocks.putSync).toHaveBeenCalledWith({
            ...duplicate,
            transactionId: "survivor-transaction",
            updatedAt: "2026-06-25T00:00:00.000Z",
        });
    });
});
