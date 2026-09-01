import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import { createVenmoAccountMappingEntity } from "@/lib/db/entities/venmo-account-mapping.entity";
import { createVenmoIntegrationEntity } from "@/lib/db/entities/venmo-integration.entity";

const options = {
    client: DynamoDBDocumentClient.from(new DynamoDBClient({ credentials: { accessKeyId: "test", secretAccessKey: "test" }, region: "us-east-1" })),
    table: "BudgetedTestTable",
};

describe("Venmo entities", () => {
    it("indexes enabled integration ownership by envelope recipient", () => {
        const params = createVenmoIntegrationEntity(options).put({
            createdAt: "2026-08-07T12:00:00.000Z", inboundRecipient: "venmo@aws.example.com", inboxEnabled: true,
            integrationId: "venmo-email", latestProcessingStatus: "never", ledgerId: "ledger-1",
            updatedAt: "2026-08-07T12:00:00.000Z", venmoAccountId: "venmo-balance",
        }).params();
        expect(params.Item).toEqual(expect.objectContaining({ inboundRecipient: "venmo@aws.example.com", inboxEnabled: true, gsi1pk: expect.stringContaining("venmo@aws.example.com") }));
    });

    it("stores normalized mapping identity without financial history", () => {
        const params = createVenmoAccountMappingEntity(options).put({
            accountId: "bank-1", createdAt: "2026-08-07T12:00:00.000Z", externalAccountKey: "sample bank:1234",
            institution: "Sample Bank", last4: "1234", ledgerId: "ledger-1", mappingId: "mapping-1", updatedAt: "2026-08-07T12:00:00.000Z",
        }).params();
        expect(params.Item).toEqual(expect.objectContaining({ accountId: "bank-1", externalAccountKey: "sample bank:1234", last4: "1234" }));
    });

});
