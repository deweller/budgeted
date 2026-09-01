import { beforeEach, describe, expect, it, vi } from "vitest";

import type { YnabImportPlan } from "@/features/import/ynab/planner";

const mocks = vi.hoisted(() => ({
    countLedgerScopedRecords: vi.fn(),
    rebuildWorkspaceStateForGeneration: vi.fn(),
    serviceGo: vi.fn(),
    serviceWrite: vi.fn(),
    toWorkspaceStateRecord: vi.fn(),
    writeLedgerScopedRecords: vi.fn(),
}));

vi.mock("@/features/ledgers/server/ledger-scoped-record-writer-service", () => ({
    countLedgerScopedRecords: mocks.countLedgerScopedRecords,
    writeLedgerScopedRecords: mocks.writeLedgerScopedRecords,
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    rebuildWorkspaceStateForGeneration: mocks.rebuildWorkspaceStateForGeneration,
    toWorkspaceStateRecord: mocks.toWorkspaceStateRecord,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        service: {
            transaction: {
                write: mocks.serviceWrite.mockImplementation((build) => {
                    build({
                        ledgers: {
                            put: () => ({ commit: () => "ledger-commit" }),
                        },
                        workspaceStates: {
                            put: () => ({ commit: () => "state-commit" }),
                        },
                    });
                    return { go: mocks.serviceGo };
                }),
            },
        },
    }),
}));

import { persistYnabImport } from "@/features/import/ynab/persistence";

describe("YNAB import persistence", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.countLedgerScopedRecords.mockReturnValue(3);
        mocks.rebuildWorkspaceStateForGeneration.mockResolvedValue({
            ledgerId: "ledger-1",
        });
        mocks.toWorkspaceStateRecord.mockReturnValue({ stateId: "current" });
        mocks.writeLedgerScopedRecords.mockResolvedValue(undefined);
    });

    it("writes hidden records before atomically publishing the new ledger", async () => {
        const records = {
            accounts: [],
            budgetAllocations: [],
            budgetCategories: [],
            budgetGroups: [],
            budgetPeriods: [],
            ledgerPostings: [],
            transactionLines: [],
            transactions: [],
        };
        const result = await persistYnabImport({
            ledgerId: "ledger-1",
            ledgerName: "Imported Ledger",
            plan: { records } as unknown as YnabImportPlan,
        });

        expect(mocks.writeLedgerScopedRecords).toHaveBeenCalledWith(records);
        expect(mocks.rebuildWorkspaceStateForGeneration).toHaveBeenCalledWith({
            ledger: expect.objectContaining({
                ledgerId: "ledger-1",
                name: "Imported Ledger",
                workspaceGeneration: 1,
                workspaceRevision: 0,
            }),
            ledgerId: "ledger-1",
            workspaceGeneration: 1,
            workspaceRevision: 0,
        });
        expect(mocks.serviceGo).toHaveBeenCalledOnce();
        expect(
            mocks.writeLedgerScopedRecords.mock.invocationCallOrder[0],
        ).toBeLessThan(
            mocks.rebuildWorkspaceStateForGeneration.mock.invocationCallOrder[0],
        );
        expect(result.scopedRecordCount).toBe(3);
    });
});
