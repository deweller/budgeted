import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";

import {
    createWorkspaceStateEntity,
    WORKSPACE_STATE_ID,
} from "@/lib/db/entities/workspace-state.entity";

function createEntity() {
    return createWorkspaceStateEntity({
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

describe("workspaceState entity", () => {
    it("keys metadata by workspace and ledger without a secondary index", () => {
        const params = createEntity()
            .put({
                createdAt: "2026-07-16T00:00:00.000Z",
                entityCountsJson: '{"transaction":1}',
                entityRevisionsJson: '{"transaction":"g1:r1"}',
                ledgerId: "ledger-1",
                oldestRetainedWorkspaceRevision: 0,
                updatedAt: "2026-07-16T00:00:00.000Z",
                workspaceGeneration: 1,
                workspaceId: "global",
                workspaceRevision: 1,
            })
            .params();

        expect(params.Item).toEqual(
            expect.objectContaining({
                ledgerId: "ledger-1",
                stateId: WORKSPACE_STATE_ID,
                workspaceId: "global",
                workspaceRevision: 1,
            }),
        );
        expect(params.Item).not.toHaveProperty("gsi1pk");
    });
});
