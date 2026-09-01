import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const rawDynamoClient = new DynamoDBClient({});

export const documentClient = DynamoDBDocumentClient.from(rawDynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true,
    },
});

export function getRawDynamoClient() {
    return rawDynamoClient;
}
