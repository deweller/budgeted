import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

async function loadBrowserTestModule(resource: Record<string, unknown> = {}) {
    vi.resetModules();
    vi.doMock("sst", () => ({
        Resource: resource,
    }));

    return import("@/lib/env/browser-test");
}

describe("browser test environment resolution", () => {
    beforeEach(() => {
        process.env = { ...originalEnv, NODE_ENV: "development" };
        delete process.env.AUTH_SECRET;
        delete process.env.NEXTAUTH_SECRET;
        delete process.env.E2E_AUTH_SECRET;
        delete process.env.E2E_USER_EMAIL;
        delete process.env.E2E_USER_PASSWORD;
        delete process.env.PLAYWRIGHT_BASE_URL;
        delete process.env.PLAYWRIGHT_MANAGED_SST;
        delete process.env.APP_TABLE_NAME;
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.doUnmock("sst");
    });

    it("loads local env for managed-local runs and reports missing startup/authenticated prerequisites", async () => {
        const envLoader = vi.fn();
        const { getBrowserTestStartupError, resolveBrowserTestEnvironment } =
            await loadBrowserTestModule();

        const resolution = resolveBrowserTestEnvironment({
            cwd: "/repo",
            envLoader,
        });

        expect(envLoader).toHaveBeenCalledWith("/repo");
        expect(resolution.mode).toBe("managedLocal");
        expect(resolution.startupPrerequisites.map(({ code }) => code)).toEqual(
            ["authSecret"],
        );
        expect(
            resolution.authenticatedPrerequisites.map(({ code }) => code),
        ).toEqual(["userEmail", "userPassword", "workspaceBackend"]);
        expect(getBrowserTestStartupError(resolution)).toContain(
            "linked SST AuthSecret",
        );
    });

    it("does not auto-load local env for caller-managed runs and does not require a local backend", async () => {
        process.env.PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3000";
        const envLoader = vi.fn();

        const { resolveBrowserTestEnvironment } = await loadBrowserTestModule();

        const resolution = resolveBrowserTestEnvironment({ envLoader });

        expect(envLoader).not.toHaveBeenCalled();
        expect(resolution.mode).toBe("callerManaged");
        expect(resolution.startupPrerequisites).toHaveLength(0);
        expect(
            resolution.authenticatedPrerequisites.map(({ code }) => code),
        ).toEqual(["userEmail", "userPassword"]);
    });

    it("becomes bootstrap-ready when managed-local prerequisites are satisfied", async () => {
        process.env.E2E_USER_EMAIL = "test-user@example.com";
        process.env.E2E_USER_PASSWORD = "change-me-please";
        process.env.APP_TABLE_NAME = "budgeted-local-ledger";

        const { resolveBrowserTestEnvironment } = await loadBrowserTestModule({
            AuthSecret: { value: "managed-local-auth-secret-32-characters" },
        });

        const resolution = resolveBrowserTestEnvironment();

        expect(resolution.startupPrerequisites).toHaveLength(0);
        expect(resolution.authenticatedPrerequisites).toHaveLength(0);
        expect(resolution.canBootstrapUser).toBe(true);
    });

    it("treats wrapper-managed SST runs as managed-local even with a base URL", async () => {
        process.env.PLAYWRIGHT_BASE_URL = "https://budgeted.ldev:5187";
        process.env.PLAYWRIGHT_MANAGED_SST = "1";
        process.env.E2E_USER_EMAIL = "test-user@example.com";
        process.env.E2E_USER_PASSWORD = "change-me-please";
        process.env.APP_TABLE_NAME = "budgeted-local-ledger";
        const envLoader = vi.fn();

        const { resolveBrowserTestEnvironment } = await loadBrowserTestModule({
            AuthSecret: { value: "managed-local-auth-secret-32-characters" },
        });

        const resolution = resolveBrowserTestEnvironment({ envLoader });

        expect(envLoader).toHaveBeenCalled();
        expect(resolution.mode).toBe("managedLocal");
        expect(resolution.baseURL).toBe("https://budgeted.ldev:5187");
        expect(resolution.authenticatedPrerequisites).toHaveLength(0);
    });

    it("formats authenticated skip guidance with actionable recovery steps", async () => {
        process.env.PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3000";
        const {
            getBrowserTestAuthenticatedSkipReason,
            resolveBrowserTestEnvironment,
        } = await loadBrowserTestModule();

        const resolution = resolveBrowserTestEnvironment();
        const reason = getBrowserTestAuthenticatedSkipReason(resolution);

        expect(reason).toContain("caller-managed");
        expect(reason).toContain("E2E_USER_EMAIL");
        expect(reason).toContain("Recovery:");
    });

    it("uses E2E user credentials for caller-managed authenticated runs", async () => {
        process.env.PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3000";
        process.env.E2E_USER_EMAIL = "override@example.com";
        process.env.E2E_USER_PASSWORD = "override-password";

        const { resolveBrowserTestEnvironment } = await loadBrowserTestModule();

        const resolution = resolveBrowserTestEnvironment();

        expect(resolution.userEmail).toBe("override@example.com");
        expect(resolution.userPassword).toBe("override-password");
        expect(resolution.authenticatedPrerequisites).toHaveLength(0);
    });
});
