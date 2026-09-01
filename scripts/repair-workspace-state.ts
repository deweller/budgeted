import process from "node:process";
import { pathToFileURL } from "node:url";

import {
    diagnoseWorkspaceState,
    repairWorkspaceState,
} from "@/features/workspace/server/workspace-sync-service";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

const USAGE = [
    "Usage:",
    "  pnpm repair:workspace-state -- --ledger-id <ledgerId> --force --confirm <ledgerId>",
    "  pnpm repair:workspace-state -- --ledger-name <name> --force --confirm <name>",
    "",
    "Options:",
    "  --ledger-id <ledgerId>    Repair one ledger by id.",
    "  --ledger-name <name>      Repair one ledger by exact name.",
    "  --confirm <value>         Must exactly match the supplied ledger selector.",
    "  --force                   Required because this replaces workspace state and advances its generation.",
    "  --help, -h                Show this help.",
].join("\n");

type ParsedArgs = {
    confirm?: string;
    force: boolean;
    help: boolean;
    ledgerId?: string;
    ledgerName?: string;
};

function parseArgs(args: string[]): ParsedArgs {
    const parsed: ParsedArgs = { force: false, help: false };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            parsed.help = true;
        } else if (arg === "--force") {
            parsed.force = true;
        } else if (arg === "--ledger-id") {
            parsed.ledgerId = args[++index];
        } else if (arg.startsWith("--ledger-id=")) {
            parsed.ledgerId = arg.slice("--ledger-id=".length);
        } else if (arg === "--ledger-name") {
            parsed.ledgerName = args[++index];
        } else if (arg.startsWith("--ledger-name=")) {
            parsed.ledgerName = arg.slice("--ledger-name=".length);
        } else if (arg === "--confirm") {
            parsed.confirm = args[++index];
        } else if (arg.startsWith("--confirm=")) {
            parsed.confirm = arg.slice("--confirm=".length);
        } else {
            throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
        }
    }

    return parsed;
}

async function resolveLedger(input: ParsedArgs) {
    if (input.ledgerId && input.ledgerName) {
        throw new Error(`Use only one ledger selector.\n\n${USAGE}`);
    }

    if (input.ledgerId) {
        return { confirmationValue: input.ledgerId, ledgerId: input.ledgerId };
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

    return {
        confirmationValue: input.ledgerName,
        ledgerId: matches[0]!.ledgerId,
    };
}

async function main() {
    const input = parseArgs(process.argv.slice(2));

    if (input.help) {
        console.log(USAGE);
        return;
    }

    if (!input.force) {
        throw new Error(`This command requires --force.\n\n${USAGE}`);
    }

    const ledger = await resolveLedger(input);

    if (input.confirm !== ledger.confirmationValue) {
        throw new Error(
            `Confirmation must exactly match "${ledger.confirmationValue}".`,
        );
    }

    const before = await diagnoseWorkspaceState(ledger.ledgerId);

    if (before.isCurrent) {
        console.log(`Ledger ${ledger.ledgerId} workspace state is already current.`);
        return;
    }

    const repaired = await repairWorkspaceState(ledger.ledgerId);
    const after = await diagnoseWorkspaceState(ledger.ledgerId);

    if (!after.isCurrent) {
        throw new Error("Workspace repair completed but state is still not current.");
    }

    console.log(
        `Rebuilt workspace state for ${ledger.ledgerId}: g${repaired.previousWorkspaceGeneration}:r${repaired.previousWorkspaceRevision} -> g${repaired.workspaceGeneration}:r${repaired.workspaceRevision}.`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
