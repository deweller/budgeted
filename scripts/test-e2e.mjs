import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
    createDevServerEnv,
    formatDevServerUrl,
    getDefaultDevPort,
    loadLocalDevServerEnv,
    parseDevServerArgs,
    prepareDevServerOptions,
    stripPackageManagerSeparator,
} from "./dev-server-options.mjs";
import { partitionE2EArgs } from "./test-e2e-options.mjs";

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
const { playwrightArgs, sstArgs, sstDevArgs, sstStage } =
    partitionE2EArgs(forwardedArgs);
const defaultDevPort = Number(getDefaultDevPort(devServerOptions));
const defaultDevProtocol = devServerOptions.https ? "https" : "http";
const defaultDevUrl = formatDevServerUrl(devServerOptions);
const shouldProbeLoopbackUrls =
    !devServerOptions.hostname ||
    devServerOptions.hostname === "0.0.0.0" ||
    devServerOptions.hostname === "::";
const devServerEnv = createDevServerEnv(localDevServerEnv, devServerOptions);
const sstDevTimeoutMs = Number(process.env.E2E_SST_DEV_TIMEOUT_MS ?? 180_000);
const sstExistingDevTimeoutMs = Number(
    process.env.E2E_SST_EXISTING_DEV_TIMEOUT_MS ?? 45_000,
);
const sstOutputPlaceholderUrl = "http://url-unavailable-in-dev.mode";
const shouldPrintSstDevLogs =
    process.env.E2E_SST_DEV_LOGS === "1" || sstArgs.includes("--print-logs");
const canSignalProcessGroups = process.platform !== "win32";
let managedSstDevChild;

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const contents = fs.readFileSync(filePath, "utf8");
    const values = {};

    for (const rawLine of contents.split(/\r?\n/u)) {
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

function resolveLocalSecrets() {
    const envLocalPath = path.join(process.cwd(), ".env.local");
    const parsed = fs.existsSync(envLocalPath)
        ? parseEnvFile(envLocalPath)
        : {};
    const authSecrets = {
        E2E_AUTH_SECRET:
            process.env.E2E_AUTH_SECRET ?? parsed.E2E_AUTH_SECRET,
        E2E_USER_EMAIL: process.env.E2E_USER_EMAIL ?? parsed.E2E_USER_EMAIL,
        E2E_USER_PASSWORD:
            process.env.E2E_USER_PASSWORD ?? parsed.E2E_USER_PASSWORD,
    };

    if (!Object.values(authSecrets).every(Boolean)) {
        return null;
    }

    return {
        ...authSecrets,
        AMAZON_ORDER_SCRAPER_API_TOKEN:
            process.env.AMAZON_ORDER_SCRAPER_API_TOKEN ??
            parsed.AMAZON_ORDER_SCRAPER_API_TOKEN ??
            "test-amazon-order-scraper-token",
        GOOGLE_GENERATIVE_AI_API_KEY:
            process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
            parsed.GOOGLE_GENERATIVE_AI_API_KEY ??
            "test-google-generative-ai-key",
        OPENAI_API_KEY:
            process.env.OPENAI_API_KEY ??
            parsed.OPENAI_API_KEY ??
            "test-openai-api-key",
        PLAID_CLIENT_ID:
            process.env.PLAID_CLIENT_ID ??
            parsed.PLAID_CLIENT_ID ??
            "test-plaid-client-id",
        PLAID_SECRET:
            process.env.PLAID_SECRET ?? parsed.PLAID_SECRET ?? "test-plaid-secret",
    };
}

function loadLocalSecrets(localSecrets) {
    const secretFilePath = path.join(
        os.tmpdir(),
        `budgeted-sst-secrets-${process.pid}.env`,
    );

    fs.writeFileSync(
        secretFilePath,
        [
            `AuthSecret=${localSecrets.E2E_AUTH_SECRET}`,
            `AmazonOrderScraperApiToken=${localSecrets.AMAZON_ORDER_SCRAPER_API_TOKEN}`,
            `GoogleGenerativeAiApiKey=${localSecrets.GOOGLE_GENERATIVE_AI_API_KEY}`,
            `OpenAiApiKey=${localSecrets.OPENAI_API_KEY}`,
            `PlaidClientId=${localSecrets.PLAID_CLIENT_ID}`,
            `PlaidSecret=${localSecrets.PLAID_SECRET}`,
        ].join("\n"),
        { mode: 0o600 },
    );

    try {
        const result = spawnSync(
            pnpmBin,
            ["exec", "sst", "secret", "load", secretFilePath, ...sstArgs],
            {
                cwd: process.cwd(),
                stdio: "inherit",
            },
        );

        if (result.status !== 0) {
            process.exit(result.status ?? 1);
        }
    } finally {
        fs.rmSync(secretFilePath, { force: true });
    }
}

function ensureSstStageSecrets() {
    const localSecrets = resolveLocalSecrets();

    if (!localSecrets) {
        process.stderr.write(
            [
                "pnpm test:e2e requires E2E_AUTH_SECRET, E2E_USER_EMAIL, and E2E_USER_PASSWORD.",
                "Add them to .env.local or export them before retrying.",
                "External integration secrets are loaded from matching env vars when present; otherwise test-safe placeholders are used.",
                "",
            ].join("\n"),
        );
        process.exit(1);
    }

    if (localSecrets.E2E_AUTH_SECRET.length < 32) {
        process.stderr.write(
            "E2E_AUTH_SECRET must be at least 32 characters.\n",
        );
        process.exit(1);
    }

    process.env.E2E_USER_EMAIL = localSecrets.E2E_USER_EMAIL;
    process.env.E2E_USER_PASSWORD = localSecrets.E2E_USER_PASSWORD;
    loadLocalSecrets(localSecrets);
}

function runPnpm(args, env = process.env) {
    return runCommand(pnpmBin, args, env);
}

function runWithSstShell(commandArgs, env) {
    return runCommand(
        pnpmBin,
        ["exec", "sst", "shell", ...sstArgs, "--", pnpmBin, ...commandArgs],
        env,
    );
}

function createPlaywrightEnv(overrides = {}) {
    const env = {
        ...devServerEnv,
        E2E_USER_EMAIL: process.env.E2E_USER_EMAIL,
        E2E_USER_PASSWORD: process.env.E2E_USER_PASSWORD,
        E2E_USER_ROLE: process.env.E2E_USER_ROLE,
        E2E_USER_DISPLAY_NAME: process.env.E2E_USER_DISPLAY_NAME,
        E2E_SST_STAGE: sstStage,
        ...overrides,
    };

    if (env.FORCE_COLOR && env.NO_COLOR) {
        delete env.NO_COLOR;
    }

    return env;
}

function runCommand(command, args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: process.cwd(),
            env,
            stdio: "inherit",
        });

        child.once("error", reject);
        child.once("exit", (code) => {
            resolve(code ?? 1);
        });
    });
}

