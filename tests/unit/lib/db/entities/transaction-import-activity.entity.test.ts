import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import { createTransactionImportActivityEntity } from "@/lib/db/entities/transaction-import-activity.entity";

function createEntity() {
    return createTransactionImportActivityEntity({
        client: DynamoDBDocumentClient.from(
            new DynamoDBClient({
                credentials: {
                    accessKeyId: "test",
                    secretAccessKey: "test",
                },
                region: "us-east-1",
            }),
        ),
        table: "BudgetedTestTable",
    });
}

describe("transactionImportActivity entity", () => {
    it("persists unlinked activities with their provider lookup keys", () => {
        const params = createEntity()
            .put({
                activityId: "amazon:payment-1",
                createdAt: "2026-08-08T12:00:00.000Z",
                detailsJson: "{}",
                detailsVersion: 1,
                direction: "outflow",
                financialFingerprint: "financial-fingerprint-1",
                ledgerId: "ledger-1",
                occurredDate: "2026-08-07",
                provider: "amazon",
                providerAmountCents: 2_500,
                providerRecordId: "payment-1",
                state: "unmatched",
                updatedAt: "2026-08-08T12:00:00.000Z",
            })
            .params();

        expect(params.Item).toEqual(
            expect.objectContaining({
                activityId: "amazon:payment-1",
                provider: "amazon",
                providerRecordId: "payment-1",
            }),
        );
        expect(params.Item).toHaveProperty("gsi2pk");
        expect(params.Item).toHaveProperty("gsi2sk");
    });

    it("persists the surviving transaction link", () => {
        const params = createEntity()
            .put({
                activityId: "venmo:provider-1",
                createdAt: "2026-08-08T12:00:00.000Z",
                detailsJson: "{}",
                detailsVersion: 1,
                direction: "inflow",
                financialFingerprint: "financial-fingerprint-1",
                ledgerId: "ledger-1",
                linkedTransactionId: "transaction-1",
                occurredDate: "2026-08-07",
                provider: "venmo",
                providerAmountCents: 2_500,
                providerRecordId: "provider-1",
                state: "posted",
                updatedAt: "2026-08-08T12:00:00.000Z",
            })
            .params();

        expect(params.Item).toEqual(
            expect.objectContaining({
                activityId: "venmo:provider-1",
                linkedTransactionId: "transaction-1",
            }),
        );
    });
});
