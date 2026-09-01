import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    AmazonOrdersWorkspace,
    UtilitiesWorkspace,
} from "@/components/workspace/workspace-views";
import { FeedbackToastProvider } from "@/components/shared/feedback-toast-provider";
import { WorkspaceStoreProvider } from "@/components/workspace/workspace-store-provider";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";
import {
    createIntegrationWorkspaceMutationResponse,
    withIntegrationWorkspaceKnowledge,
} from "./helpers/workspace-mutation-response";

function makeSnapshot(): WorkspaceSnapshot {
    return withIntegrationWorkspaceKnowledge({
        accounts: [
            {
                accountId: "amazon-card",
                accountType: "creditCard",
                balanceCents: -2500,
                createdAt: "2026-06-01T00:00:00.000Z",
                ledgerAccountId: "acct_amazon_card",
                name: "Amazon Visa",
                openedOn: "2026-01-01",
                openingBalanceCents: 0,
                updatedAt: "2026-06-01T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        activeLedgerId: "ledger-1",
        activeLedgerName: "Ledger",
        allocationFundingSources: [],
        amazonOrderIntegrations: [
            {
                accountId: "amazon-card",
                createdAt: "2026-06-01T00:00:00.000Z",
                integrationId: "amazon-orders",
                latestBudgetedImportAt: "2026-06-20T12:00:00.000Z",
                latestBudgetedImportStatus: "succeeded",
                updatedAt: "2026-06-20T12:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
        transactionImportActivities: [
            {
                activityId: "amazon:amazon-payment-1",
                candidateTransactionIdsJson: JSON.stringify(["transaction-1", "transaction-2"]),
                createdAt: "2026-06-20T12:00:00.000Z",
                detailsJson: JSON.stringify({ itemSummary: "USB cable", orderNumber: "111-222", paymentKind: "charge" }),
                detailsVersion: 2,
                direction: "outflow",
                financialFingerprint: "amazon-payment-1",
                ledgerId: "ledger-1",
                occurredDate: "2026-06-19",
                provider: "amazon",
                providerAmountCents: -2500,
                providerRecordId: "amazon-payment-1",
                state: "conflict",
                updatedAt: "2026-06-20T12:00:00.000Z",
            },
            {
                activityId: "amazon:amazon-payment-2",
                candidateTransactionIdsJson: JSON.stringify([]),
                createdAt: "2026-06-20T12:00:00.000Z",
                detailsJson: JSON.stringify({ itemSummary: "Keyboard cover", orderNumber: "333-444", paymentKind: "charge" }),
                detailsVersion: 2,
                direction: "outflow",
                financialFingerprint: "amazon-payment-2",
                ledgerId: "ledger-1",
                occurredDate: "2026-06-18",
                provider: "amazon",
                providerAmountCents: -1700,
                providerRecordId: "amazon-payment-2",
                state: "unmatched",
                updatedAt: "2026-06-20T12:00:00.000Z",
            },
            {
                activityId: "amazon:amazon-payment-3",
                candidateTransactionIdsJson: JSON.stringify(["transaction-3"]),
                createdAt: "2026-06-20T12:00:00.000Z",
                detailsJson: JSON.stringify({ itemSummary: "Returned notebook", orderNumber: "555-666", paymentKind: "refund" }),
                detailsVersion: 2,
                direction: "inflow",
                financialFingerprint: "amazon-payment-3",
                ledgerId: "ledger-1",
                linkedTransactionId: "transaction-3",
                occurredDate: "2026-06-17",
                provider: "amazon",
                providerAmountCents: 1200,
                providerRecordId: "amazon-payment-3",
                state: "autoMatched",
                updatedAt: "2026-06-20T12:00:00.000Z",
            },
        ],
        amazonOrderSyncRuns: [],
        amazonOrders: [],
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
            changeCursor: "",
            entityCounts: {},
            generatedAt: "2026-06-20T12:00:00.000Z",
            retainedChangesAfter: "2026-05-20T12:00:00.000Z",
            revision: "test-revision",
        },
        ledgerPostings: [],
        ledgers: [
            {
                createdAt: "2026-01-01T00:00:00.000Z",
                isDefault: true,
                ledgerId: "ledger-1",
                name: "Ledger",
                status: "active",
                updatedAt: "2026-06-01T00:00:00.000Z",
                workspaceId: "global",
            },
        ],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionLines: [],
        transactions: [
            {
                displayAmountCents: -2500,
                enteredAt: "2026-06-19T00:00:00.000Z",
                kind: "standard",
                occurredAt: "2026-06-19T00:00:00.000Z",
                payee: "Amazon",
                periodId: "2026-06",
                postings: [],
                referenceAccountId: "amazon-card",
                source: "plaid",
                status: "entered",
                lines: [],
                transactionId: "transaction-1",
                updatedAt: "2026-06-19T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                displayAmountCents: -2500,
                enteredAt: "2026-06-20T00:00:00.000Z",
                kind: "standard",
                occurredAt: "2026-06-20T00:00:00.000Z",
                payee: "Amazon Marketplace",
                periodId: "2026-06",
                postings: [],
                referenceAccountId: "amazon-card",
                source: "plaid",
                status: "entered",
                lines: [],
                transactionId: "transaction-2",
                updatedAt: "2026-06-20T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                displayAmountCents: 1200,
                enteredAt: "2026-06-17T00:00:00.000Z",
                kind: "standard",
                occurredAt: "2026-06-17T00:00:00.000Z",
                payee: "Amazon refund",
                periodId: "2026-06",
                postings: [],
                referenceAccountId: "amazon-card",
                source: "plaid",
                status: "entered",
                lines: [],
                transactionId: "transaction-3",
                updatedAt: "2026-06-17T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ],
    });
}

function renderWithWorkspace(snapshot: WorkspaceSnapshot) {
    return render(
        <FeedbackToastProvider>
            <WorkspaceStoreProvider initialSnapshot={snapshot}>
                <AmazonOrdersWorkspace />
            </WorkspaceStoreProvider>
        </FeedbackToastProvider>,
    );
}

describe("Amazon orders utilities workspace", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);

                if (url.includes("/manifest")) {
                    return {
                        ok: true,
                        headers: new Headers(),
                        json: async () => ({
                            lastSuccessfulSyncAt:
                                "2026-06-20T12:00:00.000Z",
                            state: "complete",
                        }),
                    };
                }

                if (url === "/api/transactions/references") {
                    const requestedIds = new Set(
                        (
                            JSON.parse(String(init?.body)) as {
                                transactionIds: string[];
                            }
                        ).transactionIds,
                    );

                    return {
                        ok: true,
                        headers: new Headers(),
                        json: async () => ({
                            references: makeSnapshot().transactions
                                .filter((transaction) =>
                                    requestedIds.has(transaction.transactionId),
                                )
                                .map((transaction) => ({
                                    accountIds: [
                                        transaction.referenceAccountId,
                                    ],
                                    displayAmountCents:
                                        transaction.displayAmountCents,
                                    occurredAt: transaction.occurredAt,
                                    payee: transaction.payee,
                                    transactionId: transaction.transactionId,
                                })),
                        }),
                    };
                }

                if (url.includes("/match")) {
                    return {
                        ok: true,
                        headers: new Headers(),
                        json: async () =>
                            createIntegrationWorkspaceMutationResponse({
                                snapshot: makeSnapshot(),
                            }),
                    };
                }

                return {
                    ok: true,
                    headers: new Headers(),
                    json: async () => ({
                        activeLedgerId: "ledger-1",
                        changeCursor: "",
                        entityCounts: {},
                        generatedAt: "2026-06-20T12:00:00.000Z",
                        retainedChangesAfter: "2026-05-20T12:00:00.000Z",
                        revision: "test-revision",
                    }),
                };
            }),
        );
    });

    it("renders the Utilities landing link to Transaction Importers", () => {
        render(<UtilitiesWorkspace />);

        expect(
            screen.getByRole("link", { name: /transaction importers/i }),
        ).toHaveAttribute("href", "/utilities/transaction-importers");
    });

    it("shows imported Amazon payments and applies a manual conflict match", async () => {
        const user = userEvent.setup();
        renderWithWorkspace(makeSnapshot());

        const table = screen.getByRole("table");

        expect(within(table).getByText("111-222")).toBeInTheDocument();
        expect(within(table).getByText("USB cable")).toBeInTheDocument();
        expect(within(table).getByText("Needs review")).toBeInTheDocument();
        expect(within(table).queryByText("333-444")).not.toBeInTheDocument();
        expect(within(table).queryByText("555-666")).not.toBeInTheDocument();

        await user.selectOptions(
            screen.getByRole("combobox", {
                name: /choose match for amazon order 111-222/i,
            }),
            "transaction-2",
        );
        await user.click(screen.getByRole("button", { name: /apply/i }));

        expect(fetch).toHaveBeenCalledWith(
            "/api/extras/amazon-orders/payments/amazon-payment-1/match",
            expect.objectContaining({
                body: JSON.stringify({ transactionId: "transaction-2" }),
                method: "PUT",
            }),
        );
    });

    it("loads candidate labels when the workspace snapshot is configuration-only", async () => {
        const snapshot = makeSnapshot();
        snapshot.ledgerPostings = [];
        snapshot.plaidTransactionSyncs = [];
        snapshot.transactionHydration = "configuration";
        snapshot.transactionLines = [];
        snapshot.transactions = [];

        renderWithWorkspace(snapshot);

        const candidateSelector = screen.getByRole("combobox", {
            name: /choose match for amazon order 111-222/i,
        });

        expect(
            await within(candidateSelector).findByRole("option", {
                name: "06/19/2026 - Amazon - -$25.00",
            }),
        ).toBeInTheDocument();
        expect(
            within(candidateSelector).getByRole("option", {
                name: "06/20/2026 - Amazon Marketplace - -$25.00",
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Missing transaction")).not.toBeInTheDocument();
    });

    it("filters Amazon payments by match status", async () => {
        const user = userEvent.setup();
        renderWithWorkspace(makeSnapshot());

        expect(
            screen.getByRole("button", { name: "Needs review" }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("111-222")).toBeInTheDocument();
        expect(screen.queryByText("333-444")).not.toBeInTheDocument();
        expect(screen.queryByText("555-666")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Unmatched" }));

        expect(
            screen.getByRole("button", { name: "Unmatched" }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(screen.queryByText("111-222")).not.toBeInTheDocument();
        expect(screen.getByText("333-444")).toBeInTheDocument();
        expect(screen.queryByText("555-666")).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "All transactions" }),
        );

        expect(
            screen.getByRole("button", { name: "All transactions" }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("111-222")).toBeInTheDocument();
        expect(screen.getByText("333-444")).toBeInTheDocument();
        expect(screen.getByText("555-666")).toBeInTheDocument();
    });
});
