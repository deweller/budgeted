import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";

import {
    deleteItemBatch,
    deleteItemsInBatches,
} from "@/lib/db/batch-delete";

function getDeleteKeys(command: BatchWriteCommand) {
    return (command.input.RequestItems?.["ledger-table"] ?? []).map(
        (request) => request.DeleteRequest?.Key,
    );
}

describe("batch-delete", () => {
    it("retries unprocessed delete requests", async () => {
        const unprocessedKey = { pk: "item#2", sk: "item#2" };
        const sentKeys: unknown[][] = [];
        const sendCommand = vi.fn(async (command: BatchWriteCommand) => {
            const deleteKeys = getDeleteKeys(command);
            sentKeys.push(deleteKeys);

            if (sentKeys.length === 1) {
                return {
                    UnprocessedItems: {
                        "ledger-table": [
                            { DeleteRequest: { Key: unprocessedKey } },
                        ],
                    },
                };
            }

            return {};
        });

        await deleteItemBatch({
            keys: [
                { pk: "item#1", sk: "item#1" },
                unprocessedKey,
            ],
            sendCommand,
            tableName: "ledger-table",
        });

        expect(sentKeys).toEqual([
            [
                { pk: "item#1", sk: "item#1" },
                { pk: "item#2", sk: "item#2" },
            ],
            [{ pk: "item#2", sk: "item#2" }],
        ]);
    });

    it("splits large deletes into batches", async () => {
        const sentBatchSizes: number[] = [];
        const sendCommand = vi.fn(async (command: BatchWriteCommand) => {
            sentBatchSizes.push(getDeleteKeys(command).length);
            return {};
        });

        await deleteItemsInBatches({
            chunkSize: 2,
            keys: [
                { pk: "item#1", sk: "item#1" },
                { pk: "item#2", sk: "item#2" },
                { pk: "item#3", sk: "item#3" },
                { pk: "item#4", sk: "item#4" },
                { pk: "item#5", sk: "item#5" },
            ],
            sendCommand,
            tableName: "ledger-table",
        });

        expect(sentBatchSizes).toEqual([2, 2, 1]);
    });
});
