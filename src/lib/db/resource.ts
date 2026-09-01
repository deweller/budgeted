import { Resource } from "sst";

type SecretResource = {
    value: string;
};

type TableResource = {
    tableName?: string;
    name?: string;
};

type FunctionResource = {
    name?: string;
};

type BucketResource = {
    name?: string;
};

function getLinkedResource<TResource>(name: string) {
    try {
        return Reflect.get(Resource, name) as TResource | undefined;
    } catch {
        return undefined;
    }
}

function getLinkedEnvResource<TResource>(name: string) {
    const resource = process.env[`SST_RESOURCE_${name}`];

    if (!resource) {
        return undefined;
    }

    try {
        return JSON.parse(resource) as TResource;
    } catch {
        return undefined;
    }
}

function resolveLinkedResource<TResource>(name: string) {
    return (
        getLinkedResource<TResource>(name) ??
        getLinkedEnvResource<TResource>(name)
    );
}

export function getLinkedSecret(
    name:
        | "AmazonOrderScraperApiToken"
        | "AmazonOrderScraperApiUrl"
        | "AuthSecret"
        | "GoogleGenerativeAiApiKey"
        | "OpenAiApiKey"
        | "PlaidClientId"
        | "PlaidEnv"
        | "PlaidSecret",
) {
    return resolveLinkedResource<SecretResource>(name)?.value;
}

export function getLedgerTableName() {
    const ledgerTable = resolveLinkedResource<TableResource>("LedgerTable");

    return (
        ledgerTable?.tableName ??
        ledgerTable?.name ??
        process.env.APP_TABLE_NAME ??
        process.env.SST_RESOURCE_LedgerTable_tableName
    );
}

export function requireLedgerTableName() {
    const tableName = getLedgerTableName();

    if (!tableName) {
        throw new Error("Ledger table name is not configured.");
    }

    return tableName;
}

export function requireLinkedBucketName(name: string) {
    const bucketName = resolveLinkedResource<BucketResource>(name)?.name;

    if (!bucketName) {
        throw new Error(`${name} bucket is not configured.`);
    }

    return bucketName;
}

export function getLinkedFunctionName(name: string) {
    return resolveLinkedResource<FunctionResource>(name)?.name;
}
