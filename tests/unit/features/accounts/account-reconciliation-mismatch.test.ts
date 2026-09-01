import { describe, expect, it } from "vitest";

import { findAccountReconciliationMismatchSuggestions } from "@/features/accounts/models/account-reconciliation-mismatch";

type ReconciliationTransaction = Parameters<
    typeof findAccountReconciliationMismatchSuggestions
>[0]["transactions"][number];

const account = {
    accountId: "account-1",
    accountType: "checking" as const,
    ledgerAccountId: "financial-checking",
    name: "Checking",
};

function makeTransaction(
    overrides: Partial<ReconciliationTransaction> & { transactionId: string },
): ReconciliationTransaction {
    const amountCents = overrides.displayAmountCents ?? -1_200;
    const isInflow = amountCents > 0;

    return {
        displayAmountCents: amountCents,
        kind: "standard",
        lines: [
            {
                amountCents: Math.abs(amountCents),
                ...(isInflow
                    ? { toAccountId: account.accountId }
                    : { fromAccountId: account.accountId }),
            },
        ],
        occurredAt: "2026-07-17T12:00:00.000Z",
        payee: "Example transaction",
        postings: [
            {
                amountCents: Math.abs(amountCents),
                direction: isInflow ? "debit" : "credit",
                ledgerAccountId: account.ledgerAccountId,
                ledgerAccountKind: "financial",
            },
        ],
        referenceAccountId: account.accountId,
        source: "manual",
        status: "cleared",
        ...overrides,
    };
}

function findSuggestions(input: {
    differenceCents: number;
    transactions: ReconciliationTransaction[];
}) {
    return findAccountReconciliationMismatchSuggestions({
        account,
        cutoffDate: "2026-07-18",
        ...input,
    });
}

