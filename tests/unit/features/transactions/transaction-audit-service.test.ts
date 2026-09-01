// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    auditLogPut: vi.fn(),
    auditLogPutGo: vi.fn(),
    listPlaidTransactionSyncsForTransaction: vi.fn(),
    listTransactionChildren: vi.fn(),
}));

vi.mock(
    "@/features/plaid/server/plaid-transaction-sync-record-service",
    () => ({
        listPlaidTransactionSyncsForTransaction:
            mocks.listPlaidTransactionSyncsForTransaction,
    }),
);

vi.mock("@/features/transactions/server/transaction-child-service", () => ({
    listTransactionChildren: mocks.listTransactionChildren,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            transactionAuditLogs: {
                put: mocks.auditLogPut,
            },
        },
    }),
}));

import {
    captureTransactionAuditAggregate,
    writeTransactionAuditLog,
} from "@/features/transactions/server/transaction-audit-service";

describe("transaction audit service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auditLogPut.mockReturnValue({ go: mocks.auditLogPutGo });
        mocks.auditLogPutGo.mockResolvedValue(undefined);
        mocks.listPlaidTransactionSyncsForTransaction.mockResolvedValue([]);
        mocks.listTransactionChildren.mockResolvedValue({
            lines: [],
            postings: [],
        });
    });

    it("captures an audit aggregate from an already loaded transaction", async () => {
        const transaction = {
            memo: "Amazon order",
            plaidTransactionSyncId: "sync-1",
            transactionId: "transaction-1",
        };

        const aggregate = await captureTransactionAuditAggregate({
            ledgerId: "ledger-1",
            transaction,
        });

        expect(aggregate.transaction).toBe(transaction);
        expect(mocks.listTransactionChildren).toHaveBeenCalledWith(
            "ledger-1",
            "transaction-1",
        );
        expect(
            mocks.listPlaidTransactionSyncsForTransaction,
        ).toHaveBeenCalledWith("ledger-1", "transaction-1", "sync-1");
    });

    it("writes transaction audit records with summaries and aggregate snapshots", async () => {
        await writeTransactionAuditLog({
            action: "update",
            actorUserId: "owner-1",
            after: {
                ledgerPostings: [],
                plaidTransactionSyncs: [],
                transaction: {
                    memo: "New memo",
                    transactionId: "transaction-1",
                },
                transactionLines: [],
            },
            before: {
                ledgerPostings: [],
                plaidTransactionSyncs: [],
                transaction: {
                    memo: "Old memo",
                    transactionId: "transaction-1",
                },
                transactionLines: [],
            },
            ledgerId: "ledger-1",
            source: "manual",
            summary: {
                transactionId: "transaction-1",
            },
            transactionId: "transaction-1",
        });

        expect(mocks.auditLogPut).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "update",
                actorUserId: "owner-1",
                ledgerId: "ledger-1",
                source: "manual",
                transactionId: "transaction-1",
            }),
        );
        const record = mocks.auditLogPut.mock.calls[0]?.[0];

        expect(JSON.parse(String(record.summaryJson))).toEqual({
            transactionId: "transaction-1",
        });
        expect(JSON.parse(String(record.beforeJson)).transaction.memo).toBe(
            "Old memo",
        );
        expect(JSON.parse(String(record.afterJson)).transaction.memo).toBe(
            "New memo",
        );
    });

    it("stores one bulk audit record with transaction ids", async () => {
        await writeTransactionAuditLog({
            action: "bulkDelete",
            ledgerId: "ledger-1",
            source: "manual",
            summary: {
                deletedCount: 2,
            },
            transactionIds: ["transaction-1", "transaction-2"],
        });

        const record = mocks.auditLogPut.mock.calls[0]?.[0];

        expect(record.beforeJson).toBeUndefined();
        expect(record.afterJson).toBeUndefined();
        expect(JSON.parse(String(record.transactionIdsJson))).toEqual([
            "transaction-1",
            "transaction-2",
        ]);
    });
});
