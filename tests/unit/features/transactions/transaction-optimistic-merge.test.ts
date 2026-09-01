import { describe, expect, it } from "vitest";

import { createOptimisticTransactionMergeChanges } from "@/features/transactions/models/optimistic-transaction";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import type { WorkspacePlaidTransactionSyncRecord } from "@/lib/workspace/sync-types";

const now = "2026-07-18T16:40:00.000Z";

function createImportActivity(input: {
    memo?: string;
    provider: "amazon" | "venmo";
    providerRecordId: string;
    transactionId: string;
}) {
    return {
        activityId: `${input.provider}:${input.providerRecordId}`,
        createdAt: now,
        detailsJson: JSON.stringify(
            input.provider === "amazon"
                ? { itemSummary: "USB cable", orderNumber: "111-222", paymentKind: "charge" }
                : { activityId: `paymentSent:${input.providerRecordId}`, activityKind: "paymentSent", sourceMessageId: "message-1", sourceSubject: "Venmo payment" },
        ),
        detailsVersion: 2,
        direction: "outflow" as const,
        financialFingerprint: `${input.provider}:${input.providerRecordId}`,
        ledgerId: "ledger-1",
        linkedTransactionId: input.transactionId,
        memo: input.memo,
        occurredDate: "2026-07-18",
        provider: input.provider,
        providerAmountCents: 1_250,
        providerRecordId: input.providerRecordId,
        state: "manualMatched" as const,
        updatedAt: now,
    };
}

function createTransaction(input: {
    categoryId?: string;
    lineId: string;
    memo?: string;
    payee: string;
    source: "manual" | "plaid" | "venmo";
    transactionId: string;
}): TransactionWithPostings {
    return {
        displayAmountCents: -1_250,
        enteredAt: now,
        kind: "standard",
        ledgerId: "ledger-1",
        lines: [
            {
                amountCents: 1_250,
                categoryId: input.categoryId,
                createdAt: now,
                fromAccountId: "checking-1",
                ledgerId: "ledger-1",
                lineId: input.lineId,
                sortOrder: 0,
                transactionId: input.transactionId,
                updatedAt: now,
            },
        ],
        memo: input.memo,
        occurredAt: "2026-07-18",
        payee: input.payee,
        periodId: "2026-07",
        postings: [],
        referenceAccountId: "checking-1",
        source: input.source,
        status: "cleared",
        transactionId: input.transactionId,
        updatedAt: now,
    };
}

const plaidSyncRecord: WorkspacePlaidTransactionSyncRecord = {
    accountId: "checking-1",
    firstSyncedAt: now,
    lastSyncedAt: now,
    ledgerId: "ledger-1",
    name: "Downloaded purchase",
    pending: false,
    plaidAccountId: "plaid-account-1",
    plaidAccountLinkId: "plaid-link-1",
    plaidAmountCents: 1_250,
    plaidDate: "2026-07-18",
    plaidItemId: "plaid-item-1",
    plaidPayloadJson: "{}",
    plaidTransactionId: "plaid-transaction-1",
    plaidTransactionSyncId: "plaid-sync-1",
    status: "active",
    transactionId: "plaid-transaction",
    updatedAt: now,
};

