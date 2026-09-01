// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getBudgetedSchema: vi.fn(),
    ledgerPostingGo: vi.fn(),
    ledgerPostingPut: vi.fn(),
    listLedgerPostingsForTransaction: vi.fn(),
    listTransactionLinesForTransaction: vi.fn(),
    removeLedgerPostings: vi.fn(),
    removeTransactionLines: vi.fn(),
    toStoredTransactionLineRecord: vi.fn(),
    transactionLineGo: vi.fn(),
    transactionLinePut: vi.fn(),
}));

vi.mock("@/features/transactions/server/posting-service", () => ({
    listLedgerPostingsForTransaction: mocks.listLedgerPostingsForTransaction,
    removeLedgerPostings: mocks.removeLedgerPostings,
}));

vi.mock("@/features/transactions/server/transaction-line-service", () => ({
    listTransactionLinesForTransaction:
        mocks.listTransactionLinesForTransaction,
    removeTransactionLines: mocks.removeTransactionLines,
    toStoredTransactionLineRecord: mocks.toStoredTransactionLineRecord,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: mocks.getBudgetedSchema,
}));

import {
    listTransactionChildren,
    listTransactionChildrenByTransactionId,
    removeTransactionChildren,
    restoreTransactionChildren,
} from "@/features/transactions/server/transaction-child-service";

describe("transaction child service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listLedgerPostingsForTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) => [
                { postingId: `posting-${transactionId}`, transactionId },
            ],
        );
        mocks.listTransactionLinesForTransaction.mockImplementation(
            async (_ledgerId: string, transactionId: string) => [
                { lineId: `line-${transactionId}`, transactionId },
            ],
        );
        mocks.removeLedgerPostings.mockImplementation(
            async (_ledgerId: string, transactionId: string) => [
                { postingId: `removed-posting-${transactionId}`, transactionId },
            ],
        );
        mocks.removeTransactionLines.mockImplementation(
            async (_ledgerId: string, transactionId: string) => [
                { lineId: `removed-line-${transactionId}`, transactionId },
            ],
        );
        mocks.toStoredTransactionLineRecord.mockImplementation((line) => ({
            ...line,
            stored: true,
        }));
        mocks.ledgerPostingPut.mockReturnValue({ go: mocks.ledgerPostingGo });
        mocks.transactionLinePut.mockReturnValue({ go: mocks.transactionLineGo });
        mocks.ledgerPostingGo.mockResolvedValue(undefined);
        mocks.transactionLineGo.mockResolvedValue(undefined);
        mocks.getBudgetedSchema.mockReturnValue({
            entities: {
                ledgerPostings: { put: mocks.ledgerPostingPut },
                transactionLines: { put: mocks.transactionLinePut },
            },
        });
    });

    it("loads postings and lines for one transaction", async () => {
        await expect(
            listTransactionChildren("ledger-1", "transaction-1"),
        ).resolves.toEqual({
            postings: [
                {
                    postingId: "posting-transaction-1",
                    transactionId: "transaction-1",
                },
            ],
            lines: [
                {
                    lineId: "line-transaction-1",
                    transactionId: "transaction-1",
                },
            ],
        });
    });

    it("loads postings and lines maps for normalized transaction ids", async () => {
        const result = await listTransactionChildrenByTransactionId(
            "ledger-1",
            [" transaction-1 ", "", "transaction-1", "transaction-2"],
        );

        expect(
            mocks.listLedgerPostingsForTransaction.mock.calls.map((call) => call[1]),
        ).toEqual(["transaction-1", "transaction-2"]);
        expect(
            mocks.listTransactionLinesForTransaction.mock.calls.map(
                (call) => call[1],
            ),
        ).toEqual(["transaction-1", "transaction-2"]);
        expect(result.postingsByTransactionId.get("transaction-1")).toEqual([
            {
                postingId: "posting-transaction-1",
                transactionId: "transaction-1",
            },
        ]);
        expect(result.linesByTransactionId.get("transaction-2")).toEqual([
            {
                lineId: "line-transaction-2",
                transactionId: "transaction-2",
            },
        ]);
    });

    it("removes postings and lines for one transaction", async () => {
        await expect(
            removeTransactionChildren("ledger-1", "transaction-1"),
        ).resolves.toEqual({
            postings: [
                {
                    postingId: "removed-posting-transaction-1",
                    transactionId: "transaction-1",
                },
            ],
            lines: [
                {
                    lineId: "removed-line-transaction-1",
                    transactionId: "transaction-1",
                },
            ],
        });

        expect(mocks.removeLedgerPostings).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
        expect(mocks.removeTransactionLines).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
    });

    it("restores postings and lines for one transaction", async () => {
        const timestamp = "2026-06-25T00:00:00.000Z";
        const posting = {
            amountCents: 1000,
            createdAt: timestamp,
            direction: "debit" as const,
            ledgerAccountId: "ledger-account-1",
            ledgerAccountKind: "financial" as const,
            ledgerId: "ledger-1",
            occurredAt: "2026-06-25",
            periodId: "2026-06",
            postingId: "posting-1",
            transactionId: "transaction-1",
        };
        const line = {
            amountCents: 1000,
            createdAt: timestamp,
            fromAccountId: "account-1",
            ledgerId: "ledger-1",
            lineId: "line-1",
            sortOrder: 0,
            transactionId: "transaction-1",
            updatedAt: timestamp,
        };

        await restoreTransactionChildren({
            lines: [line],
            postings: [posting],
        });

        expect(mocks.ledgerPostingPut).toHaveBeenCalledWith(posting);
        expect(mocks.toStoredTransactionLineRecord).toHaveBeenCalledWith(line);
        expect(mocks.transactionLinePut).toHaveBeenCalledWith({
            ...line,
            stored: true,
        });
        expect(mocks.ledgerPostingGo).toHaveBeenCalledTimes(1);
        expect(mocks.transactionLineGo).toHaveBeenCalledTimes(1);
    });
});