function readSstOutputAppUrl() {
    const outputsPath = path.join(process.cwd(), ".sst", "outputs.json");

    if (!fs.existsSync(outputsPath)) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(outputsPath, "utf8"));

        return normalizeUrl(parsed.app);
    } catch {
        return undefined;
    }
}

function normalizeUrl(value) {
    if (typeof value !== "string" || value === sstOutputPlaceholderUrl) {
        return undefined;
    }

    try {
        const parsed = new URL(value);

        if (parsed.hostname === "0.0.0.0") {
            parsed.hostname = "127.0.0.1";
        }

        return parsed.toString().replace(/\/$/u, "");
    } catch {
        return undefined;
    }
}

function extractCandidateUrls(text) {
    const candidates = [];
    const matches = text.matchAll(
        /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s'"<>)\]]*)?/giu,
    );

    for (const match of matches) {
        const url = normalizeUrl(match[0]);

        if (url) {
            candidates.push(url);
        }
    }

    return candidates;
}

function createOutputBuffer(maxLength = 20_000) {
    let value = "";

    return {
        append(text) {
            value = `${value}${text}`;

            if (value.length > maxLength) {
                value = value.slice(value.length - maxLength);
            }
        },
        read() {
            return value.trim();
        },
    };
}

function createSstDeployTracker() {
    let sawDeploy = false;
    let completed = false;
    let locked = false;
    let resolveWait;
    let rejectWait;

    function fail(error) {
        if (!rejectWait) {
            return;
        }

        const reject = rejectWait;
        clearWaitHandlers();
        reject(error);
    }

    function finish() {
        if (!resolveWait) {
            return;
        }

        const resolve = resolveWait;
        clearWaitHandlers();
        resolve();
    }

    function clearWaitHandlers() {
        resolveWait = undefined;
        rejectWait = undefined;
    }

    return {
        append(text) {
            if (/Locked\s+A concurrent update was detected/iu.test(text)) {
                locked = true;
                fail(
                    new Error(
                        "SST dev app is locked by a concurrent update. Run `pnpm exec sst unlock` and retry.",
                    ),
                );
                return;
            }

            if (
                /running stack command.*cmd=deploy/iu.test(text) ||
                /\[SST\]\s*~\s*Deploy/iu.test(text)
            ) {
                sawDeploy = true;
            }

            if (
                /done running stack command/iu.test(text) ||
                /\[SST\].*(?:✓|✔|\|)\s*Complete/iu.test(text)
            ) {
                completed = true;
                finish();
            }
        },
        async wait({ isChildAlive, timeoutMs }) {
            if (locked) {
                throw new Error(
                    "SST dev app is locked by a concurrent update. Run `pnpm exec sst unlock` and retry.",
                );
            }

            if (!sawDeploy || completed) {
                return;
            }

            process.stdout.write("Waiting for SST initial deploy to finish...\n");

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(
                        new Error(
                            `Timed out after ${Math.round(timeoutMs / 1_000)}s waiting for the SST initial deploy to finish.`,
                        ),
                    );
                }, timeoutMs);
                const interval = setInterval(() => {
                    if (!isChildAlive()) {
                        cleanup();
                        reject(
                            new Error(
                                "`sst dev` exited before the initial deploy finished.",
                            ),
                        );
                    }
                }, 1_000);

                function cleanup() {
                    clearTimeout(timeout);
                    clearInterval(interval);
                    clearWaitHandlers();
                }

                resolveWait = () => {
                    cleanup();
                    resolve();
                };
                rejectWait = (error) => {
                    cleanup();
                    reject(error);
                };
            });
        },
    };
}

