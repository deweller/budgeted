import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    buildNextDevArgs,
    createDevServerEnv,
    loadLocalDevServerEnv,
    parseDevServerArgs,
    prepareDevServerOptions,
    stripPackageManagerSeparator,
} from "./dev-server-options.mjs";

const nextBin = fileURLToPath(
    new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
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

const child = spawn(
    process.execPath,
    buildNextDevArgs([nextBin, "dev", "--turbopack"], devServerOptions),
    {
        env: createDevServerEnv(localDevServerEnv, devServerOptions),
        stdio: "inherit",
    },
);

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
