// @vitest-environment node

import { describe, expect, it } from "vitest";

import { formatSummary, parseYnabImportArgs } from "../../scripts/import-ynab.ts";

describe("YNAB import command contract", () => {
    it("parses the one-step import ledger name without a confirmation switch", () => {
        expect(
            parseYnabImportArgs([
                "--export-dir",
                "/tmp/ynab",
                "--account-map",
                "/tmp/account-map.json",
                "--ledger-name",
                "Imported Budget",
                "--ledger-id",
                "ledger-imported",
                "--end-month",
                "2025-12",
            ]),
        ).toEqual({
            accountMapPath: "/tmp/account-map.json",
            dryRun: false,
            endMonth: "2025-12",
            exportDir: "/tmp/ynab",
            help: false,
            ledgerId: "ledger-imported",
            ledgerName: "Imported Budget",
        });
    });

    it("rejects invalid end month values", () => {
        expect(() =>
            parseYnabImportArgs([
                "--export-dir",
                "/tmp/ynab",
                "--end-month",
                "2025-13",
            ]),
        ).toThrow(/--end-month must be in YYYY-MM format/);
    });

    it("rejects the removed confirmation and activation switches", () => {
        expect(() =>
            parseYnabImportArgs(["--export-dir", "/tmp/ynab", "--confirm", "old"]),
        ).toThrow(/Unknown argument: --confirm/);
        expect(() =>
            parseYnabImportArgs([
                "--export-dir",
                "/tmp/ynab",
                "--activate-for-email",
                "owner@example.com",
            ]),
        ).toThrow(/Unknown argument: --activate-for-email/);
    });

    it("includes import warnings in the command summary", () => {
        expect(
            formatSummary({
                accountCountByRole: {
                    budget: 1,
                    exclude: 0,
                    tracking: 1,
                },
                budgetCategoryCount: 2,
                budgetGroupCount: 1,
                firstMonth: "2025-01",
                lastMonth: "2025-12",
                multiLineTransactionCount: 0,
                skippedSyntheticAccountCount: 0,
                transactionCount: 1,
                transactionLineCount: 1,
                warnings: [
                    {
                        accountName: "Brokerage",
                        amountCents: 10_000,
                        categoryPath: "Float: Start of Year",
                        code: "trackingCategorizedStartingBalance",
                        message:
                            "Tracking account warning for test summary output.",
                        rowNumber: 2,
                    },
                ],
            }),
        ).toContain("- Tracking account warning for test summary output.");
    });
});
