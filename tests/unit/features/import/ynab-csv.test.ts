// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createYnabCsvExport } from "@/features/import/ynab/csv";

const planHeader =
    '"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"';
const registerHeader =
    '"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"';

describe("YNAB CSV export reader", () => {
    it("builds an export from uploaded Plan and Register CSV content", () => {
        const ynabExport = createYnabCsvExport({
            exportName: "A Budget",
            planContent: [
                planHeader,
                '"Jan 2025","Monthly: Ignored","Monthly","Ignored",$0.00,$0.00,$0.00',
                '"Jan 2025","Monthly: Rent","Monthly","Rent",$1.00,$0.00,$1.00',
            ].join("\n"),
            registerContent: [
                registerHeader,
                '"Checking","","01/01/2025","Starting Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1.00,"Cleared"',
            ].join("\n"),
        });

        expect(ynabExport.exportName).toBe("A Budget");
        expect(ynabExport.planRecords[1].Category).toBe("Rent");
        expect(ynabExport.registerRecords[0].Account).toBe("Checking");
    });
});
