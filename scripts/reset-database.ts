import process from "node:process";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";

import { requireLedgerTableName } from "@/lib/db/resource";
import { executeReset } from "@/lib/db/reset/reset-executor";
import {
    buildDestructiveWarning,
    formatResetExecutionResult,
    type ResetExecutionResult,
} from "@/lib/db/reset/reset-summary";

export const RESET_DATABASE_USAGE = [
    "Usage:",
    "  pnpm reset:db -- --target <target> --force --confirm <target>",
    "",
    "Options:",
    "  --target <target>    Operator-facing safety label for the data you intend to reset.",
    "                       This should usually match the SST stage or local environment name.",
    "                       The actual DynamoDB table is resolved separately from SST or APP_TABLE_NAME.",
    "  --confirm <target>   Must exactly match --target before the destructive reset can proceed.",
    "  --force              Required destructive-intent flag.",
    "  --yes                Skip the final interactive prompt after --force and --confirm.",
    "  --help, -h           Show this help.",
].join("\n");

export type ParsedResetDatabaseArgs = {
    help: boolean;
    targetLabel: string;
    confirmation: string;
    force: boolean;
    yes: boolean;
};

export type ResetDatabaseCommandDeps = {
    log?: (message: string) => void;
    promptForProceed?: () => Promise<boolean>;
    resolveLedgerTableName?: () => string;
    executeReset?: typeof executeReset;
};

export type ResetDatabaseCommandResult = {
    exitCode: number;
    status: "success" | "incomplete" | "cancelled" | "help";
    outcome?: ResetExecutionResult;
};

export function parseResetDatabaseArgs(
    args: string[],
): ParsedResetDatabaseArgs {
    const parsed: ParsedResetDatabaseArgs = {
        help: false,
        targetLabel: "",
        confirmation: "",
        force: false,
        yes: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
            continue;
        }

        if (arg === "--force") {
            parsed.force = true;
            continue;
        }

        if (arg === "--yes") {
            parsed.yes = true;
            continue;
        }

        if (arg === "--target") {
            parsed.targetLabel = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg === "--confirm") {
            parsed.confirmation = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}\n\n${RESET_DATABASE_USAGE}`);
    }

    return parsed;
}

async function defaultPromptForProceed() {
    const prompt = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        const response = await prompt.question(
            'Proceed with the reset? Type "yes" to continue: ',
        );

        return response.trim().toLowerCase() === "yes";
    } finally {
        prompt.close();
    }
}

export async function runResetDatabaseCommand(
    args: string[],
    deps: ResetDatabaseCommandDeps = {},
): Promise<ResetDatabaseCommandResult> {
    const parsed = parseResetDatabaseArgs(args);
    const log = deps.log ?? console.log;
    const promptForProceed = deps.promptForProceed ?? defaultPromptForProceed;
    const resolveTableName =
        deps.resolveLedgerTableName ?? requireLedgerTableName;
    const runReset = deps.executeReset ?? executeReset;

    if (parsed.help) {
        log(RESET_DATABASE_USAGE);
        return {
            exitCode: 0,
            status: "help",
        };
    }

    if (!parsed.targetLabel) {
        throw new Error(
            `Missing required --target value.\n\n${RESET_DATABASE_USAGE}`,
        );
    }

    if (!parsed.force) {
        throw new Error(
            "The reset command requires --force before any deletion can proceed.",
        );
    }

    if (!parsed.confirmation) {
        throw new Error(
            `Missing required --confirm value. Type the target label (${parsed.targetLabel}) to confirm the destructive reset.`,
        );
    }

    if (parsed.confirmation !== parsed.targetLabel) {
        throw new Error(
            `The --confirm value must exactly match the target label (${parsed.targetLabel}).`,
        );
    }

    const tableName = resolveTableName();

    for (const line of buildDestructiveWarning({
        targetLabel: parsed.targetLabel,
    })) {
        log(line);
    }

    const shouldProceed = parsed.yes || (await promptForProceed());

    if (!shouldProceed) {
        log("Reset cancelled. No data was deleted.");

        return {
            exitCode: 0,
            status: "cancelled",
        };
    }

    const outcome = await runReset({
        tableName,
        targetLabel: parsed.targetLabel,
    });

    for (const line of formatResetExecutionResult(outcome)) {
        log(line);
    }

    return {
        exitCode: outcome.status === "success" ? 0 : 1,
        status: outcome.status,
        outcome,
    };
}

async function main() {
    try {
        const result = await runResetDatabaseCommand(process.argv.slice(2));
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