describe("createOptimisticTransactionMergeChanges", () => {
    it("immediately projects the selected content into the Plaid survivor", () => {
        const manual = {
            ...createTransaction({
                categoryId: "groceries-1",
                lineId: "manual-line",
                memo: "Manual memo",
                payee: "Manual merchant",
                source: "manual",
                transactionId: "manual-transaction",
            }),
            importActivities: [createImportActivity({
                provider: "amazon",
                providerRecordId: "payment-1",
                transactionId: "manual-transaction",
            })],
        };
        const plaid = {
            ...createTransaction({
                lineId: "plaid-line",
                payee: "Downloaded merchant",
                source: "plaid",
                transactionId: "plaid-transaction",
            }),
            plaidTransactionSyncId: plaidSyncRecord.plaidTransactionSyncId,
        };

        const changes = createOptimisticTransactionMergeChanges({
            accounts: [
                {
                    accountId: "checking-1",
                    accountType: "checking",
                    ledgerAccountId: "acct-checking",
                    name: "Checking",
                },
            ],
            categories: [
                {
                    categoryId: "groceries-1",
                    ledgerAccountId: "category-groceries",
                },
            ],
            plaidTransactionSyncRecords: [plaidSyncRecord],
            transactions: [manual, plaid],
        });

        expect(changes).toContainEqual(
            expect.objectContaining({
                entityId: "manual-transaction",
                entityType: "transaction",
                operation: "delete",
            }),
        );
        expect(changes).toContainEqual(
            expect.objectContaining({
                entityId: "manual-line",
                entityType: "transactionLine",
                operation: "upsert",
                record: expect.objectContaining({
                    categoryId: "groceries-1",
                    transactionId: "plaid-transaction",
                }),
            }),
        );
        expect(changes).not.toContainEqual(
            expect.objectContaining({
                entityId: "manual-line",
                entityType: "transactionLine",
                operation: "delete",
            }),
        );
        expect(changes).toContainEqual(
            expect.objectContaining({
                entityId: "plaid-transaction",
                entityType: "transaction",
                operation: "upsert",
                record: expect.objectContaining({
                    memo: "Manual memo",
                    plaidTransactionSyncId: "plaid-sync-1",
                    source: "plaid",
                }),
            }),
        );
        expect(changes).toContainEqual(
            expect.objectContaining({
                entityId: "amazon:payment-1",
                entityType: "transactionImportActivity",
                record: expect.objectContaining({
                    linkedTransactionId: "plaid-transaction",
                }),
            }),
        );
    });

    it.each([
        { expectedMemo: "Existing bank memo", plaidMemo: "Existing bank memo" },
        { expectedMemo: "Dinner", plaidMemo: undefined },
    ])(
        "uses Venmo memo only when the Plaid survivor memo is blank",
        ({ expectedMemo, plaidMemo }) => {
            const venmo = {
                ...createTransaction({
                    lineId: "venmo-line",
                    memo: "Dinner",
                    payee: "Sample Friend",
                    source: "venmo",
                    transactionId: "venmo-transaction",
                }),
                importActivities: [createImportActivity({
                    memo: "Dinner",
                    provider: "venmo",
                    providerRecordId: "venmo-1",
                    transactionId: "venmo-transaction",
                })],
            };
            const plaid = {
                ...createTransaction({
                    lineId: "plaid-line",
                    memo: plaidMemo,
                    payee: "Downloaded payment",
                    source: "plaid",
                    transactionId: "plaid-transaction",
                }),
                plaidTransactionSyncId: plaidSyncRecord.plaidTransactionSyncId,
            };

            const changes = createOptimisticTransactionMergeChanges({
                accounts: [
                    {
                        accountId: "checking-1",
                        accountType: "checking",
                        ledgerAccountId: "acct-checking",
                        name: "Checking",
                    },
                ],
                categories: [],
                plaidTransactionSyncRecords: [plaidSyncRecord],
                transactions: [venmo, plaid],
            });

            expect(changes).toContainEqual(
                expect.objectContaining({
                    entityId: "plaid-transaction",
                    entityType: "transaction",
                    operation: "upsert",
                    record: expect.objectContaining({
                        memo: expectedMemo,
                    }),
                }),
            );
            expect(changes).toContainEqual(
                expect.objectContaining({
                    entityId: "venmo:venmo-1",
                    entityType: "transactionImportActivity",
                    record: expect.objectContaining({
                        linkedTransactionId: "plaid-transaction",
                    }),
                }),
            );
        },
    );

    it("projects a bank-to-credit-card transfer and preserves both Plaid references", () => {
        const bank = {
            ...createTransaction({
                lineId: "bank-line",
                payee: "Card payment",
                source: "plaid",
                transactionId: "bank-payment",
            }),
            plaidTransactionSyncId: "bank-sync",
        };
        const card: TransactionWithPostings = {
            ...createTransaction({
                lineId: "card-line",
                payee: "Payment received",
                source: "plaid",
                transactionId: "card-payment",
            }),
            displayAmountCents: 1_250,
            lines: [
                {
                    amountCents: 1_250,
                    createdAt: now,
                    ledgerId: "ledger-1",
                    lineId: "card-line",
                    sortOrder: 0,
                    toAccountId: "credit-card-1",
                    transactionId: "card-payment",
                    updatedAt: now,
                },
            ],
            plaidTransactionSyncId: "card-sync",
            referenceAccountId: "credit-card-1",
            transactionId: "card-payment",
        };
        const bankSync = {
            ...plaidSyncRecord,
            plaidTransactionId: "plaid-bank-payment",
            plaidTransactionSyncId: "bank-sync",
            transactionId: "bank-payment",
        };
        const cardSync = {
            ...plaidSyncRecord,
            accountId: "credit-card-1",
            plaidAccountId: "plaid-card-account",
            plaidTransactionId: "plaid-card-payment",
            plaidTransactionSyncId: "card-sync",
            transactionId: "card-payment",
        };

        const changes = createOptimisticTransactionMergeChanges({
            accounts: [
                {
                    accountId: "checking-1",
                    accountType: "checking",
                    ledgerAccountId: "acct-checking",
                    name: "Checking",
                },
                {
                    accountId: "credit-card-1",
                    accountType: "creditCard",
                    ledgerAccountId: "acct-credit-card",
                    name: "Credit Card",
                },
            ],
            categories: [],
            expectedMatchType: "creditCardPayment",
            plaidTransactionSyncRecords: [bankSync, cardSync],
            transactions: [bank, card],
        });

        expect(changes).toContainEqual(
            expect.objectContaining({
                entityId: "bank-line",
                entityType: "transactionLine",
                operation: "upsert",
                record: expect.objectContaining({
                    categoryId: undefined,
                    fromAccountId: "checking-1",
                    toAccountId: "credit-card-1",
                    transactionId: "bank-payment",
                }),
            }),
        );
        expect(changes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entityId: "card-sync",
                    entityType: "plaidTransactionSync",
                    operation: "upsert",
                    record: expect.objectContaining({
                        transactionId: "bank-payment",
                    }),
                }),
                expect.objectContaining({
                    entityType: "ledgerPosting",
                    record: expect.objectContaining({
                        direction: "credit",
                        ledgerAccountId: "acct-checking",
                    }),
                }),
                expect.objectContaining({
                    entityType: "ledgerPosting",
                    record: expect.objectContaining({
                        direction: "debit",
                        ledgerAccountId: "acct-credit-card",
                    }),
                }),
            ]),
        );
    });
});
