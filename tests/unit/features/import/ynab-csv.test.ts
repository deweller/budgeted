// @vitest-environment node

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readYnabCsvExport } from "@/features/import/ynab/csv";

const planHeader =
    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"';
const registerHeader =
    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"';

describe("YNAB CSV export reader", () => {
    it("uses the first matching Plan and Register CSV files when exact names are missing", async () => {
        const exportDir = await mkdtemp(join(tmpdir(), "ynab-export-"));

        await writeFile(
            join(exportDir, "B Budget - Plan.csv"),
            [
                planHeader,
                '"Jan 2025","Monthly: Ignored","Monthly","Ignored",$0.00,$0.00,$0.00',
            ].join("\n"),
        );
        await writeFile(
            join(exportDir, "A Budget - Plan.csv"),
            [
                planHeader,
                '"Jan 2025","Monthly: Rent","Monthly","Rent",$1.00,$0.00,$1.00',
            ].join("\n"),
        );
        await writeFile(
            join(exportDir, "B Budget - Register.csv"),
            [
                registerHeader,
                '"Ignored","","01/01/2025","Ignored","","","","",$0.00,$0.00,"Cleared"',
            ].join("\n"),
        );
        await writeFile(
            join(exportDir, "A Budget - Register.csv"),
            [
                registerHeader,
                '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1.00,"Cleared"',
            ].join("\n"),
        );

        const ynabExport = await readYnabCsvExport(exportDir);

        expect(ynabExport.planRecords[0].Category).toBe("Rent");
        expect(ynabExport.registerRecords[0].Account).toBe("Checking");
    });
});
