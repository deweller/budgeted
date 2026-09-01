import process from "node:process";
import { pathToFileURL } from "node:url";

import { diagnoseWorkspaceState } from "@/features/workspace/server/workspace-sync-service";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

const USAGE = [
    "Usage:",
    "  pnpm check:workspace-state -- --ledger-id <ledgerId>",
    "  pnpm check:workspace-state -- --ledger-name <name>",
    "",
    "Options:",
    "  --ledger-id <ledgerId>    Check one ledger by id.",
    "  --ledger-name <name>      Check one ledger by exact name.",
    "  --json                    Print the full read-only diagnostic JSON.",
    "  --help, -h                Show this help.",
].join("\n");

type ParsedArgs = {
    help: boolean;
    json: boolean;
    ledgerId?: string;
    ledgerName?: string;
};

function parseArgs(args: string[]): ParsedArgs {
    const parsed: ParsedArgs = { help: false, json: false };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
        } else if (arg === "--json") {
            parsed.json = true;
        } else if (arg === "--ledger-id") {
            parsed.ledgerId = args[++index];
        } else if (arg.startsWith("--ledger-id=")) {
            parsed.ledgerId = arg.slice("--ledger-id=".length);
        } else if (arg === "--ledger-name") {
            parsed.ledgerName = args[++index];
        } else if (arg.startsWith("--ledger-name=")) {
            parsed.ledgerName = arg.slice("--ledger-name=".length);
        } else {
            throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
        }
    }

    return parsed;
}

async function resolveLedgerId(input: ParsedArgs) {
    if (input.ledgerId && input.ledgerName) {
        throw new Error(`Use only one ledger selector.\n\n${USAGE}`);
    }

    if (input.ledgerId) {
        return input.ledgerId;
    }

    if (!input.ledgerName) {
        throw new Error(`Missing a ledger selector.\n\n${USAGE}`);
    }

    const { entities } = getBudgetedSchema();
    const ledgers = await queryAllPages(
        entities.ledgers.query.byLedger({ workspaceId: GLOBAL_WORKSPACE_ID }),
        { consistent: true },
    );
    const matches = ledgers.filter((ledger) => ledger.name === input.ledgerName);

    if (matches.length !== 1) {
        throw new Error(
            matches.length === 0
                ? `No ledger named "${input.ledgerName}" was found.`
                : `More than one ledger named "${input.ledgerName}" was found. Use --ledger-id.`,
        );
    }

    return matches[0]!.ledgerId;
}

async function main() {
    const input = parseArgs(process.argv.slice(2));

    if (input.help) {
        console.log(USAGE);
        return;
    }

    const ledgerId = await resolveLedgerId(input);
    const result = await diagnoseWorkspaceState(ledgerId);

    if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log(`Ledger: ${ledgerId}`);
    console.log(
        result.isCurrent
            ? "Workspace state matches the current ledger records."
            : "Workspace state drift detected. Run again with --json for details.",
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
