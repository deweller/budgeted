import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
    parseYnabImportMappingFile,
    createYnabImportMappingFile,
    createYnabImportPlan,
    createYnabLedgerId,
    type YnabAccountMapping,
    type YnabImportSummary,
} from "../src/features/import/ynab/planner";
import { readYnabCsvExport } from "../src/features/import/ynab/csv";
import { isMonthlyPeriodId } from "../src/modules/ledger/monthly-period";

const USAGE = [
    "Usage:",
    "  pnpm import:ynab -- --export-dir <path> --dry-run [--mapping-out <path>] [--account-map <json>] [--end-month YYYY-MM]",
    "  pnpm import:ynab -- --export-dir <path> --account-map <json> --ledger-name <name> [--ledger-id <id>] [--end-month YYYY-MM]",
    "",
    "Options:",
    "  --export-dir <path>     YNAB export folder containing Plan.csv and Register.csv.",
    "  --dry-run               Parse and summarize the import without writing data.",
    "  --end-month YYYY-MM     Ignore budget months and transactions after this month.",
    "  --mapping-out <path>    Account mapping file to write during dry-run.",
    "  --account-map <path>    Reviewed account mapping JSON to use.",
    "  --ledger-name <name>    Required for import; target ledger name to create or replace.",
    "  --ledger-id <id>        Optional target ledger id. Defaults to a stable id from ledger name.",
    "  --help, -h              Show this help.",
].join("\n");

type ParsedArgs = {
    accountMapPath?: string;
    dryRun: boolean;
    endMonth?: string;
    exportDir?: string;
    help: boolean;
    ledgerId?: string;
    ledgerName?: string;
    mappingOutPath?: string;
};

export function parseYnabImportArgs(args: string[]): ParsedArgs {
    const parsed: ParsedArgs = {
        dryRun: false,
        help: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
            continue;
        }

        if (arg === "--dry-run") {
            parsed.dryRun = true;
            continue;
        }

        if (arg === "--end-month") {
            const endMonth = args[index + 1];

            if (!endMonth || !isMonthlyPeriodId(endMonth)) {
                throw new Error(
                    `--end-month must be in YYYY-MM format.\n\n${USAGE}`,
                );
            }

            parsed.endMonth = endMonth;
            index += 1;
            continue;
        }

        if (arg === "--export-dir") {
            parsed.exportDir = args[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--mapping-out") {
            parsed.mappingOutPath = args[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--account-map") {
            parsed.accountMapPath = args[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--ledger-name") {
            parsed.ledgerName = args[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--ledger-id") {
            parsed.ledgerId = args[index + 1];
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }

    return parsed;
}

function parseEnvFile(filePath: string) {
    if (!existsSync(filePath)) {
        return {};
    }

    const values: Record<string, string> = {};

    for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
        const line = rawLine.trim();

        if (!line || line.startsWith("#")) {
            continue;
        }

        const separatorIndex = line.indexOf("=");

        if (separatorIndex <= 0) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}

function loadLocalEnv() {
    const env = {
        ...parseEnvFile(resolve(".env")),
        ...parseEnvFile(resolve(".env.local")),
        ...process.env,
    };

    for (const [key, value] of Object.entries(env)) {
        process.env[key] = value;
    }
}

function readAccountMappings(path: string | undefined) {
    if (!path) {
        return undefined;
    }

    return parseYnabImportMappingFile(
        JSON.parse(readFileSync(resolve(path), "utf8")),
    );
}

function getDefaultMappingPath(exportDir: string) {
    return join(exportDir, "budgeted-account-map.json");
}

export function formatSummary(summary: YnabImportSummary) {
    const lines = [
        `Months: ${summary.firstMonth ?? "n/a"} to ${summary.lastMonth ?? "n/a"}`,
        `Budget groups: ${summary.budgetGroupCount}`,
        `Budget categories: ${summary.budgetCategoryCount}`,
        `Accounts: ${summary.accountCountByRole.budget} budget, ${summary.accountCountByRole.tracking} tracking, ${summary.accountCountByRole.exclude} excluded`,
        `Synthetic accounts skipped: ${summary.skippedSyntheticAccountCount}`,
        `Transactions: ${summary.transactionCount} total, ${summary.transactionLineCount} lines, ${summary.multiLineTransactionCount} multi-line parents`,
    ];

    if (summary.warnings.length > 0) {
        lines.push("Warnings:");
        lines.push(...summary.warnings.map((warning) => `- ${warning.message}`));
    }

    return lines;
}

function writeMappingFile(input: {
    accountMappings: YnabAccountMapping[];
    exportDir: string;
    mappingOutPath?: string;
    source: string;
}) {
    const mappingPath = resolve(
        input.mappingOutPath ?? getDefaultMappingPath(input.exportDir),
    );
    const mappingFile = createYnabImportMappingFile({
        accountMappings: input.accountMappings,
        source: input.source,
    });

    writeFileSync(`${mappingPath}`, `${JSON.stringify(mappingFile, null, 2)}\n`);

    return mappingPath;
}

export async function runYnabImportCommand(args: string[]) {
    loadLocalEnv();

    const parsed = parseYnabImportArgs(args);

    if (parsed.help) {
        console.log(USAGE);
        return 0;
    }

    if (!parsed.exportDir) {
        throw new Error(`Missing required --export-dir value.\n\n${USAGE}`);
    }

    const exportDir = resolve(parsed.exportDir);
    const ynabExport = await readYnabCsvExport(exportDir);
    const reviewedMappings = readAccountMappings(parsed.accountMapPath);
    const previewPlan = createYnabImportPlan({
        accountMappings: reviewedMappings,
        endMonth: parsed.endMonth,
        export: ynabExport,
        ledgerId: "dry-run",
    });

    for (const line of formatSummary(previewPlan.summary)) {
        console.log(line);
    }

    if (parsed.dryRun) {
        const mappingPath = writeMappingFile({
            accountMappings: previewPlan.accountMappings,
            exportDir,
            mappingOutPath: parsed.mappingOutPath,
            source: ynabExport.exportName,
        });
        console.log(`Account map written: ${mappingPath}`);
        return 0;
    }

    if (!parsed.accountMapPath) {
        throw new Error(`Import requires --account-map.\n\n${USAGE}`);
    }

    if (!parsed.ledgerName?.trim()) {
        throw new Error(`Import requires --ledger-name <name>.\n\n${USAGE}`);
    }

    const { persistYnabImport } = await import(
        "../src/features/import/ynab/persistence"
    );
    const ledgerName = parsed.ledgerName.trim();
    const ledgerId = parsed.ledgerId ?? createYnabLedgerId(ledgerName);
    const importPlan = createYnabImportPlan({
        accountMappings: reviewedMappings,
        endMonth: parsed.endMonth,
        export: ynabExport,
        ledgerId,
    });
    const result = await persistYnabImport({
        ledgerId,
        ledgerName,
        plan: importPlan,
    });

    console.log(
        `Imported ${result.scopedRecordCount} records into ledger "${result.ledger.name}" (${result.ledger.ledgerId}).`,
    );
    return 0;
}

async function main() {
    try {
        const exitCode = await runYnabImportCommand(process.argv.slice(2));
        process.exit(exitCode);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    void main();
}
