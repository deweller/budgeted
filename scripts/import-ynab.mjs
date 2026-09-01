import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const forwardedArgs =
    process.argv[2] === "--" ? process.argv.slice(3) : process.argv.slice(2);

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const values = {};

    for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
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

function resolveLocalEnv() {
    const cwd = process.cwd();

    return {
        ...parseEnvFile(path.join(cwd, ".env")),
        ...parseEnvFile(path.join(cwd, ".env.local")),
        ...process.env,
    };
}

function hasLinkedLedger(env) {
    return Boolean(
        env.APP_TABLE_NAME ||
            env.SST_RESOURCE_LedgerTable ||
            env.SST_RESOURCE_LedgerTable_tableName,
    );
}

function extractSharedSstArgs(args) {
    const sstArgs = [];
    const importArgs = [];

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (
            arg === "--stage" ||
            arg === "--config" ||
            arg === "--verbose" ||
            arg === "--print-logs"
        ) {
            sstArgs.push(arg);

            if ((arg === "--stage" || arg === "--config") && args[index + 1]) {
                sstArgs.push(args[index + 1]);
                index += 1;
            }

            continue;
        }

        if (arg.startsWith("--stage=") || arg.startsWith("--config=")) {
            sstArgs.push(arg);
            continue;
        }

        importArgs.push(arg);
    }

    return {
        importArgs,
        sstArgs,
    };
}

function runPnpm(args, env) {
    const result = spawnSync(pnpmBin, args, {
        cwd: process.cwd(),
        env,
        stdio: "inherit",
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function runWithSstShell(commandArgs, sstArgs, env) {
    const result = spawnSync(
        pnpmBin,
        ["exec", "sst", "shell", ...sstArgs, "--", pnpmBin, ...commandArgs],
        {
            cwd: process.cwd(),
            env,
            stdio: "inherit",
        },
    );

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

const resolvedLocalEnv = resolveLocalEnv();
const { importArgs, sstArgs } = extractSharedSstArgs(forwardedArgs);
const isLocalOnlyCommand =
    importArgs.includes("--dry-run") ||
    importArgs.includes("--help") ||
    importArgs.includes("-h");
const shouldUseSstShell =
    !isLocalOnlyCommand &&
    (sstArgs.length > 0 || !hasLinkedLedger(resolvedLocalEnv));
const tsxCommand = ["exec", "tsx", "scripts/import-ynab.ts", ...importArgs];

if (shouldUseSstShell) {
    runWithSstShell(tsxCommand, sstArgs, process.env);
} else {
    runPnpm(tsxCommand, resolvedLocalEnv);
}
