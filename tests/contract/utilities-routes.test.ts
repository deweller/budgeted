import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    beginWorkspaceExplicitMutation: vi.fn().mockResolvedValue("fence-token"),
    buildCommittedWorkspaceKnowledge: vi.fn(),
    createBudgetPlanWorkbookDownload: vi.fn(),
    completeWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    buildLedgerExportFile: vi.fn(),
    classifyAccountNow: vi.fn(),
    createTransactionTemplate: vi.fn(),
    createTransactionTemplateWithWorkspaceChanges: vi.fn(),
    createTransactionClassificationDebugEmbeddings: vi.fn(),
    createLedgerExportFilename: vi.fn(),
    createLedgerExportDownload: vi.fn(),
    deleteTransactionTemplate: vi.fn(),
    deleteTransactionTemplateWithWorkspaceChanges: vi.fn(),
    getTransactionClassificationDebugPage: vi.fn(),
    getTransactionClassificationEmbeddingStatus: vi.fn(),
    getTransactionClassificationSettings: vi.fn(),
    importLedgerExport: vi.fn(),
    importBudgetPlanWorkbook: vi.fn(),
    listRecentTransactionClassificationInteractions: vi.fn(),
    listTransactionTemplates: vi.fn(),
    persistWorkspaceChanges: vi.fn(),
    recoverWorkspaceExplicitMutation: vi.fn().mockResolvedValue(undefined),
    rebuildTransactionClassificationEmbeddings: vi.fn(),
    requireCurrentUserAccount: vi.fn(),
    runTransactionClassificationDebugTrial: vi.fn(),
    runLedgerIntegrityCheck: vi.fn(),
    trackWorkspaceMutation: vi.fn(),
    updateAutoAssignSources: vi.fn(),
    updateAutoAssignSourcesWithWorkspaceChanges: vi.fn(),
    updateTransactionClassificationSettings: vi.fn(),
    updateTransactionTemplate: vi.fn(),
    updateTransactionTemplateWithWorkspaceChanges: vi.fn(),
}));

const fakeKnowledge = {
    activeLedgerId: "ledger-1",
    changeCursor: "01HZ0000000000000000000000",
    entityCounts: {
        account: 0,
        allocationFundingSource: 0,
        budgetCategory: 0,
        budgetGroup: 0,
        budgetPeriod: 0,
        categoryAllocation: 0,
        ledger: 1,
        ledgerPosting: 0,
        plaidAccountLink: 0,
        plaidTransactionSync: 0,
        transaction: 0,
        transactionLine: 0,
        transactionTemplate: 0,
        userAccount: 1,
    },
    generatedAt: "2026-06-24T12:00:00.000Z",
    retainedChangesAfter: "2026-05-25T12:00:00.000Z",
    revision: "revision",
};

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
        ledgerId: "ledger-1",
        name: "Household",
        updatedAt: "2026-06-24T00:00:00.000Z",
    },
    version: 2,
};

vi.mock("@/lib/auth/current-user", () => ({
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/utilities/server/ledger-transfer-service", () => ({
    buildLedgerExportFile: mocks.buildLedgerExportFile,
    createLedgerExportFilename: mocks.createLedgerExportFilename,
    importLedgerExport: mocks.importLedgerExport,
}));

vi.mock("@/features/utilities/server/budget-plan-workbook-service", () => ({
    createBudgetPlanWorkbookDownload: mocks.createBudgetPlanWorkbookDownload,
    importBudgetPlanWorkbook: mocks.importBudgetPlanWorkbook,
}));

vi.mock(
    "@/features/utilities/server/ledger-export-download-service",
    () => ({
        createLedgerExportDownload: mocks.createLedgerExportDownload,
    }),
);

vi.mock("@/features/budget/server/auto-assign-source-service", () => ({
    updateAutoAssignSources: mocks.updateAutoAssignSources,
    updateAutoAssignSourcesWithWorkspaceChanges:
        mocks.updateAutoAssignSourcesWithWorkspaceChanges,
}));