function getDefaultPortCandidateUrls() {
    return [
        defaultDevUrl,
        ...(shouldProbeLoopbackUrls
            ? [
                  `${defaultDevProtocol}://127.0.0.1:${defaultDevPort}`,
                  `${defaultDevProtocol}://localhost:${defaultDevPort}`,
              ]
            : []),
    ];
}

function getStaticCandidateUrls({
    includeDefaultPort = true,
    includeSstOutput = true,
} = {}) {
    return [
        normalizeUrl(process.env.E2E_SST_DEV_BASE_URL),
        ...(includeSstOutput ? [readSstOutputAppUrl()] : []),
        ...(includeDefaultPort ? getDefaultPortCandidateUrls() : []),
    ].filter(Boolean);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function hasStageArg(line, stageName) {
    const escapedStageName = escapeRegExp(stageName);
    const pattern = new RegExp(
        `(?:^|\\s)--stage(?:=|\\s+)${escapedStageName}(?:\\s|$)`,
        "u",
    );

    return pattern.test(line);
}

function hasRunningSstDevProcess() {
    if (process.platform === "win32") {
        return false;
    }

    const result = spawnSync("ps", ["-axo", "pid=,command="], {
        encoding: "utf8",
    });

    if (result.status !== 0) {
        return false;
    }

    return result.stdout
        .split(/\r?\n/u)
        .some((line) => isSstDevProcessLine(line));
}

function isSstDevProcessLine(line) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
        return false;
    }

    const currentPidPrefix = `${process.pid} `;

    if (trimmedLine.startsWith(currentPidPrefix)) {
        return false;
    }

    const isSstDevProcess =
        /(?:^|\s)sst(?:\s|$).*?(?:^|\s)dev(?:\s|$)/iu.test(trimmedLine) ||
        /(?:^|\s)dev-sst\.mjs(?:\s|$)/iu.test(trimmedLine);

    return isSstDevProcess && hasStageArg(trimmedLine, sstStage);
}

async function isReadyUrl(url) {
    try {
        if (new URL(url).protocol === "https:") {
            return isReadyHttpsUrl(url);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2_000);

        try {
            const response = await fetch(url, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
            });

            return response.status < 500;
        } finally {
            clearTimeout(timeout);
        }
    } catch {
        return false;
    }
}

