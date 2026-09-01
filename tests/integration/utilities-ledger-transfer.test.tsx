import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    notifyError: vi.fn(),
    notifySuccessToast: vi.fn(),
    reconcileFullWorkspaceMutation: vi.fn(),
    completeActivity: vi.fn(),
    failActivity: vi.fn(),
    startActivity: vi.fn(),
}));

vi.mock("@/components/shared/feedback-toast-provider", () => ({
    useFeedbackToasts: () => ({
        notifyError: mocks.notifyError,
        notifySuccessToast: mocks.notifySuccessToast,
    }),
}));

vi.mock("@/components/shared/background-mutation-activity-provider", () => ({
    useBackgroundMutationActivity: () => ({
        startActivity: mocks.startActivity.mockImplementation(() => ({
            complete: mocks.completeActivity,
            fail: mocks.failActivity,
        })),
    }),
}));

vi.mock("@/components/workspace/workspace-store-provider", () => ({
    useWorkspaceStore: () => ({
        snapshot: {
            activeLedgerId: "ledger-1",
            activeLedgerName: "Household",
        },
        reconcileFullWorkspaceMutation: mocks.reconcileFullWorkspaceMutation,
    }),
}));

import { LedgerTransferPanel } from "@/components/utilities/ledger-transfer-panel";

const exportFile = {
    exportedAt: "2026-06-24T12:00:00.000Z",
    format: "budgeted-ledger-export",
    plaidPolicy: "references-only-disabled-on-import",
    records: {
        accounts: [],
        allocationFundingSources: [],
        amazonOrderIntegrations: [],
        amazonOrderSyncRuns: [],
        amazonOrders: [],
        budgetAllocations: [],
        budgetCategories: [],
        budgetGroups: [],
        budgetPeriods: [],
        ledgerPostings: [],
        plaidAccountLinks: [],
        plaidTransactionSyncs: [],
        transactionTemplates: [],
        transactionLines: [],
        transactions: [],
        venmoAccountMappings: [],
        venmoIntegrations: [],
    },
    sourceLedger: {
        createdAt: "2026-01-01T00:00:00.000Z",
        ledgerId: "source-ledger",
        name: "Source Ledger",
        updatedAt: "2026-06-24T00:00:00.000Z",
    },
    version: 2,
};

describe("LedgerTransferPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        activeLedgerId: "ledger-2",
                        activeLedgerName: "Source Ledger copy",
                        importScope: "full",
                        mode: "create",
                        recordCounts: {
                            accounts: 0,
                            allocationFundingSources: 0,
                            amazonOrderIntegrations: 0,
                            amazonOrderSyncRuns: 0,
                            amazonOrders: 0,
                            budgetAllocations: 0,
                            budgetCategories: 0,
                            budgetGroups: 0,
                            budgetPeriods: 0,
                            ledgerPostings: 0,
                            plaidAccountLinks: 0,
                            plaidTransactionSyncs: 0,
                            transactionTemplates: 0,
                            transactionLines: 0,
                            transactions: 0,
                            venmoAccountMappings: 0,
                            venmoIntegrations: 0,
                        },
                    }),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                ),
            ),
        );
    });

    it("previews an export file and imports it as a new ledger", async () => {
        const user = userEvent.setup();
        const { container } = render(<LedgerTransferPanel />);
        const fileInput = container.querySelector<HTMLInputElement>(
            'input[type="file"]',
        );

        expect(fileInput).not.toBeNull();

        await user.upload(
            fileInput!,
            new File([JSON.stringify(exportFile)], "ledger.json", {
                type: "application/json",
            }),
        );

        expect(screen.getByText("Source Ledger")).toBeInTheDocument();
        expect(
            screen.getByDisplayValue("Source Ledger copy"),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /import ledger/i }));

        await waitFor(() => {
            expect(mocks.reconcileFullWorkspaceMutation).toHaveBeenCalled();
        });

        const fetchMock = vi.mocked(fetch);
        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse(String(init?.body));

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/utilities/ledger-import",
            expect.objectContaining({ method: "POST" }),
        );
        expect(body).toMatchObject({
            importScope: "full",
            mode: "create",
            targetLedgerName: "Source Ledger copy",
        });
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Ledger imported.",
            pendingLabel: "Importing ledger…",
        });
        expect(mocks.completeActivity).toHaveBeenCalledOnce();
        expect(mocks.failActivity).not.toHaveBeenCalled();
    });

    it("starts the temporary ledger export download", async () => {
        const user = userEvent.setup();
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    downloadUrl: "https://example.test/temporary-ledger-export",
                }),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );

        render(<LedgerTransferPanel />);
        await user.click(screen.getByRole("button", { name: "Export ledger" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        const exportRequestUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
        expect(new URL(exportRequestUrl, "https://budgeted.test").pathname).toBe(
            "/api/utilities/ledger-export",
        );
        expect(
            new URL(exportRequestUrl, "https://budgeted.test").searchParams.get(
                "timeZone",
            ),
        ).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
        expect(click).toHaveBeenCalledOnce();
        expect(mocks.notifySuccessToast).toHaveBeenCalledWith(
            "Ledger export downloaded.",
        );
    });

    it("imports a budget plan workbook from the Budget Plan tab", async () => {
        const user = userEvent.setup();
        const { container } = render(<LedgerTransferPanel />);

        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    activeLedgerId: "ledger-1",
                    activeLedgerName: "Household",
                    importScope: "budgetPlan",
                    mode: "merge",
                    recordCounts: {
                        accounts: 0,
                        allocationFundingSources: 0,
                        amazonOrderIntegrations: 0,
                        amazonOrderSyncRuns: 0,
                        amazonOrders: 0,
                        budgetAllocations: 0,
                        budgetCategories: 0,
                        budgetGroups: 0,
                        budgetPeriods: 0,
                        ledgerPostings: 0,
                        plaidAccountLinks: 0,
                        plaidTransactionSyncs: 0,
                        transactionTemplates: 0,
                        transactionLines: 0,
                        transactions: 0,
                        venmoAccountMappings: 0,
                        venmoIntegrations: 0,
                    },
                }),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );

        await user.click(screen.getByRole("tab", { name: "Budget Plan" }));
        expect(
            screen.queryByRole("button", { name: "Import budget plan" }),
        ).not.toBeInTheDocument();
        const fileInput = container.querySelector<HTMLInputElement>(
            'input[type="file"]',
        );

        expect(fileInput).not.toBeNull();
        await user.upload(
            fileInput!,
            new File(["workbook"], "budget-plan.xlsx", {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
        );
        expect(screen.getByText("budget-plan.xlsx")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Clear file" }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole("button", { name: /import budget plan/i }),
        );

        await waitFor(() => {
            expect(mocks.reconcileFullWorkspaceMutation).toHaveBeenCalled();
        });

        const fetchMock = vi.mocked(fetch);
        const [, init] = fetchMock.mock.calls[0];

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/utilities/budget-plan-workbook",
            expect.objectContaining({
                body: expect.any(FormData),
                method: "POST",
            }),
        );
        expect((init?.body as FormData).get("file")).toMatchObject({
            name: "budget-plan.xlsx",
        });
        expect(mocks.completeActivity).toHaveBeenCalledOnce();
    });
});
