// @vitest-environment node

import type { Transaction } from "plaid";
import { describe, expect, it } from "vitest";

import { getComparablePlaidBalanceCents } from "@/features/plaid/models/plaid-balance";
import {
    createPlaidImportedTransactionInput,
    createPlaidTransactionSyncRecord,
    shouldImportPlaidTransactionForLink,
    type PlaidAccountLinkRecord,
    type PlaidTransactionSyncRecord,
} from "@/features/plaid/server/plaid-service";

const account = {
    accountId: "account-1",
    accountType: "checking" as const,
    ledgerAccountId: "acct_checking",
};

const creditCardAccount = {
    accountId: "credit-card-1",
    accountType: "creditCard" as const,
    ledgerAccountId: "acct_credit_card",
};

const link: PlaidAccountLinkRecord = {
    accountId: "account-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    lastSyncStatus: "never",
    plaidAccountId: "plaid-account-1",
    plaidAccountLinkId: "link-1",
    plaidItemId: "item-1",
    status: "linked",
    syncStartDate: "2026-05-01",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ledgerId: "ledger-1",
};

const creditCardLink: PlaidAccountLinkRecord = {
    ...link,
    plaidAccountSubtype: "credit card",
    plaidAccountType: "credit",
};

function plaidTransaction(overrides: Partial<Transaction> = {}) {
    return {
        account_id: "plaid-account-1",
        amount: 12.34,
        authorized_date: "2026-05-09",
        category: ["Food and Drink", "Coffee"],
        date: "2026-05-10",
        iso_currency_code: "USD",
        merchant_name: "Coffee Shop",
        name: "Coffee Shop",
        original_description: "SQ *COFFEE SHOP",
        pending: false,
        personal_finance_category: {
            confidence_level: "VERY_HIGH",
            detailed: "FOOD_AND_DRINK_COFFEE",
            primary: "FOOD_AND_DRINK",
        },
        transaction_id: "plaid-transaction-1",
        ...overrides,
    } as Transaction;
}

