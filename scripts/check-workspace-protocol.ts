import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { diagnoseWorkspaceProtocolReadiness } from "@/features/workspace/server/workspace-protocol-diagnostic";

const DEPRECATED_ROUTE_WRAPPERS = [
    "workspaceExplicitMutationJson",
    "workspaceMutationJson",
    "workspaceMutationNoContent",
    "workspacePersistedMutationJson",
];

async function listFiles(directory: string): Promise<string[]> {
    return (
        await Promise.all(
            (await readdir(directory, { withFileTypes: true })).map(
                async (entry) => {
                    const entryPath = path.join(directory, entry.name);
                    return entry.isDirectory()
                        ? listFiles(entryPath)
                        : [entryPath];
                },
            ),
        )
    ).flat();
}

async function findDeprecatedRouteImports() {
    const routeRoot = path.join(process.cwd(), "src/app/api");
    const routeFiles = (await listFiles(routeRoot)).filter((file) =>
        file.endsWith("/route.ts"),
    );
    const matches: string[] = [];

    for (const file of routeFiles) {
        const source = await readFile(file, "utf8");

        if (DEPRECATED_ROUTE_WRAPPERS.some((name) => source.includes(name))) {
            matches.push(path.relative(process.cwd(), file));
        }
    }

    return matches;
}

async function main() {
    const json = process.argv.includes("--json");
    const result = await diagnoseWorkspaceProtocolReadiness({
        deprecatedRouteImports: await findDeprecatedRouteImports(),
    });

    if (json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(
            result.readyForLegacyCleanup
                ? "Workspace protocol is ready for legacy cleanup."
                : "Workspace protocol is not ready for legacy cleanup.",
        );

        for (const ledger of result.ledgerResults) {
            console.log(
                [
                    ledger.ledgerId,
                    ledger.status,
                    `ledger-revision=${formatRevision(
                        ledger.ledgerWorkspaceGeneration,
                        ledger.ledgerWorkspaceRevision,
                    )}`,
                    `state-revision=${formatRevision(
                        ledger.stateWorkspaceGeneration,
                        ledger.stateWorkspaceRevision,
                    )}`,
                    `state-proofs=${
                        ledger.stateEntityProofsComplete
                            ? "complete"
                            : "incomplete"
                    }`,
                    `state=${ledger.revisionStateValid ? "valid" : "invalid"}`,
                    `retained-batches=${ledger.retainedBatchCount}`,
                    `invalid-batches=${ledger.invalidRetainedBatchCount}`,
                    `ignored-legacy-rows=${ledger.legacyWorkspaceChangeCount}`,
                ].join(" "),
            );
        }

        for (const route of result.deprecatedRouteImports) {
            console.log(`Deprecated route wrapper: ${route}`);
        }
    }

    if (!result.readyForLegacyCleanup) {
        process.exitCode = 1;
    }
}

function formatRevision(
    workspaceGeneration: number | undefined,
    workspaceRevision: number | undefined,
) {
    return workspaceGeneration === undefined || workspaceRevision === undefined
        ? "missing"
        : `g${workspaceGeneration}:r${workspaceRevision}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
