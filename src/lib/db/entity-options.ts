import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export type EntityOptions = {
    client: DynamoDBDocumentClient;
    table: string;
};
