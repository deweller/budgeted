import { describe, expect, it } from "vitest";

import {
    createTransactionAggregateMetadata,
    createTransactionAggregateRevision,
    hasValidTransactionAggregateMetadata,
    hasValidWorkspaceTransactionAggregates,
    withCanonicalTransactionAggregateMetadata,
} from "@/features/transactions/models/transaction-aggregate-revision";

function createRevisionInput() {
    return {
        ledgerPostings: [
            { amountCents: -100, postingId: "posting-b" },
            { amountCents: 100, postingId: "posting-a" },
        ],
        plaidTransactionSyncs: [
            { plaidTransactionSyncId: "sync-b", updatedAt: "2026-07-16" },
            { plaidTransactionSyncId: "sync-a", updatedAt: "2026-07-15" },
        ],
        transaction: {
            source: "plaid",
            transactionId: "transaction-1",
            updatedAt: "2026-07-16",
        },
        transactionLines: [
            { amountCents: -100, lineId: "line-b" },
            { amountCents: 100, lineId: "line-a" },
        ],
    };
}

describe("createTransactionAggregateRevision", () => {
    it("is independent of child record query order", () => {
        const input = createRevisionInput();

        expect(createTransactionAggregateRevision(input)).toBe(
            createTransactionAggregateRevision({
                ...input,
                ledgerPostings: [...input.ledgerPostings].reverse(),
                plaidTransactionSyncs: [...input.plaidTransactionSyncs].reverse(),
                transactionLines: [...input.transactionLines].reverse(),
            }),
        );
    });

    it("ignores hydrated child views on the transaction record", () => {
        const input = createRevisionInput();

        expect(
            createTransactionAggregateRevision({
                ...input,
                transaction: {
                    ...input.transaction,
                    lines: input.transactionLines,
                    postings: input.ledgerPostings,
                },
            }),
        ).toBe(createTransactionAggregateRevision(input));
    });

    it("uses the same aggregate proof for stored sentinels and public records", () => {
        const input = createRevisionInput();
        const stored = {
            ...input,
            transaction: {
                ...input.transaction,
                referenceCategoryId: "__uncategorized__",
            },
            transactionLines: [
                {
                    ...input.transactionLines[0]!,
                    categoryId: "__no_category__",
                    fromAccountId: "__no_from_account__",
                    toAccountId: "account-1",
                },
                {
                    ...input.transactionLines[1]!,
                    categoryId: "category-1",
                    fromAccountId: "account-1",
                    toAccountId: "__no_to_account__",
                },
            ],
        };
        const publicRecords = {
            ...stored,
            transaction: { ...input.transaction },
            transactionLines: [
                {
                    ...input.transactionLines[0]!,
                    toAccountId: "account-1",
                },
                {
                    ...input.transactionLines[1]!,
                    categoryId: "category-1",
                    fromAccountId: "account-1",
                },
            ],
        };

        expect(createTransactionAggregateMetadata(stored)).toEqual(
            createTransactionAggregateMetadata(publicRecords),
        );
    });

    it.each([
        ["transaction", (input: ReturnType<typeof createRevisionInput>) => ({
            ...input,
            transaction: { ...input.transaction, updatedAt: "2026-07-17" },
        })],
        ["line", (input: ReturnType<typeof createRevisionInput>) => ({
            ...input,
            transactionLines: [
                { ...input.transactionLines[0]!, amountCents: -200 },
                input.transactionLines[1]!,
            ],
        })],
        ["posting", (input: ReturnType<typeof createRevisionInput>) => ({
            ...input,
            ledgerPostings: [
                { ...input.ledgerPostings[0]!, amountCents: -200 },
                input.ledgerPostings[1]!,
            ],
        })],
        ["Plaid sync", (input: ReturnType<typeof createRevisionInput>) => ({
            ...input,
            plaidTransactionSyncs: [
                { ...input.plaidTransactionSyncs[0]!, updatedAt: "2026-07-17" },
                input.plaidTransactionSyncs[1]!,
            ],
        })],
    ])("changes when the %s state changes", (_name, mutate) => {
        const input = createRevisionInput();

        expect(createTransactionAggregateRevision(mutate(input))).not.toBe(
            createTransactionAggregateRevision(input),
        );
    });

    it("persists independently verifiable line, posting, and Plaid metadata", () => {
        const input = createRevisionInput();
        const metadata = createTransactionAggregateMetadata(input);

        expect(
            hasValidTransactionAggregateMetadata({
                ...input,
                transaction: { ...input.transaction, ...metadata },
            }),
        ).toBe(true);
        expect(
            hasValidTransactionAggregateMetadata({
                ...input,
                transactionLines: [
                    { ...input.transactionLines[0]!, amountCents: -200 },
                    input.transactionLines[1]!,
                ],
                transaction: { ...input.transaction, ...metadata },
            }),
        ).toBe(false);
    });

    it("validates all full-snapshot aggregates and rejects orphaned children", () => {
        const input = createRevisionInput();
        const ledgerPostings = input.ledgerPostings.map((posting) => ({
            ...posting,
            transactionId: input.transaction.transactionId,
        }));
        const plaidTransactionSyncs = input.plaidTransactionSyncs.map((sync) => ({
            ...sync,
            transactionId: input.transaction.transactionId,
        }));
        const transactionLines = input.transactionLines.map((line) => ({
            ...line,
            transactionId: input.transaction.transactionId,
        }));
        const transaction = {
            ...input.transaction,
            ...createTransactionAggregateMetadata({
                ledgerPostings,
                plaidTransactionSyncs,
                transaction: input.transaction,
                transactionLines,
            }),
        };

        expect(
            hasValidWorkspaceTransactionAggregates({
                ledgerPostings,
                plaidTransactionSyncs,
                transactionLines,
                transactions: [transaction],
            }),
        ).toBe(true);
        expect(
            hasValidWorkspaceTransactionAggregates({
                ledgerPostings: [
                    ...ledgerPostings,
                    {
                        amountCents: 1,
                        postingId: "orphan",
                        transactionId: "missing-transaction",
                    },
                ],
                plaidTransactionSyncs,
                transactionLines,
                transactions: [transaction],
            }),
        ).toBe(false);
    });

    it("rebuilds canonical server metadata for an existing transaction", () => {
        const input = createRevisionInput();
        const ledgerPostings = input.ledgerPostings.map((posting) => ({
            ...posting,
            transactionId: input.transaction.transactionId,
        }));
        const plaidTransactionSyncs = input.plaidTransactionSyncs.map((sync) => ({
            ...sync,
            transactionId: input.transaction.transactionId,
        }));
        const transactionLines = input.transactionLines.map((line) => ({
            ...line,
            transactionId: input.transaction.transactionId,
        }));
        const [transaction] = withCanonicalTransactionAggregateMetadata({
            ledgerPostings,
            plaidTransactionSyncs,
            transactionLines,
            transactions: [
                {
                    ...input.transaction,
                    aggregateLineCount: 99,
                    aggregateRevision: "stale",
                },
            ],
        });

        expect(
            hasValidTransactionAggregateMetadata({
                ledgerPostings,
                plaidTransactionSyncs,
                transaction: transaction!,
                transactionLines,
            }),
        ).toBe(true);
    });
});
