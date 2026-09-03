import fs from "node:fs";
import path from "node:path";

import { getLedgerTableName } from "@/lib/db/resource";
import { resolveAuthSecret } from "@/lib/env/server";

export type BrowserTestMode = "managedLocal" | "callerManaged";
export type BrowserTestPrerequisiteScope =
    | "startup"
    | "authenticated-scenarios";
export type BrowserTestPrerequisiteCode =
    | "authSecret"
    | "userEmail"
    | "userPassword"
    | "workspaceBackend";

export type BrowserTestPrerequisite = {
    code: BrowserTestPrerequisiteCode;
    scope: BrowserTestPrerequisiteScope;
    message: string;
    recovery: string;
};

export type BrowserTestEnvironment = {
    mode: BrowserTestMode;
    baseURL?: string;
    authSecret?: string;
    userEmail?: string;
    userPassword?: string;
    ledgerTableName?: string;
    startupPrerequisites: BrowserTestPrerequisite[];
    authenticatedPrerequisites: BrowserTestPrerequisite[];
    canBootstrapUser: boolean;
};

type ResolveBrowserTestEnvironmentOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    envLoader?: (cwd: string) => void;
    loadLocalEnv?: boolean;
};

function defaultEnvLoader(cwd: string) {
    loadEnvFile(path.join(cwd, ".env"));
    loadEnvFile(path.join(cwd, ".env.local"));
}

function parseEnvAssignment(line: string) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
        return undefined;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
        return undefined;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");

    return { key, value };
}

function loadEnvFile(filePath: string) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const fileContents = fs.readFileSync(filePath, "utf8");

    for (const line of fileContents.split(/\r?\n/u)) {
        const assignment = parseEnvAssignment(line);

        if (!assignment || process.env[assignment.key] !== undefined) {
            continue;
        }

        process.env[assignment.key] = assignment.value;
    }
}

function buildPrerequisite(
    code: BrowserTestPrerequisiteCode,
    scope: BrowserTestPrerequisiteScope,
): BrowserTestPrerequisite {
    switch (code) {
        case "authSecret":
            return {
                code,
                scope,
                message:
                    "Managed local browser validation is missing the linked SST AuthSecret.",
                recovery:
                    "Configure AuthSecret for the E2E SST stage before running Playwright.",
            };
        case "userEmail":
            return {
                code,
                scope,
                message:
                    "Authenticated browser scenarios are missing E2E_USER_EMAIL.",
                recovery:
                    "Set E2E_USER_EMAIL in .env.local or export it in the shell before running authenticated specs.",
            };
        case "userPassword":
            return {
                code,
                scope,
                message:
                    "Authenticated browser scenarios are missing E2E_USER_PASSWORD.",
                recovery:
                    "Set E2E_USER_PASSWORD in .env.local or export it in the shell before running authenticated specs.",
            };
        case "workspaceBackend":
            return {
                code,
                scope,
                message:
                    "Authenticated browser scenarios do not have a configured workspace backend.",
                recovery:
                    "Set APP_TABLE_NAME for a local server, run against an SST-linked environment, or point Playwright at a caller-managed server with PLAYWRIGHT_BASE_URL.",
            };
    }
}

function formatPrerequisites(prerequisites: BrowserTestPrerequisite[]) {
    return prerequisites
        .map(({ message, recovery }) => `- ${message} Recovery: ${recovery}`)
        .join("\n");
}

export function resolveBrowserTestMode(
    env: NodeJS.ProcessEnv = process.env,
): BrowserTestMode {
    if (env.PLAYWRIGHT_MANAGED_SST === "1") {
        return "managedLocal";
    }

    return env.PLAYWRIGHT_BASE_URL ? "callerManaged" : "managedLocal";
}

export function resolveBrowserTestEnvironment(
    options: ResolveBrowserTestEnvironmentOptions = {},
): BrowserTestEnvironment {
    const env = options.env ?? process.env;
    const mode = resolveBrowserTestMode(env);

    if (mode === "managedLocal" && options.loadLocalEnv !== false) {
        (options.envLoader ?? defaultEnvLoader)(options.cwd ?? process.cwd());
    }

    const authSecret = resolveAuthSecret(env);
    const userEmail = env.E2E_USER_EMAIL;
    const userPassword = env.E2E_USER_PASSWORD;
    const ledgerTableName = getLedgerTableName();

    const startupPrerequisites = mode !== "managedLocal" || authSecret
        ? []
        : [buildPrerequisite("authSecret", "startup")];

    const authenticatedPrerequisites: BrowserTestPrerequisite[] = [];

    if (!userEmail) {
        authenticatedPrerequisites.push(
            buildPrerequisite("userEmail", "authenticated-scenarios"),
        );
    }

    if (!userPassword) {
        authenticatedPrerequisites.push(
            buildPrerequisite("userPassword", "authenticated-scenarios"),
        );
    }

    if (mode === "managedLocal" && !ledgerTableName) {
        authenticatedPrerequisites.push(
            buildPrerequisite("workspaceBackend", "authenticated-scenarios"),
        );
    }

    return {
        mode,
        baseURL: env.PLAYWRIGHT_BASE_URL,
        authSecret,
        userEmail,
        userPassword,
        ledgerTableName,
        startupPrerequisites,
        authenticatedPrerequisites,
        canBootstrapUser:
            mode === "managedLocal" &&
            startupPrerequisites.length === 0 &&
            authenticatedPrerequisites.length === 0,
    };
}

export function getBrowserTestStartupError(resolution: BrowserTestEnvironment) {
    if (resolution.startupPrerequisites.length === 0) {
        return undefined;
    }

    return [
        "Playwright managed-local startup is missing required prerequisites:",
        formatPrerequisites(resolution.startupPrerequisites),
    ].join("\n");
}

export function getBrowserTestAuthenticatedSkipReason(
    resolution: BrowserTestEnvironment,
) {
    if (resolution.authenticatedPrerequisites.length === 0) {
        return undefined;
    }

    const prefix =
        resolution.mode === "callerManaged"
            ? "Authenticated browser scenarios remain caller-managed for this Playwright run:"
            : "Authenticated browser scenarios are unavailable for this Playwright run:";

    return [
        prefix,
        formatPrerequisites(resolution.authenticatedPrerequisites),
    ].join("\n");
}
