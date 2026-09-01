import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getTransactions: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            transactions: {
                get: mocks.getTransactions,
            },
        },
    }),
}));

import {
    listStoredTransactionsByPrimaryKeys,
    type TransactionPrimaryKey,
} from "@/features/transactions/server/transaction-query-service";

function transactionKey(index: number): TransactionPrimaryKey {
    return {
        ledgerId: "ledger-1",
        occurredAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        transactionId: `transaction-${String(index).padStart(3, "0")}`,
    };
}

describe("transaction query batch reads", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("deduplicates keys, reads groups of one hundred, and preserves key order", async () => {
        mocks.getTransactions.mockImplementation(
            (keys: TransactionPrimaryKey[]) => ({
                go: vi.fn().mockResolvedValue({
                    data: [...keys].reverse(),
                    unprocessed: [],
                }),
            }),
        );
        const keys = Array.from({ length: 205 }, (_, index) =>
            transactionKey(index),
        );

        const result = await listStoredTransactionsByPrimaryKeys([
            ...keys,
            keys[0]!,
            keys[104]!,
        ]);

        expect(mocks.getTransactions).toHaveBeenCalledTimes(3);
        expect(
            mocks.getTransactions.mock.calls.map(([batch]) => batch.length),
        ).toEqual([100, 100, 5]);
        expect(
            result.transactions.map((record) => record.transactionId),
        ).toEqual(keys.map((key) => key.transactionId));
        expect(result.unprocessedKeys).toEqual([]);
    });

    it("retries only unprocessed keys", async () => {
        const first = transactionKey(1);
        const second = transactionKey(2);
        let attempt = 0;
        mocks.getTransactions.mockImplementation(
            () => ({
                go: vi.fn().mockImplementation(async () => {
                    attempt += 1;

                    return attempt === 1
                        ? { data: [first], unprocessed: [second] }
                        : { data: [second], unprocessed: [] };
                }),
            }),
        );

        const result = await listStoredTransactionsByPrimaryKeys([
            first,
            second,
        ]);

        expect(mocks.getTransactions).toHaveBeenCalledTimes(2);
        expect(mocks.getTransactions).toHaveBeenNthCalledWith(2, [second]);
        expect(result.transactions).toEqual([first, second]);
        expect(result.unprocessedKeys).toEqual([]);
    });

    it("returns keys that remain unprocessed after three retries", async () => {
        const key = transactionKey(1);
        mocks.getTransactions.mockImplementation(
            (keys: TransactionPrimaryKey[]) => ({
                go: vi.fn().mockResolvedValue({
                    data: [],
                    unprocessed: keys,
                }),
            }),
        );

        const result = await listStoredTransactionsByPrimaryKeys([key]);

        expect(mocks.getTransactions).toHaveBeenCalledTimes(4);
        expect(result).toEqual({
            transactions: [],
            unprocessedKeys: [key],
        });
    });
});
