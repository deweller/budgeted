import {
    BatchWriteCommand,
    type BatchWriteCommandInput,
    type BatchWriteCommandOutput,
} from "@aws-sdk/lib-dynamodb";

import { documentClient } from "@/lib/db/client";
import { chunkRecords } from "@/lib/db/chunked-write";

type BatchWriteRequestItems = NonNullable<
    BatchWriteCommandInput["RequestItems"]
>[string];

export type DynamoDeleteKey = NonNullable<
    NonNullable<BatchWriteRequestItems[number]["DeleteRequest"]>["Key"]
>;

type BatchWriteSender = (
    command: BatchWriteCommand,
) => Promise<Pick<BatchWriteCommandOutput, "UnprocessedItems">>;

type DeleteItemBatchInput = {
    keys: DynamoDeleteKey[];
    sendCommand?: BatchWriteSender;
    tableName: string;
};

export async function deleteItemBatch(input: DeleteItemBatchInput) {
    const sendCommand =
        input.sendCommand ??
        ((command: BatchWriteCommand) => documentClient.send(command));
    let unprocessed: BatchWriteRequestItems = input.keys.map((key) => ({
        DeleteRequest: { Key: key },
    }));

    while (unprocessed.length > 0) {
        const result = await sendCommand(
            new BatchWriteCommand({
                RequestItems: {
                    [input.tableName]: unprocessed,
                },
            }),
        );

        unprocessed = result.UnprocessedItems?.[input.tableName] ?? [];
    }
}

export async function deleteItemsInBatches(input: DeleteItemBatchInput & {
    chunkSize?: number;
}) {
    for (const keys of chunkRecords(input.keys, input.chunkSize)) {
        await deleteItemBatch({
            keys,
            sendCommand: input.sendCommand,
            tableName: input.tableName,
        });
    }
}
