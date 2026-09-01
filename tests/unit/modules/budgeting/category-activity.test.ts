import { describe, expect, it } from "vitest";

import { buildCategoryTransactionCountByCategoryId } from "@/modules/budgeting";

describe("category activity", () => {
    it("counts each contributing transaction once per category across the ledger", () => {
        const counts = buildCategoryTransactionCountByCategoryId({
            accounts: [
                { accountId: "checking", accountType: "checking" },
                { accountId: "tracking", accountType: "tracking" },
            ],
            categories: [
                { categoryId: "dining" },
                { categoryId: "travel" },
            ],
            lines: [
                {
                    amountCents: 600,
                    categoryId: "dining",
                    toAccountId: "checking",
                    transactionId: "split",
                },
                {
                    amountCents: 400,
                    categoryId: "dining",
                    toAccountId: "checking",
                    transactionId: "split",
                },
                {
                    amountCents: 300,
                    categoryId: "travel",
                    toAccountId: "checking",
                    transactionId: "split",
                },
                {
                    amountCents: 500,
                    categoryId: "dining",
                    fromAccountId: "checking",
                    transactionId: "second",
                },
                {
                    amountCents: 100,
                    categoryId: "travel",
                    toAccountId: "checking",
                    transactionId: "voided",
                },
                {
                    amountCents: 100,
                    categoryId: "travel",
                    toAccountId: "checking",
                    transactionId: "adjustment",
                },
                {
                    amountCents: 100,
                    categoryId: "travel",
                    toAccountId: "checking",
                    transactionId: "prior-period",
                },
                {
                    amountCents: 100,
                    categoryId: "travel",
                    toAccountId: "tracking",
                    transactionId: "tracking-account",
                },
                {
                    amountCents: 100,
                    categoryId: "travel",
                    fromAccountId: "checking",
                    toAccountId: "checking",
                    transactionId: "transfer",
                },
            ],
            transactions: [
                {
                    kind: "standard",
                    periodId: "2026-05",
                    status: "entered",
                    transactionId: "split",
                },
                {
                    kind: "standard",
                    periodId: "2026-05",
                    status: "cleared",
                    transactionId: "second",
                },
                {
                    kind: "standard",
                    periodId: "2026-05",
                    status: "voided",
                    transactionId: "voided",
                },
                {
                    kind: "adjustment",
                    periodId: "2026-05",
                    status: "entered",
                    transactionId: "adjustment",
                },
                {
                    kind: "standard",
                    periodId: "2026-04",
                    status: "entered",
                    transactionId: "prior-period",
                },
                {
                    kind: "standard",
                    periodId: "2026-05",
                    status: "entered",
                    transactionId: "tracking-account",
                },
                {
                    kind: "standard",
                    periodId: "2026-05",
                    status: "entered",
                    transactionId: "transfer",
                },
            ],
        });

        expect(counts.get("dining")).toBe(2);
        expect(counts.get("travel")).toBe(2);
    });
});
