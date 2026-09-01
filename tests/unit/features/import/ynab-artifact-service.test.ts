import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { createYnabCsvExportFromZip } from "@/features/import/ynab/server/ynab-import-artifact-service";

const plan = [
    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"',
    '"Jan 2025","Monthly: Rent","Monthly","Rent",$1.00,$0.00,$1.00',
].join("\n");
const register = [
    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"',
    '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1.00,"Cleared"',
].join("\n");

describe("YNAB ZIP artifacts", () => {
    it("finds the Plan and Register CSV files inside an export folder", () => {
        const result = createYnabCsvExportFromZip(
            zipSync({
                "YNAB Export - Household/Household - Plan.csv": strToU8(plan),
                "YNAB Export - Household/Household - Register.csv":
                    strToU8(register),
            }),
        );

        expect(result.exportName).toBe("Household");
        expect(result.planRecords[0]?.Category).toBe("Rent");
        expect(result.registerRecords[0]?.Account).toBe("Checking");
    });

    it("rejects archives without exactly one of each CSV", () => {
        expect(() =>
            createYnabCsvExportFromZip(
                zipSync({ "Household - Plan.csv": strToU8(plan) }),
            ),
        ).toThrow(/exactly one \*Register\.csv/);
    });
});
