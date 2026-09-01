import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

async function loadResourceModule(resource: Record<string, unknown> = {}) {
    vi.resetModules();
    vi.doMock("sst", () => ({
        Resource: resource,
    }));

    return import("@/lib/db/resource");
}

describe("db resource resolution", () => {
    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.APP_TABLE_NAME;
        delete process.env.SST_RESOURCE_LedgerTable;
        delete process.env.SST_RESOURCE_LedgerTable_tableName;
        delete process.env.SST_RESOURCE_OwnerEmail;
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.doUnmock("sst");
    });

    it("uses linked ledger resources that expose a name", async () => {
        const { getLedgerTableName } = await loadResourceModule({
            LedgerTable: { name: "linked-ledger-table" },
        });

        expect(getLedgerTableName()).toBe("linked-ledger-table");
    });

    it("parses JSON-backed SST resource env bindings for the ledger table", async () => {
        process.env.SST_RESOURCE_LedgerTable = JSON.stringify({
            name: "env-ledger-table",
            type: "sst.aws.Dynamo",
        });

        const { getLedgerTableName } = await loadResourceModule();

        expect(getLedgerTableName()).toBe("env-ledger-table");
    });

    it("parses JSON-backed SST secret env bindings", async () => {
        process.env.SST_RESOURCE_AuthSecret = JSON.stringify({
            type: "sst.sst.Secret",
            value: "auth-secret-32-characters-minimum",
        });

        const { getLinkedSecret } = await loadResourceModule();

        expect(getLinkedSecret("AuthSecret")).toBe(
            "auth-secret-32-characters-minimum",
        );
    });
});