function isReadyHttpsUrl(url) {
    return new Promise((resolve) => {
        const request = https.request(
            url,
            {
                method: "GET",
                rejectUnauthorized: false,
                timeout: 2_000,
            },
            (response) => {
                response.resume();
                resolve((response.statusCode ?? 0) < 500);
            },
        );

        request.once("error", () => {
            resolve(false);
        });
        request.once("timeout", () => {
            request.destroy();
            resolve(false);
        });
        request.end();
    });
}

async function hasReadyUrl(urls) {
    for (const url of urls) {
        if (await isReadyUrl(url)) {
            return true;
        }
    }

    return false;
}

async function waitForReadyUrl({ timeoutMs, getCandidateUrls, isChildAlive }) {
    const deadline = Date.now() + timeoutMs;
    const checkedUrls = new Set();

    while (Date.now() < deadline) {
        if (isChildAlive && !isChildAlive()) {
            throw new Error("`sst dev` exited before the app became ready.");
        }

        const candidateUrls = [...new Set(getCandidateUrls())];

        for (const url of candidateUrls) {
            if (!checkedUrls.has(url)) {
                process.stdout.write(`Checking SST dev app at ${url}\n`);
                checkedUrls.add(url);
            }

            if (await isReadyUrl(url)) {
                return url;
            }
        }

        await sleep(1_000);
    }

    throw new Error(
        `Timed out after ${Math.round(timeoutMs / 1_000)}s waiting for the SST dev app to become ready.`,
    );
}

function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function ensureSstDev() {
    const discoveredUrls = new Set();
    const sstDevOutputBuffer = createOutputBuffer();
    const sstDeployTracker = createSstDeployTracker();

    if (hasRunningSstDevProcess()) {
        const appUrl = await waitForReadyUrl({
            timeoutMs: sstExistingDevTimeoutMs,
            getCandidateUrls: () => getStaticCandidateUrls(),
        });

        return { appUrl, child: undefined };
    }

    const defaultPortWasReady = await hasReadyUrl(getDefaultPortCandidateUrls());

    ensureSstStageSecrets();

    process.stdout.write("Starting SST dev stage for Playwright...\n");

    const child = spawn(
        pnpmBin,
        ["exec", "sst", "dev", ...sstArgs, ...sstDevArgs],
        {
            cwd: process.cwd(),
            detached: canSignalProcessGroups,
            env: devServerEnv,
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    managedSstDevChild = child;

    child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        sstDevOutputBuffer.append(text);
        sstDeployTracker.append(text);

        if (shouldPrintSstDevLogs) {
            process.stdout.write(text);
        }

        for (const url of extractCandidateUrls(text)) {
            discoveredUrls.add(url);
        }
    });

    child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        sstDevOutputBuffer.append(text);
        sstDeployTracker.append(text);

        if (shouldPrintSstDevLogs) {
            process.stderr.write(text);
        }

        for (const url of extractCandidateUrls(text)) {
            discoveredUrls.add(url);
        }
    });

    let appUrl;

    try {
        appUrl = await waitForReadyUrl({
            timeoutMs: sstDevTimeoutMs,
            getCandidateUrls: () => [
                ...discoveredUrls,
                ...getStaticCandidateUrls({
                    includeDefaultPort: !defaultPortWasReady,
                    includeSstOutput: false,
                }),
            ],
            isChildAlive: () =>
                child.exitCode === null && child.signalCode === null,
        });
        await sstDeployTracker.wait({
            timeoutMs: sstDevTimeoutMs,
            isChildAlive: () =>
                child.exitCode === null && child.signalCode === null,
        });
    } catch (error) {
        const bufferedOutput = sstDevOutputBuffer.read();

        if (bufferedOutput) {
            process.stderr.write(
                ["Recent SST dev output:", bufferedOutput, ""].join("\n"),
            );
        }

        throw error;
    }

    return { appUrl, child };
}

function signalSstDevProcessTree(child, signal) {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    if (canSignalProcessGroups && child.pid) {
        try {
            process.kill(-child.pid, signal);
            return;
        } catch (error) {
            const isMissingProcess =
                error instanceof Error &&
                "code" in error &&
                error.code === "ESRCH";

            if (!isMissingProcess) {
                process.stderr.write(
                    `Unable to signal SST dev process group with ${signal}; falling back to the parent process.\n`,
                );
            }
        }
    }

    child.kill(signal);
}

