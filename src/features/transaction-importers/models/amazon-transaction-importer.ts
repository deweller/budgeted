import { z } from "zod";

import {
    createTransactionImportActivityId,
    type TransactionImportActivityRecord,
    type TransactionImporterAdapter,
} from "@/features/transaction-importers/models/transaction-importer-contract";
import { stableStringify } from "@/lib/workspace/revision";

const AMAZON_TRANSACTION_IMPORTER_VERSION = 2;

const amazonDetailsSchema = z.object({
    itemSummary: z.string(),
    lastImportedAt: z.string().optional(),
    orderNumber: z.string(),
    paymentKind: z.enum(["charge", "refund"]),
    paymentMethod: z.string().optional(),
    paymentMethodLast4: z.string().optional(),
    seller: z.string().optional(),
    sourceSyncId: z.string().optional(),
});

export type AmazonPaymentRecord = {
    amazonPaymentId: string;
    amountCents: number;
    candidateTransactionIdsJson?: string;
    completedDate: string;
    firstImportedAt: string;
    isRefund: boolean;
    itemSummary: string;
    lastImportedAt?: string;
    ledgerId: string;
    matchStatus: "autoMatched" | "conflict" | "manualMatched" | "unmatched";
    matchedTransactionId?: string;
    orderNumber: string;
    paymentMethod?: string;
    paymentMethodLast4?: string;
    seller?: string;
    sourceSyncId?: string;
    updatedAt: string;
};

export type AmazonPaymentDetails = z.infer<typeof amazonDetailsSchema>;

function toAmazonMatchStatus(state: string): AmazonPaymentRecord["matchStatus"] {
    return state === "autoMatched" ||
        state === "manualMatched" ||
        state === "unmatched"
        ? state
        : "conflict";
}

export function toAmazonPaymentRecord(
    activity: TransactionImportActivityRecord,
): AmazonPaymentRecord {
    const details = amazonDetailsSchema.parse(JSON.parse(activity.detailsJson));

    if (activity.provider !== "amazon") {
        throw new Error("Expected an Amazon transaction import activity.");
    }

    return {
        amazonPaymentId: activity.providerRecordId,
        amountCents: activity.providerAmountCents,
        candidateTransactionIdsJson: activity.candidateTransactionIdsJson,
        completedDate: activity.occurredDate,
        firstImportedAt: activity.createdAt,
        isRefund: details.paymentKind === "refund",
        itemSummary: details.itemSummary,
        lastImportedAt: details.lastImportedAt ?? activity.updatedAt,
        ledgerId: activity.ledgerId,
        matchStatus: toAmazonMatchStatus(activity.state),
        matchedTransactionId: activity.linkedTransactionId,
        orderNumber: details.orderNumber,
        paymentMethod: details.paymentMethod,
        paymentMethodLast4: details.paymentMethodLast4,
        seller: details.seller,
        sourceSyncId: details.sourceSyncId,
        updatedAt: activity.updatedAt,
    };
}

export const amazonTransactionImporter = {
    normalize(source) {
        const details = {
            itemSummary: source.itemSummary,
            lastImportedAt: source.lastImportedAt ?? source.updatedAt,
            orderNumber: source.orderNumber,
            paymentKind: source.isRefund ? "refund" as const : "charge" as const,
            ...(source.paymentMethod
                ? { paymentMethod: source.paymentMethod }
                : {}),
            ...(source.paymentMethodLast4
                ? { paymentMethodLast4: source.paymentMethodLast4 }
                : {}),
            ...(source.seller ? { seller: source.seller } : {}),
            ...(source.sourceSyncId ? { sourceSyncId: source.sourceSyncId } : {}),
        };
        const providerRecordId = source.amazonPaymentId;

        return {
            activityId: createTransactionImportActivityId(
                "amazon",
                providerRecordId,
            ),
            candidateTransactionIdsJson: source.candidateTransactionIdsJson,
            createdAt: source.firstImportedAt,
            detailsJson: stableStringify(details),
            detailsVersion: AMAZON_TRANSACTION_IMPORTER_VERSION,
            direction: source.isRefund ? "inflow" as const : "outflow" as const,
            financialFingerprint: stableStringify({
                amountCents: source.amountCents,
                completedDate: source.completedDate,
                isRefund: source.isRefund,
                orderNumber: source.orderNumber,
            }),
            ledgerId: source.ledgerId,
            linkedTransactionId: source.matchedTransactionId,
            occurredDate: source.completedDate,
            provider: "amazon" as const,
            providerAmountCents: source.amountCents,
            providerRecordId,
            state: source.matchStatus,
            updatedAt: source.updatedAt,
        };
    },
    detailsSchema: amazonDetailsSchema,
    matchingPolicy: {
        amountMode: "signedExact",
        dateWindowDays: 2,
        materialization: "attachExisting",
        reconciliation: "plaid",
    },
    present(activity, details) {
        return {
            summary: {
                identifier: details.orderNumber,
                text: details.itemSummary,
            },
            referenceFields: [
                { key: "provider", kind: "text", label: "Amazon provider", value: "Amazon" },
                { key: "providerRecordId", kind: "identifier", label: "Amazon provider record ID", value: activity.providerRecordId },
                { key: "providerAmountCents", kind: "money", label: "Amazon provider amount", value: activity.providerAmountCents },
                { key: "orderNumber", kind: "identifier", label: "Amazon order number", value: details.orderNumber },
                { key: "itemSummary", kind: "text", label: "Amazon item summary", value: details.itemSummary },
                { key: "paymentKind", kind: "text", label: "Amazon payment kind", value: details.paymentKind === "refund" ? "Refund" : "Charge" },
                ...(details.paymentMethod ? [{ key: "paymentMethod", kind: "text" as const, label: "Amazon payment method", value: details.paymentMethod }] : []),
                ...(details.paymentMethodLast4 ? [{ key: "paymentMethodLast4", kind: "identifier" as const, label: "Amazon payment method last four", value: details.paymentMethodLast4 }] : []),
                ...(details.seller ? [{ key: "seller", kind: "text" as const, label: "Amazon seller", value: details.seller }] : []),
            ],
        };
    },
    provider: "amazon",
    version: AMAZON_TRANSACTION_IMPORTER_VERSION,
} satisfies TransactionImporterAdapter<
    AmazonPaymentRecord,
    z.infer<typeof amazonDetailsSchema>
>;
