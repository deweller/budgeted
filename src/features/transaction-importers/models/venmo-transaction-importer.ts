import { z } from "zod";

import {
    createTransactionImportActivityId,
    type TransactionImportActivityRecord,
    type TransactionImporterAdapter,
} from "@/features/transaction-importers/models/transaction-importer-contract";
import { stableStringify } from "@/lib/workspace/revision";

const VENMO_TRANSACTION_IMPORTER_VERSION = 2;

const venmoDetailsSchema = z.object({
    activityId: z.string(),
    activityKind: z.enum(["paymentReceived", "paymentSent", "standardTransfer"]),
    counterpartyHandle: z.string().optional(),
    destinationInstitution: z.string().optional(),
    destinationLast4: z.string().optional(),
    estimatedArrivalDate: z.string().optional(),
    fundingInstitution: z.string().optional(),
    fundingLast4: z.string().optional(),
    fundingMethod: z.string().optional(),
    lastReceivedAt: z.string().optional(),
    sourceMessageId: z.string(),
    sourceSubject: z.string(),
    status: z.string().optional(),
    transactionUrl: z.string().optional(),
});

export type VenmoActivityRecord = {
    activityId: string;
    amountCents: number;
    candidateTransactionIdsJson?: string;
    counterpartyHandle?: string;
    counterpartyName?: string;
    destinationInstitution?: string;
    destinationLast4?: string;
    estimatedArrivalDate?: string;
    firstReceivedAt: string;
    fundingInstitution?: string;
    fundingLast4?: string;
    fundingMethod?: string;
    kind: "paymentReceived" | "paymentSent" | "standardTransfer";
    lastReceivedAt?: string;
    ledgerId: string;
    linkedTransactionId?: string;
    matchStatus: "autoMatched" | "conflict" | "error" | "manualMatched" | "needsAccount" | "posted" | "unmatched";
    memo?: string;
    occurredDate: string;
    processingError?: string;
    providerTransactionId: string;
    sourceMessageId: string;
    sourceSubject: string;
    status?: string;
    transactionUrl?: string;
    updatedAt: string;
};

export type VenmoActivityDetails = z.infer<typeof venmoDetailsSchema>;

function toVenmoMatchStatus(state: string): VenmoActivityRecord["matchStatus"] {
    return state === "autoMatched" ||
        state === "conflict" ||
        state === "error" ||
        state === "manualMatched" ||
        state === "needsAccount" ||
        state === "posted" ||
        state === "unmatched"
        ? state
        : "error";
}

export function toVenmoActivityRecord(
    activity: TransactionImportActivityRecord,
): VenmoActivityRecord {
    const details = venmoDetailsSchema.parse(JSON.parse(activity.detailsJson));

    if (activity.provider !== "venmo") {
        throw new Error("Expected a Venmo transaction import activity.");
    }

    return {
        activityId: details.activityId,
        amountCents: activity.providerAmountCents,
        candidateTransactionIdsJson: activity.candidateTransactionIdsJson,
        counterpartyHandle: details.counterpartyHandle,
        counterpartyName: activity.counterparty,
        destinationInstitution: details.destinationInstitution,
        destinationLast4: details.destinationLast4,
        estimatedArrivalDate: details.estimatedArrivalDate,
        firstReceivedAt: activity.createdAt,
        fundingInstitution: details.fundingInstitution,
        fundingLast4: details.fundingLast4,
        fundingMethod: details.fundingMethod,
        kind: details.activityKind,
        lastReceivedAt: details.lastReceivedAt ?? activity.updatedAt,
        ledgerId: activity.ledgerId,
        linkedTransactionId: activity.linkedTransactionId,
        matchStatus: toVenmoMatchStatus(activity.state),
        memo: activity.memo,
        occurredDate: activity.occurredDate,
        processingError: activity.processingError,
        providerTransactionId: activity.providerRecordId,
        sourceMessageId: details.sourceMessageId,
        sourceSubject: details.sourceSubject,
        status: details.status,
        transactionUrl: details.transactionUrl,
        updatedAt: activity.updatedAt,
    };
}

function toExternalAccountKey(source: VenmoActivityRecord) {
    const institution =
        source.destinationInstitution ?? source.fundingInstitution;
    const last4 = source.destinationLast4 ?? source.fundingLast4;

    return institution && last4
        ? `${institution.trim().toLocaleLowerCase()}:${last4}`
        : undefined;
}

