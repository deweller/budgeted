import { describe, expect, it } from "vitest";

import { buildReportingViewFromSnapshot } from "@/lib/workspace/reporting-projector";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

const generatedAt = "2026-05-22T00:00:00.000Z";

function makeSnapshot(
    transactionOccurredAt: string,
): WorkspaceSnapshot {
    const account = {
        accountId: "account-1",
        accountType: "checking" as const,
        balanceCents: 0,
        createdAt: generatedAt,
        ledgerAccountId: "acct_checking",
        ledgerId: "ledger-1",
        name: "Checking",
        openedOn: "2026-01-01",
        openingBalanceCents: 0,
        updatedAt: generatedAt,
    };
    const transaction = {
        displayAmountCents: -1_000,
        enteredAt: transactionOccurredAt,
        kind: "standard" as const,
        ledgerId: "ledger-1",
        lines: [],
        occurredAt: transactionOccurredAt,
        payee: "Market",
        periodId: "2026-05",
        postings: [
            {
                amountCents: 1_000,
                createdAt: generatedAt,
                direction: "credit" as const,
                ledgerAccountId: "acct_checking",
                ledgerAccountKind: "financial" as const,
                ledgerId: "ledger-1",
                occurredAt: transactionOccurredAt,
                periodId: "2026-05",
                postingId: "posting-1",
                transactionId: "transaction-1",
            },
        ],
        referenceAccountId: "account-1",
        status: "entered" as const,
        transactionId: "transaction-1",
        updatedAt: generatedAt,
    };

    return {
        accounts: [account],
        activeLedgerId: "ledger-1",
        activeLedgerName: "2026",
        allocationFundingSources: [],
        budgetAllocations: [],
        budgetCategories: [],
        budgetGroups: [],
        budgetPeriods: [],
        knowledge: {
            entityDigests: {},
            entityRevisions: {},
            oldestRetainedWorkspaceRevision: 0,
            workspaceGeneration: 1,
            workspaceRevision: 0,
            activeLedgerId: "ledger-1",
            changeCursor: "change-1",
            entityCounts: {
                account: 1,
                transaction: 1,
            },
            generatedAt,
            retainedChangesAfter: "2026-04-22T00:00:00.000Z",
            revision: "test",
        },
        ledgerPostings: transaction.postings,
        ledgers: [
            {
                createdAt: generatedAt,
                isDefault: true,
                ledgerId: "ledger-1",
                name: "2026",
                status: "active",
                updatedAt: generatedAt,
                workspaceId: "global",
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [transaction],
    };
}

describe("workspace reporting projector", () => {
    it("includes stored UTC-midnight transactions in their saved date range", () => {
        const view = buildReportingViewFromSnapshot(
            makeSnapshot("2026-05-22T00:00:00.000Z"),
            {
                accountId: "account-1",
                endDate: "2026-05-22",
                startDate: "2026-05-22",
            },
        );

        expect(view.outflowCents).toBe(1_000);
        expect(view.hasReportableActivity).toBe(true);
    });
});
