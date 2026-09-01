import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

async function loadServerEnvModule() {
    vi.resetModules();
    vi.doMock("sst", () => ({
        Resource: {},
    }));

    return import("@/lib/env/server");
}

describe("server environment resolution", () => {
    beforeEach(() => {
        process.env = { ...originalEnv, NODE_ENV: "development" };
        delete process.env.AUTH_SECRET;
        delete process.env.NEXTAUTH_SECRET;
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.doUnmock("sst");
    });

    it("resolves runtime server env from AUTH_SECRET", async () => {
        process.env.AUTH_SECRET = "runtime-auth-secret-32-characters";

        const { getServerEnv } = await loadServerEnvModule();

        expect(getServerEnv()).toMatchObject({
            authSecret: "runtime-auth-secret-32-characters",
        });
    });

    it("still requires AUTH_SECRET for runtime server env", async () => {
        const { getServerEnv } = await loadServerEnvModule();

        expect(() => getServerEnv()).toThrow(/authSecret/);
    });
});
