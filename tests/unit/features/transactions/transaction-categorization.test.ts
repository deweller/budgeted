import { describe, expect, it } from "vitest";

import { getTransactionCategorizationEligibility } from "@/features/transactions/models/transaction-categorization";

const eligibleTransaction = {
    kind: "standard" as const,
    lines: [{ fromAccountId: "checking" }],
    status: "entered" as const,
};

describe("getTransactionCategorizationEligibility", () => {
    it("allows standard single-line account transactions", () => {
        expect(
            getTransactionCategorizationEligibility([
                eligibleTransaction,
                {
                    ...eligibleTransaction,
                    lines: [{ toAccountId: "checking" }],
                },
            ]),
        ).toEqual({ canCategorize: true });
    });

    it.each([
        ["voided", { ...eligibleTransaction, status: "voided" as const }],
        ["adjustment", { ...eligibleTransaction, kind: "adjustment" as const }],
        [
            "transfer",
            {
                ...eligibleTransaction,
                lines: [{ fromAccountId: "checking", toAccountId: "savings" }],
            },
        ],
        [
            "split",
            {
                ...eligibleTransaction,
                lines: [{ fromAccountId: "checking" }, { fromAccountId: "checking" }],
            },
        ],
    ])("rejects %s transactions", (_description, transaction) => {
        expect(
            getTransactionCategorizationEligibility([transaction]),
        ).toMatchObject({ canCategorize: false });
    });

    it("rejects transactions that already have a category", () => {
        expect(
            getTransactionCategorizationEligibility([
                {
                    ...eligibleTransaction,
                    lines: [{ categoryId: "groceries", fromAccountId: "checking" }],
                },
            ]),
        ).toEqual({
            canCategorize: false,
            reason:
                "Select only uncategorized account transactions to categorize together.",
        });
    });
});
