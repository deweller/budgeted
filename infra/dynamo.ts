// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

export function defineLedgerTable() {
    return new sst.aws.Dynamo("LedgerTable", {
        fields: {
            pk: "string",
            sk: "string",
            gsi1pk: "string",
            gsi1sk: "string",
            gsi2pk: "string",
            gsi2sk: "string",
            gsi3pk: "string",
            gsi3sk: "string",
        },
        primaryIndex: {
            hashKey: "pk",
            rangeKey: "sk",
        },
        globalIndexes: {
            gsi1: {
                hashKey: "gsi1pk",
                rangeKey: "gsi1sk",
            },
            gsi2: {
                hashKey: "gsi2pk",
                rangeKey: "gsi2sk",
            },
            gsi3: {
                hashKey: "gsi3pk",
                rangeKey: "gsi3sk",
            },
        },
        ttl: "expiresAt",
    });
}
