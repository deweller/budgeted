import { defineConfig, devices } from "@playwright/test";

import {
    getBrowserTestStartupError,
    resolveBrowserTestEnvironment,
} from "./src/lib/env/browser-test";

const browserTestEnvironment = resolveBrowserTestEnvironment();
const startupError = getBrowserTestStartupError(browserTestEnvironment);
const isManagedSstRun = process.env.PLAYWRIGHT_MANAGED_SST === "1";

if (startupError) {
    throw new Error(startupError);
}

if (browserTestEnvironment.mode === "managedLocal" || isManagedSstRun) {
    if (browserTestEnvironment.userEmail && !process.env.E2E_USER_EMAIL) {
        process.env.E2E_USER_EMAIL = browserTestEnvironment.userEmail;
    }

    if (
        browserTestEnvironment.userPassword &&
        !process.env.E2E_USER_PASSWORD
    ) {
        process.env.E2E_USER_PASSWORD = browserTestEnvironment.userPassword;
    }
}

const port = Number(process.env.PORT ?? 3000);
const explicitBaseURL = browserTestEnvironment.baseURL;
const baseURL = explicitBaseURL ?? `http://localhost:${port}`;
const shouldIgnoreHTTPSErrors = baseURL.startsWith("https://");
const webServerCommand =
    process.env.PLAYWRIGHT_SKIP_BUILD === "1"
        ? `pnpm exec next start --port ${port}`
        : `pnpm build && pnpm exec next start --port ${port}`;

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 30_000,
    globalSetup: "./tests/e2e/support/global-setup.ts",
    globalTeardown: "./tests/e2e/support/global-teardown.ts",
    expect: {
        timeout: 5_000,
    },
    fullyParallel: !isManagedSstRun,
    ...(isManagedSstRun ? { workers: 1 } : {}),
    reporter: process.env.CI
        ? [["github"], ["html", { open: "never" }]]
        : "list",
    use: {
        baseURL,
        ignoreHTTPSErrors: shouldIgnoreHTTPSErrors,
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
            },
        },
    ],
    ...(explicitBaseURL
        ? {}
        : {
              webServer: {
                  command: webServerCommand,
                  url: baseURL,
                  reuseExistingServer: !process.env.CI,
              },
          }),
});
