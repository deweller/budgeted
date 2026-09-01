export const DEFAULT_E2E_STAGE = "e2e";

function hasSstDevModeArg(args) {
    return args.some((arg) => arg === "--mode" || arg.startsWith("--mode="));
}

function getStageFromArg(arg, nextArg) {
    if (arg === "--stage") {
        return nextArg;
    }

    if (arg.startsWith("--stage=")) {
        return arg.slice("--stage=".length);
    }

    return undefined;
}

export function partitionE2EArgs(args, options = {}) {
    const defaultStage = options.defaultStage ?? DEFAULT_E2E_STAGE;
    const sharedArgs = [];
    const devArgs = [];
    const remainingArgs = [];
    let stageName;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--stage" || arg === "--config") {
            sharedArgs.push(arg);

            if (args[index + 1]) {
                stageName = getStageFromArg(arg, args[index + 1]) ?? stageName;
                sharedArgs.push(args[index + 1]);
                index += 1;
            }

            continue;
        }

        if (arg === "--mode") {
            devArgs.push(arg);

            if (args[index + 1]) {
                devArgs.push(args[index + 1]);
                index += 1;
            }

            continue;
        }

        if (arg === "--verbose" || arg === "--print-logs") {
            sharedArgs.push(arg);
            continue;
        }

        if (arg.startsWith("--stage=") || arg.startsWith("--config=")) {
            stageName = getStageFromArg(arg) ?? stageName;
            sharedArgs.push(arg);
            continue;
        }

        if (arg.startsWith("--mode=")) {
            devArgs.push(arg);
            continue;
        }

        remainingArgs.push(arg);
    }

    const resolvedStageName = stageName ?? defaultStage;

    return {
        playwrightArgs: remainingArgs,
        sstArgs: stageName ? sharedArgs : ["--stage", defaultStage, ...sharedArgs],
        sstDevArgs: hasSstDevModeArg(devArgs)
            ? devArgs
            : ["--mode=mono", ...devArgs],
        sstStage: resolvedStageName,
    };
}
