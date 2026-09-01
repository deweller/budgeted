import type { WorkspacePlaidTransactionSyncRecord } from "@/lib/workspace/sync-types";

export type PlaidTransactionReference = Pick<
    WorkspacePlaidTransactionSyncRecord,
    | "categoryText"
    | "lastSyncedAt"
    | "merchantName"
    | "name"
    | "pending"
    | "plaidAmountCents"
    | "plaidDate"
    | "plaidTransactionSyncId"
    | "status"
> & {
    amountDiffersFromTransaction: boolean;
    plaidDisplayAmountCents: number;
};

export function toPlaidTransactionReference(
    record: WorkspacePlaidTransactionSyncRecord,
    transactionDisplayAmountCents: number,
): PlaidTransactionReference {
    const plaidDisplayAmountCents = -record.plaidAmountCents;

    return {
        amountDiffersFromTransaction:
            plaidDisplayAmountCents !== transactionDisplayAmountCents,
        categoryText: record.categoryText,
        lastSyncedAt: record.lastSyncedAt,
        merchantName: record.merchantName,
        name: record.name,
        pending: record.pending,
        plaidAmountCents: record.plaidAmountCents,
        plaidDisplayAmountCents,
        plaidDate: record.plaidDate,
        plaidTransactionSyncId: record.plaidTransactionSyncId,
        status: record.status,
    };
}
