import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

async function loadServerEnvModule(resource: Record<string, unknown> = {}) {
    vi.resetModules();
    vi.doMock("sst", () => ({
        Resource: resource,
    }));

    return import("@/lib/env/server");
}

describe("server environment resolution", () => {
    beforeEach(() => {
        process.env = { ...originalEnv, NODE_ENV: "development" };
        delete process.env.AUTH_SECRET;
        delete process.env.NEXTAUTH_SECRET;
        delete process.env.E2E_AUTH_SECRET;
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.doUnmock("sst");
    });

    it("resolves runtime server env from the linked SST AuthSecret", async () => {
        process.env.AUTH_SECRET = "runtime-auth-secret-32-characters";
        const { getServerEnv } = await loadServerEnvModule({
            AuthSecret: { value: "linked-auth-secret-32-characters" },
        });

        expect(getServerEnv()).toMatchObject({
            authSecret: "linked-auth-secret-32-characters",
        });
    });

    it("does not accept environment variables as runtime auth secrets", async () => {
        process.env.AUTH_SECRET = "runtime-auth-secret-32-characters";
        process.env.NEXTAUTH_SECRET = "next-auth-secret-32-characters";
        process.env.E2E_AUTH_SECRET = "e2e-auth-secret-32-characters";
        const { getServerEnv } = await loadServerEnvModule();

        expect(() => getServerEnv()).toThrow(/authSecret/);
    });
});