vi.mock(
    "@/features/transaction-templates/server/transaction-template-service",
    () => ({
        createTransactionTemplate: mocks.createTransactionTemplate,
        createTransactionTemplateWithWorkspaceChanges:
            mocks.createTransactionTemplateWithWorkspaceChanges,
        deleteTransactionTemplate: mocks.deleteTransactionTemplate,
        deleteTransactionTemplateWithWorkspaceChanges:
            mocks.deleteTransactionTemplateWithWorkspaceChanges,
        listTransactionTemplates: mocks.listTransactionTemplates,
        updateTransactionTemplate: mocks.updateTransactionTemplate,
        updateTransactionTemplateWithWorkspaceChanges:
            mocks.updateTransactionTemplateWithWorkspaceChanges,
    }),
);

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    beginWorkspaceExplicitMutation: mocks.beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge: mocks.buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation: mocks.completeWorkspaceExplicitMutation,
    persistWorkspaceChanges: mocks.persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation: mocks.recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation: mocks.trackWorkspaceMutation,
}));

vi.mock("@/features/ledgers/server/ledger-integrity-service", () => ({
    runLedgerIntegrityCheck: mocks.runLedgerIntegrityCheck,
}));

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-settings-service",
    () => ({
        getTransactionClassificationSettings:
            mocks.getTransactionClassificationSettings,
        updateTransactionClassificationSettings:
            mocks.updateTransactionClassificationSettings,
    }),
);

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-interaction-service",
    () => ({
        listRecentTransactionClassificationInteractions:
            mocks.listRecentTransactionClassificationInteractions,
    }),
);

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-embedding-service",
    () => ({
        getTransactionClassificationEmbeddingStatus:
            mocks.getTransactionClassificationEmbeddingStatus,
        rebuildTransactionClassificationEmbeddings:
            mocks.rebuildTransactionClassificationEmbeddings,
    }),
);

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-debug-service",
    () => ({
        createTransactionClassificationDebugEmbeddings:
            mocks.createTransactionClassificationDebugEmbeddings,
        getTransactionClassificationDebugPage:
            mocks.getTransactionClassificationDebugPage,
        runTransactionClassificationDebugTrial:
            mocks.runTransactionClassificationDebugTrial,
    }),
);

vi.mock(
    "@/features/transaction-classification/server/transaction-classification-pending-service",
    () => ({
        classifyAccountNow: mocks.classifyAccountNow,
    }),
);

import { PUT as PUT_AUTO_ASSIGN_SOURCES } from "@/app/api/utilities/auto-assign-sources/route";
import { POST as POST_LEDGER_INTEGRITY_CHECK } from "@/app/api/utilities/ledger-integrity/check/route";
import { GET } from "@/app/api/utilities/ledger-export/route";
import { POST } from "@/app/api/utilities/ledger-import/route";
import {
    GET as GET_BUDGET_PLAN_WORKBOOK,
    POST as POST_BUDGET_PLAN_WORKBOOK,
} from "@/app/api/utilities/budget-plan-workbook/route";
import { POST as POST_TRANSACTION_CLASSIFICATION_DEBUG_CLASSIFY } from "@/app/api/utilities/transaction-classification-debug/classify/route";
import { POST as POST_TRANSACTION_CLASSIFICATION_DEBUG_EMBEDDINGS } from "@/app/api/utilities/transaction-classification-debug/embeddings/route";
import { GET as GET_TRANSACTION_CLASSIFICATION_DEBUG } from "@/app/api/utilities/transaction-classification-debug/route";
import { POST as POST_TRANSACTION_CLASSIFICATION_CLASSIFY_NOW } from "@/app/api/utilities/transaction-classification/classify-now/route";
import { GET as GET_TRANSACTION_CLASSIFICATION_INTERACTIONS } from "@/app/api/utilities/transaction-classification-interactions/route";
import { POST as POST_TRANSACTION_CLASSIFICATION_EMBEDDINGS_REBUILD } from "@/app/api/utilities/transaction-classification-embeddings/rebuild/route";
import { GET as GET_TRANSACTION_CLASSIFICATION_EMBEDDINGS_STATUS } from "@/app/api/utilities/transaction-classification-embeddings/status/route";
import {
    GET as GET_TRANSACTION_CLASSIFICATION_SETTINGS,
    PATCH as PATCH_TRANSACTION_CLASSIFICATION_SETTINGS,
} from "@/app/api/utilities/transaction-classification-settings/route";
import {
    GET as GET_TRANSACTION_TEMPLATES,
    POST as POST_TRANSACTION_TEMPLATE,
} from "@/app/api/utilities/transaction-templates/route";
import {
    DELETE as DELETE_TRANSACTION_TEMPLATE,
    PATCH as PATCH_TRANSACTION_TEMPLATE,
} from "@/app/api/utilities/transaction-templates/[templateId]/route";

