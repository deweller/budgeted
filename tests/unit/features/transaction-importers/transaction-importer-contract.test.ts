import { describe, expect, it } from "vitest";

import { amazonTransactionImporter } from "@/features/transaction-importers/models/amazon-transaction-importer";
import { createTransactionImportActivityId } from "@/features/transaction-importers/models/transaction-importer-contract";
import {
    getTransactionImporter,
    presentTransactionImportActivity,
    transactionImporterRegistry,
} from "@/features/transaction-importers/models/transaction-importer-registry";
import { venmoTransactionImporter } from "@/features/transaction-importers/models/venmo-transaction-importer";
import {
    createRelinkedTransactionImportActivities,
    createReopenedTransactionImportActivities,
} from "@/features/transaction-importers/server/transaction-import-activity-service";

const now = "2026-08-08T12:00:00.000Z";

describe("transaction importer contract", () => {
    it("registers every importer behind the shared adapter contract", () => {
        expect(Object.keys(transactionImporterRegistry).sort()).toEqual([
            "amazon",
            "venmo",
        ]);
        expect(getTransactionImporter("amazon").matchingPolicy).toEqual({
            amountMode: "signedExact",
            dateWindowDays: 2,
            materialization: "attachExisting",
            reconciliation: "plaid",
        });
        expect(getTransactionImporter("venmo").matchingPolicy).toEqual({
            amountMode: "absoluteExact",
            dateWindowDays: 7,
            materialization: "createTransaction",
            reconciliation: "plaid",
        });
    });

    it("normalizes and presents Amazon payment records", () => {
        const activity = amazonTransactionImporter.normalize({
            amazonPaymentId: "amazon-payment-1",
            amountCents: 4_299,
            completedDate: "2026-08-06",
            firstImportedAt: now,
            isRefund: false,
            itemSummary: "Coffee grinder",
            ledgerId: "ledger-1",
            matchStatus: "autoMatched",
            matchedTransactionId: "transaction-1",
            orderNumber: "111-2222222-3333333",
            paymentMethod: "Visa",
            paymentMethodLast4: "4242",
            seller: "Example Seller",
            updatedAt: now,
        });

        expect(activity).toMatchObject({
            activityId: "amazon:amazon-payment-1",
            direction: "outflow",
            linkedTransactionId: "transaction-1",
            provider: "amazon",
            providerAmountCents: 4_299,
            providerRecordId: "amazon-payment-1",
        });
        expect(presentTransactionImportActivity(activity)).toMatchObject({
            summary: {
                identifier: "111-2222222-3333333",
                text: "Coffee grinder",
            },
            referenceFields: expect.arrayContaining([
                expect.objectContaining({
                    key: "providerAmountCents",
                    value: 4_299,
                }),
                expect.objectContaining({
                    key: "paymentMethodLast4",
                    value: "4242",
                }),
            ]),
        });
    });

    it("normalizes and presents Venmo records without losing managed memo data", () => {
        const activity = venmoTransactionImporter.normalize({
            activityId: "venmo-activity-1",
            amountCents: 1_250,
            counterpartyHandle: "@river",
            counterpartyName: "River Person",
            firstReceivedAt: now,
            fundingInstitution: "Example Bank",
            fundingLast4: "1234",
            fundingMethod: "Bank account",
            kind: "paymentSent",
            ledgerId: "ledger-1",
            linkedTransactionId: "transaction-1",
            matchStatus: "posted",
            memo: "Dinner 🍜",
            occurredDate: "2026-08-07",
            providerTransactionId: "venmo-provider-1",
            sourceMessageId: "message-1",
            sourceSubject: "You paid River Person",
            status: "Complete",
            updatedAt: now,
        });

        expect(activity).toMatchObject({
            activityId: "venmo:venmo-provider-1",
            counterparty: "River Person",
            direction: "outflow",
            externalAccountKey: "example bank:1234",
            memo: "Dinner 🍜",
            provider: "venmo",
            providerAmountCents: 1_250,
        });
        expect(presentTransactionImportActivity(activity)).toMatchObject({
            summary: {
                identifier: "venmo-provider-1",
                text: "Paid River Person with memo Dinner 🍜.",
            },
            referenceFields: expect.arrayContaining([
                expect.objectContaining({ key: "memo", value: "Dinner 🍜" }),
                expect.objectContaining({
                    key: "providerAmountCents",
                    value: 1_250,
                }),
                expect.objectContaining({
                    key: "sourceMessageId",
                    value: "message-1",
                }),
            ]),
        });
    });

    it("uses collision-safe provider-scoped activity ids", () => {
        expect(createTransactionImportActivityId("amazon", "same-id")).toBe(
            "amazon:same-id",
        );
        expect(createTransactionImportActivityId("venmo", "same-id")).toBe(
            "venmo:same-id",
        );
    });

    it("relinks merged activities and reopens deleted links for review", () => {
        const activity = venmoTransactionImporter.normalize({
            activityId: "venmo-activity-1",
            amountCents: 1_250,
            firstReceivedAt: now,
            kind: "paymentReceived",
            ledgerId: "ledger-1",
            linkedTransactionId: "duplicate-transaction",
            matchStatus: "unmatched",
            occurredDate: "2026-08-07",
            providerTransactionId: "venmo-provider-1",
            sourceMessageId: "message-1",
            sourceSubject: "River Person paid you",
            updatedAt: now,
        });
        const relinked = createRelinkedTransactionImportActivities({
            activities: [activity],
            now: "2026-08-08T13:00:00.000Z",
            transactionId: "survivor-transaction",
        })[0]!;

        expect(relinked.record).toMatchObject({
            linkedTransactionId: "survivor-transaction",
            state: "autoMatched",
        });

        const reopened = createReopenedTransactionImportActivities({
            activities: [relinked.record],
            now: "2026-08-08T14:00:00.000Z",
        })[0]!;
        expect(reopened.record).toMatchObject({
            linkedTransactionId: undefined,
            state: "needsReview",
        });
        expect(reopened.record.processingError).toContain("deleted");
    });
});
