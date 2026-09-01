import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listStoredTransactionsByIds: vi.fn(),
    listTransactionLinesForTransaction: vi.fn(),
}));

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    listStoredTransactionsByIds: mocks.listStoredTransactionsByIds,
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    listTransactionLinesForTransaction:
        mocks.listTransactionLinesForTransaction,
}));

import { listTransactionReferences } from "@/features/transactions/server/transaction-reference-read-service";

describe("transaction reference read service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns requested transactions in request order with referenced accounts", async () => {
        mocks.listStoredTransactionsByIds.mockResolvedValue([
            {
                displayAmountCents: -2_500,
                occurredAt: "2026-07-16T00:00:00.000Z",
                payee: "Store",
                referenceAccountId: "checking",
                transactionId: "transaction-2",
            },
            {
                displayAmountCents: 2_500,
                occurredAt: "2026-07-15T00:00:00.000Z",
                referenceAccountId: "savings",
                transactionId: "transaction-1",
            },
        ]);
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) =>
                transactionId === "transaction-1"
                    ? [
                          {
                              fromAccountId: "checking",
                              toAccountId: "savings",
                          },
                      ]
                    : [],
        );

        await expect(
            listTransactionReferences("ledger-1", [
                "transaction-1",
                "transaction-2",
                "transaction-1",
            ]),
        ).resolves.toEqual([
            {
                accountIds: ["savings", "checking"],
                displayAmountCents: 2_500,
                occurredAt: "2026-07-15T00:00:00.000Z",
                payee: undefined,
                transactionId: "transaction-1",
            },
            {
                accountIds: ["checking"],
                displayAmountCents: -2_500,
                occurredAt: "2026-07-16T00:00:00.000Z",
                payee: "Store",
                transactionId: "transaction-2",
            },
        ]);
        expect(mocks.listStoredTransactionsByIds).toHaveBeenCalledWith(
            "ledger-1",
            ["transaction-1", "transaction-2"],
        );
    });

    it("keeps larger reference reads on direct-lookup-sized chunks", async () => {
        mocks.listStoredTransactionsByIds.mockResolvedValue([]);
        mocks.listTransactionLinesForTransaction.mockResolvedValue([]);
        const transactionIds = Array.from(
            { length: 11 },
            (_, index) => `transaction-${index + 1}`,
        );

        await listTransactionReferences("ledger-1", transactionIds);

        expect(mocks.listStoredTransactionsByIds).toHaveBeenCalledTimes(2);
        expect(mocks.listStoredTransactionsByIds).toHaveBeenNthCalledWith(
            1,
            "ledger-1",
            transactionIds.slice(0, 10),
        );
        expect(mocks.listStoredTransactionsByIds).toHaveBeenNthCalledWith(
            2,
            "ledger-1",
            transactionIds.slice(10),
        );
    });
});
