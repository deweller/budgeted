import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import {
    getWorkspaceRepositoryDatabase,
    resetWorkspaceRepositoryDatabaseForTests,
} from "@/lib/workspace/repository/schema";
import {
    WORKSPACE_CACHE_DATABASE_NAME,
    WORKSPACE_CACHE_DATABASE_VERSION,
    WORKSPACE_CACHE_SCHEMA_VERSION,
} from "@/lib/workspace/repository/types";

async function deleteRepositoryDatabase() {
    resetWorkspaceRepositoryDatabaseForTests();
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(
            WORKSPACE_CACHE_DATABASE_NAME,
        );
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

describe("workspace repository schema", () => {
    afterEach(async () => {
        const database = await getWorkspaceRepositoryDatabase();
        database?.close();
        await deleteRepositoryDatabase();
    });

    it("creates only version metadata and canonical record stores", async () => {
        const database = await getWorkspaceRepositoryDatabase();

        expect(database?.version).toBe(WORKSPACE_CACHE_DATABASE_VERSION);
        expect(
            Array.from(database?.objectStoreNames ?? []),
        ).toEqual(["workspaceMetadata", "workspaceRecords"]);

        const transaction = database?.transaction(
            "workspaceRecords",
            "readonly",
        );
        expect(
            Array.from(
                transaction?.objectStore("workspaceRecords").indexNames ?? [],
            ),
        ).toEqual(
            expect.arrayContaining([
                "byCacheEntityId",
                "byCacheEntityType",
                "byTransactionId",
            ]),
        );
        await transaction?.done;
    });

    it("keeps physical and logical schema versions as separate fences", () => {
        expect(WORKSPACE_CACHE_DATABASE_VERSION).toBe(10);
        expect(WORKSPACE_CACHE_SCHEMA_VERSION).toBe(18);
        expect(WORKSPACE_CACHE_SCHEMA_VERSION).not.toBe(
            WORKSPACE_CACHE_DATABASE_VERSION,
        );
    });
});
