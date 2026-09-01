import process from "node:process";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";

import {
    executeWorkspaceChangePurge,
    type WorkspaceChangePurgeResult,
} from "@/lib/db/workspace-change-purge";
import { requireLedgerTableName } from "@/lib/db/resource";

export const PURGE_WORKSPACE_CHANGES_USAGE = [
    "Usage:",
    "  pnpm purge:workspace-changes -- --stage <stage> --force --confirm <stage>",
    "  pnpm purge:workspace-changes -- --target <target> --force --confirm <target>",
    "",
    "Options:",
    "  --stage <stage>     SST stage to run through. The npm wrapper passes this to `sst shell`.",
    "                       When supplied through the wrapper, it is also used as --target by default.",
    "  --target <target>    Operator-facing safety label for the data you intend to purge.",
    "                       The actual DynamoDB table is resolved separately from SST or APP_TABLE_NAME.",
    "  --confirm <target>   Must exactly match --target before deletion can proceed.",
    "  --force              Required destructive-intent flag.",
    "  --help, -h           Show this help.",
].join("\n");

export type ParsedPurgeWorkspaceChangesArgs = {
    confirmation: string;
    force: boolean;
    help: boolean;
    targetLabel: string;
};

export type PurgeWorkspaceChangesCommandDeps = {
    executePurge?: typeof executeWorkspaceChangePurge;
    log?: (message: string) => void;
    promptForProceed?: () => Promise<boolean>;
    resolveLedgerTableName?: () => string;
};

export type PurgeWorkspaceChangesCommandResult = {
    exitCode: number;
    outcome?: WorkspaceChangePurgeResult;
    status: "cancelled" | "help" | WorkspaceChangePurgeResult["status"];
};

export function parsePurgeWorkspaceChangesArgs(
    args: string[],
): ParsedPurgeWorkspaceChangesArgs {
    const parsed: ParsedPurgeWorkspaceChangesArgs = {
        confirmation: "",
        force: false,
        help: false,
        targetLabel: "",
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

        if (arg === "--target") {
            parsed.targetLabel = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg.startsWith("--target=")) {
            parsed.targetLabel = arg.slice("--target=".length);
            continue;
        }

        if (arg === "--confirm") {
            parsed.confirmation = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (arg.startsWith("--confirm=")) {
            parsed.confirmation = arg.slice("--confirm=".length);
            continue;
        }

        throw new Error(
            `Unknown argument: ${arg}\n\n${PURGE_WORKSPACE_CHANGES_USAGE}`,
        );
    }

    return parsed;
}

function buildDestructiveWarning(input: {
    tableName: string;
    targetLabel: string;
}) {
    return [
        `Workspace change purge target: ${input.targetLabel}`,
        `DynamoDB table: ${input.tableName}`,
        "This will permanently delete every workspace sync-log record from the selected target.",
        "This will not delete ledgers, accounts, budget data, transactions, postings, or user accounts.",
        "Clients that cannot use deltas after the purge will fall back to a full workspace snapshot.",
        'Type "yes" at the prompt to continue or anything else to cancel.',
    ];
}

function formatPurgeResult(result: WorkspaceChangePurgeResult) {
    const lines = [
        `Workspace change purge target: ${result.targetLabel}`,
        `Status: ${result.status}`,
        `Started: ${result.startedAt}`,
        `Finished: ${result.finishedAt}`,
        `Matched workspace sync-log records: ${result.matchedCount}`,
        `Purged workspace sync-log records: ${result.purgedCount}`,
        `Remaining workspace sync-log records: ${result.remainingCount}`,
    ];

    if (result.status === "success") {
        return [...lines, "Workspace change log is clear."];
    }

    return [
        ...lines,
        "Failures:",
        ...(result.failureReasons?.length
            ? result.failureReasons.map((reason) => `- ${reason}`)
            : ["- none recorded"]),
        "Purge is incomplete. Retry before treating the workspace change log as clear.",
    ];
}

async function defaultPromptForProceed() {
    const prompt = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        const response = await prompt.question(
            'Proceed with the workspace sync-log purge? Type "yes" to continue: ',
        );

        return response.trim().toLowerCase() === "yes";
    } finally {
        prompt.close();
    }
}

export async function runPurgeWorkspaceChangesCommand(
    args: string[],
    deps: PurgeWorkspaceChangesCommandDeps = {},
): Promise<PurgeWorkspaceChangesCommandResult> {
    const parsed = parsePurgeWorkspaceChangesArgs(args);
    const log = deps.log ?? console.log;
    const promptForProceed = deps.promptForProceed ?? defaultPromptForProceed;
    const resolveTableName =
        deps.resolveLedgerTableName ?? requireLedgerTableName;
    const runPurge = deps.executePurge ?? executeWorkspaceChangePurge;

    if (parsed.help) {
        log(PURGE_WORKSPACE_CHANGES_USAGE);
        return {
            exitCode: 0,
            status: "help",
        };
    }

    if (!parsed.targetLabel) {
        throw new Error(
            `Missing required --target value. Prefer passing --stage <stage> through the npm script so SST resolves the target table.\n\n${PURGE_WORKSPACE_CHANGES_USAGE}`,
        );
    }

    if (!parsed.force) {
        throw new Error(
            "The workspace sync-log purge command requires --force before any deletion can proceed.",
        );
    }

    if (!parsed.confirmation) {
        throw new Error(
            `Missing required --confirm value. Type the target label (${parsed.targetLabel}) to confirm the destructive purge.`,
        );
    }

    if (parsed.confirmation !== parsed.targetLabel) {
        throw new Error(
            `The --confirm value must exactly match the target label (${parsed.targetLabel}).`,
        );
    }

    const tableName = resolveTableName();

    for (const line of buildDestructiveWarning({
        tableName,
        targetLabel: parsed.targetLabel,
    })) {
        log(line);
    }

    const shouldProceed = await promptForProceed();

    if (!shouldProceed) {
        log("Workspace change purge cancelled. No data was deleted.");

        return {
            exitCode: 0,
            status: "cancelled",
        };
    }

    const outcome = await runPurge({
        tableName,
        targetLabel: parsed.targetLabel,
    });

    for (const line of formatPurgeResult(outcome)) {
        log(line);
    }

    return {
        exitCode: outcome.status === "success" ? 0 : 1,
        outcome,
        status: outcome.status,
    };
}

async function main() {
    try {
        const result = await runPurgeWorkspaceChangesCommand(
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
