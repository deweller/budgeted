// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findAmazonPaymentMatchCandidates: vi.fn(),
    listTransactionImportActivities: vi.fn(),
    queryAllPages: vi.fn(),
    synchronizeTransactionImportActivities: vi.fn(),
}));

vi.mock("@/features/amazon/models/amazon-matching", () => ({
    findAmazonPaymentMatchCandidates: mocks.findAmazonPaymentMatchCandidates,
}));

vi.mock(
    "@/features/transaction-importers/server/transaction-import-activity-service",
    () => ({
        deleteTransactionImportActivity: vi.fn(),
        listTransactionImportActivities: mocks.listTransactionImportActivities,
        synchronizeTransactionImportActivities:
            mocks.synchronizeTransactionImportActivities,
    }),
);

vi.mock("@/lib/db/query-all-pages", () => ({
    queryAllPages: mocks.queryAllPages,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            accounts: { query: { byAccount: () => "accounts" } },
            amazonOrderIntegrations: {
                query: { byIntegration: () => "integrations" },
            },
            ledgerPostings: { query: { byPosting: () => "postings" } },
            transactions: { query: { byTransaction: () => "transactions" } },
        },
    }),
}));

import { amazonTransactionImporter } from "@/features/transaction-importers/models/amazon-transaction-importer";
import { manuallyMatchAmazonPayment } from "@/features/amazon/server/amazon-order-service";

const now = "2026-08-08T12:00:00.000Z";

function activity(providerRecordId: string, linkedTransactionId?: string) {
    return amazonTransactionImporter.normalize({
        amazonPaymentId: providerRecordId,
        amountCents: -2_500,
        completedDate: "2026-08-07",
        firstImportedAt: now,
        isRefund: false,
        itemSummary: "USB cable",
        ledgerId: "ledger-1",
        matchStatus: linkedTransactionId ? "autoMatched" : "unmatched",
        matchedTransactionId: linkedTransactionId,
        orderNumber: "111-222",
        updatedAt: now,
    });
}

describe("Amazon order service canonical activities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.queryAllPages.mockImplementation(async (query) => {
            if (query === "integrations") {
                return [{
                    accountId: "card-1",
                    createdAt: now,
                    integrationId: "amazon-orders",
                    latestBudgetedImportStatus: "succeeded",
                    ledgerId: "ledger-1",
                    updatedAt: now,
                }];
            }
            if (query === "accounts") {
                return [{
                    accountId: "card-1",
                    accountType: "creditCard",
                    ledgerAccountId: "financial-card-1",
                    ledgerId: "ledger-1",
                }];
            }
            return [];
        });
        mocks.findAmazonPaymentMatchCandidates.mockReturnValue(["transaction-1"]);
        mocks.synchronizeTransactionImportActivities.mockImplementation(
            async (activities) => ({ activities, workspaceChanges: [{
                entityId: activities[0].activityId,
                entityType: "transactionImportActivity",
                operation: "upsert",
                previousRecordDigest: null,
                record: activities[0],
            }] }),
        );
    });

    it("manual matching updates only the canonical importer activity", async () => {
        mocks.listTransactionImportActivities.mockResolvedValue([activity("payment-1")]);

        const result = await manuallyMatchAmazonPayment({
            amazonPaymentId: "payment-1",
            ledgerId: "ledger-1",
            transactionId: "transaction-1",
        });

        expect(result).toMatchObject({
            amazonPaymentId: "payment-1",
            matchStatus: "manualMatched",
            matchedTransactionId: "transaction-1",
        });
        expect(mocks.synchronizeTransactionImportActivities).toHaveBeenCalledWith([
            expect.objectContaining({
                activityId: "amazon:payment-1",
                linkedTransactionId: "transaction-1",
                provider: "amazon",
                state: "manualMatched",
            }),
        ]);
    });

    it("rejects a transaction already owned by another Amazon activity", async () => {
        mocks.listTransactionImportActivities.mockResolvedValue([
            activity("payment-1"),
            activity("payment-2", "transaction-1"),
        ]);

        await expect(
            manuallyMatchAmazonPayment({
                amazonPaymentId: "payment-1",
                ledgerId: "ledger-1",
                transactionId: "transaction-1",
            }),
        ).rejects.toMatchObject({
            code: "amazon_match_transaction_claimed",
            status: 409,
        });
        expect(mocks.synchronizeTransactionImportActivities).not.toHaveBeenCalled();
    });
});
