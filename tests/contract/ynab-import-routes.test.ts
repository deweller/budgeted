// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
    beginDiscardYnabImport: vi.fn(),
    beginYnabImport: vi.fn(),
    beginYnabImportPreview: vi.fn(),
    createYnabImportJob: vi.fn(),
    failYnabImportJob: vi.fn(),
    getLatestYnabImportJob: vi.fn(),
    getYnabImportJob: vi.fn(),
    invokeYnabImportWorker: vi.fn(),
    requireCurrentUserAccount: vi.fn(),
    retryYnabImport: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
    requireCurrentUserAccount: mocks.requireCurrentUserAccount,
}));

vi.mock("@/features/import/ynab/server/ynab-import-invocation-service", () => ({
    invokeYnabImportWorker: mocks.invokeYnabImportWorker,
}));

vi.mock("@/features/import/ynab/server/ynab-import-job-service", () => ({
    beginDiscardYnabImport: mocks.beginDiscardYnabImport,
    beginYnabImport: mocks.beginYnabImport,
    beginYnabImportPreview: mocks.beginYnabImportPreview,
    createYnabImportJob: mocks.createYnabImportJob,
    failYnabImportJob: mocks.failYnabImportJob,
    getLatestYnabImportJob: mocks.getLatestYnabImportJob,
    getYnabImportJob: mocks.getYnabImportJob,
    retryYnabImport: mocks.retryYnabImport,
}));

import {
    GET as GET_IMPORTS,
    POST as CREATE_IMPORT,
} from "@/app/api/utilities/ynab-imports/route";
import { DELETE as DISCARD_IMPORT } from "@/app/api/utilities/ynab-imports/[jobId]/route";
import { POST as PREVIEW_IMPORT } from "@/app/api/utilities/ynab-imports/[jobId]/preview/route";
import { POST as START_IMPORT } from "@/app/api/utilities/ynab-imports/[jobId]/start/route";

const user = {
    activeLedgerId: "ledger-current",
    activeLedgerName: "Current",
    role: "super",
    userId: "user-1",
};

describe("YNAB import routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireCurrentUserAccount.mockResolvedValue(user);
        mocks.invokeYnabImportWorker.mockResolvedValue(undefined);
    });

    it("returns the latest job for the signed-in user", async () => {
        mocks.getLatestYnabImportJob.mockResolvedValue({ jobId: "job-1" });

        const response = await GET_IMPORTS();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ job: { jobId: "job-1" } });
        expect(mocks.getLatestYnabImportJob).toHaveBeenCalledWith("user-1");
    });

    it("creates signed upload targets for a ZIP", async () => {
        mocks.createYnabImportJob.mockResolvedValue({
            job: { jobId: "job-1", status: "uploading" },
            uploads: [{ kind: "zip", url: "https://uploads.test/job-1" }],
        });
        const response = await CREATE_IMPORT(
            new Request("http://localhost/api/utilities/ynab-imports", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    files: [
                        {
                            contentType: "application/zip",
                            kind: "zip",
                            name: "budget.zip",
                            size: 100,
                        },
                    ],
                }),
            }),
        );

        expect(response.status).toBe(201);
        expect(mocks.createYnabImportJob).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ files: [expect.objectContaining({ kind: "zip" })] }),
        );
    });

    it("stores preview settings before invoking the asynchronous analyzer", async () => {
        mocks.beginYnabImportPreview.mockResolvedValue({
            jobId: "job-1",
            status: "analyzing",
        });
        const response = await PREVIEW_IMPORT(
            new Request("http://localhost/preview", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    endMonth: "2026-06",
                    ledgerName: "Imported budget",
                }),
            }),
            { params: Promise.resolve({ jobId: "job-1" }) },
        );

        expect(response.status).toBe(202);
        expect(mocks.beginYnabImportPreview).toHaveBeenCalledWith(
            "job-1",
            "user-1",
            { endMonth: "2026-06", ledgerName: "Imported budget" },
        );
        expect(mocks.invokeYnabImportWorker).toHaveBeenCalledWith({
            action: "analyze",
            jobId: "job-1",
        });
    });

    it("returns a conflict when the requested preview revision is stale", async () => {
        mocks.beginYnabImport.mockRejectedValue(
            new HttpError(
                409,
                "ynab_import_preview_stale",
                "The YNAB preview changed.",
            ),
        );
        const response = await START_IMPORT(
            new Request("http://localhost/start", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ previewRevision: 2 }),
            }),
            { params: Promise.resolve({ jobId: "job-1" }) },
        );

        expect(response.status).toBe(409);
        expect(mocks.invokeYnabImportWorker).not.toHaveBeenCalled();
        expect((await response.json()).error.code).toBe(
            "ynab_import_preview_stale",
        );
    });

    it("does not invoke cleanup when an active import cannot be discarded", async () => {
        mocks.beginDiscardYnabImport.mockRejectedValue(
            new HttpError(
                409,
                "ynab_import_busy",
                "Wait for the current YNAB import work to finish before discarding it.",
            ),
        );

        const response = await DISCARD_IMPORT(
            new Request("http://localhost/import", { method: "DELETE" }),
            { params: Promise.resolve({ jobId: "job-1" }) },
        );

        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe("ynab_import_busy");
        expect(mocks.invokeYnabImportWorker).not.toHaveBeenCalled();
    });
});
