import { spawn } from "node:child_process";
import process from "node:process";
import {
    createDevServerEnv,
    loadLocalDevServerEnv,
    parseDevServerArgs,
    prepareDevServerOptions,
    stripPackageManagerSeparator,
} from "./dev-server-options.mjs";

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const localDevServerEnv = loadLocalDevServerEnv();
let devServerOptions;

try {
    devServerOptions = parseDevServerArgs(
        stripPackageManagerSeparator(process.argv.slice(2)),
        localDevServerEnv,
    );
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
}

devServerOptions = prepareDevServerOptions(devServerOptions);

const forwardedArgs = devServerOptions.remainingArgs;
const devServerEnv = createDevServerEnv(localDevServerEnv, devServerOptions);
const isRunningInsideSstDev =
    process.env.SST_DEV === "true" ||
    process.env.SST_LIVE === "true" ||
    Object.keys(process.env).some((key) => key.startsWith("SST_RESOURCE_"));

const child = isRunningInsideSstDev
    ? spawn(process.execPath, ["./scripts/dev-turbo.mjs", ...forwardedArgs], {
          cwd: process.cwd(),
          env: devServerEnv,
          stdio: "inherit",
      })
    : spawn(pnpmBin, ["exec", "sst", "dev", ...forwardedArgs], {
          cwd: process.cwd(),
          env: devServerEnv,
          stdio: "inherit",
      });

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        child.kill(signal);
    });
}

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 0);
});
