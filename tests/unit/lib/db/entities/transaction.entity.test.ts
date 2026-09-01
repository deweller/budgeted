import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import { createTransactionEntity } from "@/lib/db/entities/transaction.entity";

describe("transaction entity", () => {
    it("stores transaction data without importer metadata", () => {
        const entity = createTransactionEntity({
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
        const params = entity.put({
            displayAmountCents: -3_500,
            enteredAt: "2026-08-07T12:00:00.000Z",
            kind: "standard",
            ledgerId: "ledger-1",
            occurredAt: "2026-08-07T12:00:00.000Z",
            periodId: "2026-08",
            referenceAccountId: "account-1",
            referenceCategoryId: "__uncategorized__",
            source: "venmo",
            status: "entered",
            transactionId: "transaction-1",
            updatedAt: "2026-08-07T12:00:00.000Z",
        }).params();

        expect(params.Item).toEqual(
            expect.objectContaining({ source: "venmo" }),
        );
        expect(params.Item).not.toHaveProperty("orderMetadata");
        expect(params.Item).not.toHaveProperty("venmoMetadata");
    });
});
