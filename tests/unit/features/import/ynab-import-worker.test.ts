import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    assertLedgerNameIsAvailable: vi.fn(),
    completeYnabImport: vi.fn(),
    completeYnabImportPreview: vi.fn(),
    countLedgerScopedRecords: vi.fn(),
    createYnabImportPlan: vi.fn(),
    deleteLedgerScopedRecords: vi.fn(),
    deleteYnabImportArtifacts: vi.fn(),
    deleteYnabImportJobRecord: vi.fn(),
    failYnabImportJob: vi.fn(),
    getLedgerRecord: vi.fn(),
    getYnabImportAccountMappings: vi.fn(),
    getYnabImportJobRecord: vi.fn(),
    getYnabImportSourceFiles: vi.fn(),
    persistYnabImport: vi.fn(),
    readYnabImportSource: vi.fn(),
}));

vi.mock("@/features/import/ynab/server/ynab-import-artifact-service", () => ({
    deleteYnabImportArtifacts: mocks.deleteYnabImportArtifacts,
    readYnabImportSource: mocks.readYnabImportSource,
}));
vi.mock("@/features/import/ynab/server/ynab-import-job-service", () => ({
    completeYnabImport: mocks.completeYnabImport,
    completeYnabImportPreview: mocks.completeYnabImportPreview,
    deleteYnabImportJobRecord: mocks.deleteYnabImportJobRecord,
    failYnabImportJob: mocks.failYnabImportJob,
    getYnabImportAccountMappings: mocks.getYnabImportAccountMappings,
    getYnabImportJobRecord: mocks.getYnabImportJobRecord,
    getYnabImportSourceFiles: mocks.getYnabImportSourceFiles,
}));
vi.mock("@/features/import/ynab/planner", () => ({
    createYnabImportPlan: mocks.createYnabImportPlan,
}));
vi.mock("@/features/import/ynab/persistence", () => ({
    persistYnabImport: mocks.persistYnabImport,
}));
vi.mock("@/features/ledgers/server/ledger-service", () => ({
    assertLedgerNameIsAvailable: mocks.assertLedgerNameIsAvailable,
    deleteLedgerScopedRecords: mocks.deleteLedgerScopedRecords,
    getLedgerRecord: mocks.getLedgerRecord,
}));
vi.mock("@/features/ledgers/server/ledger-scoped-record-writer-service", () => ({
    countLedgerScopedRecords: mocks.countLedgerScopedRecords,
}));

import { handler } from "@/functions/ynab-import-worker";

const plan = {
    accountMappings: [{ accountId: "account-1" }],
    records: { transactions: [] },
    summary: { transactionCount: 0 },
};

describe("YNAB import worker", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getYnabImportSourceFiles.mockReturnValue([{ key: "source" }]);
        mocks.getYnabImportAccountMappings.mockReturnValue(undefined);
        mocks.readYnabImportSource.mockResolvedValue({ exportName: "Household" });
        mocks.createYnabImportPlan.mockReturnValue(plan);
        mocks.getLedgerRecord.mockResolvedValue(null);
        mocks.persistYnabImport.mockResolvedValue({ scopedRecordCount: 42 });
        mocks.countLedgerScopedRecords.mockReturnValue(42);
    });

    it("previews uploaded data without persisting a ledger", async () => {
        mocks.getYnabImportJobRecord.mockResolvedValue({
            endMonth: "2026-06",
            jobId: "job-1",
            previewRevision: 3,
            status: "analyzing",
            targetLedgerId: "ledger-target",
        });

        await handler({ action: "analyze", jobId: "job-1" });

        expect(mocks.createYnabImportPlan).toHaveBeenCalledWith(
            expect.objectContaining({
                endMonth: "2026-06",
                ledgerId: "ledger-target",
            }),
        );
        expect(mocks.completeYnabImportPreview).toHaveBeenCalledWith({
            accountMappings: plan.accountMappings,
            jobId: "job-1",
            previewRevision: 3,
            summary: plan.summary,
        });
        expect(mocks.persistYnabImport).not.toHaveBeenCalled();
    });

    it("writes and finalizes a new ledger without changing the current user", async () => {
        mocks.getYnabImportJobRecord.mockResolvedValue({
            jobId: "job-1",
            ledgerName: "Imported budget",
            status: "importing",
            targetLedgerId: "ledger-target",
        });

        await handler({ action: "import", jobId: "job-1" });

        expect(mocks.assertLedgerNameIsAvailable).toHaveBeenCalledWith({
            ledgerId: "ledger-target",
            name: "Imported budget",
        });
        expect(mocks.persistYnabImport).toHaveBeenCalledWith({
            ledgerId: "ledger-target",
            ledgerName: "Imported budget",
            plan,
        });
        expect(mocks.completeYnabImport).toHaveBeenCalledWith({
            jobId: "job-1",
            recordCount: 42,
        });
    });

    it("cleans hidden partial records when a failed import is discarded", async () => {
        mocks.getYnabImportJobRecord.mockResolvedValue({
            filesJson: "[]",
            jobId: "job-1",
            lastAction: "cleanup",
            status: "failed",
            targetLedgerId: "ledger-target",
        });

        await handler({ action: "cleanup", jobId: "job-1" });

        expect(mocks.deleteLedgerScopedRecords).toHaveBeenCalledWith({
            ledgerId: "ledger-target",
        });
        expect(mocks.deleteYnabImportArtifacts).toHaveBeenCalled();
        expect(mocks.deleteYnabImportJobRecord).toHaveBeenCalledWith("job-1");
    });

    it("ignores cleanup events for active imports", async () => {
        mocks.getYnabImportJobRecord.mockResolvedValue({
            filesJson: "[]",
            jobId: "job-1",
            lastAction: "import",
            status: "importing",
            targetLedgerId: "ledger-target",
        });

        await handler({ action: "cleanup", jobId: "job-1" });

        expect(mocks.deleteLedgerScopedRecords).not.toHaveBeenCalled();
        expect(mocks.deleteYnabImportArtifacts).not.toHaveBeenCalled();
        expect(mocks.deleteYnabImportJobRecord).not.toHaveBeenCalled();
    });
});
