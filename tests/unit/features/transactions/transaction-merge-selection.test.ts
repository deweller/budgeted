import { describe, expect, it } from "vitest";

import {
    chooseTransactionMergeContent,
    chooseTransactionMergeSurvivor,
    selectDefinedTransactionMergeText,
    selectTransactionMergeMemo,
    transactionMergeStateHasPlaidMetadata,
} from "@/features/transactions/models/transaction-merge-selection";
import { getTransactionMergeEligibility } from "@/features/transactions/models/transaction-merge-eligibility";

function createState(input: {
    categoryId?: string;
    lineCount?: number;
    memo?: string;
    plaidSyncRecords?: number;
    source?: "manual" | "plaid" | "venmo";
    transactionId: string;
    transfer?: boolean;
}) {
    const lines = Array.from({ length: input.lineCount ?? 1 }, (_, index) => ({
        categoryId: input.categoryId,
        fromAccountId: `account-${index}`,
        toAccountId: input.transfer ? `account-target-${index}` : undefined,
    }));

    return {
        children: { lines },
        plaidTransactionSyncRecords: Array.from(
            { length: input.plaidSyncRecords ?? 0 },
            () => ({}),
        ),
        transaction: {
            memo: input.memo,
            source: input.source ?? "manual",
            transactionId: input.transactionId,
        },
    };
}

describe("transaction merge selection", () => {
    it("rejects merges that include reconciled transactions", () => {
        expect(
            getTransactionMergeEligibility([
                {
                    displayAmountCents: -1_000,
                    lines: [{}],
                    status: "reconciled",
                },
                {
                    displayAmountCents: -1_000,
                    lines: [{}],
                    status: "cleared",
                },
            ]),
        ).toEqual({
            canMerge: false,
            reason: "Reconciled transactions must be unlocked before merging.",
        });
    });

    it("preserves the Plaid transaction as the survivor", () => {
        const manual = createState({ transactionId: "manual" });
        const plaid = createState({
            source: "plaid",
            transactionId: "plaid",
        });

        expect(
            chooseTransactionMergeSurvivor([manual, plaid], ["manual", "plaid"]),
        ).toBe(plaid);
        expect(transactionMergeStateHasPlaidMetadata(plaid)).toBe(true);
    });

    it("treats an attached Plaid sync record as Plaid metadata", () => {
        const state = createState({
            plaidSyncRecords: 1,
            transactionId: "transaction",
        });

        expect(transactionMergeStateHasPlaidMetadata(state)).toBe(true);
    });

    it("uses the selected content memo", () => {
        const venmo = createState({
            memo: "Dinner",
            source: "venmo",
            transactionId: "venmo",
        });
        const plaid = createState({
            memo: "Existing bank memo",
            source: "plaid",
            transactionId: "plaid",
        });

        expect(selectTransactionMergeMemo([venmo, plaid], venmo, plaid)).toBe(
            "Dinner",
        );
    });

    it("uses the importer transaction memo when the matched transaction memo is blank", () => {
        const venmo = createState({
            memo: "Editable Venmo memo",
            source: "venmo",
            transactionId: "venmo",
        });
        const plaid = createState({
            memo: " ",
            source: "plaid",
            transactionId: "plaid",
        });

        expect(selectTransactionMergeMemo([venmo, plaid], venmo, plaid)).toBe(
            "Editable Venmo memo",
        );
    });

    it("uses categorized content instead of uncategorized content", () => {
        const uncategorized = createState({
            transactionId: "uncategorized",
        });
        const categorized = createState({
            categoryId: "category-1",
            transactionId: "categorized",
        });

        expect(
            chooseTransactionMergeContent(
                [uncategorized, categorized],
                uncategorized,
            ),
        ).toBe(categorized);
    });

    it("preserves multi-line content ahead of single-line content", () => {
        const single = createState({
            categoryId: "category-1",
            transactionId: "single",
        });
        const multi = createState({
            lineCount: 2,
            transactionId: "multi",
        });

        expect(chooseTransactionMergeContent([single, multi], single)).toBe(multi);
    });

    it("uses the first non-empty memo or payee value", () => {
        expect(selectDefinedTransactionMergeText(undefined, " ", "Defined")).toBe(
            "Defined",
        );
    });
});