describe("Plaid service mapping", () => {
    it("normalizes Plaid credit balances for ledger balance comparison", () => {
        expect(
            getComparablePlaidBalanceCents({
                accountType: "creditCard",
                plaidAccountSubtype: "credit card",
                plaidAccountType: "credit",
                plaidBalanceCurrentCents: 207850,
            }),
        ).toBe(-207850);
        expect(
            getComparablePlaidBalanceCents({
                accountType: "checking",
                plaidAccountSubtype: "checking",
                plaidAccountType: "depository",
                plaidBalanceCurrentCents: 150025,
            }),
        ).toBe(150025);
    });

    it("maps positive Plaid amounts to Budgeted outflows", () => {
        const result = createPlaidImportedTransactionInput({
            account,
            plaidTransaction: plaidTransaction({
                authorized_datetime: "2026-05-08T20:00:00Z",
                datetime: "2026-05-09T20:00:00Z",
            }),
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        });

        expect(result).toMatchObject({
            accountId: "account-1",
            kind: "standard",
            occurredAt: "2026-05-09T00:00:00.000Z",
            payee: "Coffee Shop",
            plaidTransactionSyncId: "sync-1",
            source: "plaid",
            transactionId: "transaction-1",
            lines: [{ amountCents: 1234, fromAccountId: "account-1" }],
        });
        expect(result.memo).toBeUndefined();
    });

    it("keeps Plaid memo text when the raw description adds detail beyond the payee", () => {
        const result = createPlaidImportedTransactionInput({
            account,
            plaidTransaction: plaidTransaction({
                merchant_name: "Amazon",
                name: "Amazon",
                original_description: "AMZN MKTP US*2H8AB12",
            }),
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        });

        expect(result).toMatchObject({
            memo: "AMZN MKTP US*2H8AB12",
            payee: "Amazon",
        });
    });

    it("maps negative Plaid amounts to Budgeted inflows", () => {
        const result = createPlaidImportedTransactionInput({
            account,
            plaidTransaction: plaidTransaction({ amount: -50 }),
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        });

        expect(result.lines).toEqual([
            { amountCents: 5000, toAccountId: "account-1" },
        ]);
    });

    it("maps positive credit card charges to Budgeted outflows", () => {
        const result = createPlaidImportedTransactionInput({
            account: creditCardAccount,
            plaidTransaction: plaidTransaction({
                amount: 42.25,
                merchant_name: "Grocery Store",
                name: "Grocery Store",
                personal_finance_category: {
                    confidence_level: "VERY_HIGH",
                    detailed: "GENERAL_MERCHANDISE_GROCERIES",
                    primary: "GENERAL_MERCHANDISE",
                },
            }),
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        });

        expect(result.lines).toEqual([
            { amountCents: 4225, fromAccountId: "credit-card-1" },
        ]);
    });

    it("maps negative credit card payment records to Budgeted inflows", () => {
        const result = createPlaidImportedTransactionInput({
            account: creditCardAccount,
            link: creditCardLink,
            plaidTransaction: plaidTransaction({
                amount: -125,
                category: ["Payment", "Credit Card"],
                merchant_name: "Card Payment",
                name: "Payment Thank You",
                original_description: "AUTOMATIC PAYMENT - THANK YOU",
                personal_finance_category: {
                    confidence_level: "VERY_HIGH",
                    detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
                    primary: "LOAN_PAYMENTS",
                },
            }),
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        });

        expect(result.lines).toEqual([
            { amountCents: 12500, toAccountId: "credit-card-1" },
        ]);
    });

    it("maps positive Plaid loan payment records on linked credit accounts by sign only", () => {
        const result = createPlaidImportedTransactionInput({
            account,
            link: creditCardLink,
            plaidTransaction: plaidTransaction({
                amount: 2078.5,
                category: null,
                merchant_name: null,
                name: "AUTOMATIC PAYMENT - THANK",
                original_description: "AUTOMATIC PAYMENT - THANK",
                personal_finance_category: {
                    confidence_level: "LOW",
                    detailed: "LOAN_PAYMENTS_OTHER_PAYMENT",
                    primary: "LOAN_PAYMENTS",
                },
            }),
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        });

        expect(result.lines).toEqual([
            { amountCents: 207850, fromAccountId: "account-1" },
        ]);
    });

    it("keeps positive Plaid loan payment records on depository accounts as Budgeted outflows", () => {
        const result = createPlaidImportedTransactionInput({
            account,
            link,
            plaidTransaction: plaidTransaction({
                amount: 2078.5,
                category: null,
                merchant_name: null,
                name: "CREDIT CARD 3333 PAYMENT *//",
                original_description: "CREDIT CARD 3333 PAYMENT *//",
                personal_finance_category: {
                    confidence_level: "LOW",
                    detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
                    primary: "LOAN_PAYMENTS",
                },
            }),
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        });

        expect(result.lines).toEqual([
            { amountCents: 207850, fromAccountId: "account-1" },
        ]);
    });

    it("uses the linked account and sync start date when deciding imports", () => {
        expect(
            shouldImportPlaidTransactionForLink(link, {
                account_id: "plaid-account-1",
                date: "2026-05-01",
            }),
        ).toBe(true);
        expect(
            shouldImportPlaidTransactionForLink(link, {
                account_id: "plaid-account-1",
                date: "2026-04-30",
            }),
        ).toBe(false);
        expect(
            shouldImportPlaidTransactionForLink(link, {
                account_id: "other-plaid-account",
                date: "2026-05-10",
            }),
        ).toBe(false);
    });

    it("stores authoritative Plaid fields with deterministic sync ids", () => {
        const record = createPlaidTransactionSyncRecord({
            ledgerId: "ledger-1",
            link,
            now: "2026-05-11T00:00:00.000Z",
            plaidTransaction: plaidTransaction(),
            transactionId: "transaction-1",
        });

        expect(record).toMatchObject({
            categoryText: "FOOD_AND_DRINK / FOOD_AND_DRINK_COFFEE",
            firstSyncedAt: "2026-05-11T00:00:00.000Z",
            ledgerId: "ledger-1",
            merchantName: "Coffee Shop",
            name: "Coffee Shop",
            plaidAmountCents: 1234,
            plaidTransactionId: "plaid-transaction-1",
            plaidTransactionSyncId:
                "ledger-1:account-1:plaid-transaction-1",
            status: "active",
            transactionId: "transaction-1",
        });
        expect(record.plaidPayloadJson).toContain("SQ *COFFEE SHOP");
        expect(record.plaidPayloadJson).not.toContain("accessToken");
    });

    it("updates authoritative Plaid fields while retaining import identity", () => {
        const existing: PlaidTransactionSyncRecord =
            createPlaidTransactionSyncRecord({
                ledgerId: "ledger-1",
                link,
                now: "2026-05-11T00:00:00.000Z",
                plaidTransaction: plaidTransaction(),
                transactionId: "transaction-1",
            });
        const updated = createPlaidTransactionSyncRecord({
            existing,
            ledgerId: "ledger-1",
            link,
            now: "2026-05-12T00:00:00.000Z",
            plaidTransaction: plaidTransaction({
                amount: 13.5,
                merchant_name: "Updated Coffee",
            }),
            transactionId: existing.transactionId,
        });

        expect(updated.firstSyncedAt).toBe(existing.firstSyncedAt);
        expect(updated.transactionId).toBe(existing.transactionId);
        expect(updated.plaidTransactionSyncId).toBe(
            existing.plaidTransactionSyncId,
        );
        expect(updated.merchantName).toBe("Updated Coffee");
        expect(updated.plaidAmountCents).toBe(1350);
    });
});
