import { parse } from "csv-parse/sync";

export type YnabPlanCsvRecord = {
    Activity: string;
    Assigned: string;
    Available: string;
    Category: string;
    "Category Group": string;
    "Category Group/Category": string;
    Month: string;
};

export type YnabRegisterCsvRecord = {
    Account: string;
    Category: string;
    "Category Group": string;
    "Category Group/Category": string;
    Cleared: string;
    Date: string;
    Flag: string;
    Inflow: string;
    Memo: string;
    Outflow: string;
    Payee: string;
};

export type YnabCsvExport = {
    exportName: string;
    planRecords: YnabPlanCsvRecord[];
    registerRecords: YnabRegisterCsvRecord[];
};

function parseCsvRecords<TRecord extends Record<string, string>>(content: string) {
    return parse(content, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: false,
    }) as TRecord[];
}

export function parseYnabPlanCsv(content: string) {
    return parseCsvRecords<YnabPlanCsvRecord>(content);
}

export function parseYnabRegisterCsv(content: string) {
    return parseCsvRecords<YnabRegisterCsvRecord>(content);
}

export function createYnabCsvExport(input: {
    exportName: string;
    planContent: string;
    registerContent: string;
}): YnabCsvExport {
    return {
        exportName: input.exportName,
        planRecords: parseYnabPlanCsv(input.planContent),
        registerRecords: parseYnabRegisterCsv(input.registerContent),
    };
}
