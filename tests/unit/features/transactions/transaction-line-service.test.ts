// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    begins: vi.fn(),
    byLine: vi.fn(),
    deleteGo: vi.fn(),
    deleteTransactionLine: vi.fn(),
    putGo: vi.fn(),
    putTransactionLine: vi.fn(),
    queryGo: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            transactionLines: {
                delete: mocks.deleteTransactionLine,
                put: mocks.putTransactionLine,
                query: {
                    byLine: mocks.byLine,
                },
            },
        },
    }),
}));

import {
    replaceTransactionLines,
    toStoredTransactionLineRecord,
} from "@/features/transactions/server/transaction-line-service";

describe("line service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.begins.mockReturnValue({ go: mocks.queryGo });
        mocks.byLine.mockReturnValue({ begins: mocks.begins });
        mocks.deleteTransactionLine.mockReturnValue({ go: mocks.deleteGo });
        mocks.putTransactionLine.mockReturnValue({ go: mocks.putGo });
        mocks.queryGo.mockResolvedValue({ data: [] });
        mocks.deleteGo.mockResolvedValue(undefined);
        mocks.putGo.mockResolvedValue(undefined);
    });

    it("stores placeholder values for optional split-line index fields", async () => {
        const records = await replaceTransactionLines({
            transactionId: "transaction-1",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 6_000,
                    categoryId: "groceries",
                    sortOrder: 0,
                },
                {
                    amountCents: 4_000,
                    sortOrder: 1,
                    toAccountId: "savings-1",
                },
            ],
        });

        expect(mocks.putTransactionLine).toHaveBeenCalledWith(
            expect.objectContaining({
                categoryId: "groceries",
                fromAccountId: "__no_from_account__",
                toAccountId: "__no_to_account__",
            }),
        );
        expect(mocks.putTransactionLine).toHaveBeenCalledWith(
            expect.objectContaining({
                categoryId: "__no_category__",
                fromAccountId: "__no_from_account__",
                toAccountId: "savings-1",
            }),
        );
        expect(records).toEqual([
            expect.objectContaining({
                categoryId: "groceries",
                toAccountId: undefined,
            }),
            expect.objectContaining({
                categoryId: undefined,
                toAccountId: "savings-1",
            }),
        ]);
    });

    it("converts public line records back to storage records for rollback writes", () => {
        expect(
            toStoredTransactionLineRecord({
                amountCents: 6_000,
                categoryId: "groceries",
                createdAt: "2026-05-01T00:00:00.000Z",
                sortOrder: 0,
                lineId: "line-1",
                transactionId: "transaction-1",
                updatedAt: "2026-05-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            }),
        ).toMatchObject({
            categoryId: "groceries",
            fromAccountId: "__no_from_account__",
            toAccountId: "__no_to_account__",
        });
    });

    it("rejects non-positive line amounts before writing records", async () => {
        await expect(
            replaceTransactionLines({
                transactionId: "transaction-1",
                ledgerId: "ledger-1",
                lines: [
                    {
                        amountCents: -1,
                        fromAccountId: "checking",
                    },
                ],
            }),
        ).rejects.toMatchObject({
            code: "line_validation_error",
            status: 422,
        });

        expect(mocks.putTransactionLine).not.toHaveBeenCalled();
    });
});
