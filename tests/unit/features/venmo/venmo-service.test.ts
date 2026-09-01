import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteTransactionImportActivity: vi.fn(),
    findStoredTransaction: vi.fn(),
    listTransactionImportActivities: vi.fn(),
}));

vi.mock(
    "@/features/transaction-importers/server/transaction-import-activity-service",
    () => ({
        deleteTransactionImportActivity: mocks.deleteTransactionImportActivity,
        listTransactionImportActivities: mocks.listTransactionImportActivities,
        synchronizeTransactionImportActivity: vi.fn(),
    }),
);

vi.mock("@/features/transactions/server/transaction-query-service", () => ({
    findStoredTransaction: mocks.findStoredTransaction,
}));

vi.mock("@/features/transactions/server/transaction-mutation-service", () => ({
    mergeTransactionsWithWorkspaceChanges: vi.fn(),
}));

vi.mock("@/features/transactions/server/transaction-save-service", () => ({
    upsertTransactionWithWorkspaceChanges: vi.fn(),
}));

vi.mock("@/features/transactions/server/transaction-child-service", () => ({
    listTransactionChildren: vi.fn(),
}));

import { deleteVenmoActivity } from "@/features/venmo/server/venmo-service";

function storedVenmoActivity(linkedTransactionId?: string) {
    return {
        activityId: "venmo:provider-1",
        createdAt: "2026-08-07T12:00:00.000Z",
        detailsJson: JSON.stringify({
            activityId: "paymentSent:provider-1",
            activityKind: "paymentSent",
            sourceMessageId: "message-1",
            sourceSubject: "You paid Sample Friend $25.00",
        }),
        detailsVersion: 2,
        direction: "outflow",
        financialFingerprint: "fingerprint-1",
        ledgerId: "ledger-1",
        linkedTransactionId,
        occurredDate: "2026-08-07",
        provider: "venmo",
        providerAmountCents: 2_500,
        providerRecordId: "provider-1",
        state: linkedTransactionId ? "unmatched" : "needsAccount",
        updatedAt: "2026-08-07T12:00:00.000Z",
    };
}

describe("deleteVenmoActivity", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.deleteTransactionImportActivity.mockResolvedValue({
            workspaceChanges: [],
        });
    });

    it("deletes an unlinked canonical importer activity", async () => {
        mocks.listTransactionImportActivities.mockResolvedValue([
            storedVenmoActivity(),
        ]);

        await deleteVenmoActivity({
            activityId: "paymentSent:provider-1",
            ledgerId: "ledger-1",
        });

        expect(mocks.deleteTransactionImportActivity).toHaveBeenCalledWith({
            activityId: "venmo:provider-1",
            ledgerId: "ledger-1",
        });
    });

    it("requires an existing linked transaction to be deleted first", async () => {
        mocks.listTransactionImportActivities.mockResolvedValue([
            storedVenmoActivity("venmo:paymentSent:provider-1"),
        ]);
        mocks.findStoredTransaction.mockResolvedValue({
            transactionId: "venmo:paymentSent:provider-1",
        });

        await expect(
            deleteVenmoActivity({
                activityId: "paymentSent:provider-1",
                ledgerId: "ledger-1",
            }),
        ).rejects.toMatchObject({ code: "venmo_activity_linked", status: 409 });
        expect(mocks.deleteTransactionImportActivity).not.toHaveBeenCalled();
    });

    it("allows cleanup after the linked transaction has been deleted", async () => {
        mocks.listTransactionImportActivities.mockResolvedValue([
            storedVenmoActivity("venmo:paymentSent:provider-1"),
        ]);
        mocks.findStoredTransaction.mockResolvedValue(null);

        await deleteVenmoActivity({
            activityId: "paymentSent:provider-1",
            ledgerId: "ledger-1",
        });

        expect(mocks.deleteTransactionImportActivity).toHaveBeenCalledWith({
            activityId: "venmo:provider-1",
            ledgerId: "ledger-1",
        });
    });
});
