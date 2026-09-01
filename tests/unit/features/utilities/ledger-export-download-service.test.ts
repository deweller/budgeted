import { gunzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    buildLedgerExportFile: vi.fn(),
    createLedgerExportFilename: vi.fn(),
    getSignedUrl: vi.fn(),
    requireLinkedBucketName: vi.fn(),
    s3Send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
    GetObjectCommand: vi.fn(function GetObjectCommand(input) {
        return { input, type: "get" };
    }),
    PutObjectCommand: vi.fn(function PutObjectCommand(input) {
        return { input, type: "put" };
    }),
    S3Client: vi.fn(function S3Client() {
        return { send: mocks.s3Send };
    }),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
    getSignedUrl: mocks.getSignedUrl,
}));

vi.mock("@/features/utilities/server/ledger-transfer-service", () => ({
    buildLedgerExportFile: mocks.buildLedgerExportFile,
    createLedgerExportFilename: mocks.createLedgerExportFilename,
}));

vi.mock("@/lib/db/resource", () => ({
    requireLinkedBucketName: mocks.requireLinkedBucketName,
}));

import { createLedgerExportDownload } from "@/features/utilities/server/ledger-export-download-service";

const exportFile = {
    exportedAt: "2026-08-05T12:00:00.000Z",
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
        transactionAutoMatchRejections: [],
        transactionLines: [],
        transactionTemplates: [],
        transactions: [],
        venmoAccountMappings: [],
        venmoIntegrations: [],
    },
    sourceLedger: {
        createdAt: "2026-01-01T00:00:00.000Z",
        ledgerId: "ledger-1",
        name: "Household",
        updatedAt: "2026-08-05T12:00:00.000Z",
    },
    version: 2,
};

describe("createLedgerExportDownload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.buildLedgerExportFile.mockResolvedValue(exportFile);
        mocks.createLedgerExportFilename.mockReturnValue(
            "budgeted-ledger-household-2026-08-05-070000.json.gz",
        );
        mocks.requireLinkedBucketName.mockReturnValue("temporary-exports");
        mocks.s3Send.mockResolvedValue({});
        mocks.getSignedUrl.mockResolvedValue(
            "https://example.test/temporary-ledger-export",
        );
    });

    it("writes a gzip-compressed, private export and returns a short-lived URL", async () => {
        await expect(
            createLedgerExportDownload({
                activeLedgerId: "ledger-1",
                activeLedgerName: "Household",
                userId: "owner",
            }),
        ).resolves.toEqual({
            downloadUrl: "https://example.test/temporary-ledger-export",
        });

        expect(mocks.requireLinkedBucketName).toHaveBeenCalledWith(
            "LedgerExportArtifacts",
        );
        expect(mocks.s3Send).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    Bucket: "temporary-exports",
                    CacheControl: "private, no-store",
                    ContentDisposition:
                        'attachment; filename="budgeted-ledger-household-2026-08-05-070000.json.gz"',
                    ContentType: "application/gzip",
                    Key: expect.stringMatching(/^ledger-exports\/.+\.json\.gz$/),
                    ServerSideEncryption: "AES256",
                }),
                type: "put",
            }),
        );

        const putCommand = mocks.s3Send.mock.calls[0]?.[0] as {
            input: { Body: Uint8Array };
        };
        expect(JSON.parse(gunzipSync(putCommand.input.Body).toString("utf8"))).toEqual(
            exportFile,
        );
        expect(mocks.getSignedUrl).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                input: {
                    Bucket: "temporary-exports",
                    Key: expect.stringMatching(/^ledger-exports\/.+\.json\.gz$/),
                },
                type: "get",
            }),
            { expiresIn: 600 },
        );
    });
});