describe("utilities routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.buildCommittedWorkspaceKnowledge.mockResolvedValue(fakeKnowledge);
        mocks.requireCurrentUserAccount.mockResolvedValue({
            activeLedgerId: "ledger-1",
            activeLedgerName: "Household",
            userId: "owner",
        });
        mocks.trackWorkspaceMutation.mockImplementation(
            async (_user, mutate) => ({
                knowledge: fakeKnowledge,
                result: await mutate(),
            }),
        );
        mocks.persistWorkspaceChanges.mockImplementation(({ changes }) =>
            changes.map((change: Record<string, unknown>, index: number) => ({
                ...change,
                batchId: "batch-1",
                changedAt: "2026-06-24T12:00:00.000Z",
                changeId: `change-${index}`,
                expiresAt: 1_780_000_000,
            })),
        );
        mocks.getTransactionClassificationSettings.mockResolvedValue({
            availableModels: [
                {
                    label: "Gemini 3.5 Flash",
                    modelId: "gemini-3.5-flash",
                    provider: "google",
                },
                {
                    label: "GPT-5.6 Luna",
                    modelId: "gpt-5.6-luna",
                    provider: "openai",
                },
            ],
            modelId: "gemini-3.5-flash",
            systemInstructions: "Prefer restaurant categories for restaurants.",
        });
        mocks.classifyAccountNow.mockResolvedValue({
            accountId: "checking",
            categoryCount: 1,
            eligibleCount: 3,
            errorCount: 0,
            errors: [],
            noSuggestionCount: 1,
            savedCount: 2,
            skippedCount: 1,
        });
        mocks.getTransactionClassificationEmbeddingStatus.mockResolvedValue({
            dimensions: 256,
            indexedSourceCount: 9,
            indexedTransactionCount: 8,
            modelId: "text-embedding-3-small",
            orphanCount: 0,
            sourceCount: 10,
            sourceOrphanCount: 0,
            sourceStaleCount: 1,
            sourceTransactionCount: 10,
            staleCount: 3,
        });
        mocks.getTransactionClassificationDebugPage.mockResolvedValue({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    name: "Checking",
                },
            ],
            selectedAccountId: "checking",
            transactions: [
                {
                    amountCents: -4200,
                    embedding: {
                        embeddingTextHash: "hash",
                        status: "current",
                    },
                    isClassificationEligible: true,
                    kind: "standard",
                    memo: "Weekly food",
                    occurredAt: "2026-07-01T00:00:00.000Z",
                    payee: "Fresh Market",
                    status: "entered",
                    targetLineCount: 1,
                    transactionId: "transaction-1",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
        });
        mocks.createTransactionClassificationDebugEmbeddings.mockResolvedValue({
            createdCount: 1,
            refreshedCount: 0,
            requestedCount: 1,
            skippedCount: 0,
            sourceCount: 1,
        });
        mocks.runTransactionClassificationDebugTrial.mockResolvedValue({
            eligibleCount: 1,
            llmInteraction: {
                requestText: "llm input",
                responseText: "llm output",
                sent: true,
            },
            modelId: "gemini-3.5-flash",
            promptVersion: "2026-07-07.v1",
            results: [
                {
                    candidateCategories: [
                        { categoryId: "groceries", name: "Groceries" },
                    ],
                    explanations: ["Matched merchant summary s:fresh market."],
                    outcome: "llm",
                    suggestion: {
                        confidence: 0.94,
                        reason: "Matched Fresh Market history.",
                        type: "category",
                    },
                    transactionId: "transaction-1",
                },
            ],
        });
        mocks.rebuildTransactionClassificationEmbeddings.mockResolvedValue({
            createdCount: 2,
            deletedOrphanCount: 1,
            dimensions: 256,
            modelId: "text-embedding-3-small",
            refreshedCount: 3,
            skippedCount: 4,
            sourceCount: 9,
        });
        mocks.listRecentTransactionClassificationInteractions.mockResolvedValue([
            {
                createdAt: "2026-07-07T12:00:00.000Z",
                interactionId: "interaction-1",
                modelId: "gemini-3.5-flash",
                promptVersion: "2026-07-07.v1",
                requestText: "query text",
                responseText: "response text",
            },
        ]);
        mocks.updateTransactionClassificationSettings.mockImplementation(
            async (_ledgerId, input) => input,
        );
        mocks.createTransactionTemplateWithWorkspaceChanges.mockImplementation(
            async (...args) => ({
                template: await mocks.createTransactionTemplate(...args),
                workspaceChanges: [
                    {
                        entityId: "template-1",
                        entityType: "transactionTemplate",
                        operation: "upsert",
                        record: { templateId: "template-1" },
                    },
                ],
            }),
        );
        mocks.updateTransactionTemplateWithWorkspaceChanges.mockImplementation(
            async (...args) => ({
                template: await mocks.updateTransactionTemplate(...args),
                workspaceChanges: [
                    {
                        entityId: "template-1",
                        entityType: "transactionTemplate",
                        operation: "upsert",
                        record: { templateId: "template-1" },
                    },
                ],
            }),
        );
        mocks.deleteTransactionTemplateWithWorkspaceChanges.mockImplementation(
            async (...args) => {
                await mocks.deleteTransactionTemplate(...args);

                return {
                    workspaceChanges: [
                        {
                            entityId: "template-1",
                            entityType: "transactionTemplate",
                            operation: "delete",
                            record: null,
                        },
                    ],
                };
            },
        );
    });

    it("reads transaction classification settings", async () => {
        const response = await GET_TRANSACTION_CLASSIFICATION_SETTINGS();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            availableModels: [
                {
                    label: "Gemini 3.5 Flash",
                    modelId: "gemini-3.5-flash",
                    provider: "google",
                },
                {
                    label: "GPT-5.6 Luna",
                    modelId: "gpt-5.6-luna",
                    provider: "openai",
                },
            ],
            modelId: "gemini-3.5-flash",
            systemInstructions: "Prefer restaurant categories for restaurants.",
        });
        expect(mocks.getTransactionClassificationSettings).toHaveBeenCalledWith(
            "ledger-1",
        );
    });

    it("updates transaction classification settings", async () => {
        const payload = {
            modelId: "gpt-5.6-luna",
            systemInstructions: "Prefer restaurant categories for restaurants.",
        };
        const response = await PATCH_TRANSACTION_CLASSIFICATION_SETTINGS(
            new Request(
                "http://localhost/api/utilities/transaction-classification-settings",
                {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(payload);
        expect(
            mocks.updateTransactionClassificationSettings,
        ).toHaveBeenCalledWith("ledger-1", payload);
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("runs account-scoped transaction classification now", async () => {
        const response = await POST_TRANSACTION_CLASSIFICATION_CLASSIFY_NOW(
            new Request(
                "http://localhost/api/utilities/transaction-classification/classify-now",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ accountId: "checking" }),
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            accountId: "checking",
            noSuggestionCount: 1,
            savedCount: 2,
            skippedCount: 1,
        });
        expect(mocks.classifyAccountNow).toHaveBeenCalledWith({
            accountId: "checking",
            ledgerId: "ledger-1",
            source: "manual",
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("reads recent transaction classification interactions", async () => {
        const response = await GET_TRANSACTION_CLASSIFICATION_INTERACTIONS();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            interactions: [
                {
                    createdAt: "2026-07-07T12:00:00.000Z",
                    interactionId: "interaction-1",
                    modelId: "gemini-3.5-flash",
                    promptVersion: "2026-07-07.v1",
                    requestText: "query text",
                    responseText: "response text",
                },
            ],
        });
        expect(
            mocks.listRecentTransactionClassificationInteractions,
        ).toHaveBeenCalledWith("ledger-1");
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("reads transaction classification embedding status", async () => {
        const response = await GET_TRANSACTION_CLASSIFICATION_EMBEDDINGS_STATUS();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            dimensions: 256,
            indexedSourceCount: 9,
            indexedTransactionCount: 8,
            modelId: "text-embedding-3-small",
            orphanCount: 0,
            sourceCount: 10,
            sourceOrphanCount: 0,
            sourceStaleCount: 1,
            sourceTransactionCount: 10,
            staleCount: 3,
        });
        expect(
            mocks.getTransactionClassificationEmbeddingStatus,
        ).toHaveBeenCalledWith("ledger-1");
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("rebuilds transaction classification embeddings without workspace changes", async () => {
        const response =
            await POST_TRANSACTION_CLASSIFICATION_EMBEDDINGS_REBUILD();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            createdCount: 2,
            deletedOrphanCount: 1,
            dimensions: 256,
            modelId: "text-embedding-3-small",
            refreshedCount: 3,
            skippedCount: 4,
            sourceCount: 9,
        });
        expect(
            mocks.rebuildTransactionClassificationEmbeddings,
        ).toHaveBeenCalledWith("ledger-1");
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("reads transaction classification debug rows", async () => {
        const response = await GET_TRANSACTION_CLASSIFICATION_DEBUG(
            new Request(
                "http://localhost/api/utilities/transaction-classification-debug?accountId=checking",
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            accounts: [
                {
                    accountId: "checking",
                    accountType: "checking",
                    name: "Checking",
                },
            ],
            selectedAccountId: "checking",
            transactions: [
                {
                    amountCents: -4200,
                    embedding: {
                        embeddingTextHash: "hash",
                        status: "current",
                    },
                    isClassificationEligible: true,
                    kind: "standard",
                    memo: "Weekly food",
                    occurredAt: "2026-07-01T00:00:00.000Z",
                    payee: "Fresh Market",
                    status: "entered",
                    targetLineCount: 1,
                    transactionId: "transaction-1",
                    updatedAt: "2026-07-01T00:00:00.000Z",
                },
            ],
        });
        expect(
            mocks.getTransactionClassificationDebugPage,
        ).toHaveBeenCalledWith({
            accountId: "checking",
            ledgerId: "ledger-1",
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("creates selected transaction classification debug embeddings", async () => {
        const response = await POST_TRANSACTION_CLASSIFICATION_DEBUG_EMBEDDINGS(
            new Request(
                "http://localhost/api/utilities/transaction-classification-debug/embeddings",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        transactionIds: ["transaction-1"],
                    }),
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            createdCount: 1,
            refreshedCount: 0,
            requestedCount: 1,
            skippedCount: 0,
            sourceCount: 1,
        });
        expect(
            mocks.createTransactionClassificationDebugEmbeddings,
        ).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            transactionIds: ["transaction-1"],
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("runs a transaction classification debug trial", async () => {
        const response = await POST_TRANSACTION_CLASSIFICATION_DEBUG_CLASSIFY(
            new Request(
                "http://localhost/api/utilities/transaction-classification-debug/classify",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        transactionIds: ["transaction-1"],
                    }),
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            eligibleCount: 1,
            llmInteraction: {
                requestText: "llm input",
                responseText: "llm output",
                sent: true,
            },
            modelId: "gemini-3.5-flash",
            results: [
                {
                    outcome: "llm",
                    transactionId: "transaction-1",
                },
            ],
        });
        expect(
            mocks.runTransactionClassificationDebugTrial,
        ).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
            transactionIds: ["transaction-1"],
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("creates a temporary ledger export download", async () => {
        mocks.createLedgerExportDownload.mockResolvedValue({
            downloadUrl: "https://example.test/temporary-ledger-export",
        });

        const response = await GET(
            new Request(
                "https://budgeted.test/api/utilities/ledger-export?timeZone=America%2FChicago",
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "application/json",
        );
        expect(response.headers.get("cache-control")).toBe("no-store");
        await expect(response.json()).resolves.toEqual({
            downloadUrl: "https://example.test/temporary-ledger-export",
        });
        expect(mocks.createLedgerExportDownload).toHaveBeenCalledWith(
            expect.objectContaining({ activeLedgerId: "ledger-1" }),
            { timeZone: "America/Chicago" },
        );
    });

    it("downloads a budget plan workbook", async () => {
        mocks.createBudgetPlanWorkbookDownload.mockResolvedValue({
            content: Buffer.from("workbook"),
            contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename: "budgeted-budget-plan-household.xlsx",
        });

        const response = await GET_BUDGET_PLAN_WORKBOOK();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-disposition")).toBe(
            'attachment; filename="budgeted-budget-plan-household.xlsx"',
        );
        expect(response.headers.get("content-type")).toContain(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        expect(
            new TextDecoder().decode(await response.arrayBuffer()),
        ).toBe("workbook");
        expect(mocks.createBudgetPlanWorkbookDownload).toHaveBeenCalledWith(
            expect.objectContaining({ activeLedgerId: "ledger-1" }),
        );
    });

    it("imports a budget plan workbook through the workspace mutation wrapper", async () => {
        mocks.importBudgetPlanWorkbook.mockResolvedValue({
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
                budgetCategories: 2,
                budgetGroups: 1,
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
        });
        const formData = new FormData();
        const file = new File(
            ["workbook"],
            "budget-plan.xlsx",
            {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        );
        formData.set("file", file);

        const response = await POST_BUDGET_PLAN_WORKBOOK(
            {
                formData: async () => formData,
            } as Request,
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            importScope: "budgetPlan",
            mode: "merge",
            workspaceSync: { commits: [] },
        });
        expect(mocks.importBudgetPlanWorkbook).toHaveBeenCalledWith({
            file: expect.objectContaining({ name: "budget-plan.xlsx" }),
            user: expect.objectContaining({ activeLedgerId: "ledger-1" }),
        });
    });

    it("imports a ledger through the workspace mutation wrapper", async () => {
        mocks.importLedgerExport.mockResolvedValue({
            activeLedgerId: "ledger-2",
            activeLedgerName: "Imported",
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
            },
        });

        const response = await POST(
            new Request("http://localhost/api/utilities/ledger-import", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    exportFile,
                    mode: "create",
                    targetLedgerName: "Imported",
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            activeLedgerId: "ledger-2",
            mode: "create",
            workspaceSync: { commits: [] },
        });
        expect(mocks.importLedgerExport).toHaveBeenCalledWith(
            expect.objectContaining({ activeLedgerId: "ledger-1" }),
            expect.objectContaining({ importScope: "full", mode: "create" }),
        );
    });

    it("imports only budget plan records through the workspace mutation wrapper", async () => {
        mocks.importLedgerExport.mockResolvedValue({
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
                budgetCategories: 2,
                budgetGroups: 1,
                budgetPeriods: 0,
                ledgerPostings: 0,
                plaidAccountLinks: 0,
                plaidTransactionSyncs: 0,
                transactionTemplates: 0,
                transactionLines: 0,
                transactions: 0,
            },
        });

        const response = await POST(
            new Request("http://localhost/api/utilities/ledger-import", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    exportFile,
                    importScope: "budgetPlan",
                    mode: "merge",
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            activeLedgerId: "ledger-1",
            importScope: "budgetPlan",
            mode: "merge",
            workspaceSync: { commits: [] },
        });
        expect(mocks.importLedgerExport).toHaveBeenCalledWith(
            expect.objectContaining({ activeLedgerId: "ledger-1" }),
            expect.objectContaining({
                importScope: "budgetPlan",
                mode: "merge",
            }),
        );
    });

    it("updates auto assign source categories through the workspace mutation wrapper", async () => {
        mocks.updateAutoAssignSourcesWithWorkspaceChanges.mockResolvedValue({
            sources: [
                {
                    categoryId: "buffer",
                    sortOrder: 0,
                },
            ],
            workspaceChanges: [],
        });

        const response = await PUT_AUTO_ASSIGN_SOURCES(
            new Request("http://localhost/api/utilities/auto-assign-sources", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    sources: [{ categoryId: "buffer", sortOrder: 0 }],
                }),
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            sources: [{ categoryId: "buffer", sortOrder: 0 }],
            workspaceSync: { commits: [] },
        });
        expect(
            mocks.updateAutoAssignSourcesWithWorkspaceChanges,
        ).toHaveBeenCalledWith("ledger-1", {
            sources: [{ categoryId: "buffer", sortOrder: 0 }],
        });
    });

    it("runs the active ledger integrity check as a read-only utility route", async () => {
        mocks.runLedgerIntegrityCheck.mockResolvedValue({
            checkedAt: "2026-07-04T12:00:00.000Z",
            errorCount: 0,
            findings: [],
            ledger: {
                ledgerId: "ledger-1",
                name: "Household",
                status: "active",
                workspaceId: "global",
            },
            reconciliation: {
                accounts: [
                    {
                        accountId: "checking",
                        accountName: "Checking",
                        accountType: "checking",
                        currentBalanceCents: 10_000,
                        ledgerAccountId: "acct_checking",
                        openedOn: "2026-01-01",
                        openingBalanceCents: 10_000,
                        postingDeltaCents: 0,
                    },
                ],
                periods: [],
                totals: {
                    assetBalanceCents: 10_000,
                    currentBalanceCents: 10_000,
                    liabilityBalanceCents: 0,
                    openingBalanceCents: 10_000,
                    postingDeltaCents: 0,
                },
            },
            recordCounts: {
                account: 1,
                budgetAllocation: 0,
                budgetCategory: 0,
                budgetPeriod: 0,
                ledgerPosting: 0,
                transaction: 0,
                transactionLine: 0,
            },
            status: "passed",
            warningCount: 0,
        });

        const response = await POST_LEDGER_INTEGRITY_CHECK();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            errorCount: 0,
            ledger: { ledgerId: "ledger-1" },
            reconciliation: {
                totals: {
                    currentBalanceCents: 10_000,
                    openingBalanceCents: 10_000,
                },
            },
            status: "passed",
        });
        expect(mocks.runLedgerIntegrityCheck).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
        });
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
        expect(mocks.persistWorkspaceChanges).not.toHaveBeenCalled();
    });

    it("rejects invalid auto assign source payloads", async () => {
        const response = await PUT_AUTO_ASSIGN_SOURCES(
            new Request("http://localhost/api/utilities/auto-assign-sources", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    sources: [{ categoryId: "", sortOrder: 0 }],
                }),
            }),
        );

        expect(response.status).toBe(422);
        expect(mocks.updateAutoAssignSources).not.toHaveBeenCalled();
    });

    it("lists transaction templates for the active ledger", async () => {
        mocks.listTransactionTemplates.mockResolvedValue([
            {
                createdAt: "2026-06-01T00:00:00.000Z",
                ledgerId: "ledger-1",
                linesJson: "[]",
                name: "Paycheck",
                templateId: "template-1",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
        ]);

        const response = await GET_TRANSACTION_TEMPLATES();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual([
            expect.objectContaining({ templateId: "template-1" }),
        ]);
        expect(mocks.listTransactionTemplates).toHaveBeenCalledWith("ledger-1");
        expect(mocks.trackWorkspaceMutation).not.toHaveBeenCalled();
    });

    it("creates transaction templates through the workspace mutation wrapper", async () => {
        const template = {
            createdAt: "2026-06-01T00:00:00.000Z",
            ledgerId: "ledger-1",
            linesJson: "[]",
            name: "Paycheck",
            templateId: "template-1",
            updatedAt: "2026-06-01T00:00:00.000Z",
        };
        mocks.createTransactionTemplate.mockResolvedValue(template);

        const response = await POST_TRANSACTION_TEMPLATE(
            new Request(
                "http://localhost/api/utilities/transaction-templates",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        defaultAmountCents: 100_00,
                        lines: [
                            {
                                categoryId: "category-1",
                                formula: "remainder",
                                sortOrder: 0,
                            },
                        ],
                        name: "Paycheck",
                    }),
                },
            ),
        );

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            ...template,
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "template-1",
                                entityType: "transactionTemplate",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(
            mocks.createTransactionTemplateWithWorkspaceChanges,
        ).toHaveBeenCalledWith(
            "ledger-1",
            expect.objectContaining({ name: "Paycheck" }),
        );
    });

    it("updates and deletes transaction templates through workspace mutations", async () => {
        mocks.updateTransactionTemplate.mockResolvedValue({
            createdAt: "2026-06-01T00:00:00.000Z",
            ledgerId: "ledger-1",
            linesJson: "[]",
            name: "Updated",
            templateId: "template-1",
            updatedAt: "2026-06-02T00:00:00.000Z",
        });

        const patchResponse = await PATCH_TRANSACTION_TEMPLATE(
            new Request(
                "http://localhost/api/utilities/transaction-templates/template-1",
                {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        lines: [
                            {
                                categoryId: "category-1",
                                formula: "remainder",
                                sortOrder: 0,
                            },
                        ],
                        name: "Updated",
                    }),
                },
            ),
            { params: Promise.resolve({ templateId: "template-1" }) },
        );

        expect(patchResponse.status).toBe(200);
        await expect(patchResponse.json()).resolves.toMatchObject({
            templateId: "template-1",
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "template-1",
                                entityType: "transactionTemplate",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(
            mocks.updateTransactionTemplateWithWorkspaceChanges,
        ).toHaveBeenCalledWith(
            "ledger-1",
            "template-1",
            expect.objectContaining({ name: "Updated" }),
        );

        const deleteResponse = await DELETE_TRANSACTION_TEMPLATE(
            new Request(
                "http://localhost/api/utilities/transaction-templates/template-1",
            ),
            { params: Promise.resolve({ templateId: "template-1" }) },
        );

        expect(deleteResponse.status).toBe(200);
        await expect(deleteResponse.json()).resolves.toMatchObject({
            workspaceSync: {
                commits: [
                    expect.objectContaining({
                        changes: [
                            expect.objectContaining({
                                entityId: "template-1",
                                entityType: "transactionTemplate",
                                operation: "delete",
                            }),
                        ],
                    }),
                ],
            },
        });
        expect(
            mocks.deleteTransactionTemplateWithWorkspaceChanges,
        ).toHaveBeenCalledWith("ledger-1", "template-1");
    });
});
