import { describe, expect, it } from "vitest";

import { findAmazonPaymentMatchCandidates } from "@/features/amazon/models/amazon-matching";

const account = {
    accountId: "amazon-card",
    ledgerAccountId: "acct_amazon_card",
};

describe("Amazon matching", () => {
    it("matches by selected account amount and inclusive two-day window", () => {
        const candidates = findAmazonPaymentMatchCandidates({
            account,
            payment: {
                amazonPaymentId: "payment-1",
                amountCents: -2500,
                completedDate: "2026-06-10",
            },
            transactions: [
                {
                    displayAmountCents: -2500,
                    occurredAt: "2026-06-08T00:00:00.000Z",
                    postings: [],
                    referenceAccountId: "amazon-card",
                    status: "entered",
                    transactionId: "within-window",
                },
                {
                    displayAmountCents: -2500,
                    occurredAt: "2026-06-07T00:00:00.000Z",
                    postings: [],
                    referenceAccountId: "amazon-card",
                    status: "entered",
                    transactionId: "too-old",
                },
                {
                    displayAmountCents: -2600,
                    occurredAt: "2026-06-10T00:00:00.000Z",
                    postings: [],
                    referenceAccountId: "amazon-card",
                    status: "entered",
                    transactionId: "wrong-amount",
                },
            ],
        });

        expect(candidates).toEqual(["within-window"]);
    });

    it("matches refunds as positive activity and skips excluded transactions", () => {
        const candidates = findAmazonPaymentMatchCandidates({
            account,
            excludedTransactionIds: new Set(["already-used"]),
            payment: {
                amazonPaymentId: "payment-1",
                amountCents: 999,
                completedDate: "2026-06-10",
            },
            transactions: [
                {
                    displayAmountCents: 999,
                    occurredAt: "2026-06-10T00:00:00.000Z",
                    postings: [],
                    referenceAccountId: "amazon-card",
                    status: "entered",
                    transactionId: "already-used",
                },
                {
                    displayAmountCents: 999,
                    occurredAt: "2026-06-11T00:00:00.000Z",
                    postings: [],
                    referenceAccountId: "amazon-card",
                    status: "entered",
                    transactionId: "refund",
                },
            ],
        });

        expect(candidates).toEqual(["refund"]);
    });
});
