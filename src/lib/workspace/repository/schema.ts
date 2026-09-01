import { openDB, type IDBPDatabase } from "idb";

import {
    WORKSPACE_CACHE_DATABASE_NAME,
    WORKSPACE_CACHE_DATABASE_VERSION,
    type WorkspaceCacheDatabaseSchema,
} from "@/lib/workspace/repository/types";

let databasePromise: Promise<IDBPDatabase<WorkspaceCacheDatabaseSchema>> | null =
    null;

export async function getWorkspaceRepositoryDatabase() {
    if (typeof indexedDB === "undefined") {
        return null;
    }

    databasePromise ??= openDB<WorkspaceCacheDatabaseSchema>(
        WORKSPACE_CACHE_DATABASE_NAME,
        WORKSPACE_CACHE_DATABASE_VERSION,
        {
            upgrade(database) {
                for (const storeName of Array.from(database.objectStoreNames)) {
                    database.deleteObjectStore(storeName);
                }

                database.createObjectStore("workspaceMetadata", {
                    keyPath: "cacheKey",
                });
                const records = database.createObjectStore("workspaceRecords", {
                    keyPath: "key",
                });
                records.createIndex("byCacheKey", "cacheKey");
                records.createIndex("byCacheEntityType", [
                    "cacheKey",
                    "entityType",
                ]);
                records.createIndex("byCacheEntityId", [
                    "cacheKey",
                    "entityType",
                    "entityId",
                ]);
                records.createIndex("byTransactionId", [
                    "cacheKey",
                    "entityType",
                    "transactionId",
                ]);
            },
        },
    );

    return databasePromise;
}

export function resetWorkspaceRepositoryDatabaseForTests() {
    databasePromise = null;
}
