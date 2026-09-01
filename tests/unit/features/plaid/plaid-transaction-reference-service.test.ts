import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getStoredTransaction: vi.fn(),
    listPlaidTransactionSyncsForTransaction: vi.fn(),
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    getStoredTransaction: mocks.getStoredTransaction,
}));

vi.mock(
    "@/features/plaid/server/plaid-transaction-sync-record-service",
    () => ({
        listPlaidTransactionSyncsForTransaction:
            mocks.listPlaidTransactionSyncsForTransaction,
    }),
);

import { getPlaidTransactionReference } from "@/features/plaid/server/plaid-transaction-reference-service";

describe("Plaid transaction reference service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns the compact sync record referenced by the transaction", async () => {
        mocks.getStoredTransaction.mockResolvedValue({
            displayAmountCents: -1_234,
            plaidTransactionSyncId: "sync-2",
            transactionId: "transaction-1",
        });
        mocks.listPlaidTransactionSyncsForTransaction.mockResolvedValue([
            {
                lastSyncedAt: "2026-07-17T12:00:00.000Z",
                name: "Wrong record",
                pending: false,
                plaidAmountCents: 100,
                plaidDate: "2026-07-15",
                plaidPayloadJson: '{"private":"payload"}',
                plaidTransactionSyncId: "sync-1",
                status: "active",
            },
            {
                categoryText: "Food and Drink",
                lastSyncedAt: "2026-07-17T12:00:00.000Z",
                merchantName: "Coffee Shop",
                name: "Coffee",
                pending: false,
                plaidAmountCents: 1_234,
                plaidDate: "2026-07-16",
                plaidPayloadJson: '{"private":"payload"}',
                plaidTransactionSyncId: "sync-2",
                status: "active",
            },
        ]);

        await expect(
            getPlaidTransactionReference("ledger-1", "transaction-1"),
        ).resolves.toEqual({
            amountDiffersFromTransaction: false,
            categoryText: "Food and Drink",
            lastSyncedAt: "2026-07-17T12:00:00.000Z",
            merchantName: "Coffee Shop",
            name: "Coffee",
            pending: false,
            plaidAmountCents: 1_234,
            plaidDisplayAmountCents: -1_234,
            plaidDate: "2026-07-16",
            plaidTransactionSyncId: "sync-2",
            status: "active",
        });
        expect(mocks.listPlaidTransactionSyncsForTransaction).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
            "sync-2",
        );
    });

    it("does not query Plaid records for a manual transaction", async () => {
        mocks.getStoredTransaction.mockResolvedValue({
            transactionId: "transaction-1",
        });

        await expect(
            getPlaidTransactionReference("ledger-1", "transaction-1"),
        ).resolves.toBeNull();
        expect(
            mocks.listPlaidTransactionSyncsForTransaction,
        ).not.toHaveBeenCalled();
    });
});
