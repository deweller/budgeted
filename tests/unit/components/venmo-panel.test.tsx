import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    applyWorkspaceMutationResponse: vi.fn(),
    notifyError: vi.fn(),
    snapshot: {} as Record<string, unknown>,
}));

vi.mock("@/components/shared/feedback-toast-provider", () => ({
    useFeedbackToasts: () => ({ notifyError: mocks.notifyError }),
}));

vi.mock("@/components/workspace/workspace-store-provider", () => ({
    useWorkspaceStore: () => ({
        applyWorkspaceMutationResponse: mocks.applyWorkspaceMutationResponse,
        snapshot: mocks.snapshot,
    }),
}));

function createSnapshot(
    activityOverrides: Record<string, unknown> = {},
    snapshotOverrides: Record<string, unknown> = {},
) {
    return {
            accounts: [
                {
                    accountId: "checking-1",
                    accountType: "checking",
                    name: "Checking",
                },
                {
                    accountId: "card-1",
                    accountType: "creditCard",
                    name: "Rewards Card",
                },
            ],
            transactions: [],
            venmoAccountMappings: [],
            transactionImportActivities: [
                {
                    activityId: "venmo:provider-1",
                    createdAt: "2026-08-07T12:00:00.000Z",
                    detailsJson: JSON.stringify({
                        activityId: "paymentSent:provider-1",
                        activityKind: "paymentSent",
                        fundingInstitution: "Sample Bank",
                        fundingLast4: "1234",
                        sourceMessageId: "message-1",
                        sourceSubject: "You paid Sample Friend $25.00",
                    }),
                    detailsVersion: 2,
                    direction: "outflow",
                    financialFingerprint: "venmo-provider-1",
                    ledgerId: "ledger-1",
                    occurredDate: "2026-08-07",
                    provider: "venmo",
                    providerAmountCents: 2_500,
                    providerRecordId: "provider-1",
                    state: "needsAccount",
                    updatedAt: "2026-08-07T12:00:00.000Z",
                    ...activityOverrides,
                },
            ],
            venmoIntegrations: [],
            ...snapshotOverrides,
        };
}

import { VenmoPanel } from "@/components/utilities/venmo-panel";

describe("VenmoPanel account mapping", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.snapshot = createSnapshot();
        vi.stubGlobal("fetch", vi.fn());
    });

    it("uses the standard account combobox and keeps the dialog open after an error", async () => {
        const user = userEvent.setup();
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: {
                        code: "venmo_mapping_failed",
                        message: "Mapping reconciliation failed.",
                    },
                }),
                { status: 500 },
            ),
        );

        render(<VenmoPanel />);
        expect(
            screen.getByText(/The forwarding recipient is configured per deployment/),
        ).toBeVisible();
        await user.click(screen.getByRole("button", { name: "Map account" }));

        const accountChooser = screen.getByRole("combobox", {
            name: "Budgeted account",
        });
        expect(accountChooser).toHaveValue("Checking");

        await user.click(accountChooser);
        await user.click(screen.getByRole("option", { name: /Rewards Card/ }));
        expect(accountChooser).toHaveValue("Rewards Card");

        await user.click(screen.getByRole("button", { name: "Save mapping" }));

        expect(fetch).toHaveBeenCalledWith(
            "/api/utilities/venmo/account-mappings",
            expect.objectContaining({
                body: JSON.stringify({
                    accountId: "card-1",
                    externalAccountKey: "sample bank:1234",
                }),
                method: "PUT",
            }),
        );
        expect(mocks.notifyError).toHaveBeenCalledWith(
            expect.objectContaining({ message: "Mapping reconciliation failed." }),
        );
        expect(
            screen.getByRole("dialog", { name: "Map external Venmo account" }),
        ).toBeInTheDocument();
    });

    it("explains inferred Plaid account resolution separately from saved mappings", async () => {
        const user = userEvent.setup();
        mocks.snapshot = createSnapshot(
            {
                linkedTransactionId: "venmo:paymentSent:provider-1",
                state: "unmatched",
            },
            {
                accounts: [
                    {
                        accountId: "checking-1",
                        accountType: "checking",
                        name: "Checking",
                        plaidAccountLinkId: "plaid-link-1",
                        plaidAccountMask: "1234",
                        plaidInstitutionName: "Sample Bank",
                    },
                ],
                transactions: [
                    {
                        referenceAccountId: "checking-1",
                        source: "venmo",
                        transactionId: "venmo:paymentSent:provider-1",
                    },
                ],
            },
        );

        render(<VenmoPanel />);
        await user.click(screen.getByRole("button", { name: "Awaiting Plaid" }));

        expect(screen.getByText("Awaiting Plaid transaction")).toBeVisible();
        expect(
            screen.getByText("Checking · Matched from Plaid account details"),
        ).toBeVisible();
        expect(
            screen.getByText(/Only mappings you explicitly save appear here/),
        ).toBeVisible();
        expect(
            screen.getByText("No explicit account mappings have been saved."),
        ).toBeVisible();
    });

    it("deletes an unmatched Venmo transaction before removing its importer activity", async () => {
        const user = userEvent.setup();
        mocks.snapshot = createSnapshot(
            {
                linkedTransactionId: "venmo:paymentSent:provider-1",
                state: "unmatched",
            },
            {
                transactions: [
                    {
                        referenceAccountId: "checking-1",
                        source: "venmo",
                        transactionId: "venmo:paymentSent:provider-1",
                    },
                ],
            },
        );
        vi.mocked(fetch)
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        affectedPeriods: ["2026-08"],
                        crossAreaEffects: [],
                        dependentCounts: [],
                        isPermanent: true,
                        permanentWarning: "Permanent",
                        preservedRecords: [],
                        previewRevision: "preview-1",
                        target: {
                            displayName: "Sample Friend",
                            sectionId: "transactions",
                            targetId: "venmo:paymentSent:provider-1",
                            targetType: "transaction",
                        },
                    }),
                ),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({})))
            .mockResolvedValueOnce(new Response(JSON.stringify({})));

        render(<VenmoPanel />);
        await user.click(screen.getByRole("button", { name: "Awaiting Plaid" }));
        await user.click(screen.getByRole("button", { name: "Delete" }));
        await screen.findByRole("dialog", { name: "Delete Venmo activity?" });
        await user.click(
            screen.getByRole("button", { name: "Delete Venmo activity" }),
        );

        expect(fetch).toHaveBeenNthCalledWith(
            1,
            "/api/transactions/venmo%3ApaymentSent%3Aprovider-1",
        );
        expect(fetch).toHaveBeenNthCalledWith(
            2,
            "/api/transactions/venmo%3ApaymentSent%3Aprovider-1",
            expect.objectContaining({
                body: JSON.stringify({ previewRevision: "preview-1" }),
                method: "DELETE",
            }),
        );
        expect(fetch).toHaveBeenNthCalledWith(
            3,
            "/api/utilities/venmo/activities/paymentSent%3Aprovider-1",
            { method: "DELETE" },
        );
        expect(mocks.applyWorkspaceMutationResponse).toHaveBeenCalledTimes(2);
    });
});
