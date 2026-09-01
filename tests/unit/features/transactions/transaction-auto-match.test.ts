import { describe, expect, it } from "vitest";

import {
    createTransactionAutoMatchDecisionId,
    createTransactionAutoMatchFingerprint,
    findTransactionAutoMatches,
    type TransactionAutoMatchAccount,
    type TransactionAutoMatchTransaction,
} from "@/features/transactions/models/transaction-auto-match";

const checkingAccount: TransactionAutoMatchAccount = {
    accountId: "checking",
    accountType: "checking",
    ledgerAccountId: "acct_checking",
    name: "Checking",
};

const savingsAccount: TransactionAutoMatchAccount = {
    accountId: "savings",
    accountType: "savings",
    ledgerAccountId: "acct_savings",
    name: "Savings",
};

const creditCardAccount: TransactionAutoMatchAccount = {
    accountId: "credit-card",
    accountType: "creditCard",
    ledgerAccountId: "acct_credit_card",
    name: "Credit Card",
};

function makeTransaction(
    overrides: Partial<TransactionAutoMatchTransaction> & {
        transactionId: string;
    },
): TransactionAutoMatchTransaction {
    const accountId = overrides.referenceAccountId ?? checkingAccount.accountId;
    const account = [checkingAccount, savingsAccount, creditCardAccount].find(
        (candidate) => candidate.accountId === accountId,
    ) ?? checkingAccount;

    return {
        displayAmountCents: -1_200,
        kind: "standard",
        lines: [
            {
                fromAccountId: accountId,
            },
        ],
        occurredAt: "2026-07-01T12:00:00.000Z",
        postings: [
            {
                amountCents: 1_200,
                direction: "credit",
                ledgerAccountId: account.ledgerAccountId,
                ledgerAccountKind: "financial",
            },
        ],
        referenceAccountId: accountId,
        source: "manual",
        status: "cleared",
        ...overrides,
    };
}

function findMatches(transactions: TransactionAutoMatchTransaction[]) {
    return findTransactionAutoMatches({
        accounts: [checkingAccount, savingsAccount, creditCardAccount],
        transactions,
    });
}

function makeCreditCardPaymentSide(input: {
    account: TransactionAutoMatchAccount;
    amountCents?: number;
    categoryId?: string;
    occurredAt?: string;
    source?: "manual" | "plaid";
    transactionId: string;
}) {
    const amountCents = input.amountCents ?? 1_200;
    const isCreditCard = input.account.accountType === "creditCard";

    return makeTransaction({
        displayAmountCents: isCreditCard ? amountCents : -amountCents,
        lines: [
            {
                amountCents,
                categoryId: input.categoryId,
                ...(isCreditCard
                    ? { toAccountId: input.account.accountId }
                    : { fromAccountId: input.account.accountId }),
            },
        ],
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        postings: [
            {
                amountCents,
                direction: isCreditCard ? "debit" : "credit",
                ledgerAccountId: input.account.ledgerAccountId,
                ledgerAccountKind: "financial",
            },
        ],
        referenceAccountId: input.account.accountId,
        ...(input.source ? { source: input.source } : {}),
        transactionId: input.transactionId,
    });
}

function makeBankTransferDestinationSide(input: {
    account: TransactionAutoMatchAccount;
    amountCents?: number;
    categoryId?: string;
    occurredAt?: string;
    source?: "manual" | "plaid";
    transactionId: string;
}) {
    const amountCents = input.amountCents ?? 1_200;

    return makeTransaction({
        displayAmountCents: amountCents,
        lines: [
            {
                amountCents,
                categoryId: input.categoryId,
                toAccountId: input.account.accountId,
            },
        ],
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        postings: [
            {
                amountCents,
                direction: "debit",
                ledgerAccountId: input.account.ledgerAccountId,
                ledgerAccountKind: "financial",
            },
        ],
        referenceAccountId: input.account.accountId,
        ...(input.source ? { source: input.source } : {}),
        transactionId: input.transactionId,
    });
}

