import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    assertLedgerNameIsAvailable: vi.fn(),
    jobGet: vi.fn(),
    jobGetGo: vi.fn(),
    jobPut: vi.fn(),
    jobPutConditionalGo: vi.fn(),
    jobPutGo: vi.fn(),
    jobPutWhere: vi.fn(),
}));

vi.mock("@/features/import/ynab/server/ynab-import-artifact-service", () => ({
    createYnabImportUploadTargets: vi.fn(),
}));

vi.mock("@/features/ledgers/server/ledger-service", () => ({
    assertLedgerNameIsAvailable: mocks.assertLedgerNameIsAvailable,
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            ynabImportJobs: {
                get: mocks.jobGet,
                put: mocks.jobPut,
            },
        },
    }),
}));

import {
    beginDiscardYnabImport,
    beginYnabImport,
} from "@/features/import/ynab/server/ynab-import-job-service";

function buildJob(status: "analyzing" | "completed" | "failed" | "importing" | "ready" | "uploading") {
    return {
        createdAt: "2026-09-02T12:00:00.000Z",
        expiresAt: 2_000_000_000,
        filesJson: "[]",
        jobId: "job-1",
        ledgerName: "Imported budget",
        previewRevision: 3,
        status,
        targetLedgerId: "ledger-target",
        updatedAt: "2026-09-02T12:00:00.000Z",
        userId: "user-1",
        workspaceId: "global",
    } as const;
}

describe("YNAB import job transitions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.jobGet.mockReturnValue({ go: mocks.jobGetGo });
        mocks.jobPut.mockReturnValue({
            go: mocks.jobPutGo,
            where: mocks.jobPutWhere,
        });
        mocks.jobPutWhere.mockReturnValue({
            go: mocks.jobPutConditionalGo,
        });
        mocks.jobPutGo.mockResolvedValue({ data: {} });
        mocks.jobPutConditionalGo.mockResolvedValue({
            data: {},
            rejected: false,
        });
        mocks.assertLedgerNameIsAvailable.mockResolvedValue(undefined);
    });

    it.each(["analyzing", "importing"] as const)(
        "rejects discard while a job is %s",
        async (status) => {
            mocks.jobGetGo.mockResolvedValue({ data: buildJob(status) });

            await expect(
                beginDiscardYnabImport("job-1", "user-1"),
            ).rejects.toMatchObject({
                code: "ynab_import_busy",
                status: 409,
            });
            expect(mocks.jobPut).not.toHaveBeenCalled();
        },
    );

    it("conditions discard on the job version read by the request", async () => {
        const existing = buildJob("ready");
        mocks.jobGetGo.mockResolvedValue({ data: existing });

        const result = await beginDiscardYnabImport("job-1", "user-1");

        expect(result).toMatchObject({
            lastAction: "cleanup",
            status: "failed",
        });
        expect(Date.parse(result.updatedAt)).toBeGreaterThan(
            Date.parse(existing.updatedAt),
        );
        const condition = mocks.jobPutWhere.mock.calls[0]?.[0];
        const eq = vi.fn(() => "updated-at-condition");
        expect(
            condition({ updatedAt: "updatedAt" }, { eq }),
        ).toBe("updated-at-condition");
        expect(eq).toHaveBeenCalledWith("updatedAt", existing.updatedAt);
        expect(mocks.jobPutConditionalGo).toHaveBeenCalledWith({
            returnOnConditionCheckFailure: true,
        });
    });

    it("returns a conflict when another request wins the transition", async () => {
        mocks.jobGetGo.mockResolvedValue({ data: buildJob("ready") });
        mocks.jobPutConditionalGo.mockResolvedValue({ rejected: true });

        await expect(beginYnabImport("job-1", "user-1", 3)).rejects.toMatchObject({
            code: "ynab_import_changed",
            status: 409,
        });
    });
});
