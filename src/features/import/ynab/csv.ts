import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

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
    exportDir: string;
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

function getExportName(exportDir: string) {
    const normalized = exportDir.replace(/\/+$/, "");
    const parts = normalized.split("/");

    return parts.at(-1) ?? normalized;
}

function getPlanPath(exportDir: string, exportName: string) {
    return join(exportDir, `${exportName.replace(/^YNAB Export - /, "")} - Plan.csv`);
}

function getRegisterPath(exportDir: string, exportName: string) {
    return join(
        exportDir,
        `${exportName.replace(/^YNAB Export - /, "")} - Register.csv`,
    );
}

async function pathExists(path: string) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function findCsvPath(input: {
    exactPath: string;
    exportDir: string;
    suffix: "Plan.csv" | "Register.csv";
}) {
    if (await pathExists(input.exactPath)) {
        return input.exactPath;
    }

    const matches = (await readdir(input.exportDir))
        .filter((fileName) => fileName.endsWith(input.suffix))
        .sort((left, right) => left.localeCompare(right));

    if (matches.length === 0) {
        throw new Error(`Could not find a YNAB *${input.suffix} file.`);
    }

    return join(input.exportDir, matches[0]);
}

export function parseYnabPlanCsv(content: string) {
    return parseCsvRecords<YnabPlanCsvRecord>(content);
}

export function parseYnabRegisterCsv(content: string) {
    return parseCsvRecords<YnabRegisterCsvRecord>(content);
}

export async function readYnabCsvExport(exportDir: string): Promise<YnabCsvExport> {
    const exportName = getExportName(exportDir);
    const [planPath, registerPath] = await Promise.all([
        findCsvPath({
            exactPath: getPlanPath(exportDir, exportName),
            exportDir,
            suffix: "Plan.csv",
        }),
        findCsvPath({
            exactPath: getRegisterPath(exportDir, exportName),
            exportDir,
            suffix: "Register.csv",
        }),
    ]);
    const [planContent, registerContent] = await Promise.all([
        readFile(planPath, "utf8"),
        readFile(registerPath, "utf8"),
    ]);

    return {
        exportDir,
        exportName,
        planRecords: parseYnabPlanCsv(planContent),
        registerRecords: parseYnabRegisterCsv(registerContent),
    };
}
