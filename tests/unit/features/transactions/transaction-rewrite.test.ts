import { describe, expect, it } from "vitest";

import { createTransactionRewriteInput } from "@/features/transactions/models/transaction-rewrite";

const transaction = {
    kind: "standard" as const,
    memo: "Original memo",
    occurredAt: "2026-06-25T00:00:00.000Z",
    payee: "Original payee",
    plaidTransactionSyncId: "sync-1",
    referenceAccountId: "account-1",
    source: "plaid" as const,
    transactionId: "transaction-1",
};

describe("transaction rewrite input", () => {
    it("preserves transaction fields while replacing lines", () => {
        expect(
            createTransactionRewriteInput({
                lines: [
                    {
                        amountCents: 1000,
                        categoryId: "category-1",
                        fromAccountId: "account-1",
                    },
                ],
                transaction,
            }),
        ).toEqual({
            accountId: "account-1",
            kind: "standard",
            lines: [
                {
                    amountCents: 1000,
                    categoryId: "category-1",
                    fromAccountId: "account-1",
                },
            ],
            memo: "Original memo",
            occurredAt: "2026-06-25T00:00:00.000Z",
            payee: "Original payee",
            plaidTransactionSyncId: "sync-1",
            source: "plaid",
            transactionId: "transaction-1",
        });
    });

    it("allows account, source, and Plaid sync overrides", () => {
        expect(
            createTransactionRewriteInput({
                accountId: "account-2",
                lines: [
                    {
                        amountCents: 1000,
                        toAccountId: "account-2",
                    },
                ],
                plaidTransactionSyncId: null,
                source: "manual",
                transaction,
            }),
        ).toMatchObject({
            accountId: "account-2",
            plaidTransactionSyncId: null,
            source: "manual",
            transactionId: "transaction-1",
        });
    });
});
