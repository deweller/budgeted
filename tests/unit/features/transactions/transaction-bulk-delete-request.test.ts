import { describe, expect, it } from "vitest";

import { createBulkTransactionDeleteRequestDigest } from "@/features/transactions/server/transaction-delete-service";

describe("bulk transaction delete request identity", () => {
    it("normalizes reordered and duplicate transaction IDs", () => {
        const first = createBulkTransactionDeleteRequestDigest({
            ledgerId: "ledger-1",
            mutationType: "transaction.bulkDelete",
            previewRevision: "preview-1",
            transactionIds: ["transaction-2", "transaction-1", "transaction-1"],
        });
        const second = createBulkTransactionDeleteRequestDigest({
            ledgerId: "ledger-1",
            mutationType: "transaction.bulkDelete",
            previewRevision: "preview-1",
            transactionIds: ["transaction-1", "transaction-2"],
        });

        expect(first).toBe(second);
    });

    it("binds the digest to the preview revision, target set, and mutation type", () => {
        const request = {
            ledgerId: "ledger-1",
            mutationType: "transaction.bulkDelete",
            previewRevision: "preview-1",
            transactionIds: ["transaction-1", "transaction-2"],
        };
        const digest = createBulkTransactionDeleteRequestDigest(request);

        expect(
            createBulkTransactionDeleteRequestDigest({
                ...request,
                previewRevision: "preview-2",
            }),
        ).not.toBe(digest);
        expect(
            createBulkTransactionDeleteRequestDigest({
                ...request,
                transactionIds: ["transaction-1"],
            }),
        ).not.toBe(digest);
        expect(
            createBulkTransactionDeleteRequestDigest({
                ...request,
                mutationType: "transaction.categorize",
            }),
        ).not.toBe(digest);
    });
});
