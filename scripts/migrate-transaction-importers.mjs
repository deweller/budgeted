import { spawnSync } from "node:child_process";
import process from "node:process";

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const forwardedArgs =
    process.argv[2] === "--" ? process.argv.slice(3) : process.argv.slice(2);
const sstArgs = [];
const migrationArgs = [];

for (let index = 0; index < forwardedArgs.length; index += 1) {
    const arg = forwardedArgs[index];

    if (arg === "--stage" || arg === "--config") {
        sstArgs.push(arg, forwardedArgs[++index]);
    } else if (arg.startsWith("--stage=") || arg.startsWith("--config=")) {
        sstArgs.push(arg);
    } else {
        migrationArgs.push(arg);
    }
}

const isHelp = migrationArgs.includes("--help") || migrationArgs.includes("-h");
const script = "scripts/migrate-transaction-importers.ts";
const command = isHelp
    ? ["exec", "tsx", script, ...migrationArgs]
    : [
          "exec",
          "sst",
          "shell",
          ...sstArgs,
          "--",
          pnpmBin,
          "exec",
          "tsx",
          script,
          ...migrationArgs,
      ];
const result = spawnSync(pnpmBin, command, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
});

process.exit(result.status ?? 1);