describe("account reconciliation mismatch suggestions", () => {
    it("finds a single included transaction whose removal closes the gap", () => {
        const suggestions = findSuggestions({
            differenceCents: 1_200,
            transactions: [
                makeTransaction({
                    payee: "Coffee shop",
                    transactionId: "transaction-1",
                }),
            ],
        });

        expect(suggestions).toEqual([
            {
                confidence: "high",
                reason: "includedActivity",
                transactions: [
                    {
                        amountCents: -1_200,
                        occurredAt: "2026-07-17",
                        payee: "Coffee shop",
                        source: "manual",
                        status: "cleared",
                    },
                ],
            },
        ]);
    });

    it("finds a two-transaction combination that closes the gap", () => {
        const suggestions = findSuggestions({
            differenceCents: 1_500,
            transactions: [
                makeTransaction({
                    displayAmountCents: -1_000,
                    payee: "Grocer",
                    transactionId: "transaction-1",
                }),
                makeTransaction({
                    displayAmountCents: -500,
                    payee: "Pharmacy",
                    transactionId: "transaction-2",
                }),
            ],
        });

        expect(suggestions).toMatchObject([
            {
                confidence: "medium",
                reason: "includedActivity",
                transactions: [
                    { amountCents: -500, payee: "Pharmacy" },
                    { amountCents: -1_000, payee: "Grocer" },
                ],
            },
        ]);
    });

    it("reports an exact manual and Plaid duplicate as a cluster", () => {
        const manual = makeTransaction({
            occurredAt: "2026-07-15T12:00:00.000Z",
            transactionId: "manual",
        });
        const plaid = makeTransaction({
            occurredAt: "2026-07-17T12:00:00.000Z",
            source: "plaid",
            transactionId: "plaid",
        });
        const suggestions = findSuggestions({
            differenceCents: 1_200,
            transactions: [manual, plaid],
        });

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0]).toMatchObject({
            apparentDuplicateCount: 1,
            confidence: "high",
            reason: "possibleDuplicateGroup",
            transactions: [
                { occurredAt: "2026-07-17", source: "plaid" },
                { occurredAt: "2026-07-15", source: "manual" },
            ],
        });
    });

    it("reports three duplicate transactions once when one duplicate explains the gap", () => {
        const suggestions = findSuggestions({
            differenceCents: 1_200,
            transactions: [
                makeTransaction({
                    occurredAt: "2026-07-13T12:00:00.000Z",
                    source: "manual",
                    transactionId: "manual",
                }),
                makeTransaction({
                    occurredAt: "2026-07-15T12:00:00.000Z",
                    source: "plaid",
                    transactionId: "plaid-1",
                }),
                makeTransaction({
                    occurredAt: "2026-07-17T12:00:00.000Z",
                    source: "plaid",
                    transactionId: "plaid-2",
                }),
            ],
        });

        expect(suggestions).toEqual([
            expect.objectContaining({
                apparentDuplicateCount: 1,
                confidence: "high",
                reason: "possibleDuplicateGroup",
                transactions: expect.arrayContaining([
                    expect.objectContaining({ source: "manual" }),
                    expect.objectContaining({ source: "plaid" }),
                    expect.objectContaining({ source: "plaid" }),
                ]),
            }),
        ]);
    });

    it("reports three duplicate transactions once when two duplicates explain the gap", () => {
        const suggestions = findSuggestions({
            differenceCents: 2_400,
            transactions: [
                makeTransaction({
                    occurredAt: "2026-07-13T12:00:00.000Z",
                    source: "manual",
                    transactionId: "manual",
                }),
                makeTransaction({
                    occurredAt: "2026-07-15T12:00:00.000Z",
                    source: "plaid",
                    transactionId: "plaid-1",
                }),
                makeTransaction({
                    occurredAt: "2026-07-17T12:00:00.000Z",
                    source: "plaid",
                    transactionId: "plaid-2",
                }),
            ],
        });

        expect(suggestions).toEqual([
            expect.objectContaining({
                apparentDuplicateCount: 2,
                confidence: "high",
                reason: "possibleDuplicateGroup",
                transactions: expect.arrayContaining([
                    expect.objectContaining({ source: "manual" }),
                    expect.objectContaining({ source: "plaid" }),
                    expect.objectContaining({ source: "plaid" }),
                ]),
            }),
        ]);
    });

    it("does not form a duplicate cluster when the gap needs too many copies", () => {
        const suggestions = findSuggestions({
            differenceCents: 3_600,
            transactions: [
                makeTransaction({ source: "manual", transactionId: "manual" }),
                makeTransaction({ source: "plaid", transactionId: "plaid-1" }),
                makeTransaction({ source: "plaid", transactionId: "plaid-2" }),
            ],
        });

        expect(suggestions).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ reason: "possibleDuplicateGroup" }),
            ]),
        );
    });

    it("does not form a duplicate cluster from ineligible candidate pairs", () => {
        const mismatchedAmounts = findSuggestions({
            differenceCents: 1_200,
            transactions: [
                makeTransaction({
                    displayAmountCents: -1_200,
                    source: "manual",
                    transactionId: "manual",
                }),
                makeTransaction({
                    displayAmountCents: -1_100,
                    source: "plaid",
                    transactionId: "plaid",
                }),
            ],
        });
        const outsideMatchingWindow = findSuggestions({
            differenceCents: 1_200,
            transactions: [
                makeTransaction({
                    occurredAt: "2026-07-01T12:00:00.000Z",
                    source: "manual",
                    transactionId: "manual",
                }),
                makeTransaction({
                    occurredAt: "2026-07-17T12:00:00.000Z",
                    source: "plaid",
                    transactionId: "plaid",
                }),
            ],
        });
        const reconciledTransaction = findSuggestions({
            differenceCents: 1_200,
            transactions: [
                makeTransaction({
                    source: "manual",
                    status: "reconciled",
                    transactionId: "manual",
                }),
                makeTransaction({
                    source: "plaid",
                    transactionId: "plaid",
                }),
            ],
        });

        for (const suggestions of [
            mismatchedAmounts,
            outsideMatchingWindow,
            reconciledTransaction,
        ]) {
            expect(suggestions).not.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ reason: "possibleDuplicateGroup" }),
                ]),
            );
        }
    });

    it("retains unrelated activity suggestions beside a duplicate cluster", () => {
        const suggestions = findSuggestions({
            differenceCents: 1_200,
            transactions: [
                makeTransaction({
                    occurredAt: "2026-07-15T12:00:00.000Z",
                    source: "manual",
                    transactionId: "manual",
                }),
                makeTransaction({
                    occurredAt: "2026-07-17T12:00:00.000Z",
                    source: "plaid",
                    transactionId: "plaid",
                }),
                makeTransaction({
                    occurredAt: "2026-06-01T12:00:00.000Z",
                    payee: "Older activity",
                    source: "manual",
                    transactionId: "older-activity",
                }),
            ],
        });

        expect(suggestions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ reason: "possibleDuplicateGroup" }),
                expect.objectContaining({
                    reason: "includedActivity",
                    transactions: [expect.objectContaining({ payee: "Older activity" })],
                }),
            ]),
        );
    });

    it("finds activity immediately after the reconciliation cutoff", () => {
        const suggestions = findSuggestions({
            differenceCents: 750,
            transactions: [
                makeTransaction({
                    displayAmountCents: 750,
                    occurredAt: "2026-07-19T12:00:00.000Z",
                    transactionId: "transaction-1",
                }),
            ],
        });

        expect(suggestions).toMatchObject([
            {
                confidence: "medium",
                reason: "cutoffActivity",
                transactions: [{ amountCents: 750, occurredAt: "2026-07-19" }],
            },
        ]);
    });

    it("does not suggest reconciled transactions or unrelated amounts", () => {
        const suggestions = findSuggestions({
            differenceCents: 700,
            transactions: [
                makeTransaction({
                    status: "reconciled",
                    transactionId: "reconciled",
                }),
                makeTransaction({
                    displayAmountCents: -300,
                    transactionId: "unrelated",
                }),
            ],
        });

        expect(suggestions).toEqual([]);
    });

    it("uses a recent same-amount transaction as a low-confidence fallback", () => {
        const suggestions = findSuggestions({
            differenceCents: -1_200,
            transactions: [makeTransaction({ transactionId: "transaction-1" })],
        });

        expect(suggestions).toMatchObject([
            {
                confidence: "low",
                reason: "similarAmount",
                transactions: [{ amountCents: -1_200 }],
            },
        ]);
    });
});
