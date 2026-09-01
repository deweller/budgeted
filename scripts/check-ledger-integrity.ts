import process from "node:process";
import { pathToFileURL } from "node:url";

import type { LedgerIntegrityCheckResult } from "@/features/ledgers/server/ledger-integrity-service";

export const CHECK_LEDGER_INTEGRITY_USAGE = [
    "Usage:",
    "  pnpm check:ledger-integrity -- --ledger-id <ledgerId>",
    '  pnpm check:ledger-integrity -- --ledger-name "Ledger name"',
    '  pnpm check:ledger-integrity -- --stage <stage> --ledger-name "Ledger name"',
    "",
    "Options:",
    "  --ledger-id <id>       Active ledger id to check.",
    "  --ledger-name <name>   Active ledger name to check. Use --ledger-id if names are not unique.",
    "  --json                 Print the full result as JSON.",
    "  --strict               Exit nonzero when warnings are present.",
    "  --help, -h             Show this help.",
    "",
    "This command is read-only. It does not repair or update records.",
].join("\n");

export type ParsedCheckLedgerIntegrityArgs = {
    help: boolean;
    json: boolean;
    ledgerId?: string;
    ledgerName?: string;
    strict: boolean;
};

export type CheckLedgerIntegrityCommandDeps = {
    formatResult?: (result: LedgerIntegrityCheckResult) => string[];
    log?: (message: string) => void;
    resolveLedgerTableName?: () => string;
    runCheck?: (input: {
        ledgerId?: string;
        ledgerName?: string;
    }) => Promise<LedgerIntegrityCheckResult>;
};

export type CheckLedgerIntegrityCommandResult = {
    exitCode: number;
    result?: LedgerIntegrityCheckResult;
    status: "failed" | "help" | "passed" | "warning";
};

export function parseCheckLedgerIntegrityArgs(
    args: string[],
): ParsedCheckLedgerIntegrityArgs {
    const parsed: ParsedCheckLedgerIntegrityArgs = {
        help: false,
        json: false,
        strict: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
            continue;
        }

        if (arg === "--json") {
            parsed.json = true;
            continue;
        }

        if (arg === "--strict") {
            parsed.strict = true;
            continue;
        }

        if (arg === "--ledger-id") {
            parsed.ledgerId = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg.startsWith("--ledger-id=")) {
            parsed.ledgerId = arg.slice("--ledger-id=".length);
            continue;
        }

        if (arg === "--ledger-name") {
            parsed.ledgerName = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg.startsWith("--ledger-name=")) {
            parsed.ledgerName = arg.slice("--ledger-name=".length);
            continue;
        }

        throw new Error(
            `Unknown argument: ${arg}\n\n${CHECK_LEDGER_INTEGRITY_USAGE}`,
        );
    }

    return parsed;
}

export async function runCheckLedgerIntegrityCommand(
    args: string[],
    deps: CheckLedgerIntegrityCommandDeps = {},
): Promise<CheckLedgerIntegrityCommandResult> {
    const parsed = parseCheckLedgerIntegrityArgs(args);
    const log = deps.log ?? console.log;

    if (parsed.help) {
        log(CHECK_LEDGER_INTEGRITY_USAGE);
        return {
            exitCode: 0,
            status: "help",
        };
    }

    if (parsed.ledgerId && parsed.ledgerName) {
        throw new Error(
            `Use only one of --ledger-id or --ledger-name.\n\n${CHECK_LEDGER_INTEGRITY_USAGE}`,
        );
    }

    if (!parsed.ledgerId && !parsed.ledgerName) {
        throw new Error(
            `Missing required --ledger-id or --ledger-name.\n\n${CHECK_LEDGER_INTEGRITY_USAGE}`,
        );
    }

    const [{ requireLedgerTableName }, ledgerIntegrity] = await Promise.all([
        deps.resolveLedgerTableName
            ? Promise.resolve({
                  requireLedgerTableName: deps.resolveLedgerTableName,
              })
            : import("@/lib/db/resource"),
        deps.runCheck && deps.formatResult
            ? Promise.resolve({
                  formatLedgerIntegrityCheckResult: deps.formatResult,
                  runLedgerIntegrityCheck: deps.runCheck,
              })
            : import("@/features/ledgers/server/ledger-integrity-service"),
    ]);
    const check = deps.runCheck ?? ledgerIntegrity.runLedgerIntegrityCheck;
    const formatResult =
        deps.formatResult ?? ledgerIntegrity.formatLedgerIntegrityCheckResult;
    const resolveTableName = deps.resolveLedgerTableName ?? requireLedgerTableName;

    log(`DynamoDB table: ${resolveTableName()}`);

    const result = await check({
        ledgerId: parsed.ledgerId,
        ledgerName: parsed.ledgerName,
    });

    if (parsed.json) {
        log(JSON.stringify(result, null, 2));
    } else {
        for (const line of formatResult(result)) {
            log(line);
        }
    }

    const exitCode =
        result.errorCount > 0 || (parsed.strict && result.warningCount > 0)
            ? 1
            : 0;

    return {
        exitCode,
        result,
        status: result.status,
    };
}

async function main() {
    try {
        const result = await runCheckLedgerIntegrityCommand(
            process.argv.slice(2),
        );
        process.exit(result.exitCode);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    void main();
}