async function stopSstDev(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    signalSstDevProcessTree(child, "SIGINT");

    const exited = await waitForChildExit(child, 10_000);

    if (!exited && child.exitCode === null && child.signalCode === null) {
        signalSstDevProcessTree(child, "SIGTERM");
        await waitForChildExit(child, 5_000);
    }
}

function waitForChildExit(child, timeoutMs) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            child.off("exit", onExit);
            resolve(false);
        }, timeoutMs);

        function onExit() {
            clearTimeout(timeout);
            resolve(true);
        }

        child.once("exit", onExit);
    });
}

async function seedTestUserAccount(env) {
    process.stdout.write("Seeding test user account for Playwright...\n");

    const seedArgs = [
        "seed:user",
        "--",
        "--email",
        env.E2E_USER_EMAIL,
        "--password",
        env.E2E_USER_PASSWORD,
        "--role",
        env.E2E_USER_ROLE ?? "normal",
    ];

    if (env.E2E_USER_DISPLAY_NAME) {
        seedArgs.push("--display-name", env.E2E_USER_DISPLAY_NAME);
    }

    const status = await runWithSstShell(seedArgs, env);

    if (status !== 0) {
        throw new Error("Unable to seed the test user account for Playwright.");
    }
}

function requestAppUserBootstrap(appUrl, authSecret) {
    return new Promise((resolve, reject) => {
        const url = new URL("/api/e2e/bootstrap-user", appUrl);
        const client = url.protocol === "https:" ? https : http;
        const request = client.request(
            url,
            {
                headers: {
                    "content-length": "0",
                    "x-budgeted-e2e-secret": authSecret,
                },
                method: "POST",
                rejectUnauthorized: false,
                timeout: 5_000,
            },
            (response) => {
                let body = "";

                response.setEncoding("utf8");
                response.on("data", (chunk) => {
                    body = `${body}${chunk}`;
                });
                response.on("end", () => {
                    resolve({
                        body,
                        statusCode: response.statusCode ?? 0,
                    });
                });
            },
        );

        request.once("error", reject);
        request.once("timeout", () => {
            request.destroy(new Error("Timed out bootstrapping test user account."));
        });
        request.end();
    });
}

async function bootstrapUserThroughApp(appUrl) {
    const localSecrets = resolveLocalSecrets();
    const authSecret =
        process.env.E2E_AUTH_SECRET ?? localSecrets?.E2E_AUTH_SECRET;

    if (!authSecret) {
        throw new Error(
            "Unable to bootstrap the test user through the app without E2E_AUTH_SECRET.",
        );
    }

    process.stdout.write("Bootstrapping test user through app server...\n");

    let lastResponse;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        lastResponse = await requestAppUserBootstrap(appUrl, authSecret);

        if (lastResponse.statusCode >= 200 && lastResponse.statusCode < 300) {
            return;
        }

        await sleep(1_000);
    }

    throw new Error(
        [
            "Unable to bootstrap the test user through the app server.",
            `Status: ${lastResponse?.statusCode ?? "unknown"}`,
            lastResponse?.body ? `Body: ${lastResponse.body}` : "",
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

async function main() {
    if (process.env.PLAYWRIGHT_BASE_URL) {
        const status = await runPnpm(
            ["exec", "playwright", "test", ...forwardedArgs],
            createPlaywrightEnv(),
        );

        process.exit(status);
    }

    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, async () => {
            await stopSstDev(managedSstDevChild);
            process.exit(signal === "SIGINT" ? 130 : 143);
        });
    }

    try {
        const result = await ensureSstDev();
        const playwrightEnv = createPlaywrightEnv({
            PLAYWRIGHT_BASE_URL: result.appUrl,
            PLAYWRIGHT_MANAGED_SST: "1",
            PLAYWRIGHT_SKIP_BUILD: "1",
        });

        process.stdout.write(`Running Playwright against ${result.appUrl}\n`);

        await seedTestUserAccount(playwrightEnv);
        await bootstrapUserThroughApp(result.appUrl);

        const status = await runWithSstShell(
            ["exec", "playwright", "test", ...playwrightArgs],
            playwrightEnv,
        );

        await stopSstDev(managedSstDevChild);
        process.exit(status);
    } catch (error) {
        await stopSstDev(managedSstDevChild);
        process.stderr.write(
            `${error instanceof Error ? error.message : error}\n`,
        );
        process.exit(1);
    }
}

main();