export const venmoTransactionImporter = {
    normalize(source) {
        const details = {
            activityId: source.activityId,
            activityKind: source.kind,
            lastReceivedAt: source.lastReceivedAt ?? source.updatedAt,
            sourceMessageId: source.sourceMessageId,
            sourceSubject: source.sourceSubject,
            ...(source.counterpartyHandle
                ? { counterpartyHandle: source.counterpartyHandle }
                : {}),
            ...(source.destinationInstitution
                ? { destinationInstitution: source.destinationInstitution }
                : {}),
            ...(source.destinationLast4
                ? { destinationLast4: source.destinationLast4 }
                : {}),
            ...(source.estimatedArrivalDate
                ? { estimatedArrivalDate: source.estimatedArrivalDate }
                : {}),
            ...(source.fundingInstitution
                ? { fundingInstitution: source.fundingInstitution }
                : {}),
            ...(source.fundingLast4 ? { fundingLast4: source.fundingLast4 } : {}),
            ...(source.fundingMethod ? { fundingMethod: source.fundingMethod } : {}),
            ...(source.status ? { status: source.status } : {}),
            ...(source.transactionUrl
                ? { transactionUrl: source.transactionUrl }
                : {}),
        };

        return {
            activityId: createTransactionImportActivityId(
                "venmo",
                source.providerTransactionId,
            ),
            candidateTransactionIdsJson: source.candidateTransactionIdsJson,
            counterparty: source.counterpartyName,
            createdAt: source.firstReceivedAt,
            detailsJson: stableStringify(details),
            detailsVersion: VENMO_TRANSACTION_IMPORTER_VERSION,
            direction:
                source.kind === "paymentReceived"
                    ? "inflow" as const
                    : source.kind === "standardTransfer"
                      ? "transfer" as const
                      : "outflow" as const,
            externalAccountKey: toExternalAccountKey(source),
            financialFingerprint: stableStringify({
                amountCents: source.amountCents,
                kind: source.kind,
                occurredDate: source.occurredDate,
            }),
            ledgerId: source.ledgerId,
            linkedTransactionId: source.linkedTransactionId,
            memo: source.memo,
            occurredDate: source.occurredDate,
            processingError: source.processingError,
            provider: "venmo" as const,
            providerAmountCents: source.amountCents,
            providerRecordId: source.providerTransactionId,
            state: source.matchStatus,
            updatedAt: source.updatedAt,
        };
    },
    detailsSchema: venmoDetailsSchema,
    matchingPolicy: {
        amountMode: "absoluteExact",
        dateWindowDays: 7,
        materialization: "createTransaction",
        reconciliation: "plaid",
    },
    present(activity, details) {
        const text = `Paid ${activity.counterparty ?? "Venmo"}${
            activity.memo ? ` with memo ${activity.memo}` : ""
        }.`;

        return {
            summary: {
                identifier: activity.providerRecordId,
                text,
            },
            referenceFields: [
                { key: "provider", kind: "text", label: "Venmo provider", value: "Venmo" },
                { key: "providerRecordId", kind: "identifier", label: "Venmo provider record ID", value: activity.providerRecordId },
                { key: "providerAmountCents", kind: "money", label: "Venmo provider amount", value: activity.providerAmountCents },
                { key: "activityId", kind: "identifier", label: "Venmo activity ID", value: details.activityId },
                { key: "activityKind", kind: "text", label: "Venmo activity kind", value: details.activityKind === "paymentReceived" ? "Payment received" : details.activityKind === "paymentSent" ? "Payment sent" : "Standard transfer" },
                ...(activity.counterparty ? [{ key: "counterparty", kind: "text" as const, label: "Venmo counterparty", value: activity.counterparty }] : []),
                ...(activity.memo ? [{ key: "memo", kind: "text" as const, label: "Venmo memo", value: activity.memo }] : []),
                ...(details.counterpartyHandle ? [{ key: "counterpartyHandle", kind: "text" as const, label: "Venmo handle", value: details.counterpartyHandle }] : []),
                ...(details.fundingMethod ? [{ key: "fundingMethod", kind: "text" as const, label: "Venmo funding method", value: details.fundingMethod }] : []),
                ...(details.fundingInstitution ? [{ key: "fundingInstitution", kind: "text" as const, label: "Venmo funding institution", value: details.fundingInstitution }] : []),
                ...(details.fundingLast4 ? [{ key: "fundingLast4", kind: "identifier" as const, label: "Venmo funding last four", value: details.fundingLast4 }] : []),
                ...(details.destinationInstitution ? [{ key: "destinationInstitution", kind: "text" as const, label: "Venmo destination institution", value: details.destinationInstitution }] : []),
                ...(details.destinationLast4 ? [{ key: "destinationLast4", kind: "identifier" as const, label: "Venmo destination last four", value: details.destinationLast4 }] : []),
                ...(details.estimatedArrivalDate ? [{ key: "estimatedArrivalDate", kind: "date" as const, label: "Venmo estimated arrival", value: details.estimatedArrivalDate }] : []),
                { key: "sourceMessageId", kind: "identifier", label: "Venmo source message ID", value: details.sourceMessageId },
                { key: "sourceSubject", kind: "text", label: "Venmo source subject", value: details.sourceSubject },
                ...(details.status ? [{ key: "status", kind: "text" as const, label: "Venmo status", value: details.status }] : []),
                ...(details.transactionUrl ? [{ key: "transactionUrl", kind: "text" as const, label: "Venmo transaction URL", value: details.transactionUrl }] : []),
            ],
        };
    },
    provider: "venmo",
    version: VENMO_TRANSACTION_IMPORTER_VERSION,
} satisfies TransactionImporterAdapter<
    VenmoActivityRecord,
    z.infer<typeof venmoDetailsSchema>
>;
