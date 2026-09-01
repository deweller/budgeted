import { describe, expect, it } from "vitest";

import {
    createYnabImportUploadSchema,
    previewYnabImportSchema,
} from "@/features/import/ynab/models/ynab-import-job";
import { isYnabImportWorkerLeaseExpired } from "@/features/import/ynab/server/ynab-import-job-service";

describe("YNAB import job model", () => {
    it("accepts one ZIP or a Plan/Register CSV pair", () => {
        expect(
            createYnabImportUploadSchema.safeParse({
                files: [
                    {
                        contentType: "application/zip",
                        kind: "zip",
                        name: "budget.zip",
                        size: 100,
                    },
                ],
            }).success,
        ).toBe(true);
        expect(
            createYnabImportUploadSchema.safeParse({
                files: [
                    { contentType: "text/csv", kind: "plan", name: "Plan.csv", size: 10 },
                    { contentType: "text/csv", kind: "register", name: "Register.csv", size: 10 },
                ],
            }).success,
        ).toBe(true);
        expect(
            createYnabImportUploadSchema.safeParse({
                files: [
                    { contentType: "text/csv", kind: "plan", name: "Plan.csv", size: 10 },
                ],
            }).success,
        ).toBe(false);
    });

    it("validates the ledger name and optional end month", () => {
        expect(
            previewYnabImportSchema.safeParse({
                endMonth: "2026-12",
                ledgerName: "Imported budget",
            }).success,
        ).toBe(true);
        expect(
            previewYnabImportSchema.safeParse({
                endMonth: "2026-13",
                ledgerName: "Imported budget",
            }).success,
        ).toBe(false);
    });

    it("only expires active workers after their lease", () => {
        expect(
            isYnabImportWorkerLeaseExpired(
                { leaseExpiresAt: 100, status: "importing" },
                100,
            ),
        ).toBe(true);
        expect(
            isYnabImportWorkerLeaseExpired(
                { leaseExpiresAt: 101, status: "analyzing" },
                100,
            ),
        ).toBe(false);
        expect(
            isYnabImportWorkerLeaseExpired(
                { leaseExpiresAt: 1, status: "ready" },
                100,
            ),
        ).toBe(false);
    });
});
