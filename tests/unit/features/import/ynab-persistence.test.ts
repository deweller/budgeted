import { beforeEach, describe, expect, it, vi } from "vitest";

import type { YnabImportPlan } from "@/features/import/ynab/planner";

const mocks = vi.hoisted(() => {
    const ledgersGetGo = vi.fn();
    const ledgersUpsertGo = vi.fn();

    return {
        bumpLedgerWorkspaceGeneration: vi.fn(),
        countLedgerScopedRecords: vi.fn(),
        deleteLedgerScopedRecords: vi.fn(),
        ledgersGet: vi.fn(() => ({ go: ledgersGetGo })),
        ledgersGetGo,
        ledgersUpsert: vi.fn(() => ({ go: ledgersUpsertGo })),
        ledgersUpsertGo,
        writeLedgerScopedRecords: vi.fn(),
    };
});

vi.mock("@/features/ledgers/server/ledger-scoped-record-writer-service", () => ({
    countLedgerScopedRecords: mocks.countLedgerScopedRecords,
    writeLedgerScopedRecords: mocks.writeLedgerScopedRecords,
}));

vi.mock("@/features/ledgers/server/ledger-service", () => ({
    bumpLedgerWorkspaceGeneration: mocks.bumpLedgerWorkspaceGeneration,
    deleteLedgerScopedRecords: mocks.deleteLedgerScopedRecords,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            ledgers: {
                get: mocks.ledgersGet,
                upsert: mocks.ledgersUpsert,
            },
        },
    }),
}));

import { persistYnabImport } from "@/features/import/ynab/persistence";

describe("YNAB import persistence", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.countLedgerScopedRecords.mockReturnValue(3);
        mocks.bumpLedgerWorkspaceGeneration.mockResolvedValue({
            ledgerId: "ledger-1",
            workspaceGeneration: 2,
            workspaceRevision: 0,
        });
        mocks.deleteLedgerScopedRecords.mockResolvedValue(12);
        mocks.ledgersGetGo.mockResolvedValue({
            data: {
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        });
        mocks.ledgersUpsertGo.mockResolvedValue(undefined);
        mocks.writeLedgerScopedRecords.mockResolvedValue(undefined);
    });

    it("replaces existing ledger-scoped records before writing the fresh import", async () => {
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
            plan: {
                records,
            } as unknown as YnabImportPlan,
        });

        expect(mocks.ledgersUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                createdAt: "2026-01-01T00:00:00.000Z",
                ledgerId: "ledger-1",
                name: "Imported Ledger",
            }),
        );
        expect(mocks.deleteLedgerScopedRecords).toHaveBeenCalledWith({
            ledgerId: "ledger-1",
        });
        expect(mocks.writeLedgerScopedRecords).toHaveBeenCalledWith(records);
        expect(mocks.bumpLedgerWorkspaceGeneration).toHaveBeenCalledWith(
            "ledger-1",
        );
        expect(
            mocks.deleteLedgerScopedRecords.mock.invocationCallOrder[0],
        ).toBeLessThan(
            mocks.writeLedgerScopedRecords.mock.invocationCallOrder[0],
        );
        expect(result.scopedRecordCount).toBe(3);
    });
});
