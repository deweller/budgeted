import { describe, expect, it } from "vitest";

import {
    findTransferTransactionLine,
    getTransactionLineSignedAmountCents,
    getTransactionTransferCounterparty,
    getTransferLineCounterparty,
    hasMultipleTransactionLines,
    hasTransactionLineAccount,
    hasTransferTransactionLine,
    isOneSidedAccountTransactionLine,
    isSingleTransferLineTransaction,
    isTransferTransactionLine,
    isZeroNetMultiLineTransaction,
} from "@/features/transactions/models/transaction-shape";

describe("transaction shape helpers", () => {
    it("detects multi-line transactions from line count", () => {
        expect(hasMultipleTransactionLines({ lines: [{}] })).toBe(false);
        expect(hasMultipleTransactionLines({ lines: [{}, {}] })).toBe(true);
    });

    it("detects transfer lines from from/to account references", () => {
        expect(
            isTransferTransactionLine({
                fromAccountId: "checking",
                toAccountId: "savings",
            }),
        ).toBe(true);
        expect(isTransferTransactionLine({ fromAccountId: "checking" })).toBe(
            false,
        );
        expect(isTransferTransactionLine({ toAccountId: "savings" })).toBe(
            false,
        );
    });

    it("detects account references and one-sided account movement lines", () => {
        expect(hasTransactionLineAccount({})).toBe(false);
        expect(hasTransactionLineAccount({ fromAccountId: "checking" })).toBe(
            true,
        );
        expect(hasTransactionLineAccount({ toAccountId: "savings" })).toBe(
            true,
        );
        expect(
            isOneSidedAccountTransactionLine({
                fromAccountId: "checking",
            }),
        ).toBe(true);
        expect(
            isOneSidedAccountTransactionLine({
                fromAccountId: "checking",
                toAccountId: "savings",
            }),
        ).toBe(false);
        expect(isOneSidedAccountTransactionLine({})).toBe(false);
    });

    it("finds transfer lines in a transaction shape", () => {
        const transferLine = {
            fromAccountId: "checking",
            lineId: "transfer",
            toAccountId: "savings",
        };
        const transaction = {
            lines: [{ fromAccountId: "checking" }, transferLine],
        };

        expect(hasTransferTransactionLine(transaction)).toBe(true);
        expect(findTransferTransactionLine(transaction)).toBe(transferLine);
        expect(hasTransferTransactionLine({ lines: [{ toAccountId: "savings" }] }))
            .toBe(false);
    });

    it("detects single-line transfers only when the sole line is a transfer", () => {
        expect(
            isSingleTransferLineTransaction({
                lines: [
                    {
                        fromAccountId: "checking",
                        toAccountId: "savings",
                    },
                ],
            }),
        ).toBe(true);
        expect(
            isSingleTransferLineTransaction({
                lines: [
                    {
                        fromAccountId: "checking",
                        toAccountId: "savings",
                    },
                    {
                        fromAccountId: "checking",
                    },
                ],
            }),
        ).toBe(false);
    });

    it("resolves transfer counterparty from an account perspective", () => {
        const line = {
            fromAccountId: "checking",
            toAccountId: "savings",
        };

        expect(getTransferLineCounterparty(line, "checking")).toEqual({
            counterpartyAccountId: "savings",
            direction: "to",
            sourceAccountId: "checking",
            targetAccountId: "savings",
        });
        expect(getTransferLineCounterparty(line, "savings")).toEqual({
            counterpartyAccountId: "checking",
            direction: "from",
            sourceAccountId: "checking",
            targetAccountId: "savings",
        });
        expect(getTransferLineCounterparty(line)).toEqual({
            counterpartyAccountId: "savings",
            direction: "to",
            sourceAccountId: "checking",
            targetAccountId: "savings",
        });
        expect(getTransferLineCounterparty({ fromAccountId: "checking" }))
            .toBeNull();
    });

    it("resolves transaction transfer counterparty from the first transfer line", () => {
        const transaction = {
            lines: [
                { fromAccountId: "checking" },
                {
                    fromAccountId: "checking",
                    lineId: "transfer",
                    toAccountId: "savings",
                },
            ],
        };

        expect(
            getTransactionTransferCounterparty(transaction, "savings"),
        ).toEqual({
            counterpartyAccountId: "checking",
            direction: "from",
            sourceAccountId: "checking",
            targetAccountId: "savings",
        });
        expect(
            getTransactionTransferCounterparty(
                { lines: [{ fromAccountId: "checking" }] },
                "savings",
            ),
        ).toBeNull();
    });

    it("detects zero-net multi-line transactions", () => {
        expect(
            isZeroNetMultiLineTransaction({
                displayAmountCents: 0,
                lines: [{}, {}],
            }),
        ).toBe(true);
        expect(
            isZeroNetMultiLineTransaction({
                displayAmountCents: 0,
                lines: [{}],
            }),
        ).toBe(false);
        expect(
            isZeroNetMultiLineTransaction({
                displayAmountCents: 500,
                lines: [{}, {}],
            }),
        ).toBe(false);
    });

    it("signs persisted transaction line amounts from an account perspective", () => {
        expect(
            getTransactionLineSignedAmountCents(
                {
                    amountCents: 5_000,
                    fromAccountId: "checking",
                    toAccountId: "savings",
                },
                "savings",
            ),
        ).toBe(5_000);
        expect(
            getTransactionLineSignedAmountCents(
                {
                    amountCents: 5_000,
                    fromAccountId: "checking",
                    toAccountId: "savings",
                },
                "checking",
            ),
        ).toBe(-5_000);
        expect(
            getTransactionLineSignedAmountCents(
                {
                    amountCents: 1_250,
                    toAccountId: "checking",
                },
                "savings",
            ),
        ).toBe(1_250);
        expect(
            getTransactionLineSignedAmountCents(
                {
                    amountCents: 1_250,
                    fromAccountId: "checking",
                },
                "savings",
            ),
        ).toBe(-1_250);
        expect(
            getTransactionLineSignedAmountCents(
                {
                    amountCents: 750,
                },
                "checking",
            ),
        ).toBe(750);
    });
});
