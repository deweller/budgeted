import type { ZodType } from "zod";

export const TRANSACTION_IMPORTER_IDS = ["amazon", "venmo"] as const;

export type TransactionImporterId = (typeof TRANSACTION_IMPORTER_IDS)[number];

export const TRANSACTION_IMPORT_DIRECTIONS = [
    "inflow",
    "outflow",
    "transfer",
] as const;

export type TransactionImportDirection =
    (typeof TRANSACTION_IMPORT_DIRECTIONS)[number];

export const TRANSACTION_IMPORT_STATES = [
    "autoMatched",
    "conflict",
    "error",
    "ignored",
    "manualMatched",
    "needsAccount",
    "needsReview",
    "posted",
    "provisional",
    "unmatched",
] as const;

export type TransactionImportState =
    (typeof TRANSACTION_IMPORT_STATES)[number];

export type TransactionImportReferenceField = {
    key: string;
    kind: "date" | "identifier" | "money" | "text";
    label: string;
    value: number | string;
};

export type TransactionImportPresentation = {
    referenceFields: TransactionImportReferenceField[];
    summary: {
        identifier: string;
        text: string;
    };
};

export type TransactionImportMatchingPolicy = {
    amountMode: "absoluteExact" | "signedExact";
    dateWindowDays: number;
    materialization: "attachExisting" | "createTransaction";
    reconciliation: "none" | "plaid";
};

export type TransactionImportActivityRecord = {
    activityId: string;
    candidateTransactionIdsJson?: string;
    counterparty?: string;
    createdAt: string;
    detailsJson: string;
    detailsVersion: number;
    direction: TransactionImportDirection;
    externalAccountKey?: string;
    financialFingerprint: string;
    ledgerId: string;
    linkedTransactionId?: string;
    memo?: string;
    occurredDate: string;
    processingError?: string;
    provider: TransactionImporterId;
    providerAmountCents: number;
    providerRecordId: string;
    state: TransactionImportState;
    updatedAt: string;
};

export type TransactionImporterAdapter<TSourceRecord, TDetails> = {
    normalize: (
        source: TSourceRecord,
    ) => TransactionImportActivityRecord;
    detailsSchema: ZodType<TDetails>;
    matchingPolicy: TransactionImportMatchingPolicy;
    present: (
        activity: TransactionImportActivityRecord,
        details: TDetails,
    ) => TransactionImportPresentation;
    provider: TransactionImporterId;
    version: number;
};

export function createTransactionImportActivityId(
    provider: TransactionImporterId,
    providerRecordId: string,
) {
    return `${provider}:${providerRecordId}`;
}

export function parseTransactionImportDetails<TDetails>(
    adapter: TransactionImporterAdapter<unknown, TDetails>,
    activity: TransactionImportActivityRecord,
) {
    return adapter.detailsSchema.parse(JSON.parse(activity.detailsJson));
}