describe("transaction auto match", () => {
    it("finds a manual and Plaid pair when at least one transaction is uncategorized", () => {
        const matches = findMatches([
            makeTransaction({ transactionId: "manual" }),
            makeTransaction({
                transactionId: "plaid",
                occurredAt: "2026-07-04T12:00:00.000Z",
                source: "plaid",
            }),
        ]);

        expect(matches.readyPairs).toHaveLength(1);
        expect(matches.readyPairs[0]).toMatchObject({
            dayDistance: 3,
            sourcePriority: 0,
        });
        expect(matches.ambiguousPairs).toEqual([]);
    });

    it("suggests a categorized Manual-Plaid pair", () => {
        const categorizedLine = {
            categoryId: "groceries",
            fromAccountId: checkingAccount.accountId,
        };
        const matches = findMatches([
            makeTransaction({ transactionId: "left", lines: [categorizedLine] }),
            makeTransaction({
                transactionId: "right",
                lines: [categorizedLine],
                source: "plaid",
            }),
        ]);

        expect(matches.readyPairs).toHaveLength(1);
        expect(matches.ambiguousPairs).toEqual([]);
    });

    it("does not suggest two categorized same-source transactions", () => {
        const categorizedLine = {
            categoryId: "groceries",
            fromAccountId: checkingAccount.accountId,
        };
        const matches = findMatches([
            makeTransaction({ transactionId: "left", lines: [categorizedLine] }),
            makeTransaction({ transactionId: "right", lines: [categorizedLine] }),
        ]);

        expect(matches.readyPairs).toEqual([]);
        expect(matches.ambiguousPairs).toEqual([]);
    });

    it("suppresses a rejected pair until either transaction changes", () => {
        const left = makeTransaction({ transactionId: "manual" });
        const right = makeTransaction({
            transactionId: "plaid",
            source: "plaid",
        });
        const initial = findMatches([left, right]);
        const pair = initial.readyPairs[0]!;
        const rejection = {
            accountId: pair.account.accountId,
            leftTransactionId: pair.left.transactionId,
            matchDecisionId: createTransactionAutoMatchDecisionId(
                pair.left.transactionId,
                pair.right.transactionId,
            ),
            matchFingerprint: createTransactionAutoMatchFingerprint(pair),
            rightTransactionId: pair.right.transactionId,
        };
        const rejected = findTransactionAutoMatches({
            accounts: [checkingAccount],
            rejections: [rejection],
            transactions: [left, right],
        });

        expect(rejected.readyPairs).toEqual([]);
        expect(rejected.rejectedPairs).toHaveLength(1);

        const changed = findTransactionAutoMatches({
            accounts: [checkingAccount],
            rejections: [rejection],
            transactions: [{ ...left, updatedAt: "2026-07-02T00:00:00.000Z" }, right],
        });

        expect(changed.rejectedPairs).toEqual([]);
        expect(changed.readyPairs).toHaveLength(1);
    });

    it("never suggests a Plaid transaction with another Plaid transaction", () => {
        const matches = findMatches([
            makeTransaction({ transactionId: "plaid-one", source: "plaid" }),
            makeTransaction({
                transactionId: "plaid-two",
                occurredAt: "2026-07-02T12:00:00.000Z",
                source: "plaid",
            }),
        ]);

        expect(matches.readyPairs).toEqual([]);
        expect(matches.ambiguousPairs).toEqual([]);
    });

    it("allows a Plaid-Plaid checking-to-credit-card payment", () => {
        const matches = findMatches([
            makeCreditCardPaymentSide({
                account: checkingAccount,
                source: "plaid",
                transactionId: "bank-payment",
            }),
            makeCreditCardPaymentSide({
                account: creditCardAccount,
                occurredAt: "2026-07-04T12:00:00.000Z",
                source: "plaid",
                transactionId: "card-payment",
            }),
        ]);

        expect(matches.readyPairs).toHaveLength(1);
        expect(matches.readyPairs[0]).toMatchObject({
            account: { accountId: "checking" },
            dayDistance: 3,
            matchType: "creditCardPayment",
            transfer: {
                amountCents: 1_200,
                destinationAccount: { accountId: "credit-card" },
                requiresTransferSynthesis: true,
                sourceAccount: { accountId: "checking" },
            },
        });
    });

    it("shows a payment match in either participating account scope", () => {
        const transactions = [
            makeCreditCardPaymentSide({
                account: savingsAccount,
                transactionId: "bank-payment",
            }),
            makeCreditCardPaymentSide({
                account: creditCardAccount,
                source: "plaid",
                transactionId: "card-payment",
            }),
        ];

        for (const accountId of ["savings", "credit-card"]) {
            expect(
                findTransactionAutoMatches({
                    accountId,
                    accounts: [savingsAccount, creditCardAccount],
                    transactions,
                }).readyPairs,
            ).toHaveLength(1);
        }
    });

    it("finds a checking-to-savings transfer in either participating account scope", () => {
        const transactions = [
            makeCreditCardPaymentSide({
                account: checkingAccount,
                source: "plaid",
                transactionId: "checking-transfer",
            }),
            makeBankTransferDestinationSide({
                account: savingsAccount,
                occurredAt: "2026-07-04T12:00:00.000Z",
                source: "plaid",
                transactionId: "savings-transfer",
            }),
        ];

        for (const accountId of ["checking", "savings"]) {
            const matches = findTransactionAutoMatches({
                accountId,
                accounts: [checkingAccount, savingsAccount],
                transactions,
            });

            expect(matches.readyPairs).toMatchObject([
                {
                    account: { accountId: "checking" },
                    matchType: "bankTransfer",
                    transfer: {
                        amountCents: 1_200,
                        destinationAccount: { accountId: "savings" },
                        requiresTransferSynthesis: true,
                        sourceAccount: { accountId: "checking" },
                    },
                },
            ]);
        }
    });

    it("excludes invalid payment directions, amounts, dates, and categories", () => {
        const bank = makeCreditCardPaymentSide({
            account: checkingAccount,
            transactionId: "bank-payment",
        });
        const invalidCards = [
            makeCreditCardPaymentSide({
                account: creditCardAccount,
                amountCents: 1_201,
                source: "plaid",
                transactionId: "wrong-amount",
            }),
            makeCreditCardPaymentSide({
                account: creditCardAccount,
                categoryId: "category-1",
                source: "plaid",
                transactionId: "categorized",
            }),
            makeCreditCardPaymentSide({
                account: creditCardAccount,
                occurredAt: "2026-07-09T12:00:00.000Z",
                source: "plaid",
                transactionId: "too-late",
            }),
            makeTransaction({
                displayAmountCents: -1_200,
                lines: [
                    {
                        amountCents: 1_200,
                        fromAccountId: creditCardAccount.accountId,
                    },
                ],
                postings: [
                    {
                        amountCents: 1_200,
                        direction: "credit",
                        ledgerAccountId: creditCardAccount.ledgerAccountId,
                        ledgerAccountKind: "financial",
                    },
                ],
                referenceAccountId: creditCardAccount.accountId,
                source: "plaid",
                transactionId: "card-outflow",
            }),
        ];

        for (const card of invalidCards) {
            const matches = findMatches([bank, card]);
            expect(matches.readyPairs).toEqual([]);
            expect(matches.ambiguousPairs).toEqual([]);
        }
    });

    it("does not treat cash or transfer accounts as payment-source bank accounts", () => {
        const cashAccount: TransactionAutoMatchAccount = {
            accountId: "cash",
            accountType: "cash",
            ledgerAccountId: "acct_cash",
            name: "Cash",
        };
        const cashOutflow = makeTransaction({
            displayAmountCents: -1_200,
            lines: [
                {
                    amountCents: 1_200,
                    fromAccountId: cashAccount.accountId,
                },
            ],
            postings: [
                {
                    amountCents: 1_200,
                    direction: "credit",
                    ledgerAccountId: cashAccount.ledgerAccountId,
                    ledgerAccountKind: "financial",
                },
            ],
            referenceAccountId: cashAccount.accountId,
            transactionId: "cash-payment",
        });
        const card = makeCreditCardPaymentSide({
            account: creditCardAccount,
            source: "plaid",
            transactionId: "card-payment",
        });
        const matches = findTransactionAutoMatches({
            accounts: [cashAccount, creditCardAccount],
            transactions: [cashOutflow, card],
        });

        expect(matches.readyPairs).toEqual([]);
        expect(matches.ambiguousPairs).toEqual([]);
    });

    it("retains an existing bank-to-card transfer when matching a downloaded side", () => {
        const transfer = makeTransaction({
            displayAmountCents: -1_200,
            lines: [
                {
                    amountCents: 1_200,
                    fromAccountId: checkingAccount.accountId,
                    toAccountId: creditCardAccount.accountId,
                },
            ],
            postings: [
                {
                    amountCents: 1_200,
                    direction: "credit",
                    ledgerAccountId: checkingAccount.ledgerAccountId,
                    ledgerAccountKind: "financial",
                },
                {
                    amountCents: 1_200,
                    direction: "debit",
                    ledgerAccountId: creditCardAccount.ledgerAccountId,
                    ledgerAccountKind: "financial",
                },
            ],
            transactionId: "existing-transfer",
        });
        const card = makeCreditCardPaymentSide({
            account: creditCardAccount,
            source: "plaid",
            transactionId: "downloaded-card-side",
        });
        const matches = findMatches([transfer, card]);

        expect(matches.readyPairs).toHaveLength(1);
        expect(matches.readyPairs[0]).toMatchObject({
            matchType: "creditCardPayment",
            transfer: { requiresTransferSynthesis: false },
        });
    });

    it("marks competing payment counterparts as ambiguous", () => {
        const matches = findMatches([
            makeCreditCardPaymentSide({
                account: checkingAccount,
                transactionId: "bank-payment",
            }),
            makeCreditCardPaymentSide({
                account: creditCardAccount,
                source: "plaid",
                transactionId: "card-payment-one",
            }),
            makeCreditCardPaymentSide({
                account: creditCardAccount,
                occurredAt: "2026-07-02T12:00:00.000Z",
                source: "plaid",
                transactionId: "card-payment-two",
            }),
        ]);

        expect(matches.readyPairs).toEqual([]);
        expect(matches.ambiguousPairs).toHaveLength(2);
        expect(
            matches.ambiguousPairs.every(
                (pair) => pair.matchType === "creditCardPayment",
            ),
        ).toBe(true);
    });

    it("suppresses a rejected payment until either transaction changes", () => {
        const bank = makeCreditCardPaymentSide({
            account: checkingAccount,
            transactionId: "bank-payment",
        });
        const card = makeCreditCardPaymentSide({
            account: creditCardAccount,
            source: "plaid",
            transactionId: "card-payment",
        });
        const pair = findMatches([bank, card]).readyPairs[0]!;
        const rejection = {
            accountId: pair.transfer!.sourceAccount.accountId,
            leftTransactionId: pair.left.transactionId,
            matchDecisionId: createTransactionAutoMatchDecisionId(
                pair.left.transactionId,
                pair.right.transactionId,
            ),
            matchFingerprint: createTransactionAutoMatchFingerprint(pair),
            rightTransactionId: pair.right.transactionId,
        };

        const rejected = findTransactionAutoMatches({
            accounts: [checkingAccount, creditCardAccount],
            rejections: [rejection],
            transactions: [bank, card],
        });
        const changed = findTransactionAutoMatches({
            accounts: [checkingAccount, creditCardAccount],
            rejections: [rejection],
            transactions: [
                bank,
                { ...card, updatedAt: "2026-07-02T00:00:00.000Z" },
            ],
        });

        expect(rejected.readyPairs).toEqual([]);
        expect(rejected.rejectedPairs).toHaveLength(1);
        expect(changed.rejectedPairs).toEqual([]);
        expect(changed.readyPairs).toHaveLength(1);
    });

    it("uses an inclusive seven-calendar-day window", () => {
        const matches = findMatches([
            makeTransaction({ transactionId: "base" }),
            makeTransaction({
                transactionId: "within-window",
                occurredAt: "2026-07-08T01:00:00.000Z",
                source: "plaid",
            }),
            makeTransaction({
                transactionId: "outside-window",
                occurredAt: "2026-07-09T01:00:00.000Z",
                displayAmountCents: -1_300,
                source: "plaid",
            }),
        ]);

        expect(matches.ambiguousPairs).toEqual([]);
        expect(matches.readyPairs).toHaveLength(1);
        expect(matches.readyPairs[0]?.dayDistance).toBe(7);
    });

    it("uses the signed movement for the shared financial account", () => {
        const matches = findMatches([
            makeTransaction({
                transactionId: "left",
                displayAmountCents: 1_200,
                postings: [
                    {
                        amountCents: 1_200,
                        direction: "credit",
                        ledgerAccountId: checkingAccount.ledgerAccountId,
                        ledgerAccountKind: "financial",
                    },
                ],
            }),
            makeTransaction({
                transactionId: "right",
                displayAmountCents: 1_200,
                postings: [
                    {
                        amountCents: 1_200,
                        direction: "credit",
                        ledgerAccountId: checkingAccount.ledgerAccountId,
                        ledgerAccountKind: "financial",
                    },
                ],
            }),
            makeTransaction({
                transactionId: "other-account",
                displayAmountCents: -1_300,
                referenceAccountId: savingsAccount.accountId,
                source: "plaid",
            }),
        ]);

        expect(matches.readyPairs).toHaveLength(1);
        expect(matches.readyPairs[0]?.account.accountId).toBe(
            checkingAccount.accountId,
        );
    });

    it("ranks manual-Plaid pairs before same-source pairs and then by date", () => {
        const matches = findMatches([
            makeTransaction({ transactionId: "manual-base" }),
            makeTransaction({
                transactionId: "manual-close",
                occurredAt: "2026-07-02T12:00:00.000Z",
            }),
            makeTransaction({
                transactionId: "plaid-farther",
                occurredAt: "2026-07-07T12:00:00.000Z",
                source: "plaid",
            }),
        ]);

        expect(matches.ambiguousPairs.map((pair) => pair.sourcePriority)).toEqual(
            [0, 0, 1],
        );
        expect(matches.ambiguousPairs.map((pair) => pair.dayDistance)).toEqual(
            [5, 6, 1],
        );
    });

    it("excludes voided and unmergeable pairs", () => {
        const matches = findMatches([
            makeTransaction({
                transactionId: "voided",
                source: "plaid",
                status: "voided",
            }),
            makeTransaction({
                transactionId: "multi-left",
                lines: [{ fromAccountId: "checking" }, { fromAccountId: "checking" }],
            }),
            makeTransaction({
                transactionId: "multi-right",
                lines: [{ fromAccountId: "checking" }, { fromAccountId: "checking" }],
                source: "plaid",
            }),
        ]);

        expect(matches.readyPairs).toEqual([]);
        expect(matches.ambiguousPairs).toEqual([]);
    });

    it("marks every pair involving a transaction with multiple candidates as ambiguous", () => {
        const matches = findMatches([
            makeTransaction({ transactionId: "manual" }),
            makeTransaction({ transactionId: "plaid-one", source: "plaid" }),
            makeTransaction({
                transactionId: "plaid-two",
                occurredAt: "2026-07-03T12:00:00.000Z",
                source: "plaid",
            }),
        ]);

        expect(matches.readyPairs).toEqual([]);
        expect(matches.ambiguousPairs).toHaveLength(2);
    });
});
