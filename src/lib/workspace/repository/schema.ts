import { openDB, type IDBPDatabase } from "idb";

import {
    WORKSPACE_CACHE_DATABASE_NAME,
    WORKSPACE_CACHE_DATABASE_VERSION,
    type WorkspaceCacheDatabaseSchema,
} from "@/lib/workspace/repository/types";

let databasePromise: Promise<IDBPDatabase<WorkspaceCacheDatabaseSchema>> | null =
    null;

const DEFAULT_DATABASE_OPEN_TIMEOUT_MS = 5_000;

function openWorkspaceRepositoryDatabase(openTimeoutMs: number) {
    let didTimeOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const openPromise = openDB<WorkspaceCacheDatabaseSchema>(
        WORKSPACE_CACHE_DATABASE_NAME,
        WORKSPACE_CACHE_DATABASE_VERSION,
        {
            blocking(_currentVersion, _blockedVersion, event) {
                const database = event.target;

                if (database instanceof IDBDatabase) {
                    database.close();
                }
                databasePromise = null;
            },
            terminated() {
                databasePromise = null;
            },
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

    return new Promise<IDBPDatabase<WorkspaceCacheDatabaseSchema>>(
        (resolve, reject) => {
            timeoutId = setTimeout(() => {
                didTimeOut = true;
                reject(
                    new Error(
                        "Opening the workspace cache was blocked by another browser context.",
                    ),
                );
            }, openTimeoutMs);

            void openPromise.then(
                (database) => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    if (didTimeOut) {
                        database.close();
                        return;
                    }
                    resolve(database);
                },
                (error: unknown) => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    reject(error);
                },
            );
        },
    );
}

export async function getWorkspaceRepositoryDatabase(
    options: { openTimeoutMs?: number } = {},
) {
    if (typeof indexedDB === "undefined") {
        return null;
    }

    const pendingDatabase =
        databasePromise ??
        openWorkspaceRepositoryDatabase(
            options.openTimeoutMs ?? DEFAULT_DATABASE_OPEN_TIMEOUT_MS,
        );
    databasePromise = pendingDatabase;

    try {
        return await pendingDatabase;
    } catch (error) {
        if (databasePromise === pendingDatabase) {
            databasePromise = null;
        }
        throw error;
    }
}

export function resetWorkspaceRepositoryDatabaseForTests() {
    databasePromise = null;
}
