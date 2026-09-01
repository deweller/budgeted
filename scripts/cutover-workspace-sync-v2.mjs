import { spawnSync } from "node:child_process";
import process from "node:process";

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const forwardedArgs =
    process.argv[2] === "--" ? process.argv.slice(3) : process.argv.slice(2);
const sstArgs = [];
const cutoverArgs = [];

for (let index = 0; index < forwardedArgs.length; index += 1) {
    const arg = forwardedArgs[index];

    if (arg === "--stage" || arg === "--config") {
        sstArgs.push(arg, forwardedArgs[++index]);
    } else if (arg.startsWith("--stage=") || arg.startsWith("--config=")) {
        sstArgs.push(arg);
    } else {
        cutoverArgs.push(arg);
    }
}

const isHelp = cutoverArgs.includes("--help") || cutoverArgs.includes("-h");
const command = isHelp
    ? ["exec", "tsx", "scripts/cutover-workspace-sync-v2.ts", ...cutoverArgs]
    : [
          "exec",
          "sst",
          "shell",
          ...sstArgs,
          "--",
          pnpmBin,
          "exec",
          "tsx",
          "scripts/cutover-workspace-sync-v2.ts",
          ...cutoverArgs,
      ];
const result = spawnSync(pnpmBin, command, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
});

process.exit(result.status ?? 1);
