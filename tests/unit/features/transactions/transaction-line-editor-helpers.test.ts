import { describe, expect, it } from "vitest";

import {
    getEstimatedTransactionNetCents,
    getLineAssignmentValue,
    normalizeTransactionLineDrafts,
} from "@/components/transactions/transaction-line-editor-helpers";

describe("transaction line editor helpers", () => {
    it("uses the transfer line direction for its category assignment", () => {
        expect(
            getLineAssignmentValue({
                line: {
                    amount: "53.00",
                    categoryId: "",
                    fromAccountId: "venmo",
                    id: "transfer-line",
                    memo: "",
                    payee: "",
                    toAccountId: "checking",
                },
                selectedAccountId: "venmo",
                transactionKind: "standard",
            }),
        ).toBe("to:checking");
        expect(
            getLineAssignmentValue({
                line: {
                    amount: "53.00",
                    categoryId: "",
                    fromAccountId: "venmo",
                    id: "transfer-line",
                    memo: "",
                    payee: "",
                    toAccountId: "checking",
                },
                selectedAccountId: "checking",
                transactionKind: "standard",
            }),
        ).toBe("from:venmo");
    });

    it("uses a negative signed amount to make an existing positive category line an outflow", () => {
        const lines = [
            {
                amount: "-2",
                categoryId: "groceries",
                fromAccountId: "",
                id: "line-1",
                memo: "",
                payee: "",
                toAccountId: "checking",
            },
        ];

        expect(
            getEstimatedTransactionNetCents({
                lines,
                selectedAccountId: "checking",
                transactionKind: "standard",
            }),
        ).toBe(-200);
        expect(
            normalizeTransactionLineDrafts({
                lines,
                selectedAccountId: "checking",
                transactionKind: "standard",
            }),
        ).toEqual([
            {
                amountCents: 200,
                categoryId: "groceries",
                fromAccountId: "checking",
                lineId: "line-1",
                memo: "",
                payee: "",
                sortOrder: 0,
                toAccountId: undefined,
            },
        ]);
    });

    it("uses a positive signed amount to make an existing negative category line an inflow", () => {
        const lines = [
            {
                amount: "2",
                categoryId: "groceries",
                fromAccountId: "checking",
                id: "line-1",
                memo: "",
                payee: "",
                toAccountId: "",
            },
        ];

        expect(
            getEstimatedTransactionNetCents({
                lines,
                selectedAccountId: "checking",
                transactionKind: "standard",
            }),
        ).toBe(200);
        expect(
            normalizeTransactionLineDrafts({
                lines,
                selectedAccountId: "checking",
                transactionKind: "standard",
            }),
        ).toEqual([
            {
                amountCents: 200,
                categoryId: "groceries",
                fromAccountId: undefined,
                lineId: "line-1",
                memo: "",
                payee: "",
                sortOrder: 0,
                toAccountId: "checking",
            },
        ]);
    });

    it("accepts an explicit plus sign as a positive category amount", () => {
        const lines = [
            {
                amount: "+2",
                categoryId: "groceries",
                fromAccountId: "checking",
                id: "line-1",
                memo: "",
                payee: "",
                toAccountId: "",
            },
        ];

        expect(
            getEstimatedTransactionNetCents({
                lines,
                selectedAccountId: "checking",
                transactionKind: "standard",
            }),
        ).toBe(200);
        expect(
            normalizeTransactionLineDrafts({
                lines,
                selectedAccountId: "checking",
                transactionKind: "standard",
            })[0],
        ).toMatchObject({
            amountCents: 200,
            fromAccountId: undefined,
            toAccountId: "checking",
        });
    });
});
