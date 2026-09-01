import { execFileSync } from "node:child_process";

const HOOKS_PATH = ".githooks";

function getLocalHooksPath() {
    try {
        return execFileSync(
            "git",
            ["config", "--local", "--get", "core.hooksPath"],
            {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            },
        ).trim();
    } catch {
        return "";
    }
}

function isGitRepository() {
    try {
        execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
            stdio: "ignore",
        });
        return true;
    } catch {
        return false;
    }
}

if (!isGitRepository()) {
    process.exit(0);
}

const currentHooksPath = getLocalHooksPath();

if (currentHooksPath && currentHooksPath !== HOOKS_PATH) {
    console.warn(
        `Skipped Git hook installation because core.hooksPath is already ${currentHooksPath}.`,
    );
    process.exit(0);
}

execFileSync("git", ["config", "--local", "core.hooksPath", HOOKS_PATH], {
    stdio: "inherit",
});
