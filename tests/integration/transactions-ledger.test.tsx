import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockPlaidLinkOptions = {
    onExit?: (error: null) => void;
    onLoad?: () => void;
    onSuccess?: (
        publicToken: string | null,
        metadata: {
            accounts: Array<{
                id: string;
                mask?: string;
                name?: string;
                subtype?: string;
            }>;
            institution: { institution_id: string; name: string };
        },
    ) => void;
    token: string | null;
};

const mocks = vi.hoisted(() => ({
    completeActivity: vi.fn(),
    failActivity: vi.fn(),
    lastPlaidOptions: null as MockPlaidLinkOptions | null,
    plaidExit: vi.fn(),
    plaidOpen: vi.fn(),
    plaidSubmit: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    startActivity: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/transactions/all-accounts",
    useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("react-plaid-link", () => ({
    usePlaidLink: (options: MockPlaidLinkOptions) => {
        mocks.lastPlaidOptions = options;

        return {
            error: null,
            exit: mocks.plaidExit,
            open: mocks.plaidOpen,
            ready: true,
            submit: mocks.plaidSubmit,
        };
    },
}));

vi.mock("@/components/shared/background-mutation-activity-provider", () => ({
    useBackgroundMutationActivity: () => ({
        activities: [],
        startActivity: mocks.startActivity,
    }),
}));

import { AccountsTable } from "@/components/accounts/accounts-table";
import { FeedbackToastProvider } from "@/components/shared/feedback-toast-provider";
import { AccountTransactionStatusBar } from "@/components/transactions/account-transaction-status-bar";
import { TransactionAccountSelector } from "@/components/transactions/transaction-account-selector";
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
import { TransactionInlineEditor } from "@/components/transactions/transaction-inline-editor";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import {
    WorkspaceStoreProvider,
    useWorkspaceStore,
} from "@/components/workspace/workspace-store-provider";
import type { TransactionWithPostings } from "@/features/transactions/server/transaction-write-model";
import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import type { TransactionImportActivityRecord } from "@/features/transaction-importers/models/transaction-importer-contract";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

function createTestImportActivity(input: {
    counterparty?: string;
    itemSummary?: string;
    memo?: string;
    provider: "amazon" | "venmo";
    providerAmountCents?: number;
    providerRecordId: string;
}): TransactionImportActivityRecord {
    const timestamp = "2026-05-22T12:00:00.000Z";
    const providerAmountCents = input.providerAmountCents ?? -2_500;
    const venmoActivityKind =
        providerAmountCents > 0 ? "paymentReceived" : "paymentSent";
    return {
        activityId: `${input.provider}:${input.providerRecordId}`,
        counterparty: input.counterparty,
        createdAt: timestamp,
        detailsJson: JSON.stringify(
            input.provider === "amazon"
                ? {
                      itemSummary: input.itemSummary ?? "Amazon purchase",
                      orderNumber: "111-222",
                      paymentKind: "charge",
                  }
                : {
                      activityId: `${venmoActivityKind}:${input.providerRecordId}`,
                      activityKind: venmoActivityKind,
                      sourceMessageId: "message-1",
                      sourceSubject: "Venmo payment",
                  },
        ),
        detailsVersion: 2,
        direction: "outflow",
        financialFingerprint: `${input.provider}:${input.providerRecordId}:fingerprint`,
        ledgerId: "ledger-1",
        linkedTransactionId: "transaction-1",
        memo: input.memo,
        occurredDate: "2026-05-22",
        provider: input.provider,
        providerAmountCents,
        providerRecordId: input.providerRecordId,
        state: "manualMatched",
        updatedAt: timestamp,
    };
}
import {
    createIntegrationWorkspaceMutationResponse,
    withIntegrationWorkspaceKnowledge,
} from "./helpers/workspace-mutation-response";

function renderWithFeedback(ui: ReactElement) {
    return render(<FeedbackToastProvider>{ui}</FeedbackToastProvider>);
}

function renderWithWorkspace(ui: ReactElement, snapshot: WorkspaceSnapshot) {
    return renderWithFeedback(
        <WorkspaceStoreProvider initialSnapshot={snapshot}>
            {ui}
        </WorkspaceStoreProvider>,
    );
}

function WorkspaceAccountsTable() {
    const { snapshot } = useWorkspaceStore();

    return <AccountsTable accounts={snapshot.accounts} />;
}

function WorkspaceTransactionsTable() {
    const { snapshot } = useWorkspaceStore();

    return (
        <TransactionsTable
            accounts={snapshot.accounts}
            categories={snapshot.budgetCategories}
            transactions={snapshot.transactions}
        />
    );
}

function makeWorkspaceSnapshot({
    accounts,
    ledgerPostings = [],
    budgetCategories = [],
    plaidAccountLinks = [],
    plaidTransactionSyncs = [],
    transactionTemplates = [],
    transactionLines = [],
    transactions = [],
}: {
    accounts: WorkspaceSnapshot["accounts"];
    ledgerPostings?: WorkspaceSnapshot["ledgerPostings"];
    budgetCategories?: WorkspaceSnapshot["budgetCategories"];
    plaidAccountLinks?: WorkspaceSnapshot["plaidAccountLinks"];
    plaidTransactionSyncs?: WorkspaceSnapshot["plaidTransactionSyncs"];
    transactionTemplates?: WorkspaceSnapshot["transactionTemplates"];
    transactionLines?: WorkspaceSnapshot["transactionLines"];
    transactions?: WorkspaceSnapshot["transactions"];
}): WorkspaceSnapshot {
    const generatedAt = "2026-05-22T00:00:00.000Z";

    return withIntegrationWorkspaceKnowledge({
        accounts,
        activeLedgerId: "ledger-1",
        activeLedgerName: "2026",
        allocationFundingSources: [],
        budgetAllocations: [],
        budgetCategories,
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
                account: accounts.length,
                allocationFundingSource: 0,
                budgetCategory: budgetCategories.length,
                budgetGroup: 0,
                budgetPeriod: 0,
                categoryAllocation: 0,
                ledger: 1,
                ledgerPosting: ledgerPostings.length,
                plaidAccountLink: plaidAccountLinks.length,
                plaidTransactionSync: plaidTransactionSyncs.length,
                transaction: transactions.length,
                transactionLine: transactionLines.length,
                transactionTemplate: transactionTemplates.length,
            },
            generatedAt,
            retainedChangesAfter: "2026-04-22T00:00:00.000Z",
            revision: "test",
        },
        ledgerPostings,
        ledgers: [
            {
                createdAt: generatedAt,
                isDefault: false,
                ledgerId: "ledger-1",
                workspaceId: "global",
                name: "2026",
                status: "active",
                updatedAt: generatedAt,
            },
        ],
        plaidAccountLinks,
        plaidTransactionSyncs,
        transactionTemplates,
        transactionLines,
        transactions,
    });
}

function getFetchRequestUrl(input: RequestInfo | URL) {
    if (typeof input === "string") {
        return input;
    }

    if (input instanceof URL) {
        return input.toString();
    }

    return input.url;
}

async function selectComboboxOption(
    user: ReturnType<typeof userEvent.setup>,
    combobox: HTMLElement,
    optionLabel: string,
) {
    await user.click(combobox);
    await user.clear(combobox);
    await user.type(combobox, optionLabel);
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(combobox).toHaveValue(optionLabel));
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickComboboxOption(
    user: ReturnType<typeof userEvent.setup>,
    combobox: HTMLElement,
    optionLabel: string,
) {
    await user.click(combobox);
    await user.clear(combobox);
    await user.type(combobox, optionLabel);
    await screen.findByRole("option", {
        name: new RegExp(escapeRegExp(optionLabel), "i"),
    });
    await user.keyboard("{Enter}");
}

describe("US2 account and transaction flows", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.lastPlaidOptions = null;
        mocks.startActivity.mockReturnValue({
            complete: mocks.completeActivity,
            fail: mocks.failActivity,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => createIntegrationWorkspaceMutationResponse(),
            }),
        );
    });

    it("reopens Plaid Link after the user closes the Link window", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ institutions: [] }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ linkToken: "link-token-1" }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ linkToken: "link-token-2" }),
                }),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));
        expect(
            screen.queryByRole("button", { name: "Link Plaid" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Sync start date")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Set up Plaid" }));
        await user.click(screen.getByRole("button", { name: "Link Plaid" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(mocks.lastPlaidOptions?.token).toBe("link-token-1"),
        );
        expect(mocks.plaidOpen).not.toHaveBeenCalled();

        act(() => {
            mocks.lastPlaidOptions?.onLoad?.();
        });

        await waitFor(() => expect(mocks.plaidOpen).toHaveBeenCalledTimes(1));

        act(() => {
            mocks.lastPlaidOptions?.onExit?.(null);
        });

        await user.click(screen.getByRole("button", { name: "Link Plaid" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
        await waitFor(() =>
            expect(mocks.lastPlaidOptions?.token).toBe("link-token-2"),
        );
        expect(mocks.plaidOpen).toHaveBeenCalledTimes(1);

        act(() => {
            mocks.lastPlaidOptions?.onLoad?.();
        });

        await waitFor(() => expect(mocks.plaidOpen).toHaveBeenCalledTimes(2));
    });

    it("does not exchange a nullable Plaid Link public token", async () => {
        const user = userEvent.setup();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ institutions: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ linkToken: "link-token-1" }),
            });
        vi.stubGlobal("fetch", fetchMock);

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        ledgerId: "ledger-1",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.click(screen.getByRole("button", { name: "Set up Plaid" }));
        await user.click(screen.getByRole("button", { name: "Link Plaid" }));
        await waitFor(() =>
            expect(mocks.lastPlaidOptions?.token).toBe("link-token-1"),
        );

        act(() => {
            mocks.lastPlaidOptions?.onSuccess?.(null, {
                accounts: [
                    {
                        id: "plaid-account-1",
                        mask: "1234",
                        name: "Everyday Checking",
                        subtype: "checking",
                    },
                ],
                institution: {
                    institution_id: "institution-1",
                    name: "Test Bank",
                },
            });
        });

        await waitFor(() =>
            expect(
                screen.getByText("Plaid account could not be linked."),
            ).toBeInTheDocument(),
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("shows progress while the first Plaid link runs initial sync", async () => {
        const user = userEvent.setup();
        let resolveExchange!: (value: {
            json: () => Promise<
                ReturnType<typeof createIntegrationWorkspaceMutationResponse>
            >;
            ok: true;
        }) => void;
        const exchangeResponse = new Promise<{
            json: () => Promise<
                ReturnType<typeof createIntegrationWorkspaceMutationResponse>
            >;
            ok: true;
        }>((resolve) => {
            resolveExchange = resolve;
        });

        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ institutions: [] }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ linkToken: "link-token-1" }),
                })
                .mockReturnValueOnce(exchangeResponse),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.click(screen.getByRole("button", { name: "Set up Plaid" }));
        await user.click(screen.getByRole("button", { name: "Link Plaid" }));
        const openingStatus = screen.getByText("Opening Plaid Link.");
        const saveButton = screen.getByRole("button", {
            name: "Save account",
        });

        expect(openingStatus).toBeInTheDocument();
        expect(saveButton).toBeDisabled();
        expect(
            openingStatus.closest("section")?.querySelector(".animate-spin"),
        ).not.toBeNull();

        await waitFor(() =>
            expect(mocks.lastPlaidOptions?.token).toBe("link-token-1"),
        );

        act(() => {
            mocks.lastPlaidOptions?.onLoad?.();
        });
        act(() => {
            mocks.lastPlaidOptions?.onSuccess?.("public-token", {
                accounts: [
                    {
                        id: "plaid-account-1",
                        mask: "1234",
                        name: "Everyday Checking",
                        subtype: "checking",
                    },
                ],
                institution: {
                    institution_id: "institution-1",
                    name: "Test Bank",
                },
            });
        });

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
        const linkingStatus = screen.getByText("Linking Plaid account.");

        expect(linkingStatus).toBeInTheDocument();
        expect(saveButton).toBeDisabled();
        expect(
            linkingStatus.closest("section")?.querySelector(".animate-spin"),
        ).not.toBeNull();

        act(() => {
            resolveExchange({
                ok: true,
                json: async () => createIntegrationWorkspaceMutationResponse(),
            });
        });

        await waitFor(() => expect(mocks.completeActivity).toHaveBeenCalledOnce());
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Plaid account linked.",
            pendingLabel: "Linking Plaid account…",
        });
        expect(mocks.failActivity).not.toHaveBeenCalled();
        await waitFor(() => expect(saveButton).toBeEnabled());
    });

    it("submits a new account through the dialog flow", async () => {
        const user = userEvent.setup();

        renderWithFeedback(<AccountsTable accounts={[]} />);

        expect(screen.queryByText("Account register")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Add account" }).className,
        ).toContain("bg-[var(--color-accent-ink)]");

        await user.click(screen.getByRole("button", { name: "Add account" }));
        await user.type(screen.getByLabelText("Account name"), "Wallet");
        expect(screen.getByLabelText("Account name").className).toContain(
            "bg-[var(--color-field)]",
        );
        await user.selectOptions(screen.getByLabelText("Account type"), "cash");
        await user.clear(screen.getByLabelText("Opening balance"));
        await user.type(screen.getByLabelText("Opening balance"), "125.00");
        await user.click(screen.getByRole("button", { name: "Save account" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        const [, request] = vi.mocked(fetch).mock.calls[0];

        expect(fetch).toHaveBeenCalledWith(
            "/api/accounts",
            expect.objectContaining({ method: "POST" }),
        );
        expect(JSON.parse(String(request?.body))).toMatchObject({
            name: "Wallet",
            accountType: "cash",
            openingBalanceCents: 12_500,
        });
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("hides opening balance and submits zero for transfer accounts", async () => {
        const user = userEvent.setup();

        renderWithFeedback(<AccountsTable accounts={[]} />);

        await user.click(screen.getByRole("button", { name: "Add account" }));
        await user.type(screen.getByLabelText("Account name"), "Transfers");
        await user.selectOptions(
            screen.getByLabelText("Account type"),
            "transfers",
        );

        expect(screen.queryByLabelText("Opening balance")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Save and link to Plaid" }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Save account" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        const [, request] = vi.mocked(fetch).mock.calls[0];

        expect(JSON.parse(String(request?.body))).toMatchObject({
            name: "Transfers",
            accountType: "transfers",
            openingBalanceCents: 0,
        });
    });

    it("saves a new account and starts Plaid Link from the creation dialog", async () => {
        const user = userEvent.setup();
        const createdAccount = {
            accountId: "account-created",
            accountType: "checking",
            balanceCents: 0,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_created",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 0,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };

        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify(
                            createIntegrationWorkspaceMutationResponse({
                                body: { account: createdAccount },
                            }),
                        ),
                        {
                            status: 201,
                            headers: { "content-type": "application/json" },
                        },
                    ),
                )
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ institutions: [] }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ linkToken: "link-token-created" }),
                }),
        );

        renderWithFeedback(<AccountsTable accounts={[]} />);

        await user.click(screen.getByRole("button", { name: "Add account" }));
        await user.type(screen.getByLabelText("Account name"), "Checking");
        await user.click(
            screen.getByRole("button", { name: "Save and link to Plaid" }),
        );

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

        const [, saveRequest] = vi.mocked(fetch).mock.calls[0];

        expect(fetch).toHaveBeenNthCalledWith(
            1,
            "/api/accounts",
            expect.objectContaining({ method: "POST" }),
        );
        expect(JSON.parse(String(saveRequest?.body))).toMatchObject({
            name: "Checking",
            accountType: "checking",
            openingBalanceCents: 0,
        });
        expect(fetch).toHaveBeenNthCalledWith(
            3,
            "/api/plaid/link-token",
            expect.objectContaining({
                body: JSON.stringify({ accountId: "account-created" }),
                method: "POST",
            }),
        );
        expect(
            within(screen.getByRole("dialog")).getByText("Plaid"),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(mocks.lastPlaidOptions?.token).toBe("link-token-created"),
        );
        expect(mocks.plaidOpen).not.toHaveBeenCalled();

        act(() => {
            mocks.lastPlaidOptions?.onLoad?.();
        });

        await waitFor(() => expect(mocks.plaidOpen).toHaveBeenCalledTimes(1));
    });

    it("keeps the last saved account row visible when account save fails", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: "account_store_unavailable",
                            message: "Unable to reach the account store.",
                        },
                    }),
                    {
                        status: 503,
                        headers: { "content-type": "application/json" },
                    },
                ),
            ),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                        balanceCents: 10_000,
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Add account" }));
        await user.type(screen.getByLabelText("Account name"), "Wallet");
        await user.click(screen.getByRole("button", { name: "Save account" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        expect(
            screen.getByText(
                "Unable to reach the account store. The last saved account data is unchanged. Review the form and try again.",
            ),
        ).toBeInTheDocument();
        expect(screen.getAllByText("Checking").length).toBeGreaterThan(0);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("groups accounts by type and keeps row actions scoped to the account", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "savings",
                    accountType: "savings",
                    balanceCents: 20_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_savings",
                    name: "Vacation",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 20_000,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    accountId: "checking-zoo",
                    accountType: "checking",
                    balanceCents: 10_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_checking_zoo",
                    name: "Zoo Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 10_000,
                    plaidLinkStatus: "linked",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    accountId: "credit-card",
                    accountType: "creditCard",
                    balanceCents: -5_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_credit_card",
                    name: "Amex",
                    openedOn: "2026-05-22",
                    openingBalanceCents: -5_000,
                    plaidAccountLinkId: "link-amex",
                    plaidInstitutionName: "Amex Bank",
                    plaidLastSyncStatus: "failed",
                    plaidLinkStatus: "error",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    accountId: "checking-everyday",
                    accountType: "checking",
                    balanceCents: 50_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_checking_everyday",
                    name: "Everyday Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 50_000,
                    plaidAccountLinkId: "link-checking",
                    plaidInstitutionName: "Test Bank",
                    plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
                    plaidLastSyncStatus: "succeeded",
                    plaidLinkStatus: "linked",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
        });

        renderWithWorkspace(<WorkspaceAccountsTable />, snapshot);

        const list = screen.getByRole("list", { name: "Accounts" });
        const listText = Array.from(list.querySelectorAll("h2, [role='listitem']"))
            .map((entry) => entry.textContent ?? "");
        const getRowIndex = (text: string) =>
            listText.findIndex((entry) => entry.includes(text));

        expect(getRowIndex("Checking")).toBeLessThan(getRowIndex("Credit card"));
        expect(getRowIndex("Credit card")).toBeLessThan(getRowIndex("Savings"));
        expect(getRowIndex("Everyday Checking")).toBeLessThan(
            getRowIndex("Zoo Checking"),
        );

        const zooCheckingRow = screen.getByRole("listitem", {
            name: "Zoo Checking",
        });
        const everydayCheckingRow = screen.getByRole("listitem", {
            name: "Everyday Checking",
        });
        const amexRow = screen.getByRole("listitem", { name: "Amex" });

        expect(
            within(
                screen.getByRole("listitem", { name: "Vacation" }),
            ).getByText("Manual"),
        ).toBeInTheDocument();
        expect(within(zooCheckingRow).getByText("Plaid")).toBeInTheDocument();
        expect(
            within(zooCheckingRow).getByText("Not synced yet"),
        ).toBeInTheDocument();
        expect(within(everydayCheckingRow).getByText("Plaid")).toBeInTheDocument();
        expect(
            within(everydayCheckingRow).getByText("Synced 05/23/2026"),
        ).toBeInTheDocument();
        expect(within(amexRow).getByText("Plaid")).toBeInTheDocument();
        expect(
            within(amexRow).getByText("Failed - Amex Bank"),
        ).toBeInTheDocument();

        await user.click(
            within(zooCheckingRow).getByRole("button", { name: "Edit" }),
        );

        expect(
            screen.getByRole("dialog", { name: "Zoo Checking" }),
        ).toBeInTheDocument();
    });

    it("optimistically closes and updates an existing account edit", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    balanceCents: 10_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 10_000,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise(() => undefined)),
        );

        renderWithWorkspace(<WorkspaceAccountsTable />, snapshot);

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.clear(screen.getByLabelText("Account name"));
        await user.type(screen.getByLabelText("Account name"), "Everyday");
        await user.click(screen.getByRole("button", { name: "Save account" }));

        expect(
            screen.queryByRole("dialog", { name: "Checking" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("listitem", { name: "Everyday" }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/accounts/account-1",
                expect.objectContaining({ method: "PATCH" }),
            ),
        );
    });

    it("navigates account panes and scopes account actions to the arrow-highlighted pane", async () => {
        const user = userEvent.setup();
        const accounts = [
            {
                accountId: "account-1",
                accountType: "checking" as const,
                balanceCents: 10_000,
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_checking",
                name: "Checking",
                openedOn: "2026-05-22",
                openingBalanceCents: 10_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                accountId: "account-2",
                accountType: "checking" as const,
                balanceCents: 20_000,
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_savings",
                name: "Household",
                openedOn: "2026-05-22",
                openingBalanceCents: 20_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ];
        const fetchMock = vi.fn().mockResolvedValue({
            json: async () => ({
                affectedPeriods: [],
                crossAreaEffects: [],
                dependentCounts: [],
                isPermanent: true,
                permanentWarning: "Permanent",
                preservedRecords: [],
                previewRevision: "preview-1",
                target: {
                    displayName: "Household",
                    sectionId: "accounts",
                    targetId: "account-2",
                    targetType: "account",
                },
            }),
            ok: true,
        });
        vi.stubGlobal("fetch", fetchMock);

        renderWithFeedback(<AccountsTable accounts={accounts} />);

        const checkingPane = screen.getByRole("listitem", {
            name: "Checking",
        });
        const householdPane = screen.getByRole("listitem", {
            name: "Household",
        });
        const householdViewLink = within(householdPane).getByRole("link", {
            name: "View transactions for Household",
        });
        const householdEditButton = within(householdPane).getByRole("button", {
            name: "Edit",
        });
        const householdDeleteButton = within(householdPane).getByRole("button", {
            name: "Delete",
        });

        for (const action of [
            householdViewLink,
            householdEditButton,
            householdDeleteButton,
        ]) {
            expect(action).toHaveClass(
                "inline-flex",
                "min-h-9",
                "min-w-16",
                "items-center",
                "justify-center",
            );
        }
        fireEvent.keyDown(window, { key: "e" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(checkingPane).not.toHaveAttribute("data-pane-list-highlighted");
        expect(householdPane).toHaveAttribute(
            "data-pane-list-highlighted",
            "true",
        );

        fireEvent.keyDown(window, { key: "Enter" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        fireEvent.keyDown(window, { key: "e" });
        expect(
            screen.getByRole("dialog", { name: "Household" }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole("button", { name: "Close account dialog" }),
        );

        const viewLink = screen.getByRole("link", {
            name: "View transactions for Household",
        });
        const viewClick = vi.fn((event: Event) => event.preventDefault());
        viewLink.addEventListener("click", viewClick);
        fireEvent.keyDown(window, { key: "v" });
        expect(viewClick).toHaveBeenCalledOnce();

        fireEvent.keyDown(window, { key: "d" });
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                "/api/accounts/account-2",
            ),
        );
    });

    it("shows Plaid controls for a linked account in the edit dialog", async () => {
        const user = userEvent.setup();
        const balanceSyncResponse = new Promise<{
            json: () => Promise<Record<string, never>>;
            ok: true;
        }>(() => undefined);

        vi.stubGlobal("fetch", vi.fn().mockReturnValue(balanceSyncResponse));

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        plaidAccountLinkId: "link-1",
                        plaidAccountMask: "1234",
                        plaidAccountName: "Everyday Checking",
                        plaidAccountSubtype: "checking",
                        plaidBalanceCurrentCents: 10_000,
                        plaidBalanceLastSyncedAt: "2026-05-23T12:15:00.000Z",
                        plaidBalanceSyncStatus: "succeeded",
                        plaidInstitutionName: "Test Bank",
                        plaidLastSyncStatus: "succeeded",
                        plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
                        plaidLinkStatus: "linked",
                        plaidSyncStartDate: "2026-05-01",
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));

        expect(
            within(screen.getByRole("dialog")).getByText("Plaid"),
        ).toBeInTheDocument();
        expect(screen.getAllByText("Test Bank").length).toBeGreaterThanOrEqual(1);
        expect(
            screen.getByText("Everyday Checking (...1234) checking"),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Manage Plaid" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Unlink Plaid" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Plaid institution")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Sync balance" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Sync Plaid" }),
        ).toBeInTheDocument();
        expect(screen.getAllByText("$100.00").length).toBeGreaterThanOrEqual(2);
        expect(screen.getByLabelText("Balances match")).toBeInTheDocument();
        expect(screen.queryByLabelText("Sync start date")).not.toBeInTheDocument();
        expect(screen.getByText("2026-05-01")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Manage Plaid" }));
        expect(
            screen.getByRole("button", { name: "Unlink Plaid" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Choose Plaid account" }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Sync start date")).toHaveValue("2026-05-01");

        await user.click(screen.getByRole("button", { name: "Sync balance" }));
        const balanceSyncStatus = screen.getByText("Syncing Plaid balance.");

        expect(balanceSyncStatus).toBeInTheDocument();
        expect(
            balanceSyncStatus.closest("section")?.querySelector(".animate-spin"),
        ).not.toBeNull();
        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/accounts/account-1/plaid/balance",
                expect.objectContaining({ method: "POST" }),
            ),
        );
    });

    it("unlinks a Plaid account from the account edit dialog", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => createIntegrationWorkspaceMutationResponse(),
            }),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        plaidAccountLinkId: "link-1",
                        plaidInstitutionName: "Test Bank",
                        plaidLastSyncStatus: "succeeded",
                        plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
                        plaidLinkStatus: "linked",
                        plaidSyncStartDate: "2026-05-01",
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.click(screen.getByRole("button", { name: "Manage Plaid" }));
        await user.click(screen.getByRole("button", { name: "Unlink Plaid" }));

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/accounts/account-1/plaid",
                expect.objectContaining({ method: "DELETE" }),
            ),
        );
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Plaid account unlinked.",
            pendingLabel: "Unlinking Plaid account…",
        });
        expect(mocks.completeActivity).toHaveBeenCalledOnce();
        expect(mocks.failActivity).not.toHaveBeenCalled();
        expect(
            screen.getByRole("button", { name: "Set up Plaid" }),
        ).toHaveAttribute("aria-expanded", "true");
        expect(
            screen.queryByRole("button", { name: "Manage Plaid" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Link Plaid" }),
        ).toBeInTheDocument();
    });

    it("opens Plaid account selection without unlinking a linked account", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ linkToken: "update-link-token" }),
            }),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        plaidAccountLinkId: "link-1",
                        plaidInstitutionName: "Test Bank",
                        plaidLinkStatus: "linked",
                        plaidSyncStartDate: "2026-05-01",
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.click(screen.getByRole("button", { name: "Manage Plaid" }));
        await user.click(
            screen.getByRole("button", { name: "Choose Plaid account" }),
        );

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/plaid/link-token",
                expect.objectContaining({
                    body: JSON.stringify({
                        accountId: "account-1",
                        accountSelectionEnabled: true,
                    }),
                    method: "POST",
                }),
            ),
        );
    });

    it("shows the new item count after a manual Plaid sync", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () =>
                    createIntegrationWorkspaceMutationResponse({
                        body: {
                            addedCount: 3,
                            modifiedCount: 0,
                            removedCount: 0,
                            syncedAt: "2026-05-23T12:30:00.000Z",
                        },
                    }),
            }),
        );

        renderWithFeedback(
            <AccountsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        plaidAccountLinkId: "link-1",
                        plaidAccountMask: "1234",
                        plaidAccountName: "Everyday Checking",
                        plaidAccountSubtype: "checking",
                        plaidInstitutionName: "Test Bank",
                        plaidLastSyncStatus: "succeeded",
                        plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
                        plaidLinkStatus: "linked",
                        plaidSyncStartDate: "2026-05-01",
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.click(screen.getByRole("button", { name: "Manage Plaid" }));
        fireEvent.change(screen.getByLabelText("Sync start date"), {
            target: { value: "2026-04-15" },
        });
        await user.click(screen.getByRole("button", { name: "Sync Plaid" }));

        await waitFor(() => expect(mocks.completeActivity).toHaveBeenCalledOnce());
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Plaid sync complete.",
            pendingLabel: "Syncing Plaid account…",
        });
        expect(mocks.failActivity).not.toHaveBeenCalled();

        expect(fetch).toHaveBeenCalledWith(
            "/api/accounts/account-1/plaid/sync",
            expect.objectContaining({
                body: JSON.stringify({ syncStartDate: "2026-04-15" }),
                method: "POST",
            }),
        );
    });

    it("shows a compact Plaid sync control for selected account transactions", async () => {
        const user = userEvent.setup();
        let resolveSync!: (response: Response) => void;
        const syncResponse = new Promise<Response>((resolve) => {
            resolveSync = resolve;
        });
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            plaidAccountLinkId: "link-1",
            plaidLastSyncStatus: "succeeded" as const,
            plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
            plaidLinkStatus: "linked" as const,
            plaidSyncStartDate: "2026-05-01",
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const snapshot = makeWorkspaceSnapshot({ accounts: [account] });

        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const requestUrl = getFetchRequestUrl(input);

                if (requestUrl.endsWith("/api/workspace/knowledge")) {
                    return Promise.resolve(
                        new Response(JSON.stringify(snapshot.knowledge), {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        }),
                    );
                }

                if (requestUrl.endsWith("/api/accounts/account-1/plaid/sync")) {
                    return syncResponse;
                }

                return Promise.resolve(new Response("{}", { status: 200 }));
            }),
        );

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            snapshot,
        );

        expect(screen.getByText("Sync")).toBeInTheDocument();
        expect(screen.getAllByText(/^Succeeded/).length).toBeGreaterThan(0);

        const syncSummary = screen.getByText("Sync").closest("summary");
        expect(syncSummary).not.toBeNull();
        await user.click(syncSummary!);
        expect(screen.getByText("Last sync")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Sync now" }));

        expect(screen.getByRole("button", { name: "Syncing..." })).toBeDisabled();
        expect(fetch).toHaveBeenCalledWith(
            "/api/accounts/account-1/plaid/sync",
            expect.objectContaining({
                body: JSON.stringify({ syncStartDate: "2026-05-01" }),
                method: "POST",
            }),
        );

        resolveSync(
            new Response(
                JSON.stringify(
                    createIntegrationWorkspaceMutationResponse({
                        body: { addedCount: 2 },
                        snapshot,
                    }),
                ),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );

        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled(),
        );
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Plaid sync complete.",
            pendingLabel: "Syncing Plaid account…",
        });
        expect(mocks.completeActivity).toHaveBeenCalledOnce();
        expect(mocks.failActivity).not.toHaveBeenCalled();
    });

    it("shows compact Plaid balance reconciliation for selected account transactions", async () => {
        const user = userEvent.setup();
        let resolveBalanceSync!: (response: Response) => void;
        const balanceSyncResponse = new Promise<Response>((resolve) => {
            resolveBalanceSync = resolve;
        });
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            plaidAccountLinkId: "link-1",
            plaidBalanceCurrentCents: 9_975,
            plaidBalanceLastSyncedAt: "2026-05-23T12:15:00.000Z",
            plaidBalanceSyncStatus: "succeeded" as const,
            plaidLastSyncStatus: "succeeded" as const,
            plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
            plaidLinkStatus: "linked" as const,
            plaidSyncStartDate: "2026-05-01",
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const snapshot = makeWorkspaceSnapshot({ accounts: [account] });

        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const requestUrl = getFetchRequestUrl(input);

                if (requestUrl.endsWith("/api/workspace/knowledge")) {
                    return Promise.resolve(
                        new Response(JSON.stringify(snapshot.knowledge), {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        }),
                    );
                }

                if (requestUrl.endsWith("/api/accounts/account-1/plaid/balance")) {
                    return balanceSyncResponse;
                }

                return Promise.resolve(new Response("{}", { status: 200 }));
            }),
        );

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            snapshot,
        );

        const reconciliationSummary = screen.getByText("Reconcile", {
            selector: "summary",
        });
        expect(reconciliationSummary).not.toBeNull();
        await user.click(reconciliationSummary!);
        const balanceDisclosure = reconciliationSummary!.closest("details");
        expect(balanceDisclosure).not.toBeNull();
        expect(
            within(balanceDisclosure as HTMLElement)
                .getAllByText(/^(Ledger|Unlocked|Institution|Difference|Last sync)$/)
                .map((element) => element.textContent),
        ).toEqual([
            "Ledger",
            "Unlocked",
            "Institution",
            "Difference",
            "Last sync",
        ]);
        expect(
            within(balanceDisclosure as HTMLElement).getByText("0 transactions"),
        ).toBeInTheDocument();
        expect(
            within(reconciliationSummary!).queryByLabelText(
                "No unlocked transactions",
            ),
        ).not.toBeInTheDocument();
        expect(
            within(balanceDisclosure as HTMLElement).queryByText("Checked"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("$99.75")).toBeInTheDocument();
        expect(screen.getByText("$0.25")).toBeInTheDocument();
        expect(screen.getByLabelText("Balances differ")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Check balance" }));

        expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
        expect(fetch).toHaveBeenCalledWith(
            "/api/accounts/account-1/plaid/balance",
            expect.objectContaining({ method: "POST" }),
        );

        resolveBalanceSync(
            new Response(
                JSON.stringify(
                    createIntegrationWorkspaceMutationResponse({
                        body: {
                            accountId: "account-1",
                            plaidAccountLinkId: "link-1",
                            plaidBalanceCurrentCents: 10_000,
                            plaidBalanceSyncStatus: "succeeded",
                        },
                        snapshot,
                    }),
                ),
                {
                    headers: { "content-type": "application/json" },
                    status: 200,
                },
            ),
        );

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "Check balance" }),
            ).toBeEnabled(),
        );
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "Plaid balance synced.",
            pendingLabel: "Syncing Plaid balance…",
        });
        expect(mocks.completeActivity).toHaveBeenCalledOnce();
        expect(mocks.failActivity).not.toHaveBeenCalled();
    });

    it("refreshes a stale institution balance before opening Plaid reconciliation", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            plaidAccountLinkId: "link-1",
            plaidBalanceCurrentCents: 10_000,
            plaidBalanceLastSyncedAt: "2026-05-22T12:00:00.000Z",
            plaidBalanceSyncStatus: "succeeded" as const,
            plaidLastSyncStatus: "succeeded" as const,
            plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
            plaidLinkStatus: "linked" as const,
            plaidSyncStartDate: "2026-05-01",
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const snapshot = makeWorkspaceSnapshot({ accounts: [account] });
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const requestUrl = getFetchRequestUrl(input);

            if (requestUrl.endsWith("/plaid/balance")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify(
                            createIntegrationWorkspaceMutationResponse({
                                body: {
                                    accountId: "account-1",
                                    plaidAccountLinkId: "link-1",
                                    plaidBalanceCurrentCents: 10_000,
                                    plaidBalanceSyncStatus: "succeeded",
                                },
                                snapshot,
                            }),
                        ),
                        {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        },
                    ),
                );
            }

            if (requestUrl.endsWith("/reconciliation/preview")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            accountId: "account-1",
                            accountName: "Checking",
                            alreadyReconciledCount: 0,
                            cutoffDate: "2026-05-23",
                            differenceCents: 0,
                            eligibleTransactionCount: 1,
                            institutionBalanceCents: 10_000,
                            ledgerBalanceCents: 10_000,
                            mismatchSuggestions: [],
                            mode: "plaid",
                            previewRevision: "preview-1",
                        }),
                        {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        },
                    ),
                );
            }

            return Promise.resolve(new Response("{}", { status: 200 }));
        });
        vi.stubGlobal("fetch", fetchMock);

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            snapshot,
        );

        await user.click(screen.getByText("Reconcile", { selector: "summary" }));
        await user.click(screen.getByRole("button", { name: "Reconcile" }));

        await screen.findByRole("dialog", { name: "Checking" });
        const requestUrls = fetchMock.mock.calls.map(([request]) =>
            getFetchRequestUrl(request),
        );
        expect(
            requestUrls.findIndex((url) => url.endsWith("/plaid/balance")),
        ).toBeLessThan(
            requestUrls.findIndex((url) =>
                url.endsWith("/reconciliation/preview"),
            ),
        );
        expect(screen.queryByText("Plaid balance synced.")).not.toBeInTheDocument();
    });

    it("aborts reconciliation when the required institution balance refresh fails", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            plaidAccountLinkId: "link-1",
            plaidBalanceCurrentCents: 10_000,
            plaidBalanceLastSyncedAt: "2026-05-22T12:00:00.000Z",
            plaidBalanceSyncStatus: "succeeded" as const,
            plaidLastSyncStatus: "succeeded" as const,
            plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
            plaidLinkStatus: "linked" as const,
            plaidSyncStartDate: "2026-05-01",
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const snapshot = makeWorkspaceSnapshot({ accounts: [account] });
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const requestUrl = getFetchRequestUrl(input);

            if (requestUrl.endsWith("/plaid/balance")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            error: {
                                code: "plaid_balance_sync_failed",
                                message: "Institution balance is unavailable.",
                            },
                        }),
                        {
                            headers: { "content-type": "application/json" },
                            status: 502,
                        },
                    ),
                );
            }

            return Promise.resolve(new Response("{}", { status: 200 }));
        });
        vi.stubGlobal("fetch", fetchMock);

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            snapshot,
        );

        await user.click(screen.getByText("Reconcile", { selector: "summary" }));
        await user.click(screen.getByRole("button", { name: "Reconcile" }));

        await screen.findByText("Reconciliation could not start.");
        expect(
            screen.getByText(
                "Institution balance is unavailable. Reconciliation was not started.",
            ),
        ).toBeInTheDocument();
        expect(
            fetchMock.mock.calls.some(([request]) =>
                getFetchRequestUrl(request).endsWith("/reconciliation/preview"),
            ),
        ).toBe(false);
        expect(screen.queryByRole("dialog", { name: "Checking" })).not.toBeInTheDocument();
    });

    it("marks the reconciliation control complete when balances match and no transactions are unlocked", () => {
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            plaidAccountLinkId: "link-1",
            plaidBalanceCurrentCents: 10_000,
            plaidBalanceLastSyncedAt: "2026-05-23T12:15:00.000Z",
            plaidBalanceSyncStatus: "succeeded" as const,
            plaidLastSyncStatus: "succeeded" as const,
            plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
            plaidLinkStatus: "linked" as const,
            plaidSyncStartDate: "2026-05-01",
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            makeWorkspaceSnapshot({ accounts: [account] }),
        );

        const reconciliationSummary = screen.getByText("Reconcile", {
            selector: "summary",
        });
        expect(
            within(reconciliationSummary!).getByLabelText(
                "No unlocked transactions",
            ),
        ).toBeInTheDocument();
    });

    it("shows the unlocked transaction count in the reconciliation details", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const timestamp = "2026-05-22T00:00:00.000Z";
        const snapshot = makeWorkspaceSnapshot({
            accounts: [account],
            transactions: [
                "cleared",
                "entered",
                "reconciled",
                "voided",
            ].map((status) => ({
                displayAmountCents: 0,
                enteredAt: timestamp,
                kind: "standard" as const,
                ledgerId: "ledger-1",
                lines: [],
                occurredAt: timestamp,
                periodId: "2026-05",
                postings: [],
                referenceAccountId: "account-1",
                status: status as "cleared" | "entered" | "reconciled" | "voided",
                transactionId: `${status}-transaction`,
                updatedAt: timestamp,
            })),
        });

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            snapshot,
        );

        await user.click(screen.getByText("Reconcile", { selector: "summary" }));
        const disclosure = screen.getByText("Reconcile", { selector: "summary" })
            .closest("details");

        expect(disclosure).not.toBeNull();
        expect(within(disclosure as HTMLElement).getByText("Unlocked")).toBeInTheDocument();
        expect(
            within(disclosure as HTMLElement).getByText("2 transactions"),
        ).toBeInTheDocument();
    });

    it("creates a categorized adjustment before reconciling a manual account", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 12_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const snapshot = makeWorkspaceSnapshot({
            accounts: [account],
            budgetCategories: [
                {
                    categoryId: "reconciliation-adjustment",
                    categoryType: "spending",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_reconciliation_adjustment",
                    ledgerId: "ledger-1",
                    name: "Reconciliation adjustments",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
        });
        const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
            void _init;
            const requestUrl = getFetchRequestUrl(input);

            if (requestUrl.includes("/reconciliation/preview")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            accountId: "account-1",
                            accountName: "Checking",
                            alreadyReconciledCount: 0,
                            cutoffDate: "2026-07-18",
                            differenceCents: 500,
                            eligibleTransactionCount: 4,
                            ledgerBalanceCents: 12_000,
                            manualBalanceCents: 12_500,
                            mode: "manual",
                            previewRevision: "preview-1",
                        }),
                        {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        },
                    ),
                );
            }

            if (requestUrl.endsWith("/reconciliation/commit")) {
                return Promise.resolve(
                    new Response(
                        JSON.stringify(
                            createIntegrationWorkspaceMutationResponse({
                                body: { reconciledCount: 4 },
                                snapshot,
                            }),
                        ),
                        {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        },
                    ),
                );
            }

            return Promise.resolve(new Response("{}", { status: 200 }));
        });
        vi.stubGlobal("fetch", fetchMock);

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            snapshot,
        );

        const reconciliationSummary = screen.getByText("Reconcile", {
            selector: "summary",
        });
        expect(reconciliationSummary).not.toBeNull();
        await user.click(reconciliationSummary!);
        await user.click(screen.getByRole("button", { name: "Reconcile" }));
        const dialog = await screen.findByRole("dialog", {
            name: "Checking",
        });

        const currentBalance = within(dialog).getByLabelText("Current balance");
        await user.type(currentBalance, "125.00");
        await user.click(within(dialog).getByRole("button", { name: "Continue" }));

        expect(within(dialog).getByText("2026-07-18")).toBeInTheDocument();
        expect(within(dialog).getByText("$120.00")).toBeInTheDocument();
        expect(
            within(dialog).getByText(
                "Adjustment required",
            ),
        ).toBeInTheDocument();
        expect(within(dialog).getAllByText("$5.00")).toHaveLength(2);
        expect(within(dialog).queryByText("Possible causes")).not.toBeInTheDocument();

        await selectComboboxOption(
            user,
            within(dialog).getByRole("combobox", {
                name: "Adjustment assignment",
            }),
            "Reconciliation adjustments",
        );

        await user.click(
            within(dialog).getByRole("button", {
                name: "Create adjustment and reconcile",
            }),
        );

        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", { name: "Checking" }),
            ).not.toBeInTheDocument(),
        );
        const commitCall = fetchMock.mock.calls.find(([request]) =>
            getFetchRequestUrl(request).endsWith("/reconciliation/commit"),
        );
        expect(commitCall).toBeDefined();
        expect(JSON.parse(String(commitCall?.[1]?.body))).toMatchObject({
            adjustment: {
                categoryId: "reconciliation-adjustment",
                confirmedDifferenceCents: 500,
                kind: "standard",
            },
            manualBalanceCents: 12_500,
            mutationId: expect.any(String),
            previewRevision: "preview-1",
        });
    });

    it("shows possible transactions for a reconciliation mismatch", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 12_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const snapshot = makeWorkspaceSnapshot({ accounts: [account] });

        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL) => {
                const requestUrl = getFetchRequestUrl(input);

                if (requestUrl.endsWith("/api/workspace/knowledge")) {
                    return Promise.resolve(
                        new Response(JSON.stringify(snapshot.knowledge), {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        }),
                    );
                }

                if (requestUrl.includes("/reconciliation/preview")) {
                    return Promise.resolve(
                        new Response(
                            JSON.stringify({
                                accountId: "account-1",
                                accountName: "Checking",
                                alreadyReconciledCount: 0,
                                cutoffDate: "2026-07-18",
                                differenceCents: 1_200,
                                eligibleTransactionCount: 2,
                                institutionBalanceCents: 13_200,
                                ledgerBalanceCents: 12_000,
                                mismatchSuggestions: [
                                    {
                                        apparentDuplicateCount: 1,
                                        confidence: "high",
                                        reason: "possibleDuplicateGroup",
                                        transactions: [
                                            {
                                                amountCents: -1_200,
                                                occurredAt: "2026-07-17",
                                                payee: "Coffee shop",
                                                source: "plaid",
                                                status: "cleared",
                                            },
                                            {
                                                amountCents: -1_200,
                                                occurredAt: "2026-07-15",
                                                payee: "Coffee shop",
                                                source: "manual",
                                                status: "cleared",
                                            },
                                        ],
                                    },
                                ],
                                mode: "plaid",
                                previewRevision: "preview-1",
                            }),
                            {
                                headers: { "content-type": "application/json" },
                                status: 200,
                            },
                        ),
                    );
                }

                return Promise.resolve(new Response("{}", { status: 200 }));
            }),
        );

        renderWithWorkspace(
            <AccountTransactionStatusBar account={account} />,
            snapshot,
        );

        await user.click(screen.getByText("Reconcile", { selector: "summary" }));
        await user.click(screen.getByRole("button", { name: "Reconcile" }));
        const dialog = await screen.findByRole("dialog", { name: "Checking" });

        await user.type(
            within(dialog).getByLabelText("Current balance"),
            "132.00",
        );
        await user.click(within(dialog).getByRole("button", { name: "Continue" }));

        expect(within(dialog).getByText("Possible causes")).toBeInTheDocument();
        expect(
            within(dialog).getByText("Possible duplicate transactions"),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText(
                "These 2 transactions look alike. Removing 1 apparent duplicate copy would close the gap.",
            ),
        ).toBeInTheDocument();
        expect(within(dialog).getAllByText("Coffee shop")).toHaveLength(2);
        expect(
            within(dialog).getByText(/high confidence/i),
        ).toBeInTheDocument();
        expect(within(dialog).getAllByText("-$12.00")).toHaveLength(2);
    });

    it("closes account balance and sync pulldowns when clicking outside", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            plaidAccountLinkId: "link-1",
            plaidBalanceCurrentCents: 9_975,
            plaidBalanceLastSyncedAt: "2026-05-23T12:15:00.000Z",
            plaidBalanceSyncStatus: "succeeded" as const,
            plaidLastSyncStatus: "succeeded" as const,
            plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
            plaidLinkStatus: "linked" as const,
            plaidSyncStartDate: "2026-05-01",
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };

        renderWithWorkspace(
            <div>
                <AccountTransactionStatusBar account={account} />
                <button type="button">Outside target</button>
            </div>,
            makeWorkspaceSnapshot({ accounts: [account] }),
        );

        const reconciliationSummary = screen.getByText("Reconcile", {
            selector: "summary",
        });
        expect(reconciliationSummary).not.toBeNull();
        const balanceDisclosure = reconciliationSummary!.closest("details");
        expect(balanceDisclosure).not.toBeNull();
        await user.click(reconciliationSummary);
        expect(balanceDisclosure).toHaveAttribute("open");
        expect(screen.getByText("Institution")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Outside target" }));
        expect(balanceDisclosure).not.toHaveAttribute("open");

        const syncSummary = screen.getByText("Sync").closest("summary");
        expect(syncSummary).not.toBeNull();
        const syncDisclosure = syncSummary!.closest("details");
        expect(syncDisclosure).not.toBeNull();
        await user.click(syncSummary!);
        expect(syncDisclosure).toHaveAttribute("open");
        expect(
            within(syncDisclosure as HTMLElement).getByText("Last sync"),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Outside target" }));
        expect(syncDisclosure).not.toHaveAttribute("open");
    });

    it("shows a transaction-derived local Plaid balance when ledger postings are unavailable", async () => {
        const user = userEvent.setup();
        const generatedAt = "2026-05-22T00:00:00.000Z";
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 0,
            createdAt: generatedAt,
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 0,
            plaidAccountLinkId: "link-1",
            plaidAccountMask: "1234",
            plaidAccountName: "Everyday Checking",
            plaidAccountSubtype: "checking",
            plaidInstitutionName: "Test Bank",
            plaidLastSyncStatus: "succeeded" as const,
            plaidLastSyncedAt: "2026-05-23T12:00:00.000Z",
            plaidLinkStatus: "linked" as const,
            plaidSyncStartDate: "2026-05-01",
            updatedAt: generatedAt,
            ledgerId: "ledger-1",
        };
        const snapshot = {
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
                    allocationFundingSource: 0,
                    budgetCategory: 0,
                    budgetGroup: 0,
                    budgetPeriod: 0,
                    categoryAllocation: 0,
                    ledger: 1,
                    ledgerPosting: 0,
                    plaidAccountLink: 1,
                    plaidTransactionSync: 0,
                    transaction: 1,
                    transactionLine: 0,
                },
                generatedAt,
                retainedChangesAfter: "2026-04-22T00:00:00.000Z",
                revision: "test",
            },
            ledgerPostings: [],
            ledgers: [
                {
                    createdAt: generatedAt,
                    isDefault: false,
                    ledgerId: "ledger-1",
                    workspaceId: "global",
                    name: "2026",
                    status: "active" as const,
                    updatedAt: generatedAt,
                },
            ],
            plaidAccountLinks: [
                {
                    accountId: "account-1",
                    createdAt: generatedAt,
                    lastSyncStatus: "succeeded" as const,
                    lastSyncedAt: "2026-05-23T12:00:00.000Z",
                    plaidAccountId: "plaid-account-1",
                    plaidAccountLinkId: "link-1",
                    plaidAccountMask: "1234",
                    plaidAccountName: "Everyday Checking",
                    plaidAccountSubtype: "checking",
                    plaidAccountType: "depository",
                    plaidBalanceCurrentCents: 12_500,
                    plaidBalanceLastSyncedAt: "2026-05-23T12:15:00.000Z",
                    plaidBalanceSyncStatus: "succeeded" as const,
                    plaidInstitutionName: "Test Bank",
                    plaidItemId: "item-1",
                    status: "linked" as const,
                    syncStartDate: "2026-05-01",
                    updatedAt: generatedAt,
                    ledgerId: "ledger-1",
                },
            ],
            plaidTransactionSyncs: [],
            transactionLines: [],
            transactions: [
                {
                    displayAmountCents: 12_500,
                    enteredAt: generatedAt,
                    occurredAt: "2026-05-23T12:00:00.000Z",
                    payee: "Deposit",
                    periodId: "2026-05",
                    postings: [],
                    referenceAccountId: "account-1",
                    source: "manual" as const,
                    status: "entered" as const,
                    lines: [],
                    transactionId: "transaction-1",
                    kind: "standard",
                    updatedAt: generatedAt,
                    ledgerId: "ledger-1",
                },
            ],
        } satisfies WorkspaceSnapshot;

        renderWithWorkspace(
            <AccountsTable accounts={snapshot.accounts} />,
            snapshot,
        );

        await user.click(screen.getByRole("button", { name: "Edit" }));

        expect(screen.getAllByText("$125.00").length).toBeGreaterThanOrEqual(2);
        expect(screen.getByLabelText("Balances match")).toBeInTheDocument();
    });

    it("shows projected category balances in the transaction category chooser", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accountContextId="account-1"
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        ledgerId: "ledger-1",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                categoryBalanceById={new Map([["groceries", -1_234]])}
                transactions={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));
        await user.click(screen.getByRole("combobox", { name: "Category" }));

        expect(screen.getByText("Balance: -$12.34")).toHaveClass("money-negative");
    });

    it("submits an uncategorized inflow and surfaces the warning in the table", async () => {
        const user = userEvent.setup();
        let resolveSave!: (response: Response) => void;

        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveSave = resolve;
                    }),
            ),
        );

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                        balanceCents: 10_000,
                    },
                ]}
                categories={[
                    {
                        categoryId: "category-1",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T00:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: undefined,
                        displayAmountCents: -2_500,
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-20T12:00:00.000Z",
                                fromAccountId: "checking",
                                lineId: "market-line",
                                sortOrder: 0,
                                transactionId: "market-transaction",
                                updatedAt: "2026-05-20T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        expect(screen.getAllByText("Uncategorized").length).toBeGreaterThan(0);
        expect(
            screen.getByLabelText("Unassigned category").getAttribute("class"),
        ).toContain("text-[var(--tone-warning-ink)]");
        expect(screen.getByText("Uncategorized").className).toContain(
            "text-[var(--tone-warning-ink)]",
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));
        const accountCombobox = screen.getByRole("combobox", {
            name: "Account",
        });
        await waitFor(() => expect(accountCombobox).toHaveFocus());
        await selectComboboxOption(user, accountCombobox, "Checking");
        const newTransactionDialog = screen.getByRole("dialog", {
            name: "New transaction",
        });
        const dateInput = within(newTransactionDialog).getByLabelText(
            "Date",
        ) as HTMLInputElement;
        expect(dateInput.type).toBe("date");
        fireEvent.change(dateInput, { target: { value: "2026-05-24" } });
        expect(
            within(newTransactionDialog)
                .getAllByText(/^(Payee|Category|Memo|Amount)$/)
                .map((element) => element.textContent),
        ).toEqual(["Payee", "Category", "Memo", "Amount"]);
        const modalMemo = within(newTransactionDialog).getByLabelText("Memo");
        expect(modalMemo.tagName).toBe("TEXTAREA");
        expect(modalMemo).toHaveAttribute("rows", "1");
        expect(modalMemo).toHaveClass("h-[46px]");
        expect(modalMemo).toHaveClass("text-xs");
        expect(
            within(newTransactionDialog).getByRole("button", {
                name: "Split",
            }).parentElement,
        ).toHaveClass("items-start");
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Uncategorized",
        );
        expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
            "Uncategorized",
        );
        await user.clear(screen.getByLabelText("Amount"));
        await user.type(screen.getByLabelText("Amount"), "45.00");
        await user.type(screen.getAllByLabelText("Payee")[0], "Employer");
        await user.type(modalMemo, "Initial pay");
        await user.keyboard("{Meta>}{Enter}{/Meta}");

        expect(
            screen.queryByRole("dialog", { name: "New transaction" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Transaction saved.")).not.toBeInTheDocument();
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        const [, transactionRequest] = vi.mocked(fetch).mock.calls[0];

        expect(fetch).toHaveBeenCalledWith(
            "/api/transactions",
            expect.objectContaining({ method: "POST" }),
        );
        expect(JSON.parse(String(transactionRequest?.body))).toMatchObject({
            kind: "standard",
            occurredAt: "2026-05-24T00:00:00.000Z",
            payee: "Employer",
            lines: [
                {
                    amountCents: 4_500,
                },
            ],
        });

        await act(async () => {
            resolveSave(
                new Response(
                    JSON.stringify(createIntegrationWorkspaceMutationResponse()),
                    {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    },
                ),
            );
            await Promise.resolve();
        });
        expect(screen.queryByText("Transaction saved.")).not.toBeInTheDocument();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("allows a locked transaction to be split in the transaction dialog", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            ledgerId: "ledger-1",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
        };
        const category = {
            categoryId: "category-1",
            ledgerAccountId: "category_groceries",
            name: "Groceries",
            status: "active" as const,
        };
        const transaction: TransactionWithPostings = {
            displayAmountCents: -2_500,
            enteredAt: "2026-05-22T12:00:00.000Z",
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 2_500,
                    categoryId: "category-1",
                    createdAt: "2026-05-22T12:00:00.000Z",
                    fromAccountId: "account-1",
                    ledgerId: "ledger-1",
                    lineId: "line-1",
                    memo: "Apples",
                    payee: "Market",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: "2026-05-22T12:00:00.000Z",
                },
            ],
            memo: "",
            occurredAt: "2026-05-22T00:00:00.000Z",
            payee: "Market",
            periodId: "2026-05",
            postings: [],
            referenceAccountId: "account-1",
            referenceCategoryId: "category-1",
            source: "manual",
            status: "reconciled",
            transactionId: "transaction-1",
            updatedAt: "2026-05-22T12:00:00.000Z",
        };
        const snapshot = makeWorkspaceSnapshot({
            accounts: [account],
            budgetCategories: [
                {
                    ...category,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    sortOrder: 0,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactions: [transaction],
        });

        renderWithWorkspace(
            <TransactionDialog
                accounts={[account]}
                categories={[category]}
                onClose={vi.fn()}
                open
                transaction={transaction}
            />,
            snapshot,
        );

        expect(screen.queryByText("Cancel split")).not.toBeInTheDocument();

        expect(screen.getByLabelText("Amount")).toBeDisabled();

        await user.click(screen.getAllByLabelText("Payee")[0]);
        await user.keyboard("{Control>}s{/Control}");

        expect(screen.getByText("Cancel split")).toBeInTheDocument();
        expect(screen.getAllByRole("combobox", { name: "Category" })).toHaveLength(
            2,
        );
        for (const amountInput of screen.getAllByLabelText("Amount")) {
            expect(amountInput).toBeEnabled();
        }
        expect(screen.getByRole("button", { name: "Add line" })).toBeEnabled();
        expect(
            screen.queryByRole("button", { name: "Remove split line" }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Add line" }));

        expect(
            screen.getByRole("button", { name: "Remove split line" }),
        ).toBeEnabled();

        const splitAmountInputs = screen.getAllByLabelText("Amount");
        await user.type(splitAmountInputs[0], "-10.00");
        await user.type(splitAmountInputs[1], "-10.00");

        expect(
            screen.getByText("Locked transactions must keep their original total."),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Accept difference" }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    });

    it("closes the new transaction modal immediately and shows an error toast when create fails", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: "transaction_save_failed",
                            message: "The transaction could not be created.",
                        },
                    }),
                    { status: 400 },
                ),
            ),
        );

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Account" }),
            "Checking",
        );
        await user.type(screen.getByLabelText("Amount"), "12.00");
        await user.type(screen.getAllByLabelText("Payee")[0], "Deposit");
        await user.click(screen.getByRole("button", { name: "Save transaction" }));

        expect(
            screen.queryByRole("dialog", { name: "New transaction" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Transaction saved.")).not.toBeInTheDocument();
        expect(
            await screen.findByText("Transaction could not be saved."),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "The transaction could not be created. Save failed. The latest saved data has been restored.",
            ),
        ).toBeInTheDocument();
    });

    it("applies a transaction template from the new transaction modal", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    balanceCents: 10_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 10_000,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "household",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_household",
                    name: "Household",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactionTemplates: [
                {
                    accountId: "account-1",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAmountCents: -10_000,
                    ledgerId: "ledger-1",
                    linesJson: JSON.stringify([
                        {
                            categoryId: "groceries",
                            formula: "total * 0.6",
                            lineId: "template-line-1",
                            sortOrder: 0,
                        },
                        {
                            categoryId: "household",
                            formula: "remainder",
                            lineId: "template-line-2",
                            sortOrder: 1,
                        },
                    ]),
                    memo: "Weekly split",
                    name: "Household order",
                    payee: "Big Store",
                    templateId: "template-1",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
        });

        renderWithWorkspace(
            <TransactionDialog
                accounts={snapshot.accounts}
                categories={snapshot.budgetCategories}
                onClose={vi.fn()}
                open
            />,
            snapshot,
        );

        await clickComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Household order",
        );

        const pane = await screen.findByRole("region", {
            name: "Template preview for Household order",
        });
        const totalInput = within(pane).getByLabelText("Total");

        expect(totalInput).toHaveValue("100.00");
        await waitFor(() => expect(totalInput).toHaveFocus());
        await user.keyboard("{Enter}");

        await waitFor(() =>
            expect(
                screen.getAllByRole("combobox", { name: "Category" }),
            ).toHaveLength(2),
        );

        const saveButton = screen.getByRole("button", {
            name: "Save transaction",
        });

        await waitFor(() => expect(saveButton).toHaveFocus());
        await user.keyboard("{Enter}");

        await waitFor(() =>
            expect(
                vi
                    .mocked(fetch)
                    .mock.calls.some(
                        ([input]) => getFetchRequestUrl(input) === "/api/transactions",
                    ),
            ).toBe(true),
        );

        const [, request] = vi
            .mocked(fetch)
            .mock.calls.find(
                ([input]) => getFetchRequestUrl(input) === "/api/transactions",
            )!;
        const payload = JSON.parse(String(request?.body));

        expect(payload).toMatchObject({
            accountId: "account-1",
            kind: "standard",
            lines: [
                {
                    amountCents: 6_000,
                    categoryId: "groceries",
                    fromAccountId: "account-1",
                    sortOrder: 0,
                },
                {
                    amountCents: 4_000,
                    categoryId: "household",
                    fromAccountId: "account-1",
                    sortOrder: 1,
                },
            ],
            memo: "Weekly split",
            payee: "Big Store",
        });
    });

    it("shows a live template preview pane when a modal template needs a total", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    balanceCents: 10_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 10_000,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "household",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_household",
                    name: "Household",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactionTemplates: [
                {
                    accountId: "account-1",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                    linesJson: JSON.stringify([
                        {
                            categoryId: "groceries",
                            formula: "total * 0.25",
                            lineId: "template-line-1",
                            sortOrder: 0,
                        },
                        {
                            categoryId: "household",
                            formula: "remainder",
                            lineId: "template-line-2",
                            sortOrder: 1,
                        },
                    ]),
                    name: "Needs total",
                    templateId: "template-1",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
        });

        renderWithWorkspace(
            <TransactionDialog
                accounts={snapshot.accounts}
                categories={snapshot.budgetCategories}
                onClose={vi.fn()}
                open
            />,
            snapshot,
        );

        await clickComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Needs total",
        );

        const pane = await screen.findByRole("region", {
            name: "Template preview for Needs total",
        });
        const totalInput = within(pane).getByLabelText("Total");
        const applyButton = within(pane).getByRole("button", {
            name: "Apply template",
        });

        await waitFor(() => expect(totalInput).toHaveFocus());
        expect(applyButton).toBeDisabled();
        expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
            "Needs total",
        );
        expect(screen.getByLabelText("Payee")).toBeDisabled();
        expect(screen.getByRole("combobox", { name: "Category" })).toBeDisabled();
        expect(screen.getByLabelText("Memo")).toBeDisabled();
        expect(screen.getByLabelText("Amount")).toBeDisabled();
        expect(
            screen.getByRole("button", { name: "Split" }),
        ).toBeDisabled();
        expect(
            screen.getByRole("button", { name: "Save transaction" }),
        ).toBeDisabled();
        expect(
            within(pane).getByText(
                "Enter a template total to preview the split lines.",
            ),
        ).toBeInTheDocument();

        await user.type(totalInput, "-80.00");

        expect(within(pane).getByText("Groceries")).toBeInTheDocument();
        expect(within(pane).getByText("Household")).toBeInTheDocument();
        expect(within(pane).getByText("-$20.00")).toBeInTheDocument();
        expect(within(pane).getByText("-$60.00")).toBeInTheDocument();

        await user.tab();

        expect(applyButton).toHaveFocus();
        expect(
            screen.getAllByRole("combobox", { name: "Category" }),
        ).toHaveLength(1);

        await user.keyboard("{Enter}");

        await waitFor(() =>
            expect(
                screen.getAllByRole("combobox", { name: "Category" }),
            ).toHaveLength(2),
        );
        expect(screen.getAllByLabelText("Amount")[0]).toHaveValue("20.00");
        expect(screen.getAllByLabelText("Amount")[1]).toHaveValue("60.00");
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "Save transaction" }),
            ).toHaveFocus(),
        );
    });

    it("opens a new transaction from the transactions list with Ctrl-N", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[]}
            />,
        );

        await user.keyboard("{Control>}n{/Control}");

        expect(
            screen.getByRole("dialog", { name: "New transaction" }),
        ).toBeInTheDocument();
    });

    it("opens inline table editing without selecting the transaction and saves category changes", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "dining",
                        ledgerAccountId: "category_dining",
                        name: "Dining",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -2_500,
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: /Groceries/ }));

        expect(screen.queryByText("Editing categories")).not.toBeInTheDocument();
        expect(screen.getByDisplayValue("Market").closest("tr")).toHaveAttribute(
            "aria-selected",
            "false",
        );

        const categoryCombobox = screen.getByRole("combobox", {
            name: "Category",
        });
        expect(categoryCombobox).toHaveFocus();

        await selectComboboxOption(user, categoryCombobox, "Dining");
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/transactions/transaction-1",
                expect.objectContaining({ method: "PATCH" }),
            ),
        );

        const [, transactionRequest] = vi.mocked(fetch).mock.calls[0];

        expect(JSON.parse(String(transactionRequest?.body))).toMatchObject({
            accountId: "account-1",
            kind: "standard",
            lines: [
                {
                    amountCents: 2_500,
                    categoryId: "dining",
                    fromAccountId: "account-1",
                    lineId: "line-1",
                },
            ],
        });
        expect(
            screen.queryByRole("button", { name: "Save changes" }),
        ).not.toBeInTheDocument();
    });

    it("edits payee, category, memo, and amount inline and saves from the memo with Command+Enter", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "dining",
                        ledgerAccountId: "category_dining",
                        name: "Dining",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "Old memo",
                        importActivities: [createTestImportActivity({
                            itemSummary: "USB cable",
                            provider: "amazon",
                            providerRecordId: "payment-1",
                        })],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -2_500,
                        source: "manual",
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "05/22/2026" }));

        const dateInput = screen.getByLabelText("Date");
        const payeeInput = screen.getByLabelText("Payee");
        expect(dateInput).toHaveFocus();

        await user.tab();
        expect(payeeInput).toHaveFocus();
        await user.tab();
        const inlineMemo = screen.getByLabelText("Memo");
        const categoryInput = screen.getByRole("combobox", {
            name: "Category",
        });
        expect(categoryInput).toHaveFocus();

        fireEvent.keyDown(categoryInput, { key: "Tab" });
        expect(inlineMemo).toHaveFocus();

        await user.tab({ shift: true });
        expect(categoryInput).toHaveFocus();

        fireEvent.keyDown(categoryInput, { key: "Tab" });
        expect(inlineMemo).toHaveFocus();
        expect(inlineMemo.tagName).toBe("TEXTAREA");
        expect(inlineMemo).toHaveAttribute("rows", "1");
        expect(inlineMemo).toHaveClass("h-9");
        expect(inlineMemo).toHaveClass("text-xs");
        expect(screen.queryByText("Managed order information")).not.toBeInTheDocument();
        expect(screen.getByText("USB cable")).toBeVisible();
        expect(screen.getByText("111-222")).toHaveClass("font-mono");
        expect(inlineMemo).toHaveValue("Old memo");
        const inlineEditorRow = inlineMemo.closest("tr");
        expect(inlineEditorRow).not.toBeNull();
        expect(
            Array.from(inlineEditorRow!.querySelectorAll("td"))
                .slice(1)
                .every((cell) => cell.classList.contains("align-top")),
        ).toBe(true);
        await user.type(inlineMemo, "{Enter}Second line");
        expect(inlineMemo).toHaveValue("Old memo\nSecond line");
        expect(inlineMemo).toHaveAttribute("rows", "2");
        expect(inlineMemo).toHaveClass("h-14");
        await user.tab();
        expect(screen.getByLabelText("Amount")).toHaveFocus();

        fireEvent.change(dateInput, { target: { value: "2026-05-23" } });
        await user.clear(payeeInput);
        await user.type(payeeInput, "Farmers Market");
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Dining",
        );
        await user.clear(screen.getByLabelText("Amount"));
        await user.type(screen.getByLabelText("Amount"), "-30.00");
        await user.clear(screen.getByLabelText("Memo"));
        await user.type(screen.getByLabelText("Memo"), "Lunch supplies");
        await user.keyboard("{Meta>}{Enter}{/Meta}");

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/transactions/transaction-1",
                expect.objectContaining({ method: "PATCH" }),
            ),
        );

        const [, transactionRequest] = vi.mocked(fetch).mock.calls[0];

        expect(JSON.parse(String(transactionRequest?.body))).toMatchObject({
            accountId: "account-1",
            kind: "standard",
            occurredAt: "2026-05-23T00:00:00.000Z",
            payee: "Farmers Market",
            memo: "Lunch supplies",
            lines: [
                {
                    amountCents: 3_000,
                    categoryId: "dining",
                    fromAccountId: "account-1",
                    lineId: "line-1",
                    memo: "Lunch supplies",
                    payee: "Farmers Market",
                },
            ],
        });
        expect(JSON.parse(String(transactionRequest?.body))).not.toHaveProperty(
            "importActivities",
        );
    });

    it("keeps the existing inline category highlighted when pressing Enter immediately", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "dining",
                        ledgerAccountId: "category_dining",
                        name: "Dining",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T00:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -5_000,
                        source: "manual",
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 5_000,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: /Groceries/ }));

        const categoryCombobox = screen.getByRole("combobox", {
            name: "Category",
        });

        expect(categoryCombobox).toHaveFocus();
        expect(categoryCombobox).toHaveValue("Groceries");

        await user.keyboard("{Enter}");

        expect(categoryCombobox).toHaveValue("Groceries");
        expect(screen.getAllByLabelText("Payee")).toHaveLength(1);
        expect(
            screen.queryByRole("button", { name: "Add split" }),
        ).not.toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("keeps a dirty inline editor open on Escape but allows manual cancel", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T00:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -5_000,
                        source: "manual",
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 5_000,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Market" }));

        const payeeInput = screen.getByLabelText("Payee");

        await user.clear(payeeInput);
        await user.type(payeeInput, "Farmers Market");
        await user.keyboard("{Escape}");

        expect(screen.getByLabelText("Payee")).toHaveValue("Farmers Market");
        expect(
            screen.getByRole("button", { name: "Save changes" }),
        ).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.queryByLabelText("Payee")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Market" })).toBeInTheDocument();
    });

    it("closes the clean inline editor on Escape when no editor input has focus", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T00:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -5_000,
                        source: "manual",
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 5_000,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Market" }));

        const payeeInput = screen.getByLabelText("Payee");
        expect(payeeInput).toHaveFocus();

        payeeInput.blur();
        fireEvent.keyDown(document, { key: "Escape" });

        expect(screen.queryByLabelText("Payee")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Market" })).toBeInTheDocument();
    });

    it("optimistically updates the transaction row before inline save returns", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    balanceCents: 10_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 10_000,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "group-1",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactionLines: [
                {
                    amountCents: 2_500,
                    categoryId: "groceries",
                    createdAt: "2026-05-22T12:00:00.000Z",
                    fromAccountId: "account-1",
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: "2026-05-22T12:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactions: [
                {
                    transactionId: "transaction-1",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-05-22T12:00:00.000Z",
                    enteredAt: "2026-05-22T12:00:00.000Z",
                    kind: "standard",
                    payee: "Market",
                    memo: "",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "groceries",
                    displayAmountCents: -2_500,
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-22T12:00:00.000Z",
                    postings: [],
                    lines: [],
                },
            ],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise(() => undefined)),
        );

        renderWithWorkspace(<WorkspaceTransactionsTable />, snapshot);

        await user.click(screen.getByRole("button", { name: "Market" }));
        fireEvent.change(screen.getByLabelText("Date"), {
            target: { value: "2026-05-24" },
        });
        await user.clear(screen.getByLabelText("Payee"));
        await user.type(screen.getByLabelText("Payee"), "Farmers Market");
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(
            screen.queryByRole("button", { name: "Save changes" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Farmers Market" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "05/24/2026" }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/transactions/transaction-1",
                expect.objectContaining({ method: "PATCH" }),
            ),
        );
    });

    it("shows an inline total warning only after saving a changed Plaid amount", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Coffee",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -2_500,
                        source: "plaid",
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: /Groceries/ }));
        expect(screen.queryByText("Transaction total changed")).toBeNull();

        await user.clear(screen.getByLabelText("Amount"));
        await user.type(screen.getByLabelText("Amount"), "-30.00");

        expect(screen.queryByText("Transaction total changed")).toBeNull();
        expect(fetch).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Save changes" }));

        const warningPane = screen
            .getByText("Transaction total changed")
            .closest('[aria-live="polite"]');

        expect(warningPane).not.toBeNull();
        expect(
            within(warningPane as HTMLElement).getByText("-$25.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("-$30.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("-$5.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByRole("button", {
                name: "Accept difference",
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Accept difference" }));
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    });

    it("creates split rows from the inline Split Transaction option and fills the difference with Ctrl-D", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -5_000,
                        source: "manual",
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 5_000,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: /Groceries/ }));
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Split Transaction",
        );

        const amountInputs = screen.getAllByLabelText("Amount");
        expect(screen.getAllByLabelText("Date")).toHaveLength(1);
        expect(screen.getByLabelText("Date")).toHaveValue("2026-05-22");
        expect(screen.getAllByLabelText("Payee")).toHaveLength(2);
        expect(screen.getAllByRole("combobox", { name: "Category" })).toHaveLength(
            2,
        );
        expect(
            screen.getByRole("button", { name: "Add split" }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Split total mismatch")).toBeInTheDocument();
        expect(amountInputs[0]).toHaveValue("");
        expect(amountInputs[1]).toHaveValue("");

        await user.type(amountInputs[0], "-30.00");
        expect(screen.getAllByText("-$50.00")).toHaveLength(1);
        screen.getAllByLabelText("Payee")[1]?.focus();
        await user.keyboard("{Control>}d{/Control}");

        expect(amountInputs[1]).toHaveValue("20.00");

        await user.clear(amountInputs[0]);
        await user.type(amountInputs[0], "-40.00");
        screen.getAllByRole("combobox", { name: "Category" })[1]?.focus();
        await user.keyboard("{Control>}d{/Control}");

        expect(amountInputs[1]).toHaveValue("10.00");

        await user.clear(amountInputs[0]);
        await user.type(amountInputs[0], "-45.00");
        screen.getAllByLabelText("Memo")[1]?.focus();
        await user.keyboard("{Control>}d{/Control}");

        expect(amountInputs[1]).toHaveValue("5.00");
        expect(
            screen.queryByLabelText("Split total mismatch"),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Split total changed")).not.toBeInTheDocument();

        const addSplitButton = screen.getByRole("button", {
            name: "Add split",
        });
        addSplitButton.focus();
        expect(addSplitButton).toHaveFocus();
        await user.keyboard("{Enter}");

        expect(fetch).not.toHaveBeenCalled();
        expect(screen.queryByText("Split total changed")).not.toBeInTheDocument();
        expect(screen.getAllByLabelText("Amount")).toHaveLength(3);
    });

    it("applies a transaction template from the inline editor", async () => {
        const user = userEvent.setup();
        const snapshot = makeWorkspaceSnapshot({
            accounts: [
                {
                    accountId: "account-1",
                    accountType: "checking",
                    balanceCents: 10_000,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerAccountId: "acct_checking",
                    name: "Checking",
                    openedOn: "2026-05-22",
                    openingBalanceCents: 10_000,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            budgetCategories: [
                {
                    categoryId: "groceries",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_groceries",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
                {
                    categoryId: "household",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "spending",
                    isIncomeCategory: false,
                    ledgerAccountId: "category_household",
                    name: "Household",
                    sortOrder: 1,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactionTemplates: [
                {
                    createdAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                    linesJson: JSON.stringify([
                        {
                            categoryId: "groceries",
                            formula: "total * 0.5",
                            lineId: "template-line-1",
                            sortOrder: 0,
                        },
                        {
                            categoryId: "household",
                            formula: "remainder",
                            lineId: "template-line-2",
                            sortOrder: 1,
                        },
                    ]),
                    memo: "Split by template",
                    name: "Half and half",
                    templateId: "template-1",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
            transactions: [
                {
                    transactionId: "transaction-1",
                    ledgerId: "ledger-1",
                    occurredAt: "2026-05-22T12:00:00.000Z",
                    enteredAt: "2026-05-22T12:00:00.000Z",
                    kind: "standard",
                    payee: "Market",
                    memo: "",
                    referenceAccountId: "account-1",
                    referenceCategoryId: "groceries",
                    displayAmountCents: -5_000,
                    source: "manual",
                    status: "entered",
                    periodId: "2026-05",
                    updatedAt: "2026-05-22T12:00:00.000Z",
                    postings: [],
                    lines: [
                        {
                            amountCents: 5_000,
                            categoryId: "groceries",
                            createdAt: "2026-05-22T12:00:00.000Z",
                            fromAccountId: "account-1",
                            lineId: "line-1",
                            sortOrder: 0,
                            transactionId: "transaction-1",
                            updatedAt: "2026-05-22T12:00:00.000Z",
                            ledgerId: "ledger-1",
                        },
                    ],
                },
            ],
        });

        renderWithWorkspace(<WorkspaceTransactionsTable />, snapshot);

        await user.click(screen.getByRole("button", { name: /Groceries/ }));
        await clickComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Half and half",
        );

        const pane = await screen.findByRole("region", {
            name: "Template preview for Half and half",
        });
        const totalInput = within(pane).getByLabelText("Total");

        expect(totalInput).toHaveValue("50.00");
        await waitFor(() => expect(totalInput).toHaveFocus());
        await user.clear(totalInput);
        await user.type(totalInput, "-50.00");
        await user.keyboard("{Enter}");

        await waitFor(() =>
            expect(
                screen.getAllByRole("combobox", { name: "Category" }),
            ).toHaveLength(2),
        );
        expect(screen.getAllByLabelText("Amount")[0]).toHaveValue("25.00");
        expect(screen.getAllByLabelText("Amount")[1]).toHaveValue("25.00");

        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "Save changes" }),
            ).toHaveFocus(),
        );

        await user.keyboard("{Enter}");

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/transactions/transaction-1",
                expect.objectContaining({ method: "PATCH" }),
            ),
        );

        const [, request] = vi
            .mocked(fetch)
            .mock.calls.find(
                ([input]) =>
                    getFetchRequestUrl(input) === "/api/transactions/transaction-1",
            )!;
        const payload = JSON.parse(String(request?.body));

        expect(payload).toMatchObject({
            accountId: "account-1",
            kind: "standard",
            lines: [
                {
                    amountCents: 2_500,
                    categoryId: "groceries",
                    fromAccountId: "account-1",
                    sortOrder: 0,
                },
                {
                    amountCents: 2_500,
                    categoryId: "household",
                    fromAccountId: "account-1",
                    sortOrder: 1,
                },
            ],
            memo: "Split by template",
            payee: "Market",
        });
    });

    it("allows a locked transaction to start inline split editing with Ctrl-S", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T00:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -5_000,
                        source: "manual",
                        status: "reconciled",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 5_000,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: /Groceries/ }));
        await user.keyboard("{Control>}s{/Control}");

        expect(screen.getAllByLabelText("Date")).toHaveLength(1);
        expect(screen.getAllByLabelText("Payee")).toHaveLength(2);
        expect(screen.getAllByRole("combobox", { name: "Category" })).toHaveLength(
            2,
        );
        expect(screen.getAllByLabelText("Amount")).toHaveLength(2);
        for (const amountInput of screen.getAllByLabelText("Amount")) {
            expect(amountInput).toBeEnabled();
        }
        expect(
            screen.getByRole("button", { name: "Add split" }),
        ).toBeEnabled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("shows a split total warning only after saving a changed inline split", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "transaction-1",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Market",
                        memo: "",
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        displayAmountCents: -5_000,
                        source: "manual",
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 5_000,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: /Groceries/ }));
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Split Transaction",
        );

        const amountInputs = screen.getAllByLabelText("Amount");
        await user.clear(amountInputs[0]);
        await user.type(amountInputs[0], "-30.00");
        await user.type(amountInputs[1], "-10.00");

        expect(screen.queryByText("Split total changed")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Save changes" }));

        const warningPane = screen
            .getByText("Split total changed")
            .closest('[aria-live="polite"]');

        expect(warningPane).not.toBeNull();
        expect(
            within(warningPane as HTMLElement).getByText("-$50.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("-$40.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("$10.00"),
        ).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Accept difference" }));
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    });

    it("edits existing split child rows inline and cancels on Escape", async () => {
        const user = userEvent.setup();
        const { container } = renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "household",
                        ledgerAccountId: "category_household",
                        name: "Household",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        transactionId: "split-transaction",
                        ledgerId: "ledger-1",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        payee: "Big Store",
                        memo: "",
                        referenceAccountId: "account-1",
                        displayAmountCents: -5_500,
                        status: "entered",
                        periodId: "2026-05",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        postings: [],
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                memo: "Apples",
                                payee: "Produce stand",
                                sortOrder: 0,
                                transactionId: "split-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                            {
                                amountCents: 3_000,
                                categoryId: "household",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-2",
                                memo: "Towels",
                                payee: "Home goods",
                                sortOrder: 1,
                                transactionId: "split-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                    },
                ]}
            />,
        );

        expect(container.querySelectorAll("tbody > tr")).toHaveLength(3);

        await user.click(screen.getByRole("button", { name: /Mixed/ }));

        expect(screen.queryByText("Editing categories")).not.toBeInTheDocument();
        expect(container.querySelectorAll("tbody > tr")).toHaveLength(5);
        expect(screen.getAllByLabelText("Payee")).toHaveLength(2);
        expect(screen.getAllByRole("combobox", { name: "Category" })).toHaveLength(
            2,
        );
        expect(screen.getAllByLabelText("Memo")).toHaveLength(2);
        expect(screen.getAllByLabelText("Amount")).toHaveLength(2);

        await user.keyboard("{Escape}");

        expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
        expect(container.querySelectorAll("tbody > tr")).toHaveLength(3);

        await user.click(
            screen.getByRole("button", {
                name: "Edit split payee: Home goods",
            }),
        );
        expect(screen.getAllByLabelText("Payee")[1]).toHaveFocus();
        await user.keyboard("{Escape}");

        await user.click(
            screen.getByRole("button", {
                name: "Edit split category: Household",
            }),
        );
        expect(
            screen.getAllByRole("combobox", { name: "Category" })[1],
        ).toHaveFocus();
        await user.keyboard("{Escape}");

        await user.click(
            screen.getByRole("button", {
                name: "Edit split memo: Towels",
            }),
        );
        expect(screen.getAllByLabelText("Memo")[1]).toHaveFocus();
        await user.keyboard("{Escape}");

        await user.click(
            screen.getByRole("button", {
                name: "Edit split amount: -$30.00",
            }),
        );
        expect(screen.getAllByLabelText("Amount")[1]).toHaveFocus();
    });

    it("defaults new transaction account to the selected account context", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accountContextId="account-1"
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "account-2",
                        accountType: "savings",
                        balanceCents: 25_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_savings",
                        name: "Savings",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 25_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));

        const newTransactionDialog = screen.getByRole("dialog", {
            name: "New transaction",
        });
        await waitFor(() =>
            expect(
                within(newTransactionDialog).getByLabelText("Payee"),
            ).toHaveFocus(),
        );
        expect(screen.queryByRole("combobox", { name: "Account" })).toBeNull();
        expect(screen.queryByText("Checking")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Reference info" }));
        expect(screen.getByText("Checking")).toBeInTheDocument();
    });

    it("shows selected account starting balance as a non-editable synthetic row", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accountContextId="checking"
                accounts={[
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 9_845,
                        createdAt: "2026-01-05T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-01-05",
                        openingBalanceCents: 12_345,
                        updatedAt: "2026-01-05T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -2_500,
                        enteredAt: "2026-02-01T12:00:00.000Z",
                        memo: "Weekly groceries",
                        occurredAt: "2026-02-01T00:00:00.000Z",
                        payee: "Market",
                        periodId: "2026-02",
                        postings: [],
                        referenceAccountId: "checking",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-02-01T12:00:00.000Z",
                                fromAccountId: "checking",
                                lineId: "market-line",
                                sortOrder: 0,
                                transactionId: "market-transaction",
                                updatedAt: "2026-02-01T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "market-transaction",
                        kind: "standard",
                        updatedAt: "2026-02-01T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        const table = screen.getByRole("table");
        const startingBalanceRow = screen.getByRole("row", {
            name: "Starting balance",
        });

        expect(
            within(startingBalanceRow).getByText("01/05/2026"),
        ).toBeInTheDocument();
        expect(
            within(startingBalanceRow).getByText("Starting balance"),
        ).toBeInTheDocument();
        expect(within(startingBalanceRow).getByText("Account")).toBeInTheDocument();
        expect(
            within(startingBalanceRow).getByText("Opening balance"),
        ).toBeInTheDocument();
        expect(within(startingBalanceRow).getByText("$123.45")).toBeInTheDocument();
        expect(within(startingBalanceRow).queryByRole("button")).toBeNull();
        expect(within(table).getAllByRole("row").at(-1)).toBe(startingBalanceRow);

        await user.click(screen.getByRole("button", { name: "Date" }));

        const sortedStartingBalanceRow = screen.getByRole("row", {
            name: "Starting balance",
        });
        expect(within(table).getAllByRole("row")[1]).toBe(sortedStartingBalanceRow);
    });

    it("groups transfer destinations and sources under separate category chooser headers", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accountContextId="checking"
                accounts={[
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "savings",
                        accountType: "savings",
                        balanceCents: 25_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_savings",
                        name: "Savings",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 25_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "credit",
                        accountType: "creditCard",
                        balanceCents: -7_500,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_credit",
                        name: "Credit Card",
                        openedOn: "2026-05-22",
                        openingBalanceCents: -7_500,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));
        await user.click(screen.getByRole("combobox", { name: "Category" }));

        const toAccountsHeader = screen.getByText("To accounts");
        const fromAccountsHeader = screen.getByText("From accounts");

        expect(screen.getAllByText("To accounts")).toHaveLength(1);
        expect(screen.getAllByText("From accounts")).toHaveLength(1);
        expect(
            screen.getByRole("option", { name: "To: Savings" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("option", { name: "To: Credit Card" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("option", { name: "From: Savings" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("option", { name: "From: Credit Card" }),
        ).toBeInTheDocument();
        expect(
            toAccountsHeader.compareDocumentPosition(fromAccountsHeader) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).not.toBe(0);
    });

    it("shows an existing transfer target in both transaction editor category choosers", async () => {
        const user = userEvent.setup();
        const accounts = [
            {
                accountId: "venmo",
                accountType: "cash",
                balanceCents: 5_300,
                createdAt: "2026-08-10T00:00:00.000Z",
                ledgerAccountId: "acct_venmo",
                name: "Venmo",
                openedOn: "2026-08-10",
                openingBalanceCents: 0,
                updatedAt: "2026-08-10T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                accountId: "checking",
                accountType: "checking",
                balanceCents: 10_000,
                createdAt: "2026-08-10T00:00:00.000Z",
                ledgerAccountId: "acct_checking",
                name: "Checking",
                openedOn: "2026-08-10",
                openingBalanceCents: 0,
                updatedAt: "2026-08-10T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ] satisfies AccountWithBalance[];
        const transaction = {
            displayAmountCents: 5_300,
            enteredAt: "2026-08-10T12:00:00.000Z",
            kind: "standard",
            occurredAt: "2026-08-10T12:00:00.000Z",
            payee: "Venmo transfer",
            periodId: "2026-08",
            postings: [],
            referenceAccountId: "checking",
            status: "entered",
            transactionId: "venmo-transfer",
            updatedAt: "2026-08-10T12:00:00.000Z",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 5_300,
                    createdAt: "2026-08-10T12:00:00.000Z",
                    fromAccountId: "venmo",
                    lineId: "transfer-line",
                    sortOrder: 0,
                    toAccountId: "checking",
                    transactionId: "venmo-transfer",
                    updatedAt: "2026-08-10T12:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
        } satisfies TransactionWithPostings;
        const snapshot = makeWorkspaceSnapshot({
            accounts,
            transactions: [transaction],
        });

        const { unmount } = renderWithWorkspace(
            <table>
                <tbody>
                    <TransactionInlineEditor
                        accounts={accounts}
                        accountContextId="venmo"
                        categories={[]}
                        columnCount={7}
                        onCancel={vi.fn()}
                        onSaved={vi.fn()}
                        showAccountColumn={false}
                        sourceCell={null}
                        transaction={transaction}
                    />
                </tbody>
            </table>,
            snapshot,
        );

        const inlineCategory = screen.getByRole("combobox", {
            name: "Category",
        });
        expect(inlineCategory).toHaveValue("To: Checking");
        await user.click(inlineCategory);
        expect(
            screen
                .getAllByRole("option", { name: "To: Checking" })
                .some((option) => option.getAttribute("aria-selected") === "true"),
        ).toBe(true);

        unmount();

        renderWithWorkspace(
            <TransactionDialog
                accounts={accounts}
                accountContextId="venmo"
                categories={[]}
                onClose={vi.fn()}
                open
                transaction={transaction}
            />,
            snapshot,
        );

        const dialog = screen.getByRole("dialog", {
            name: "Edit transaction",
        });
        const dialogCategory = within(dialog).getByRole("combobox", {
            name: "Category",
        });
        expect(dialogCategory).toHaveValue("To: Checking");
        await user.click(dialogCategory);
        expect(
            within(dialog)
                .getAllByRole("option", { name: "To: Checking" })
                .some((option) => option.getAttribute("aria-selected") === "true"),
        ).toBe(true);
        expect(
            within(dialog).getByRole("option", { name: "To: Venmo" }),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole("option", { name: "From: Venmo" }),
        ).toBeInTheDocument();
    });

    it("leaves new transaction account blank for all accounts context", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));

        expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue("");
    });

    it("hides tracking account transactions from all accounts but shows them for the tracking account", () => {
        const accounts = [
            {
                accountId: "checking",
                accountType: "checking" as const,
                balanceCents: 10_000,
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_checking",
                name: "Checking",
                openedOn: "2026-05-22",
                openingBalanceCents: 10_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                accountId: "brokerage",
                accountType: "tracking" as const,
                balanceCents: 500_000,
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_brokerage",
                name: "Brokerage",
                openedOn: "2026-05-22",
                openingBalanceCents: 500_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ];
        const transactions = [
            {
                displayAmountCents: -2_500,
                enteredAt: "2026-05-22T12:00:00.000Z",
                memo: "",
                occurredAt: "2026-05-22T12:00:00.000Z",
                payee: "Market",
                periodId: "2026-05",
                postings: [],
                referenceAccountId: "checking",
                status: "entered" as const,
                lines: [],
                transactionId: "checking-transaction",
                kind: "standard",
                updatedAt: "2026-05-22T12:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                displayAmountCents: 50_000,
                enteredAt: "2026-05-23T12:00:00.000Z",
                memo: "",
                occurredAt: "2026-05-23T12:00:00.000Z",
                payee: "Brokerage adjustment",
                periodId: "2026-05",
                postings: [],
                referenceAccountId: "brokerage",
                status: "entered" as const,
                lines: [],
                transactionId: "tracking-transaction",
                kind: "adjustment",
                updatedAt: "2026-05-23T12:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ] satisfies TransactionWithPostings[];
        const { unmount } = renderWithFeedback(
            <TransactionsTable
                accounts={accounts}
                categories={[]}
                transactions={transactions}
            />,
        );

        expect(screen.getByText("Market")).toBeInTheDocument();
        expect(screen.queryByText("Brokerage adjustment")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /Show Uncategorized/ }),
        ).not.toBeInTheDocument();

        unmount();

        renderWithFeedback(
            <TransactionsTable
                accountContextId="brokerage"
                accounts={accounts}
                categories={[]}
                transactions={transactions}
            />,
        );

        expect(screen.getByText("Brokerage adjustment")).toBeInTheDocument();
    });

    it("shows adjustments as muted adjustment rows in the category column", () => {
        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -5_000,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Balance correction",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 7_500,
                                categoryId: "utilities",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "savings",
                                lineId: "power-line",
                                sortOrder: 0,
                                transactionId: "power-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "adjustment-transaction",
                        kind: "adjustment",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        expect(screen.getByLabelText("Adjustment").getAttribute("class")).toContain(
            "text-[var(--color-muted)]",
        );
        expect(screen.getByText("adjustment").className).toContain(
            "text-[var(--color-muted)]",
        );
        expect(
            screen.queryByLabelText("Category assigned"),
        ).not.toBeInTheDocument();
    });

    it("labels manual and Plaid transactions in the source column", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -2_500,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Market",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 7_500,
                                categoryId: "utilities",
                                createdAt: "2026-05-23T12:00:00.000Z",
                                lineId: "paycheck-line",
                                sortOrder: 0,
                                toAccountId: "checking",
                                transactionId: "paycheck-transaction",
                                updatedAt: "2026-05-23T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "manual-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: -1_200,
                        enteredAt: "2026-05-23T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-23T12:00:00.000Z",
                        payee: "Coffee",
                        periodId: "2026-05",
                        plaidTransactionSyncId: "sync-1",
                        postings: [],
                        referenceAccountId: "account-1",
                        source: "plaid",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 1_000,
                                createdAt: "2026-05-21T12:00:00.000Z",
                                fromAccountId: "checking",
                                lineId: "mystery-line",
                                sortOrder: 0,
                                transactionId: "mystery-transaction",
                                updatedAt: "2026-05-21T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "plaid-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-23T12:00:00.000Z",
                        importActivities: [createTestImportActivity({
                            counterparty: "Coffee Shop",
                            provider: "venmo",
                            providerRecordId: "provider-2",
                        })],
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: 4_200,
                        enteredAt: "2026-05-24T12:00:00.000Z",
                        memo: "Dinner",
                        occurredAt: "2026-05-24T12:00:00.000Z",
                        payee: "Sample Friend",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        source: "venmo",
                        status: "entered",
                        lines: [],
                        transactionId: "venmo-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-24T12:00:00.000Z",
                        importActivities: [createTestImportActivity({
                            counterparty: "Sample Friend",
                            memo: "Dinner",
                            provider: "venmo",
                            providerAmountCents: 4_200,
                            providerRecordId: "provider-1",
                        })],
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        expect(
            screen
                .getAllByRole("columnheader")
                .map((header) => header.textContent?.trim()),
        ).toEqual([
            "",
            "Date",
            "Account",
            "Payee",
            "Category",
            "Memo",
            "Amount",
            "",
        ]);
        expect(
            screen.getByRole("columnheader", { name: "Date" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("columnheader", { name: "Date" }).closest("thead")
                ?.className,
        ).toContain("sticky");
        expect(
            screen.getByRole("columnheader", { name: "Account" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("columnheader", { name: "Occurred" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("columnheader", { name: "Type" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("columnheader", { name: "Actions" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("columnheader", { name: "Status" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("columnheader", { name: "Attention" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("columnheader", { name: "Source" }),
        ).not.toBeInTheDocument();
        expect(screen.getByText("05/22/2026")).toBeInTheDocument();
        expect(screen.getByLabelText("Manual source")).toBeInTheDocument();
        expect(screen.getByLabelText("Plaid source")).toBeInTheDocument();
        const mergedRow = screen.getByText("Coffee").closest("tr");
        expect(mergedRow).not.toBeNull();
        expect(
            within(mergedRow!).getByLabelText(
                "Managed Venmo transaction",
            ),
        ).toBeInTheDocument();
        const venmoRow = screen.getByText("Sample Friend").closest("tr");
        expect(venmoRow).not.toBeNull();
        expect(
            within(venmoRow!).getByLabelText("Venmo source"),
        ).toBeInTheDocument();
        expect(
            within(venmoRow!).queryByLabelText(/Managed Venmo/),
        ).not.toBeInTheDocument();
        await user.click(within(venmoRow!).getByText("Dinner"));
        expect(
            await screen.findByText("Paid Sample Friend with memo Dinner."),
        ).toBeVisible();
        expect(screen.getByText("provider-1")).toHaveClass("font-mono");
        await user.keyboard("{Escape}");
        expect(screen.getAllByLabelText("Category assigned")).toHaveLength(2);
        expect(screen.getByLabelText("Unassigned category")).toBeInTheDocument();

        await user.click(
            screen.getByRole("row", { name: /Select Sample Friend/ }),
        );
        await user.click(
            within(
                screen.getByRole("region", { name: "Selected row actions" }),
            ).getByRole("button", { name: "Edit Details" }),
        );
        const venmoDialog = screen.getByRole("dialog", {
            name: "Edit transaction",
        });
        await user.click(
            within(venmoDialog).getByRole("button", { name: "Reference info" }),
        );
        expect(within(venmoDialog).getByText("Venmo provider")).toBeVisible();
        const venmoProviderRecordIdField = within(venmoDialog)
            .getByText("Venmo provider record ID")
            .closest("div");
        expect(venmoProviderRecordIdField).not.toBeNull();
        expect(
            within(venmoProviderRecordIdField!).getByText("provider-1"),
        ).toHaveClass("font-mono");
        const venmoProviderAmountField = within(venmoDialog)
            .getByText("Venmo provider amount")
            .closest("div");
        expect(venmoProviderAmountField).not.toBeNull();
        expect(
            within(venmoProviderAmountField!).getByText("$42.00"),
        ).toBeVisible();
        expect(within(venmoDialog).getByText("Venmo activity ID")).toBeVisible();
        expect(
            within(venmoDialog).getByText("paymentReceived:provider-1"),
        ).toBeVisible();
        expect(within(venmoDialog).getByText("Venmo activity kind")).toBeVisible();
        expect(within(venmoDialog).getByText("Payment received")).toBeVisible();
        expect(within(venmoDialog).getByText("Venmo counterparty")).toBeVisible();
        expect(within(venmoDialog).getByText("Venmo memo")).toBeVisible();
        await user.keyboard("{Escape}");

        const marketRow = screen.getByText("Market").closest("tr");
        expect(marketRow).not.toBeNull();

        await user.click(marketRow!);

        expect(marketRow).toHaveAttribute("aria-selected", "true");
        expect(
            screen.getByRole("region", { name: "Selected row actions" }),
        ).toBeInTheDocument();
        expect(
            within(
                screen.getByRole("region", { name: "Selected row actions" }),
            ).getByRole("button", { name: "Edit Details" }),
        ).toBeInTheDocument();

        await user.keyboard("{Escape}");

        await waitFor(() =>
            expect(
                screen.queryByRole("region", {
                    name: "Selected row actions",
                }),
            ).not.toBeInTheDocument(),
        );

        await user.click(marketRow!);
        await user.click(marketRow!);
        await waitFor(() =>
            expect(
                screen.queryByRole("region", {
                    name: "Selected row actions",
                }),
            ).not.toBeInTheDocument(),
        );

        await user.click(marketRow!);
        await user.keyboard("e");

        const dialog = screen.getByRole("dialog", {
            name: "Edit transaction",
        });
        expect(within(dialog).queryByText("Source")).not.toBeInTheDocument();
        const referenceInfoButton = within(dialog).getByRole("button", {
            name: "Reference info",
        });
        expect(referenceInfoButton).toHaveAttribute("aria-expanded", "false");

        await user.click(referenceInfoButton);

        expect(referenceInfoButton).toHaveAttribute("aria-expanded", "true");
        expect(within(dialog).getByText("Account")).toBeInTheDocument();
        expect(within(dialog).getByText("Checking")).toBeInTheDocument();
        expect(within(dialog).getByText("Source")).toBeInTheDocument();
        expect(within(dialog).getByText("Manual")).toBeInTheDocument();
        expect(within(dialog).getByText("Status")).toBeInTheDocument();
        expect(within(dialog).getByText("Entered")).toBeInTheDocument();
        expect(
            within(dialog).queryByText("Latest Plaid amount"),
        ).not.toBeInTheDocument();

        await user.keyboard("{Escape}");
        expect(
            screen.queryByRole("dialog", {
                name: "Edit transaction",
            }),
        ).not.toBeInTheDocument();

        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                target: {
                    targetType: "transaction",
                    targetId: "manual-transaction",
                    displayName: "Market",
                    sectionId: "transactions",
                },
                dependentCounts: [{ label: "Ledger postings", count: 0 }],
                affectedPeriods: ["2026-05"],
                preservedRecords: [],
                crossAreaEffects: [],
                isPermanent: true,
                permanentWarning: "This deletion is permanent and cannot be undone.",
                previewRevision: "preview-1",
            }),
        } as Response);

        await user.click(marketRow!);
        await user.keyboard("d");

        expect(
            await screen.findByRole("dialog", { name: "Delete Market?" }),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", { name: "Delete Market?" }),
            ).not.toBeInTheDocument(),
        );

        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                target: {
                    targetType: "transaction",
                    targetId: "manual-transaction",
                    displayName: "Market",
                    sectionId: "transactions",
                },
                dependentCounts: [{ label: "Ledger postings", count: 0 }],
                affectedPeriods: ["2026-05"],
                preservedRecords: [],
                crossAreaEffects: [],
                isPermanent: true,
                permanentWarning: "This deletion is permanent and cannot be undone.",
                previewRevision: "preview-2",
            }),
        } as Response);

        await user.click(marketRow!);
        await user.keyboard("{Delete}");

        expect(
            await screen.findByRole("dialog", { name: "Delete Market?" }),
        ).toBeInTheDocument();
    });

    it("activates visible transactions with wrapping arrows and keeps action-bar commands available", async () => {
        const user = userEvent.setup();
        const scrollIntoView = vi.fn();
        const makeTransaction = (
            transactionId: string,
            payee: string,
            occurredAt: string,
        ): TransactionWithPostings => ({
            displayAmountCents: -1_000,
            enteredAt: occurredAt,
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 1_000,
                    categoryId: "groceries",
                    createdAt: occurredAt,
                    fromAccountId: "account-1",
                    ledgerId: "ledger-1",
                    lineId: `${transactionId}-line`,
                    sortOrder: 0,
                    transactionId,
                    updatedAt: occurredAt,
                },
            ],
            memo: "",
            occurredAt,
            payee,
            periodId: "2026-05",
            postings: [],
            referenceAccountId: "account-1",
            referenceCategoryId: "groceries",
            source: "manual",
            status: "entered",
            transactionId,
            updatedAt: occurredAt,
        });

        Object.defineProperty(Element.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoView,
        });

        renderWithFeedback(
            <>
                <input aria-label="Outside transaction filter" />
                <TransactionsTable
                    accounts={[
                        {
                            accountId: "account-1",
                            accountType: "checking",
                            balanceCents: 10_000,
                            createdAt: "2026-05-22T00:00:00.000Z",
                            ledgerAccountId: "acct_checking",
                            name: "Checking",
                            openedOn: "2026-05-22",
                            openingBalanceCents: 10_000,
                            updatedAt: "2026-05-22T00:00:00.000Z",
                            ledgerId: "ledger-1",
                        },
                    ]}
                    categories={[
                        {
                            categoryId: "groceries",
                            ledgerAccountId: "category_groceries",
                            name: "Groceries",
                            status: "active",
                        },
                    ]}
                    transactions={[
                        makeTransaction(
                            "transaction-3",
                            "Third Vendor",
                            "2026-05-23T12:00:00.000Z",
                        ),
                        makeTransaction(
                            "transaction-2",
                            "Second Vendor",
                            "2026-05-22T12:00:00.000Z",
                        ),
                        makeTransaction(
                            "transaction-1",
                            "First Vendor",
                            "2026-05-21T12:00:00.000Z",
                        ),
                    ]}
                />
            </>,
        );

        const outsideInput = screen.getByRole("textbox", {
            name: "Outside transaction filter",
        });
        const thirdRow = screen.getByText("Third Vendor").closest("tr")!;
        const secondRow = screen.getByText("Second Vendor").closest("tr")!;
        const firstRow = screen.getByText("First Vendor").closest("tr")!;
        const bottomSpacer = document.querySelector(
            "[data-transaction-list-bottom-spacer='true']",
        );

        expect(bottomSpacer).toHaveClass("h-28");
        expect(bottomSpacer).toHaveAttribute("aria-hidden", "true");

        outsideInput.focus();
        fireEvent.keyDown(outsideInput, { key: "ArrowDown" });
        expect(thirdRow).toHaveAttribute("aria-selected", "false");

        outsideInput.blur();
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(thirdRow).toHaveAttribute("aria-selected", "true");
        expect(thirdRow).toHaveFocus();
        expect(thirdRow).toHaveClass("scroll-mt-16", "scroll-mb-28");

        const actionBar = await screen.findByRole("region", {
            name: "Selected row actions",
        });
        expect(
            within(actionBar).getByRole("button", { name: "Edit Details" }),
        ).toBeInTheDocument();
        expect(
            within(actionBar).getByRole("button", { name: "Categorize" }),
        ).toBeInTheDocument();
        expect(
            within(actionBar).getByRole("button", { name: "Lock" }),
        ).toBeInTheDocument();
        expect(
            within(actionBar).getByRole("button", { name: "Delete" }),
        ).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "ArrowDown", repeat: true });
        expect(thirdRow).toHaveAttribute("aria-selected", "false");
        expect(secondRow).toHaveAttribute("aria-selected", "true");

        fireEvent.keyDown(window, { key: "ArrowUp", repeat: true });
        expect(thirdRow).toHaveAttribute("aria-selected", "true");

        fireEvent.keyDown(window, { key: "ArrowUp", repeat: true });
        expect(firstRow).toHaveAttribute("aria-selected", "true");
        expect(thirdRow).toHaveAttribute("aria-selected", "false");

        await user.keyboard("{Escape}");
        await user.click(thirdRow);
        await user.click(secondRow);
        expect(screen.getByText("2 transactions selected")).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(firstRow).toHaveAttribute("aria-selected", "true");
        expect(secondRow).toHaveAttribute("aria-selected", "false");
        expect(thirdRow).toHaveAttribute("aria-selected", "false");

        await user.keyboard("{Enter}");
        const payeeInput = await screen.findByLabelText("Payee");
        expect(payeeInput).toHaveValue("First Vendor");
        await waitFor(() => expect(payeeInput).toHaveFocus());
        expect(screen.queryByRole("dialog", { name: "Edit transaction" })).not.toBeInTheDocument();
        expect(scrollIntoView).toHaveBeenCalledWith({
            behavior: "auto",
            block: "nearest",
            inline: "nearest",
        });
    });

    it("toggles full memo display from the memo header", async () => {
        const user = userEvent.setup();
        const longMemo =
            "Amazon order 111-222 with storage bins, receipt details, and household supplies";

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -2_500,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: longMemo,
                        importActivities: [createTestImportActivity({
                            itemSummary: "Storage bins",
                            provider: "amazon",
                            providerRecordId: "payment-1",
                        })],
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Market",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "checking",
                                lineId: "market-line",
                                sortOrder: 0,
                                transactionId: "market-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "market-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        expect(screen.getByRole("table")).toHaveClass("table-fixed");
        expect(screen.getByText(longMemo)).toHaveClass("truncate");
        expect(screen.getByText("Storage bins")).toHaveClass("truncate");
        expect(
            screen.getByText(longMemo).compareDocumentPosition(
                screen.getByText("Storage bins"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Show full memos" }));

        expect(screen.getByText(longMemo)).toHaveClass("whitespace-normal");
        expect(
            screen.getByRole("button", { name: "Truncate memos" }),
        ).toHaveAttribute("aria-pressed", "true");
    });

    it("loads original Plaid details when the configuration snapshot omits transaction sync records", async () => {
        const user = userEvent.setup();
        const generatedAt = "2026-05-23T12:00:00.000Z";
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            if (String(input) === "/api/transactions/transaction-1/plaid-reference") {
                return {
                    ok: true,
                    json: async () => ({
                        reference: {
                            categoryText: "Food and Drink",
                            lastSyncedAt: generatedAt,
                            merchantName: "Coffee Shop",
                            name: "Coffee",
                            pending: false,
                            plaidAmountCents: 1_234,
                            plaidDate: "2026-05-21",
                            plaidTransactionSyncId: "sync-1",
                            status: "active",
                        },
                    }),
                };
            }

            return {
                ok: true,
                json: async () => createIntegrationWorkspaceMutationResponse(),
            };
        });
        vi.stubGlobal("fetch", fetchMock);
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: generatedAt,
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: generatedAt,
            ledgerId: "ledger-1",
        };
        const transaction = {
            displayAmountCents: -1_234,
            enteredAt: generatedAt,
            memo: "Edited memo",
            importActivities: [createTestImportActivity({
                itemSummary: "Coffee filters",
                provider: "amazon",
                providerAmountCents: 1_234,
                providerRecordId: "payment-1",
            })],
            occurredAt: "2026-05-22T12:00:00.000Z",
            payee: "Coffee",
            periodId: "2026-05",
            plaidTransactionSyncId: "sync-1",
            postings: [],
            referenceAccountId: "account-1",
            source: "plaid" as const,
            status: "entered" as const,
            lines: [
                {
                    amountCents: 1_234,
                    createdAt: generatedAt,
                    fromAccountId: "account-1",
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: generatedAt,
                    ledgerId: "ledger-1",
                },
            ],
            transactionId: "transaction-1",
            kind: "standard" as const,
            updatedAt: generatedAt,
            ledgerId: "ledger-1",
        } satisfies TransactionWithPostings;
        const snapshot = {
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
                    allocationFundingSource: 0,
                    budgetCategory: 0,
                    budgetGroup: 0,
                    budgetPeriod: 0,
                    categoryAllocation: 0,
                    ledger: 1,
                    ledgerPosting: 0,
                    plaidAccountLink: 0,
                    plaidTransactionSync: 0,
                    transaction: 1,
                    transactionLine: 1,
                },
                generatedAt,
                retainedChangesAfter: "2026-04-22T00:00:00.000Z",
                revision: "test",
            },
            ledgerPostings: [],
            ledgers: [
                {
                    createdAt: generatedAt,
                    isDefault: false,
                    ledgerId: "ledger-1",
                    workspaceId: "global",
                    name: "2026",
                    status: "active" as const,
                    updatedAt: generatedAt,
                },
            ],
            plaidAccountLinks: [],
            plaidTransactionSyncs: [],
            transactionLines: transaction.lines,
            transactions: [transaction],
        } satisfies WorkspaceSnapshot;

        renderWithWorkspace(
            <TransactionDialog
                accounts={[account]}
                categories={[]}
                onClose={vi.fn()}
                open
                transaction={transaction}
            />,
            snapshot,
        );

        const dialog = screen.getByRole("dialog", {
            name: "Edit transaction",
        });
        expect(
            within(dialog).queryByText("Original Plaid amount"),
        ).not.toBeInTheDocument();
        expect(within(dialog).getByLabelText("Memo")).toHaveValue("Edited memo");
        expect(
            within(dialog).getByText("Managed Information"),
        ).toBeVisible();
        expect(within(dialog).getByText("Transaction ID:")).toBeVisible();
        const managedOrderInfo = within(dialog).getByText("Coffee filters");
        expect(managedOrderInfo).toBeVisible();
        expect(managedOrderInfo.closest(".text-sm")).not.toBeNull();
        expect(managedOrderInfo.closest("[data-managed-order-information]")).not.toBeNull();

        await user.click(
            within(dialog).getByRole("button", { name: "Reference info" }),
        );

        const originalAmountLabel = await within(dialog).findByText(
            "Latest Plaid amount",
        );
        const infoPane = originalAmountLabel.closest("dl");

        expect(infoPane).not.toBeNull();
        expect(
            within(infoPane as HTMLElement).queryByText("Plaid reference"),
        ).not.toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("Transaction ID"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("transaction-1"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("Amazon provider record ID"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("payment-1"),
        ).toHaveClass("font-mono");
        expect(
            within(infoPane as HTMLElement).getByText("111-222"),
        ).toHaveClass("font-mono");
        expect(
            within(infoPane as HTMLElement).getByText("Amazon provider amount"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("Amazon order number"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("Amazon item summary"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("Amazon payment kind"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("Latest Plaid date"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("2026-05-21"),
        ).toBeInTheDocument();
        expect(
            within(infoPane as HTMLElement).getByText("-$12.34"),
        ).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/transactions/transaction-1/plaid-reference",
        );
    });

    it("supports range selection and bulk transaction delete", async () => {
        const user = userEvent.setup();

        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = getFetchRequestUrl(input);
                const method = init?.method ?? "GET";

                if (url === "/api/transactions/deletion-impact" && method === "POST") {
                    return {
                        ok: true,
                        headers: new Headers(),
                        json: async () => ({
                            target: {
                                targetType: "transaction",
                                targetId: "bulk:transaction-1|transaction-2|transaction-3",
                                displayName: "3 transactions",
                                sectionId: "transactions",
                            },
                            dependentCounts: [{ label: "Transactions", count: 3 }],
                            affectedPeriods: ["2026-05"],
                            preservedRecords: [],
                            crossAreaEffects: [],
                            isPermanent: true,
                            permanentWarning:
                                "This deletion is permanent and cannot be undone.",
                            previewRevision: "bulk-preview-1",
                        }),
                    };
                }

                if (url === "/api/transactions" && method === "DELETE") {
                    return {
                        ok: true,
                        headers: new Headers(),
                        json: async () => ({ deletedCount: 3 }),
                    };
                }

                return {
                    ok: false,
                    headers: new Headers(),
                    json: async () => ({
                        error: {
                            code: "unexpected_request",
                            message: "Unexpected request.",
                        },
                    }),
                };
            },
        );

        vi.stubGlobal("fetch", fetchMock);

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -3_000,
                        enteredAt: "2026-05-23T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-23T12:00:00.000Z",
                        payee: "Third Vendor",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "checking-1",
                                lineId: "transfer-line",
                                sortOrder: 0,
                                toAccountId: "savings-1",
                                transactionId: "transfer-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "transaction-3",
                        kind: "standard",
                        updatedAt: "2026-05-23T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: -2_000,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Second Vendor",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "checking-1",
                                lineId: "transfer-line",
                                sortOrder: 0,
                                toAccountId: "savings-1",
                                transactionId: "transfer-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "transaction-2",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: -1_000,
                        enteredAt: "2026-05-21T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-21T12:00:00.000Z",
                        payee: "First Vendor",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-20T12:00:00.000Z",
                                fromAccountId: "checking",
                                lineId: "market-line",
                                sortOrder: 0,
                                transactionId: "market-transaction",
                                updatedAt: "2026-05-20T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "transaction-1",
                        kind: "standard",
                        updatedAt: "2026-05-21T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        const thirdRow = screen.getByText("Third Vendor").closest("tr");
        const secondRow = screen.getByText("Second Vendor").closest("tr");
        const firstRow = screen.getByText("First Vendor").closest("tr");

        expect(thirdRow).not.toBeNull();
        expect(secondRow).not.toBeNull();
        expect(firstRow).not.toBeNull();

        await user.click(thirdRow!);
        fireEvent.click(firstRow!, { shiftKey: true });

        expect(thirdRow).toHaveAttribute("aria-selected", "true");
        expect(secondRow).toHaveAttribute("aria-selected", "true");
        expect(firstRow).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("3 transactions selected")).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Edit Details" }),
        ).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "3 transactions selected" }),
        );
        await waitFor(() =>
            expect(
                screen.queryByRole("region", {
                    name: "Selected row actions",
                }),
            ).not.toBeInTheDocument(),
        );

        await user.click(thirdRow!);
        await user.click(firstRow!);

        expect(thirdRow).toHaveAttribute("aria-selected", "true");
        expect(secondRow).toHaveAttribute("aria-selected", "false");
        expect(firstRow).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("2 transactions selected")).toBeInTheDocument();

        await user.click(firstRow!);

        expect(thirdRow).toHaveAttribute("aria-selected", "true");
        expect(secondRow).toHaveAttribute("aria-selected", "false");
        expect(firstRow).toHaveAttribute("aria-selected", "false");

        await user.click(
            within(thirdRow!).getByRole("checkbox", {
                name: "Deselect Third Vendor",
            }),
        );

        expect(thirdRow).toHaveAttribute("aria-selected", "false");
        await waitFor(() =>
            expect(
                screen.queryByRole("region", {
                    name: "Selected row actions",
                }),
            ).not.toBeInTheDocument(),
        );

        await user.click(thirdRow!);

        fireEvent.click(firstRow!, { shiftKey: true });

        expect(thirdRow).toHaveAttribute("aria-selected", "true");
        expect(secondRow).toHaveAttribute("aria-selected", "true");
        expect(firstRow).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText("3 transactions selected")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(
            screen.getByRole("dialog", {
                name: "Delete 3 transactions?",
            }),
        ).toBeInTheDocument();
        expect(
            await screen.findByText(
                "This deletion is permanent. All related data will be deleted.",
            ),
        ).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/transactions/deletion-impact",
            expect.objectContaining({ method: "POST" }),
        );

        const [, previewRequest] = fetchMock.mock.calls[0];
        expect(JSON.parse(String(previewRequest?.body))).toEqual({
            transactionIds: ["transaction-3", "transaction-2", "transaction-1"],
        });
        expect(
            screen.getByText(
                "This deletion is permanent. All related data will be deleted.",
            ),
        ).toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Delete permanently" }),
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/transactions",
            expect.objectContaining({ method: "DELETE" }),
        );

        const [, request] = fetchMock.mock.calls[1];
        expect(JSON.parse(String(request?.body))).toMatchObject({
            mutationId: expect.any(String),
            previewRevision: "bulk-preview-1",
            transactionIds: ["transaction-3", "transaction-2", "transaction-1"],
        });
    });

    it("categorizes selected standard transactions", async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers(),
            json: async () =>
                createIntegrationWorkspaceMutationResponse({
                    body: { updatedCount: 2 },
                }),
        });
        vi.stubGlobal("fetch", fetchMock);

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -1_000,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        kind: "standard",
                        lines: [
                            {
                                amountCents: 1_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "transaction-1",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        memo: "",
                        occurredAt: "2026-05-22T00:00:00.000Z",
                        payee: "Market One",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        status: "entered",
                        transactionId: "transaction-1",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: -2_000,
                        enteredAt: "2026-05-23T12:00:00.000Z",
                        kind: "standard",
                        lines: [
                            {
                                amountCents: 2_000,
                                createdAt: "2026-05-23T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-2",
                                sortOrder: 0,
                                transactionId: "transaction-2",
                                updatedAt: "2026-05-23T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        memo: "",
                        occurredAt: "2026-05-23T00:00:00.000Z",
                        payee: "Market Two",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        status: "entered",
                        transactionId: "transaction-2",
                        updatedAt: "2026-05-23T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        const firstRow = screen.getByText("Market One").closest("tr");
        const secondRow = screen.getByText("Market Two").closest("tr");
        expect(firstRow).not.toBeNull();
        expect(secondRow).not.toBeNull();

        await user.click(firstRow!);
        await user.click(secondRow!);
        await user.click(screen.getByRole("button", { name: "Categorize" }));

        const dialog = screen.getByRole("dialog", {
            name: "Categorize 2 transactions",
        });
        const categoryCombobox = within(dialog).getByRole("combobox", {
            name: "Category",
        });
        await selectComboboxOption(user, categoryCombobox, "Groceries");
        await user.click(
            within(dialog).getByRole("button", { name: "Categorize" }),
        );

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/transactions/categorize",
            expect.objectContaining({ method: "POST" }),
        );
        const [, request] = fetchMock.mock.calls[0];
        expect(JSON.parse(String(request?.body))).toMatchObject({
            categoryId: "groceries",
            mutationId: expect.any(String),
            transactionIds: ["transaction-2", "transaction-1"],
        });
        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", {
                    name: "Categorize 2 transactions",
                }),
            ).not.toBeInTheDocument(),
        );
    });

    it("optimistically locks a selected transaction before the server responds", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const transaction = {
            displayAmountCents: -1_000,
            enteredAt: "2026-05-22T12:00:00.000Z",
            kind: "standard" as const,
            lines: [
                {
                    amountCents: 1_000,
                    createdAt: "2026-05-22T12:00:00.000Z",
                    fromAccountId: "account-1",
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: "2026-05-22T12:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            occurredAt: "2026-05-22T00:00:00.000Z",
            payee: "Market",
            periodId: "2026-05",
            postings: [],
            referenceAccountId: "account-1",
            status: "cleared" as const,
            transactionId: "transaction-1",
            updatedAt: "2026-05-22T12:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const snapshot = makeWorkspaceSnapshot({
            accounts: [account],
            transactionLines: transaction.lines,
            transactions: [transaction],
        });
        const fetchMock = vi.fn(
            (_input: RequestInfo | URL, _init?: RequestInit) => {
                void _input;
                void _init;
                return new Promise<Response>(() => undefined);
            },
        );
        vi.stubGlobal("fetch", fetchMock);

        renderWithWorkspace(<WorkspaceTransactionsTable />, snapshot);

        await user.click(screen.getByText("Market").closest("tr")!);
        await user.click(screen.getByRole("button", { name: "Lock" }));

        expect(
            await screen.findByLabelText("Reconciled and locked"),
        ).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/transactions/status",
            expect.objectContaining({ method: "POST" }),
        );
        const [, lockRequest] = fetchMock.mock.calls[0];
        expect(JSON.parse(String(lockRequest?.body))).toMatchObject({
            status: "reconciled",
            transactionIds: ["transaction-1"],
        });
    });

    it("enables merge for a Plaid transfer and a separate Plaid side", async () => {
        const user = userEvent.setup();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers(),
                json: async () =>
                    createIntegrationWorkspaceMutationResponse({
                        body: {
                            deletedTransactionId: "plaid-payment",
                            transaction: {
                                transactionId: "manual-transfer",
                            },
                        },
                    }),
            }),
        );

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "credit-card",
                        accountType: "creditCard",
                        balanceCents: -5_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_credit_card",
                        name: "Credit Card",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 0,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[
                    {
                        displayAmountCents: -5_000,
                        enteredAt: "2026-05-20T12:00:00.000Z",
                        memo: "Downloaded payment",
                        occurredAt: "2026-05-20T12:00:00.000Z",
                        payee: "Payment Thank You",
                        periodId: "2026-05",
                        plaidTransactionSyncId: "sync-1",
                        postings: [],
                        referenceAccountId: "credit-card",
                        source: "plaid",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "checking-1",
                                lineId: "transfer-line",
                                sortOrder: 0,
                                toAccountId: "savings-1",
                                transactionId: "transfer-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "plaid-payment",
                        kind: "standard",
                        updatedAt: "2026-05-20T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: -5_000,
                        enteredAt: "2026-05-18T12:00:00.000Z",
                        memo: "Manual transfer",
                        occurredAt: "2026-05-18T12:00:00.000Z",
                        payee: "Credit card payment",
                        periodId: "2026-05",
                        plaidTransactionSyncId: "checking-sync",
                        postings: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-18T12:00:00.000Z",
                                direction: "credit",
                                ledgerAccountId: "acct_checking",
                                ledgerAccountKind: "financial",
                                occurredAt: "2026-05-18T12:00:00.000Z",
                                periodId: "2026-05",
                                postingId: "posting-1",
                                transactionId: "manual-transfer",
                                ledgerId: "ledger-1",
                            },
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-18T12:00:00.000Z",
                                direction: "debit",
                                ledgerAccountId: "acct_credit_card",
                                ledgerAccountKind: "financial",
                                occurredAt: "2026-05-18T12:00:00.000Z",
                                periodId: "2026-05",
                                postingId: "posting-2",
                                transactionId: "manual-transfer",
                                ledgerId: "ledger-1",
                            },
                        ],
                        referenceAccountId: "checking",
                        source: "plaid",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "checking-1",
                                lineId: "transfer-line",
                                sortOrder: 0,
                                toAccountId: "savings-1",
                                transactionId: "transfer-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "manual-transfer",
                        kind: "standard",
                        updatedAt: "2026-05-18T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        const plaidRow = screen.getByText("Payment Thank You").closest("tr");
        const manualRow = screen.getByText("Credit card payment").closest("tr");

        expect(plaidRow).not.toBeNull();
        expect(manualRow).not.toBeNull();

        await user.click(manualRow!);
        fireEvent.click(plaidRow!, { metaKey: true });

        const mergeButton = screen.getByRole("button", { name: "Merge" });
        expect(mergeButton).toBeEnabled();

        await user.keyboard("m");

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        expect(fetch).toHaveBeenCalledWith(
            "/api/transactions/merge",
            expect.objectContaining({ method: "POST" }),
        );

        const [, request] = vi.mocked(fetch).mock.calls[0];
        expect(JSON.parse(String(request?.body))).toMatchObject({
            mutationId: expect.any(String),
            transactionIds: ["plaid-payment", "manual-transfer"],
        });
        expect(screen.queryByText("Transactions merged.")).not.toBeInTheDocument();
    });

    it("shows, collapses, and merges a ready uncategorized auto-match", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const createTransaction = (
            transactionId: string,
            source: "manual" | "plaid",
            occurredAt: string,
        ): TransactionWithPostings => ({
            displayAmountCents: -5_000,
            enteredAt: occurredAt,
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 5_000,
                    createdAt: occurredAt,
                    fromAccountId: "account-1",
                    ledgerId: "ledger-1",
                    lineId: `${transactionId}-line`,
                    sortOrder: 0,
                    transactionId,
                    updatedAt: occurredAt,
                },
            ],
            memo: "",
            occurredAt,
            payee: source === "plaid" ? "Downloaded payment" : "Payment",
            periodId: "2026-05",
            postings: [],
            referenceAccountId: "account-1",
            source,
            status: "entered",
            transactionId,
            updatedAt: occurredAt,
        });

        const manualTransaction = {
            ...createTransaction(
                "manual-transaction",
                "manual",
                "2026-05-18T12:00:00.000Z",
            ),
            memo: "Manual payment memo with enough detail to be expanded from the auto-match pane.",
        };
        const plaidTransaction = {
            ...createTransaction(
                "plaid-transaction",
                "plaid",
                "2026-05-20T12:00:00.000Z",
            ),
            lines: [
                {
                    ...createTransaction(
                        "plaid-transaction",
                        "plaid",
                        "2026-05-20T12:00:00.000Z",
                    ).lines[0],
                    categoryId: "groceries",
                },
            ],
            memo: "Institution payment memo",
        };

        renderWithFeedback(
            <TransactionsTable
                accounts={[account]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category-groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                transactions={[manualTransaction, plaidTransaction]}
            />,
        );

        const autoMatches = screen.getByRole("region", {
            name: "Auto matches",
        });
        expect(within(autoMatches).getByText("Ready to merge")).toBeInTheDocument();
        expect(within(autoMatches).getByText("05/18/2026")).toBeInTheDocument();
        expect(within(autoMatches).getByText("Uncategorized")).toHaveClass(
            "text-[var(--tone-warning-ink)]",
        );
        expect(within(autoMatches).getByText("Groceries")).toBeInTheDocument();
        const memoButton = within(autoMatches).getByRole("button", {
            name: "Expand memo for Payment",
        });
        expect(memoButton).toHaveAttribute("aria-expanded", "false");
        await user.click(memoButton);
        expect(memoButton).toHaveAttribute("aria-expanded", "true");

        await user.click(
            within(autoMatches).getByRole("button", {
                name: "Hide matches",
            }),
        );
        expect(
            within(autoMatches).queryByText("Ready to merge"),
        ).not.toBeInTheDocument();

        await user.click(
            within(autoMatches).getByRole("button", {
                name: "Show matches",
            }),
        );
        expect(
            within(autoMatches).getByRole("button", { name: "Do not Merge" }),
        ).toHaveClass("bg-[var(--color-secondary-action)]");
        await user.click(
            within(autoMatches).getByRole("button", { name: "Merge" }),
        );

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        const [, request] = vi.mocked(fetch).mock.calls[0];
        expect(JSON.parse(String(request?.body))).toMatchObject({
            expectedMatchType: "duplicate",
            mutationId: expect.any(String),
            transactionIds: ["manual-transaction", "plaid-transaction"],
        });
    });

    it("shows and merges a bank-to-credit-card payment from either account scope", async () => {
        const user = userEvent.setup();
        const checking = {
            accountId: "checking-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct-checking",
            ledgerId: "ledger-1",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
        };
        const creditCard = {
            accountId: "credit-card-1",
            accountType: "creditCard" as const,
            balanceCents: -2_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct-credit-card",
            ledgerId: "ledger-1",
            name: "Credit Card",
            openedOn: "2026-05-22",
            openingBalanceCents: -2_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
        };
        const bankPayment: TransactionWithPostings = {
            displayAmountCents: -5_000,
            enteredAt: "2026-05-18T12:00:00.000Z",
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 5_000,
                    createdAt: "2026-05-18T12:00:00.000Z",
                    fromAccountId: checking.accountId,
                    ledgerId: "ledger-1",
                    lineId: "bank-line",
                    sortOrder: 0,
                    transactionId: "bank-payment",
                    updatedAt: "2026-05-18T12:00:00.000Z",
                },
            ],
            occurredAt: "2026-05-18T12:00:00.000Z",
            payee: "Bank card payment",
            periodId: "2026-05",
            postings: [],
            referenceAccountId: checking.accountId,
            source: "plaid",
            status: "cleared",
            transactionId: "bank-payment",
            updatedAt: "2026-05-18T12:00:00.000Z",
        };
        const cardPayment: TransactionWithPostings = {
            displayAmountCents: 5_000,
            enteredAt: "2026-05-20T12:00:00.000Z",
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 5_000,
                    createdAt: "2026-05-20T12:00:00.000Z",
                    ledgerId: "ledger-1",
                    lineId: "card-line",
                    sortOrder: 0,
                    toAccountId: creditCard.accountId,
                    transactionId: "card-payment",
                    updatedAt: "2026-05-20T12:00:00.000Z",
                },
            ],
            occurredAt: "2026-05-20T12:00:00.000Z",
            payee: "Card payment received",
            periodId: "2026-05",
            postings: [],
            referenceAccountId: creditCard.accountId,
            source: "plaid",
            status: "cleared",
            transactionId: "card-payment",
            updatedAt: "2026-05-20T12:00:00.000Z",
        };
        const fetchMock = vi.fn<typeof fetch>();
        fetchMock.mockImplementation(
            () => new Promise<Response>(() => undefined),
        );
        vi.stubGlobal("fetch", fetchMock);

        renderWithFeedback(
            <TransactionsTable
                accountContextId={checking.accountId}
                accounts={[checking, creditCard]}
                autoMatchTransactions={[bankPayment, cardPayment]}
                categories={[]}
                transactions={[bankPayment]}
            />,
        );

        const pane = screen.getByRole("region", { name: "Auto matches" });
        expect(within(pane).getByText("Credit card payment")).toBeInTheDocument();
        expect(within(pane).getByText("Checking -> Credit Card")).toBeInTheDocument();
        expect(
            within(screen.getByRole("table")).queryByText("Card payment received"),
        ).not.toBeInTheDocument();

        await user.click(within(pane).getByRole("button", { name: "Merge" }));

        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(
                    ([url]) => url === "/api/transactions/merge",
                ),
            ).toBe(true),
        );
        const [, request] = fetchMock.mock.calls.find(
            ([url]) => url === "/api/transactions/merge",
        )!;
        expect(JSON.parse(String(request?.body))).toMatchObject({
            expectedMatchType: "creditCardPayment",
            transactionIds: ["bank-payment", "card-payment"],
        });
    });

    it("projects a merge before the server responds", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "checking-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct-checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const createTransaction = (input: {
            categoryId?: string;
            lineId: string;
            payee: string;
            source: "manual" | "plaid";
            transactionId: string;
        }): TransactionWithPostings => ({
            displayAmountCents: -1_250,
            enteredAt: "2026-05-22T00:00:00.000Z",
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 1_250,
                    categoryId: input.categoryId,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    fromAccountId: "checking-1",
                    ledgerId: "ledger-1",
                    lineId: input.lineId,
                    sortOrder: 0,
                    transactionId: input.transactionId,
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
            occurredAt: "2026-05-22",
            payee: input.payee,
            periodId: "2026-05",
            postings: [],
            referenceAccountId: "checking-1",
            source: input.source,
            status: "cleared",
            transactionId: input.transactionId,
            updatedAt: "2026-05-22T00:00:00.000Z",
        });
        const manual = createTransaction({
            lineId: "manual-line",
            payee: "Manual duplicate",
            source: "manual",
            transactionId: "manual-transaction",
        });
        const plaid = createTransaction({
            categoryId: "groceries-1",
            lineId: "plaid-line",
            payee: "Plaid survivor",
            source: "plaid",
            transactionId: "plaid-transaction",
        });
        const snapshot = makeWorkspaceSnapshot({
            accounts: [account],
            budgetCategories: [
                {
                    categoryId: "groceries-1",
                    categoryType: "spending",
                    createdAt: "2026-05-22T00:00:00.000Z",
                    defaultAssignedCents: 0,
                    groupId: "group-1",
                    isIncomeCategory: false,
                    ledgerAccountId: "category-groceries",
                    ledgerId: "ledger-1",
                    name: "Groceries",
                    sortOrder: 0,
                    status: "active",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                },
            ],
            transactionLines: [...manual.lines, ...plaid.lines],
            transactions: [manual, plaid],
        });
        const fetchMock = vi.fn(
            () => new Promise<Response>(() => undefined),
        );
        vi.stubGlobal("fetch", fetchMock);

        renderWithWorkspace(<WorkspaceTransactionsTable />, snapshot);

        const getTransactionRow = (payee: string) =>
            screen
                .getAllByText(payee)
                .map((element) => element.closest("tr"))
                .find((row): row is HTMLTableRowElement => Boolean(row));

        await user.click(getTransactionRow("Manual duplicate")!);
        await user.click(getTransactionRow("Plaid survivor")!);
        await user.click(screen.getByText("M").closest("button")!);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(screen.queryAllByText("Manual duplicate")).toHaveLength(0);
        expect(screen.getByText("Plaid survivor")).toBeInTheDocument();
        expect(screen.queryByText("Transactions merged.")).not.toBeInTheDocument();
    });

    it("links the transaction account selector to all accounts and account-specific routes", () => {
        renderWithFeedback(
            <TransactionAccountSelector
                accounts={[
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Everyday Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        plaidInstitutionLogo: "base64-logo",
                        plaidInstitutionName: "Test Bank",
                        plaidLastSyncedAt: "2026-05-24T12:00:00.000Z",
                        plaidLastSyncStatus: "succeeded",
                        plaidLinkStatus: "linked",
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "savings",
                        accountType: "savings",
                        balanceCents: 20_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_savings",
                        name: "Savings",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 20_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "brokerage",
                        accountType: "tracking",
                        balanceCents: 500_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_brokerage",
                        name: "Brokerage",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 500_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                ledgerId="ledger-1"
                summaries={{
                    allAccounts: {
                        latestTransactionDate: "2026-05-24T12:00:00.000Z",
                        transactionCount: 3,
                        uncategorizedCount: 1,
                        unlockedTransactionCount: 1,
                    },
                    byAccountId: {
                        checking: {
                            latestTransactionDate: "2026-05-24T12:00:00.000Z",
                            transactionCount: 2,
                            uncategorizedCount: 1,
                            unlockedTransactionCount: 1,
                        },
                        savings: {
                            latestTransactionDate: "2026-05-23T12:00:00.000Z",
                            transactionCount: 1,
                            uncategorizedCount: 0,
                            unlockedTransactionCount: 0,
                        },
                        brokerage: {
                            latestTransactionDate: "2026-05-22T12:00:00.000Z",
                            transactionCount: 1,
                        },
                    },
                }}
            />,
        );

        const allAccountsLink = screen.getByRole("link", {
            name: "All accounts, All account types",
        });
        const checkingLink = screen.getByRole("link", {
            name: "Everyday Checking, Checking",
        });
        const savingsLink = screen.getByRole("link", {
            name: "Savings, Savings",
        });
        const brokerageLink = screen.getByRole("link", {
            name: "Brokerage, Tracking",
        });
        const checkingHeading = screen.getByRole("heading", {
            name: "Checking",
        });
        const savingsHeading = screen.getByRole("heading", {
            name: "Savings",
        });
        const trackingHeading = screen.getByRole("heading", {
            name: "Tracking",
        });

        expect(allAccountsLink).toHaveAttribute(
            "href",
            "/transactions/all-accounts",
        );
        expect(
            within(allAccountsLink).getByText("Tracking accounts are excluded"),
        ).toBeInTheDocument();
        expect(
            allAccountsLink.compareDocumentPosition(checkingHeading) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            checkingHeading.compareDocumentPosition(savingsHeading) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            savingsHeading.compareDocumentPosition(trackingHeading) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(trackingHeading.closest("section")?.className).toContain("mt-5");
        expect(
            within(allAccountsLink).getByText("3 transactions"),
        ).toBeInTheDocument();
        expect(allAccountsLink).toHaveTextContent(
            "3 transactions / 1 uncategorized",
        );
        expect(within(allAccountsLink).getByText("1 uncategorized")).toHaveClass(
            "text-[var(--tone-warning-ink)]",
        );
        expect(
            within(allAccountsLink).getByText("Latest: 05/24/2026"),
        ).toBeInTheDocument();

        expect(checkingLink).toHaveAttribute(
            "href",
            "/transactions/everyday-checking",
        );
        expect(
            within(checkingLink).getByText("2 transactions"),
        ).toBeInTheDocument();
        expect(checkingLink).toHaveTextContent("2 transactions / 1 uncategorized");
        expect(
            within(checkingLink).getByText("Latest: 05/24/2026"),
        ).toBeInTheDocument();
        expect(
            within(checkingLink).getByText("Test Bank - Synced 05/24/2026"),
        ).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Test Bank logo" })).toBeVisible();
        expect(savingsLink).toBeVisible();
        expect(
            within(savingsLink).getByLabelText("No unlocked transactions"),
        ).toBeInTheDocument();
        expect(
            within(savingsLink).getByText("Manually managed account"),
        ).toBeInTheDocument();
        expect(within(savingsLink).getByText("1 transaction")).toBeInTheDocument();
        expect(savingsLink).not.toHaveTextContent("uncategorized");
        expect(
            within(savingsLink).getByText("Latest: 05/23/2026"),
        ).toBeInTheDocument();
        expect(brokerageLink).toHaveAttribute("href", "/transactions/brokerage");
        expect(screen.queryByText("$100.00")).not.toBeInTheDocument();

        const allAccountsClick = vi.fn((event: Event) =>
            event.preventDefault(),
        );
        allAccountsLink.addEventListener("click", allAccountsClick);

        expect(allAccountsLink).not.toHaveAttribute(
            "data-pane-list-highlighted",
        );
        fireEvent.keyDown(window, { key: "ArrowUp" });
        expect(brokerageLink).toHaveAttribute(
            "data-pane-list-highlighted",
            "true",
        );
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(allAccountsLink).toHaveAttribute(
            "data-pane-list-highlighted",
            "true",
        );
        fireEvent.keyDown(window, { key: "Enter" });
        expect(allAccountsClick).toHaveBeenCalledOnce();
    });

    it("collapses transaction account selector groups with per-ledger storage", async () => {
        const user = userEvent.setup();
        const accounts = [
            {
                accountId: "checking",
                accountType: "checking" as const,
                balanceCents: 10_000,
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_checking",
                name: "Everyday Checking",
                openedOn: "2026-05-22",
                openingBalanceCents: 10_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
            {
                accountId: "savings",
                accountType: "savings" as const,
                balanceCents: 20_000,
                createdAt: "2026-05-22T00:00:00.000Z",
                ledgerAccountId: "acct_savings",
                name: "Savings",
                openedOn: "2026-05-22",
                openingBalanceCents: 20_000,
                updatedAt: "2026-05-22T00:00:00.000Z",
                ledgerId: "ledger-1",
            },
        ];
        const summaries = {
            allAccounts: {
                transactionCount: 0,
            },
            byAccountId: {},
        };

        const renderResult = renderWithFeedback(
            <TransactionAccountSelector
                accounts={accounts}
                ledgerId="ledger-1"
                summaries={summaries}
            />,
        );

        const checkingToggle = await screen.findByRole("button", {
            name: "Hide accounts in Checking",
        });

        expect(checkingToggle).toHaveAttribute("aria-expanded", "true");
        expect(
            screen.getByRole("link", { name: "Everyday Checking, Checking" }),
        ).toBeInTheDocument();

        await user.click(checkingToggle);

        expect(checkingToggle).toHaveAttribute("aria-expanded", "false");
        expect(
            screen.queryByRole("link", {
                name: "Everyday Checking, Checking",
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Savings, Savings" }),
        ).toBeInTheDocument();

        renderResult.unmount();

        await waitFor(() =>
            expect(
                window.localStorage.getItem(
                    "budgeted:transactions:account-selector:collapsed-groups:v1:ledger-1",
                ),
            ).toBe(JSON.stringify(["checking"])),
        );
        expect(
            window.localStorage.getItem(
                "budgeted:transactions:account-selector:collapsed-groups:v1:ledger-2",
            ),
        ).toBeNull();
    });

    it("sorts by date and filters transactions by category, amount, memo, and managed order metadata", async () => {
        const user = userEvent.setup();
        const payeeNames = [
            "Paycheck",
            "Power Company",
            "Mystery Vendor",
            "Market",
        ];
        const getRenderedPayees = () => {
            const table = screen.getByRole("table");

            return within(table)
                .getAllByRole("row")
                .map((row) =>
                    payeeNames.find((payeeName) => within(row).queryByText(payeeName)),
                )
                .filter((payeeName): payeeName is string => Boolean(payeeName));
        };

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "checking",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "savings",
                        accountType: "savings",
                        balanceCents: 20_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_savings",
                        name: "Savings",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 20_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "utilities",
                        ledgerAccountId: "category_utilities",
                        name: "Utilities",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -2_500,
                        enteredAt: "2026-05-20T12:00:00.000Z",
                        memo: "",
                        importActivities: [createTestImportActivity({
                            itemSummary: "Pantry labels",
                            provider: "amazon",
                            providerRecordId: "payment-1",
                        })],
                        occurredAt: "2026-05-20T12:00:00.000Z",
                        payee: "Market",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "checking",
                        referenceCategoryId: "groceries",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 2_500,
                                categoryId: "groceries",
                                createdAt: "2026-05-20T12:00:00.000Z",
                                fromAccountId: "checking",
                                lineId: "market-line",
                                sortOrder: 0,
                                transactionId: "market-transaction",
                                updatedAt: "2026-05-20T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "market-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-20T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: -7_500,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "Autopay utility bill",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Power Company",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "savings",
                        referenceCategoryId: "utilities",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 7_500,
                                categoryId: "utilities",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "savings",
                                lineId: "power-line",
                                sortOrder: 0,
                                transactionId: "power-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "power-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: 7_500,
                        enteredAt: "2026-05-23T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-23T12:00:00.000Z",
                        payee: "Paycheck",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "checking",
                        referenceCategoryId: "utilities",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 7_500,
                                categoryId: "utilities",
                                createdAt: "2026-05-23T12:00:00.000Z",
                                lineId: "paycheck-line",
                                sortOrder: 0,
                                toAccountId: "checking",
                                transactionId: "paycheck-transaction",
                                updatedAt: "2026-05-23T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "paycheck-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-23T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        displayAmountCents: -1_000,
                        enteredAt: "2026-05-21T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-21T12:00:00.000Z",
                        payee: "Mystery Vendor",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "checking",
                        referenceCategoryId: undefined,
                        status: "entered",
                        lines: [
                            {
                                amountCents: 1_000,
                                createdAt: "2026-05-21T12:00:00.000Z",
                                fromAccountId: "checking",
                                lineId: "mystery-line",
                                sortOrder: 0,
                                transactionId: "mystery-transaction",
                                updatedAt: "2026-05-21T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "mystery-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-21T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        expect(screen.getByRole("columnheader", { name: "Date" })).toHaveAttribute(
            "aria-sort",
            "descending",
        );
        expect(getRenderedPayees()).toEqual([
            "Paycheck",
            "Power Company",
            "Mystery Vendor",
            "Market",
        ]);

        await user.click(screen.getByRole("button", { name: "Date" }));

        expect(screen.getByRole("columnheader", { name: "Date" })).toHaveAttribute(
            "aria-sort",
            "ascending",
        );
        expect(getRenderedPayees()).toEqual([
            "Market",
            "Mystery Vendor",
            "Power Company",
            "Paycheck",
        ]);

        await user.click(screen.getByRole("button", { name: "Filter" }));
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Groceries",
        );

        expect(screen.getByText("Filter:")).toBeInTheDocument();
        expect(screen.getByText("Category: Groceries")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Market"]);
        expect(
            screen.queryByRole("combobox", { name: "Category" }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Clear all" }));

        expect(screen.queryByText(/^Filter:/)).not.toBeInTheDocument();
        expect(getRenderedPayees()).toEqual([
            "Market",
            "Mystery Vendor",
            "Power Company",
            "Paycheck",
        ]);

        expect(
            screen.getByRole("button", { name: "Show Uncategorized (1)" }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole("button", { name: "Show Uncategorized (1)" }),
        );

        expect(screen.getByText("Filter:")).toBeInTheDocument();
        expect(screen.getByText("Uncategorized only")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Mystery Vendor"]);
        expect(
            screen.queryByRole("button", {
                name: "Show Uncategorized (1)",
            }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Clear all" }));
        await user.click(screen.getByRole("button", { name: "Filter" }));
        await user.type(screen.getByLabelText("Amount"), "$75.00");

        expect(screen.getByText("Amount: $75.00")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Power Company", "Paycheck"]);

        await user.clear(screen.getByLabelText("Amount"));
        await user.type(screen.getByLabelText("Amount"), "-$75.00");

        expect(screen.getByText("Amount: -$75.00")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Power Company"]);

        await user.clear(screen.getByLabelText("Amount"));
        await user.type(screen.getByLabelText("Amount"), "+$75.00");

        expect(screen.getByText("Amount: +$75.00")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Paycheck"]);

        await user.clear(screen.getByLabelText("Amount"));
        await user.type(screen.getByLabelText("Payee/Memo"), "market");

        expect(screen.getByText("Payee/Memo: market")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Market"]);

        await user.clear(screen.getByLabelText("Payee/Memo"));
        await user.type(screen.getByLabelText("Payee/Memo"), "UTILITY");

        expect(screen.getByText("Payee/Memo: UTILITY")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Power Company"]);

        await user.clear(screen.getByLabelText("Payee/Memo"));
        await user.type(screen.getByLabelText("Payee/Memo"), "111-222");

        expect(screen.getByText("Payee/Memo: 111-222")).toBeInTheDocument();
        expect(getRenderedPayees()).toEqual(["Market"]);
    });

    it("filters to transactions with another exact signed amount match", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "checking",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const createTransaction = (input: {
            amountCents: number;
            occurredAt?: string;
            payee: string;
            transactionId: string;
        }): TransactionWithPostings => {
            const isInflow = input.amountCents > 0;
            const occurredAt = input.occurredAt ?? "2026-05-22T12:00:00.000Z";

            return {
                displayAmountCents: input.amountCents,
                enteredAt: occurredAt,
                kind: "standard",
                ledgerId: "ledger-1",
                lines: [
                    {
                        amountCents: Math.abs(input.amountCents),
                        createdAt: occurredAt,
                        ...(isInflow
                            ? { toAccountId: account.accountId }
                            : { fromAccountId: account.accountId }),
                        ledgerId: "ledger-1",
                        lineId: `${input.transactionId}-line`,
                        sortOrder: 0,
                        transactionId: input.transactionId,
                        updatedAt: occurredAt,
                    },
                ],
                memo: "",
                occurredAt,
                payee: input.payee,
                periodId: "2026-05",
                postings: [],
                referenceAccountId: account.accountId,
                status: "entered",
                transactionId: input.transactionId,
                updatedAt: occurredAt,
            };
        };

        renderWithFeedback(
            <TransactionsTable
                accounts={[account]}
                categories={[]}
                transactions={[
                    createTransaction({
                        amountCents: -2_500,
                        payee: "Duplicate debit one",
                        transactionId: "duplicate-debit-one",
                    }),
                    createTransaction({
                        amountCents: -2_500,
                        payee: "Duplicate debit two",
                        transactionId: "duplicate-debit-two",
                    }),
                    createTransaction({
                        amountCents: -2_500,
                        occurredAt: "2026-05-30T12:00:00.000Z",
                        payee: "Outside duplicate window",
                        transactionId: "outside-duplicate-window",
                    }),
                    createTransaction({
                        amountCents: 2_500,
                        payee: "Matching credit",
                        transactionId: "matching-credit",
                    }),
                    createTransaction({
                        amountCents: -1_000,
                        payee: "Unique debit",
                        transactionId: "unique-debit",
                    }),
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Filter" }));
        const duplicateTransactionsSwitch = screen.getByRole("switch", {
            name: "Duplicate transactions",
        });

        await user.click(duplicateTransactionsSwitch);

        const transactionTable = screen.getByRole("table");

        expect(duplicateTransactionsSwitch).toBeChecked();
        expect(screen.getAllByText("Duplicate transactions")).toHaveLength(2);
        expect(
            within(transactionTable).getByText("Duplicate debit one"),
        ).toBeInTheDocument();
        expect(
            within(transactionTable).getByText("Duplicate debit two"),
        ).toBeInTheDocument();
        expect(
            within(transactionTable).queryByText("Matching credit"),
        ).not.toBeInTheDocument();
        expect(
            within(transactionTable).queryByText("Unique debit"),
        ).not.toBeInTheDocument();
        expect(
            within(transactionTable).queryByText("Outside duplicate window"),
        ).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("button", {
                name: "Clear Duplicate transactions filter",
            }),
        );

        expect(duplicateTransactionsSwitch).not.toBeChecked();
        expect(
            within(transactionTable).getByText("Matching credit"),
        ).toBeInTheDocument();
        expect(
            within(transactionTable).getByText("Unique debit"),
        ).toBeInTheDocument();
    });

    it("filters unlocked non-Plaid transactions for Plaid-enabled accounts", async () => {
        const user = userEvent.setup();
        const plaidAccount = {
            accountId: "plaid-checking",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_plaid_checking",
            ledgerId: "ledger-1",
            name: "Plaid Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            plaidAccountLinkId: "plaid-link-1",
            plaidLinkStatus: "linked" as const,
            updatedAt: "2026-05-22T00:00:00.000Z",
        };
        const manualAccount = {
            accountId: "manual-checking",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_manual_checking",
            ledgerId: "ledger-1",
            name: "Manual Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
        };
        const createTransaction = (input: {
            accountId: string;
            payee: string;
            source: "manual" | "plaid";
            status: "entered" | "reconciled" | "voided";
            transactionId: string;
        }): TransactionWithPostings => ({
            displayAmountCents: -2_500,
            enteredAt: "2026-05-22T12:00:00.000Z",
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [],
            occurredAt: "2026-05-22T12:00:00.000Z",
            payee: input.payee,
            periodId: "2026-05",
            postings: [],
            referenceAccountId: input.accountId,
            source: input.source,
            status: input.status,
            transactionId: input.transactionId,
            updatedAt: "2026-05-22T12:00:00.000Z",
        });
        const transactions = [
            createTransaction({
                accountId: plaidAccount.accountId,
                payee: "Manual Plaid account transaction",
                source: "manual",
                status: "entered",
                transactionId: "manual-plaid-account-transaction",
            }),
            createTransaction({
                accountId: plaidAccount.accountId,
                payee: "Plaid transaction",
                source: "plaid",
                status: "entered",
                transactionId: "plaid-transaction",
            }),
            createTransaction({
                accountId: plaidAccount.accountId,
                payee: "Locked manual Plaid account transaction",
                source: "manual",
                status: "reconciled",
                transactionId: "locked-manual-plaid-account-transaction",
            }),
            createTransaction({
                accountId: manualAccount.accountId,
                payee: "Manual-only account transaction",
                source: "manual",
                status: "entered",
                transactionId: "manual-account-transaction",
            }),
            createTransaction({
                accountId: plaidAccount.accountId,
                payee: "Voided manual Plaid account transaction",
                source: "manual",
                status: "voided",
                transactionId: "voided-manual-plaid-account-transaction",
            }),
        ];
        const snapshot = makeWorkspaceSnapshot({
            accounts: [plaidAccount, manualAccount],
            plaidAccountLinks: [
                {
                    accountId: plaidAccount.accountId,
                    createdAt: "2026-05-22T00:00:00.000Z",
                    lastSyncStatus: "succeeded",
                    plaidAccountId: "plaid-account-1",
                    plaidAccountLinkId: "plaid-link-1",
                    plaidItemId: "plaid-item-1",
                    status: "linked",
                    syncStartDate: "2026-05-01",
                    updatedAt: "2026-05-22T00:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
            transactions,
        });

        renderWithWorkspace(
            <TransactionsTable
                accounts={[plaidAccount, manualAccount]}
                categories={[]}
                transactions={transactions}
            />,
            snapshot,
        );

        await user.click(screen.getByRole("button", { name: "Filter" }));
        const unmatchedTransactionsSwitch = screen.getByRole("switch", {
            name: "Unmatched transactions",
        });
        await user.click(unmatchedTransactionsSwitch);

        const transactionTable = screen.getByRole("table");

        expect(unmatchedTransactionsSwitch).toBeChecked();
        expect(screen.getAllByText("Unmatched transactions")).toHaveLength(2);
        expect(
            within(transactionTable).getByText("Manual Plaid account transaction"),
        ).toBeInTheDocument();
        expect(within(transactionTable).queryByText("Plaid transaction")).not.toBeInTheDocument();
        expect(
            within(transactionTable).queryByText(
                "Locked manual Plaid account transaction",
            ),
        ).not.toBeInTheDocument();
        expect(
            within(transactionTable).queryByText("Manual-only account transaction"),
        ).not.toBeInTheDocument();
        expect(
            within(transactionTable).queryByText(
                "Voided manual Plaid account transaction",
            ),
        ).not.toBeInTheDocument();
    });

    it("focuses Payee/Memo when the transaction filter opens and accepts or clears a focused input", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable accounts={[]} categories={[]} transactions={[]} />,
        );

        await user.click(screen.getByRole("button", { name: "Filter" }));

        const payeeMemoInput = screen.getByLabelText("Payee/Memo");
        const categoryInput = screen.getByRole("combobox", {
            name: "Category",
        });
        const amountInput = screen.getByLabelText("Amount");

        expect(payeeMemoInput).toHaveFocus();
        expect(payeeMemoInput).toHaveClass("h-10");
        expect(categoryInput).toHaveClass("h-10");
        expect(amountInput).toHaveClass("h-10");
        expect(
            document.getElementById("transaction-filter-controls"),
        ).toHaveClass("lg:grid-cols-3");

        await user.type(payeeMemoInput, "market");
        await user.keyboard("{Escape}");

        expect(
            screen.queryByLabelText("Payee/Memo"),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/^Filter:/)).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Filter" }));
        const reopenedPayeeMemoInput = screen.getByLabelText("Payee/Memo");
        expect(reopenedPayeeMemoInput).toHaveValue("");

        await user.type(reopenedPayeeMemoInput, "market");
        await user.keyboard("{Enter}");

        expect(
            screen.queryByLabelText("Payee/Memo"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Payee/Memo: market")).toBeInTheDocument();
    });

    it("opens the transaction filter with slash outside editable controls", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable accounts={[]} categories={[]} transactions={[]} />,
        );

        await user.keyboard("/");

        const payeeMemoInput = screen.getByLabelText("Payee/Memo");

        expect(payeeMemoInput).toHaveFocus();
        await user.type(payeeMemoInput, "market");
        await user.keyboard("/");

        expect(payeeMemoInput).toHaveValue("market/");
    });

    it("renders transfer transactions with a transfer category icon", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "checking-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "savings-1",
                        accountType: "savings",
                        balanceCents: 0,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_savings",
                        name: "Savings",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 0,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[
                    {
                        displayAmountCents: -5_000,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "Move to savings",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Savings transfer",
                        periodId: "2026-05",
                        postings: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                direction: "credit",
                                ledgerAccountId: "acct_checking",
                                ledgerAccountKind: "financial",
                                occurredAt: "2026-05-22T12:00:00.000Z",
                                periodId: "2026-05",
                                postingId: "posting-transfer-source",
                                transactionId: "transfer-transaction",
                                ledgerId: "ledger-1",
                            },
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                direction: "debit",
                                ledgerAccountId: "acct_savings",
                                ledgerAccountKind: "financial",
                                occurredAt: "2026-05-22T12:00:00.000Z",
                                periodId: "2026-05",
                                postingId: "posting-transfer-target",
                                transactionId: "transfer-transaction",
                                ledgerId: "ledger-1",
                            },
                        ],
                        referenceAccountId: "checking-1",
                        status: "cleared",
                        lines: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "checking-1",
                                lineId: "transfer-line",
                                sortOrder: 0,
                                toAccountId: "savings-1",
                                transactionId: "transfer-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "transfer-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        expect(screen.getByText("To: Savings")).toBeInTheDocument();
        expect(screen.getByLabelText("Transfer to Savings")).toBeInTheDocument();
        expect(screen.queryByText(/Transfer To:/)).not.toBeInTheDocument();
        expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();

        const transferRow = screen.getByText("Savings transfer").closest("tr");
        expect(transferRow).not.toBeNull();

        await user.click(transferRow!);

        const actionBar = screen.getByRole("region", {
            name: "Selected row actions",
        });

        expect(
            within(actionBar).queryByText("Selected row"),
        ).not.toBeInTheDocument();
        expect(within(actionBar).getByText("Move to savings")).toBeInTheDocument();

        expect(
            within(actionBar).getByRole("button", {
                name: "Show Destination",
            }),
        ).toBeInTheDocument();

        await user.keyboard("s");

        expect(mocks.push).toHaveBeenCalledWith(
            "/transactions/savings?selected=transfer-transaction",
        );
        expect(transferRow).toHaveAttribute("aria-selected", "false");
    });

    it("renders inbound transfers in an account view as credits and scrolls the selected row into view", async () => {
        const user = userEvent.setup();
        const scrollIntoView = vi.fn();

        Object.defineProperty(Element.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoView,
        });

        renderWithFeedback(
            <TransactionsTable
                accountContextId="savings-1"
                initialSelectedTransactionId="transfer-transaction"
                accounts={[
                    {
                        accountId: "checking-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                    {
                        accountId: "savings-1",
                        accountType: "savings",
                        balanceCents: 5_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_savings",
                        name: "Savings",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 0,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[]}
                transactions={[
                    {
                        displayAmountCents: 5_000,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Savings transfer",
                        periodId: "2026-05",
                        postings: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                direction: "credit",
                                ledgerAccountId: "acct_checking",
                                ledgerAccountKind: "financial",
                                occurredAt: "2026-05-22T12:00:00.000Z",
                                periodId: "2026-05",
                                postingId: "posting-transfer-source",
                                transactionId: "transfer-transaction",
                                ledgerId: "ledger-1",
                            },
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                direction: "debit",
                                ledgerAccountId: "acct_savings",
                                ledgerAccountKind: "financial",
                                occurredAt: "2026-05-22T12:00:00.000Z",
                                periodId: "2026-05",
                                postingId: "posting-transfer-target",
                                transactionId: "transfer-transaction",
                                ledgerId: "ledger-1",
                            },
                        ],
                        referenceAccountId: "checking-1",
                        status: "cleared",
                        lines: [
                            {
                                amountCents: 5_000,
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "checking-1",
                                lineId: "transfer-line",
                                sortOrder: 0,
                                toAccountId: "savings-1",
                                transactionId: "transfer-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "transfer-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        const inboundTransferRow = screen
            .getAllByText("Savings transfer")[0]
            .closest("tr");

        expect(inboundTransferRow).not.toBeNull();
        expect(inboundTransferRow).toHaveAttribute("aria-selected", "true");
        expect(
            screen.queryByRole("columnheader", { name: "Account" }),
        ).not.toBeInTheDocument();
        expect(screen.getByText("From: Checking")).toBeInTheDocument();
        expect(screen.getByLabelText("Transfer from Checking")).toBeInTheDocument();
        expect(screen.getByText("$50.00")).toBeInTheDocument();
        expect(
            screen.getByRole("region", { name: "Selected row actions" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Show Source" }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(scrollIntoView).toHaveBeenCalledWith({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
            }),
        );

        await user.keyboard("s");

        expect(mocks.push).toHaveBeenCalledWith(
            "/transactions/checking?selected=transfer-transaction",
        );
    });

    it("renders multi-line transactions as compact child rows", () => {
        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "household",
                        ledgerAccountId: "category_household",
                        name: "Household",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: -1_200,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "Receipt with multiple categories",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Market",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "__mixed__",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 700,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                memo: "Weekly food",
                                sortOrder: 0,
                                lineId: "split-line-1",
                                transactionId: "split-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                            {
                                amountCents: 500,
                                categoryId: "household",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                memo: "Paper goods",
                                sortOrder: 1,
                                lineId: "split-line-2",
                                transactionId: "split-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "split-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        expect(screen.getByText("Mixed")).toBeInTheDocument();
        expect(screen.queryByText(/__no_to_account__/)).not.toBeInTheDocument();
        expect(screen.queryByText(/__mixed__/)).not.toBeInTheDocument();

        const groceriesRow = screen.getByText("Groceries").closest("tr");
        const householdRow = screen.getByText("Household").closest("tr");

        expect(groceriesRow).not.toBeNull();
        expect(householdRow).not.toBeNull();
        expect(within(groceriesRow!).getByText("Weekly food")).toBeInTheDocument();
        expect(within(groceriesRow!).getByText("-$7.00")).toBeInTheDocument();
        expect(within(groceriesRow!).queryByText("Market")).not.toBeInTheDocument();
        expect(within(householdRow!).getByText("Paper goods")).toBeInTheDocument();
        expect(within(householdRow!).getByText("-$5.00")).toBeInTheDocument();
        expect(within(householdRow!).queryByText("Market")).not.toBeInTheDocument();
    });

    it("labels zero-net multi-line transactions as internal transfers", () => {
        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        balanceCents: 10_000,
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "refunds",
                        ledgerAccountId: "category_refunds",
                        name: "Refunds",
                        status: "active",
                    },
                ]}
                transactions={[
                    {
                        displayAmountCents: 0,
                        enteredAt: "2026-05-22T12:00:00.000Z",
                        memo: "",
                        occurredAt: "2026-05-22T12:00:00.000Z",
                        payee: "Store credit",
                        periodId: "2026-05",
                        postings: [],
                        referenceAccountId: "account-1",
                        referenceCategoryId: "__zero_net__",
                        status: "entered",
                        lines: [
                            {
                                amountCents: 1_000,
                                categoryId: "groceries",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                fromAccountId: "account-1",
                                lineId: "line-1",
                                sortOrder: 0,
                                transactionId: "zero-net-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                            {
                                amountCents: 1_000,
                                categoryId: "refunds",
                                createdAt: "2026-05-22T12:00:00.000Z",
                                lineId: "line-2",
                                sortOrder: 1,
                                toAccountId: "account-1",
                                transactionId: "zero-net-transaction",
                                updatedAt: "2026-05-22T12:00:00.000Z",
                                ledgerId: "ledger-1",
                            },
                        ],
                        transactionId: "zero-net-transaction",
                        kind: "standard",
                        updatedAt: "2026-05-22T12:00:00.000Z",
                        ledgerId: "ledger-1",
                    },
                ]}
            />,
        );

        expect(screen.getByText("Internal Transfer")).toBeInTheDocument();
        expect(screen.getByLabelText("Internal transfer")).toBeInTheDocument();
        expect(screen.queryByText("Zero-net")).not.toBeInTheDocument();
    });

    it("submits a multi-line transaction with child transaction lines", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                        balanceCents: 10_000,
                    },
                ]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                    {
                        categoryId: "household",
                        ledgerAccountId: "category_household",
                        name: "Household",
                        status: "active",
                    },
                ]}
                transactions={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Account" }),
            "Checking",
        );
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Category" }),
            "Split Transaction",
        );
        const dialog = screen.getByRole("dialog", { name: "New transaction" });
        const runningTotal = screen.getByText("Running total").parentElement;

        expect(runningTotal).not.toBeNull();
        expect(within(runningTotal as HTMLElement).getByText("$0.00")).toBeInTheDocument();
        expect(
            within(dialog)
                .getAllByText(/^(Payee|Category|Memo|Amount)$/)
                .slice(0, 4)
                .map((element) => element.textContent),
        ).toEqual(["Payee", "Category", "Memo", "Amount"]);
        const amountInputs = screen.getAllByLabelText("Amount");
        await user.clear(amountInputs[0]);
        await user.type(amountInputs[0], "-60.00");
        await user.type(amountInputs[1], "-40.00");

        expect(
            within(runningTotal as HTMLElement).getByText("-$100.00"),
        ).toBeInTheDocument();

        const categoryComboboxes = screen.getAllByRole("combobox", {
            name: "Category",
        });
        await selectComboboxOption(user, categoryComboboxes[0], "Groceries");
        await selectComboboxOption(user, categoryComboboxes[1], "Household");
        await user.click(screen.getByRole("button", { name: "Save transaction" }));

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

        const [, request] = vi.mocked(fetch).mock.calls[0];
        const payload = JSON.parse(String(request?.body));

        expect(payload).toMatchObject({
            accountId: "account-1",
            kind: "standard",
            lines: [
                {
                    amountCents: 6_000,
                    categoryId: "groceries",
                    fromAccountId: "account-1",
                    sortOrder: 0,
                },
                {
                    amountCents: 4_000,
                    categoryId: "household",
                    fromAccountId: "account-1",
                    sortOrder: 1,
                },
            ],
        });
        expect(payload.postings).toBeUndefined();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("keeps manual single-line amount edits quiet unless the edit session enters split mode", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const transaction = {
            transactionId: "transaction-1",
            ledgerId: "ledger-1",
            occurredAt: "2026-05-22T12:00:00.000Z",
            enteredAt: "2026-05-22T12:00:00.000Z",
            kind: "standard" as const,
            payee: "Market",
            memo: "",
            referenceAccountId: "account-1",
            referenceCategoryId: "groceries",
            displayAmountCents: -2_500,
            source: "manual" as const,
            status: "entered" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-22T12:00:00.000Z",
            postings: [],
            lines: [
                {
                    amountCents: 2_500,
                    categoryId: "groceries",
                    createdAt: "2026-05-22T12:00:00.000Z",
                    fromAccountId: "account-1",
                    lineId: "line-1",
                    sortOrder: 0,
                    transactionId: "transaction-1",
                    updatedAt: "2026-05-22T12:00:00.000Z",
                    ledgerId: "ledger-1",
                },
            ],
        } satisfies TransactionWithPostings;

        renderWithWorkspace(
            <TransactionDialog
                accounts={[account]}
                categories={[
                    {
                        categoryId: "groceries",
                        ledgerAccountId: "category_groceries",
                        name: "Groceries",
                        status: "active",
                    },
                ]}
                onClose={vi.fn()}
                open
                transaction={transaction}
            />,
            makeWorkspaceSnapshot({
                accounts: [account],
                transactionLines: transaction.lines,
                transactions: [transaction],
            }),
        );

        const dialog = screen.getByRole("dialog", {
            name: "Edit transaction",
        });
        const amountInput = within(dialog).getByLabelText("Amount");

        await user.clear(amountInput);
        await user.type(amountInput, "-30.00");

        expect(
            within(dialog).queryByText("Transaction total changed"),
        ).not.toBeInTheDocument();
        expect(
            within(dialog).queryByText("Split total changed"),
        ).not.toBeInTheDocument();

        await selectComboboxOption(
            user,
            within(dialog).getByRole("combobox", { name: "Category" }),
            "Split Transaction",
        );

        const referenceTotal = within(dialog)
            .getByText("Reference total")
            .parentElement;

        expect(referenceTotal).not.toBeNull();
        expect(
            within(referenceTotal as HTMLElement).getByText("-$25.00"),
        ).toBeInTheDocument();

        const splitAmountInputs = within(dialog).getAllByLabelText("Amount");
        expect(splitAmountInputs).toHaveLength(2);
        expect(splitAmountInputs[0]).toHaveValue("");
        expect(splitAmountInputs[1]).toHaveValue("");
        await waitFor(() => expect(splitAmountInputs[0]).toHaveFocus());
        expect(
            within(dialog).queryByText("Split total changed"),
        ).not.toBeInTheDocument();
        expect(
            within(dialog).getByRole("button", { name: "Save transaction" }),
        ).toBeDisabled();

        await user.type(splitAmountInputs[0], "-30.00");
        await user.type(splitAmountInputs[1], "-10.00");

        const warningPane = within(dialog)
            .getByText("Split total changed")
            .closest('[aria-live="polite"]');

        expect(warningPane).not.toBeNull();
        expect(
            within(warningPane as HTMLElement).getByText("-$25.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("-$40.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("-$15.00"),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole("button", { name: "Save transaction" }),
        ).toBeDisabled();

        await user.click(
            within(dialog).getByRole("button", { name: "Cancel split" }),
        );

        expect(within(dialog).getAllByLabelText("Amount")).toHaveLength(1);
        expect(within(dialog).getByLabelText("Amount")).toHaveValue("25.00");
        expect(within(dialog).getByText("Debit: $-25.00")).toBeInTheDocument();
    });

    it("requires accepting a changed split total before saving", async () => {
        const user = userEvent.setup();

        renderWithFeedback(
            <TransactionsTable
                accounts={[
                    {
                        accountId: "account-1",
                        accountType: "checking",
                        createdAt: "2026-05-22T00:00:00.000Z",
                        ledgerAccountId: "acct_checking",
                        name: "Checking",
                        openedOn: "2026-05-22",
                        openingBalanceCents: 10_000,
                        updatedAt: "2026-05-22T00:00:00.000Z",
                        ledgerId: "ledger-1",
                        balanceCents: 10_000,
                    },
                ]}
                categories={[]}
                transactions={[]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "New transaction" }));
        await selectComboboxOption(
            user,
            screen.getByRole("combobox", { name: "Account" }),
            "Checking",
        );
        await user.type(screen.getByLabelText("Amount"), "-100.00");
        await user.click(screen.getByRole("button", { name: "Split" }));

        const amountInputs = screen.getAllByLabelText("Amount");
        await user.clear(amountInputs[0]);
        await user.type(amountInputs[0], "-60.00");
        await user.type(amountInputs[1], "-30.00");

        const warningPane = screen
            .getByText("Split total changed")
            .closest('[aria-live="polite"]');

        expect(warningPane).not.toBeNull();
        expect(
            within(warningPane as HTMLElement).getByText("-$100.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("-$90.00"),
        ).toBeInTheDocument();
        expect(
            within(warningPane as HTMLElement).getByText("$10.00"),
        ).toBeInTheDocument();

        const saveButton = screen.getByRole("button", {
            name: "Save transaction",
        });

        expect(saveButton).toBeDisabled();
        expect(fetch).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Accept difference" }));
        expect(saveButton).not.toBeDisabled();

        await user.click(saveButton);

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    });

    it("reviews pending AI classifications in the inline transaction editor", async () => {
        const user = userEvent.setup();
        const generatedAt = "2026-07-01T00:00:00.000Z";
        const account = {
            accountId: "checking",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: generatedAt,
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-07-01",
            openingBalanceCents: 10_000,
            updatedAt: generatedAt,
            ledgerId: "ledger-1",
        };
        const groceries = {
            categoryId: "groceries",
            createdAt: generatedAt,
            defaultAssignedCents: 0,
            groupId: "spending",
            isIncomeCategory: false,
            ledgerAccountId: "cat_groceries",
            name: "Groceries",
            sortOrder: 0,
            status: "active" as const,
            updatedAt: generatedAt,
            ledgerId: "ledger-1",
        };
        const dining = {
            categoryId: "dining",
            createdAt: generatedAt,
            defaultAssignedCents: 0,
            groupId: "spending",
            isIncomeCategory: false,
            ledgerAccountId: "cat_dining",
            name: "Dining",
            sortOrder: 1,
            status: "active" as const,
            updatedAt: generatedAt,
            ledgerId: "ledger-1",
        };
        const makeUnclassifiedTransaction = (
            transactionId: string,
            payee: string,
            memo = "",
        ): TransactionWithPostings => ({
            displayAmountCents: -4_200,
            enteredAt: generatedAt,
            kind: "standard",
            ledgerId: "ledger-1",
            lines: [
                {
                    amountCents: 4_200,
                    createdAt: generatedAt,
                    fromAccountId: "checking",
                    lineId: `${transactionId}-line`,
                    ledgerId: "ledger-1",
                    sortOrder: 0,
                    transactionId,
                    updatedAt: generatedAt,
                },
            ],
            memo,
            occurredAt: generatedAt,
            payee,
            periodId: "2026-07",
            postings: [],
            referenceAccountId: "checking",
            status: "entered",
            transactionId,
            updatedAt: generatedAt,
        });
        const marketSuggestion = {
            confidence: 0.91,
            lineAssignments: [
                {
                    categoryId: "groceries",
                    lineId: "market-line",
                },
            ],
            reason: "Past market transactions matched groceries.",
            suggestedMemo: "Weekly groceries",
            suggestedPayee: "Fresh Market",
            targetLineIds: ["market-line"],
            transactionId: "market",
            transactionUpdatedAt: generatedAt,
            type: "category" as const,
        };
        const bottleShopSuggestion = {
            confidence: 0.72,
            lineAssignments: [
                {
                    categoryId: "groceries",
                    lineId: "bottle-shop-line",
                },
            ],
            matchingMethod: "deterministic" as const,
            reason: "Merchant history was mixed.",
            suggestedMemo: "Alcohol purchase",
            suggestedPayee: "Bottle Shop",
            targetLineIds: ["bottle-shop-line"],
            transactionId: "bottle-shop",
            transactionUpdatedAt: generatedAt,
            type: "category" as const,
        };
        const noSuggestion = {
            confidence: 0,
            lineAssignments: [],
            reason: "No compact category candidates were found.",
            targetLineIds: ["coffee-line"],
            transactionId: "coffee",
            transactionUpdatedAt: generatedAt,
            type: "noSuggestion" as const,
        };
        const snapshot = makeWorkspaceSnapshot({
            accounts: [account],
            budgetCategories: [groceries, dining],
            transactionTemplates: [
                {
                    createdAt: generatedAt,
                    defaultAmountCents: -4_200,
                    ledgerId: "ledger-1",
                    linesJson: JSON.stringify([
                        {
                            categoryId: "groceries",
                            formula: "total * 0.5",
                            lineId: "template-line-1",
                            sortOrder: 0,
                        },
                        {
                            categoryId: "dining",
                            formula: "remainder",
                            lineId: "template-line-2",
                            sortOrder: 1,
                        },
                    ]),
                    name: "Dinner split",
                    templateId: "template-dinner",
                    updatedAt: generatedAt,
                },
            ],
            transactionLines: ["market", "bottle-shop", "utilities", "coffee"].map(
                (transactionId) => ({
                    amountCents: 4_200,
                    createdAt: generatedAt,
                    fromAccountId: "checking",
                    ledgerId: "ledger-1",
                    lineId: `${transactionId}-line`,
                    sortOrder: 0,
                    transactionId,
                    updatedAt: generatedAt,
                }),
            ),
            transactions: [
                makeUnclassifiedTransaction("market", "Market"),
                makeUnclassifiedTransaction("bottle-shop", "Bottle Shop"),
                makeUnclassifiedTransaction("utilities", "", "Utility Bill"),
                makeUnclassifiedTransaction("coffee", "Coffee", "Coffee shop"),
            ],
        });
        type MockFetch = (
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<Response>;
        let resolvePendingApply!: (response: Response) => void;
        const pendingApplyResponse = new Promise<Response>((resolve) => {
            resolvePendingApply = resolve;
        });
        const fetchMock = vi.fn<MockFetch>(async (input: RequestInfo | URL) => {
            const url = getFetchRequestUrl(input);

            if (url === "/api/transactions/classification/pending") {
                return {
                    ok: true,
                    headers: new Headers(),
                    json: async () => ({
                        pending: [marketSuggestion, bottleShopSuggestion, noSuggestion].map(
                            (suggestion) => ({
                                accountId: "checking",
                                createdAt: generatedAt,
                                expiresAt: 1_791_372_000,
                                modelId: "gemini-3.5-flash",
                                promptVersion: "2026-07-07.v1",
                                rejectedAt: null,
                                source: "manual",
                                status: "pending",
                                suggestion,
                                suggestionType: suggestion.type,
                                transactionId: suggestion.transactionId,
                                transactionUpdatedAt: suggestion.transactionUpdatedAt,
                                updatedAt: generatedAt,
                            }),
                        ),
                    }),
                } as Response;
            }

            if (url === "/api/transactions/classification/pending/apply") {
                return pendingApplyResponse;
            }

            if (url === "/api/transactions/classification/pending/reject") {
                return {
                    ok: true,
                    headers: new Headers(),
                    json: async () => ({
                        pending: {
                            accountId: "checking",
                            createdAt: generatedAt,
                            expiresAt: 1_791_372_000,
                            modelId: "gemini-3.5-flash",
                            promptVersion: "2026-07-07.v1",
                            rejectedAt: generatedAt,
                            source: "manual",
                            status: "rejected",
                            suggestion: bottleShopSuggestion,
                            suggestionType: "category",
                            transactionId: "bottle-shop",
                            transactionUpdatedAt:
                                bottleShopSuggestion.transactionUpdatedAt,
                            updatedAt: generatedAt,
                        },
                    }),
                } as Response;
            }

            return {
                ok: true,
                headers: new Headers(),
                json: async () => ({}),
            } as Response;
        });

        function AccountScopedPendingTransactionsTable() {
            const { snapshot: workspaceSnapshot } = useWorkspaceStore();

            return (
                <TransactionsTable
                    accountContextId="checking"
                    accounts={workspaceSnapshot.accounts}
                    categories={workspaceSnapshot.budgetCategories}
                    transactions={workspaceSnapshot.transactions}
                />
            );
        }

        vi.stubGlobal("fetch", fetchMock);
        renderWithWorkspace(<AccountScopedPendingTransactionsTable />, snapshot);

        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(
                    ([input]) =>
                        getFetchRequestUrl(input as RequestInfo | URL) ===
                        "/api/transactions/classification/pending",
                ),
            ).toBe(true),
        );

        await screen.findByRole("button", { name: "Market" });
        await user.click(screen.getByRole("button", { name: "Market" }));

        expect(await screen.findByText("Groceries")).toBeInTheDocument();
        const pendingClassificationRow = screen
            .getByText("Suggested Classification")
            .closest("tr");
        expect(pendingClassificationRow).not.toBeNull();
        const applyButton = within(pendingClassificationRow!).getByRole("button", {
            name: "Apply",
        });
        const classificationActionRow = within(pendingClassificationRow!)
            .getByText("Groceries")
            .closest("div");
        expect(classificationActionRow).not.toBeNull();
        expect(
            within(classificationActionRow!).getByRole("button", {
                name: "Apply",
            }),
        ).toBeInTheDocument();
        expect(
            within(classificationActionRow!).getByRole("button", {
                name: "Edit",
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Chosen category")).not.toBeInTheDocument();
        const editorActionRow = screen
            .getByText("Editing transaction")
            .closest("tr");
        expect(editorActionRow).not.toBeNull();
        expect(
            within(editorActionRow!).queryByRole("button", {
                name: "Apply",
            }),
        ).not.toBeInTheDocument();
        expect(
            within(classificationActionRow!).getByRole("button", {
                name: "Reject",
            }),
        ).toBeInTheDocument();
        expect(applyButton).not.toHaveFocus();
        expect(within(applyButton).getByText("A")).toHaveClass(
            "font-bold",
            "underline",
        );
        expect(
            within(
                within(classificationActionRow!).getByRole("button", {
                    name: "Reject",
                }),
            ).getByText("R"),
        ).toHaveClass("font-bold", "underline");
        expect(
            within(
                within(classificationActionRow!).getByRole("button", {
                    name: "Edit",
                }),
            ).getByText("E"),
        ).toHaveClass("font-bold", "underline");
        expect(screen.getByText("Market -> Fresh Market")).toBeInTheDocument();
        expect(screen.getByText(/91% confidence/)).toBeInTheDocument();
        expect(screen.getByText("(blank) -> Weekly groceries")).toBeInTheDocument();
        const marketPayeeCheckbox = screen.getByRole("checkbox", {
            name: "Apply suggested payee for Market",
        });
        const marketMemoCheckbox = screen.getByRole("checkbox", {
            name: "Apply suggested memo for Market",
        });
        expect(marketPayeeCheckbox).not.toBeChecked();
        expect(marketMemoCheckbox).toBeChecked();
        await user.click(marketPayeeCheckbox);
        await user.keyboard("a");
        expect(
            fetchMock.mock.calls.filter(
                ([input]) =>
                    getFetchRequestUrl(input as RequestInfo | URL) ===
                    "/api/transactions/classification/pending/apply",
            ),
        ).toHaveLength(0);
        marketPayeeCheckbox.blur();
        await user.keyboard("a");
        await waitFor(() =>
            expect(
                fetchMock.mock.calls.some(
                    ([input]) =>
                        getFetchRequestUrl(input as RequestInfo | URL) ===
                        "/api/transactions/classification/pending/apply",
                ),
            ).toBe(true),
        );
        expect(
            screen.getByRole("button", { name: "Fresh Market" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Market -> Fresh Market"),
        ).not.toBeInTheDocument();
        resolvePendingApply({
            ok: true,
            headers: new Headers(),
            json: async () =>
                createIntegrationWorkspaceMutationResponse({
                    body: { appliedCount: 1 },
                }),
        } as Response);

        await screen.findByRole("button", { name: "Bottle Shop" });
        await user.click(screen.getByRole("button", { name: "Bottle Shop" }));
        expect(screen.getByText("Merchant history was mixed.")).toBeInTheDocument();
        expect(screen.queryByText(/72% confidence/)).not.toBeInTheDocument();
        await user.keyboard("e");
        await waitFor(() =>
            expect(screen.getByRole("combobox", { name: "Category" })).toHaveFocus(),
        );
        expect(
            screen.getByRole("button", { name: "Save changes" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Suggested Classification"),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
        expect(screen.queryByText("Optional feedback")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Dismiss" }),
        ).not.toBeInTheDocument();

        const categoryCombobox = screen.getByRole("combobox", {
            name: "Category",
        });
        await user.keyboard("r");
        expect(
            screen.getByRole("button", { name: "Reject" }),
        ).toBeInTheDocument();
        categoryCombobox.blur();
        await user.keyboard("r");
        expect(await screen.findByText("AI Classification")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();

        await user.keyboard("{Escape}");

        await user.click(screen.getByRole("button", { name: "Coffee" }));
        expect(
            screen.queryByText(
                "AI reviewed this transaction and found no confident suggestion.",
            ),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText("Suggested Classification"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Apply" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Save changes" }),
        ).toBeInTheDocument();

        const pendingFetchCalls = fetchMock.mock.calls.filter(
            ([input]) =>
                getFetchRequestUrl(input as RequestInfo | URL) ===
                "/api/transactions/classification/pending",
        );
        const pendingFetchCall = pendingFetchCalls[0];
        const pendingApplyCall = fetchMock.mock.calls.find(
            ([input]) =>
                getFetchRequestUrl(input as RequestInfo | URL) ===
                "/api/transactions/classification/pending/apply",
        );
        const pendingRejectCalls = fetchMock.mock.calls.filter(
            ([input]) =>
                getFetchRequestUrl(input as RequestInfo | URL) ===
                "/api/transactions/classification/pending/reject",
        );
        const oldSuggestionCall = fetchMock.mock.calls.find(
            ([input]) =>
                getFetchRequestUrl(input as RequestInfo | URL) ===
                "/api/transactions/classification/suggestions",
        );

        expect(pendingFetchCalls.length).toBeGreaterThanOrEqual(1);
        expect(JSON.parse(String(pendingFetchCall?.[1]?.body))).toEqual({
            accountId: "checking",
        });
        expect(JSON.parse(String(pendingApplyCall?.[1]?.body))).toMatchObject({
            fieldSelection: {
                applySuggestedMemo: true,
                applySuggestedPayee: true,
            },
            mutationId: expect.any(String),
            transactionId: "market",
        });
        expect(pendingRejectCalls).toHaveLength(1);
        expect(JSON.parse(String(pendingRejectCalls[0]?.[1]?.body))).toEqual({
            transactionId: "bottle-shop",
        });
        expect(oldSuggestionCall).toBeUndefined();
    });

    it("loads the delete preview and restores the last saved transaction row when delete fails", async () => {
        const user = userEvent.setup();
        const account = {
            accountId: "account-1",
            accountType: "checking" as const,
            balanceCents: 10_000,
            createdAt: "2026-05-22T00:00:00.000Z",
            ledgerAccountId: "acct_checking",
            name: "Checking",
            openedOn: "2026-05-22",
            openingBalanceCents: 10_000,
            updatedAt: "2026-05-22T00:00:00.000Z",
            ledgerId: "ledger-1",
        };
        const transaction = {
            transactionId: "transaction-1",
            ledgerId: "ledger-1",
            occurredAt: "2026-05-22T12:00:00.000Z",
            enteredAt: "2026-05-22T12:00:00.000Z",
            kind: "standard" as const,
            payee: "Market",
            memo: "",
            referenceAccountId: "account-1",
            referenceCategoryId: undefined,
            displayAmountCents: -2_500,
            status: "entered" as const,
            periodId: "2026-05",
            updatedAt: "2026-05-22T12:00:00.000Z",
            postings: [],
            lines: [],
        } satisfies TransactionWithPostings;
        const snapshot = makeWorkspaceSnapshot({
            accounts: [account],
            transactions: [transaction],
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = getFetchRequestUrl(input);
                const method = init?.method ?? "GET";

                if (url === "/api/transactions/transaction-1" && method === "GET") {
                    return {
                        ok: true,
                        json: async () => ({
                            target: {
                                targetType: "transaction",
                                targetId: "transaction-1",
                                displayName: "Market",
                                sectionId: "transactions",
                            },
                            dependentCounts: [{ label: "Ledger postings", count: 2 }],
                            affectedPeriods: ["2026-05"],
                            preservedRecords: [],
                            crossAreaEffects: [
                                "Account balances will update from the remaining saved transactions.",
                            ],
                            isPermanent: true,
                            permanentWarning:
                                "This deletion is permanent and cannot be undone.",
                            previewRevision: "preview-1",
                        }),
                    };
                }

                if (url === "/api/workspace/snapshot") {
                    return {
                        ok: true,
                        json: async () => snapshot,
                    };
                }

                if (url === "/api/workspace/knowledge") {
                    return {
                        ok: true,
                        json: async () => snapshot.knowledge,
                    };
                }

                return {
                    ok: false,
                    json: async () => ({
                        error: {
                            code: "ledger_store_unavailable",
                            message: "Unable to reach the ledger store.",
                        },
                    }),
                };
            }),
        );

        renderWithWorkspace(<WorkspaceTransactionsTable />, snapshot);

        const transactionRow = screen.getByText("Market").closest("tr");
        expect(transactionRow).not.toBeNull();

        await user.click(transactionRow!);
        await user.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith("/api/transactions/transaction-1"),
        );

        await user.click(
            screen.getByRole("button", { name: "Delete permanently" }),
        );

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/transactions/transaction-1",
                expect.objectContaining({ method: "DELETE" }),
            ),
        );
        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith("/api/workspace/snapshot"),
        );

        expect(
            screen.getByText(
                "Delete failed. The latest saved data has been restored.",
            ),
        ).toBeInTheDocument();
        expect(screen.getAllByText("Market").length).toBeGreaterThan(0);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
});
