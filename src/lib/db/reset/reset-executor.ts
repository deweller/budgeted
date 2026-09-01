import { ScanCommand } from "@aws-sdk/lib-dynamodb";

import { deleteItemBatch } from "@/lib/db/batch-delete";
import { documentClient } from "@/lib/db/client";
import { chunkRecords } from "@/lib/db/chunked-write";
import { listAllPaginatedItems } from "@/lib/db/paginated-list";

import { acquireResetRunLock, releaseResetRunLock } from "./reset-run-lock";
import {
    classifyResetItem,
    getResetDeleteKey,
    type ResetDeleteKey,
    type ResetScanItem,
} from "./reset-scope";
import { buildCountEntries, type ResetExecutionResult } from "./reset-summary";

type ResetScanPage = {
    items: ResetScanItem[];
    lastEvaluatedKey?: Record<string, unknown>;
};

type ResetExecutorDeps = {
    listPage?: (input: {
        tableName: string;
        exclusiveStartKey?: Record<string, unknown>;
    }) => Promise<ResetScanPage>;
    deleteBatch?: (input: {
        tableName: string;
        keys: ResetDeleteKey[];
    }) => Promise<void>;
    acquireLock?: typeof acquireResetRunLock;
    releaseLock?: typeof releaseResetRunLock;
    now?: () => Date;
};

type ResetCollectionResult = {
    clearableItems: Array<{ item: ResetScanItem; label: string }>;
    clearedCounts: Map<string, number>;
    preservedCounts: Map<string, number>;
};

function getDefaultDeps(): Required<ResetExecutorDeps> {
    return {
        listPage: async ({ tableName, exclusiveStartKey }) => {
            const result = await documentClient.send(
                new ScanCommand({
                    TableName: tableName,
                    ExclusiveStartKey: exclusiveStartKey,
                    ProjectionExpression: "#pk, #sk, #entity, #userId, #email",
                    ExpressionAttributeNames: {
                        "#pk": "pk",
                        "#sk": "sk",
                        "#entity": "__edb_e__",
                        "#userId": "userId",
                        "#email": "email",
                    },
                }),
            );

            return {
                items: (result.Items as ResetScanItem[] | undefined) ?? [],
                lastEvaluatedKey: result.LastEvaluatedKey,
            };
        },
        deleteBatch: async ({ tableName, keys }) => {
            await deleteItemBatch({ keys, tableName });
        },
        acquireLock: acquireResetRunLock,
        releaseLock: releaseResetRunLock,
        now: () => new Date(),
    };
}

function incrementCount(counts: Map<string, number>, label: string) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
}

async function collectScopedItems(
    tableName: string,
    listPage: Required<ResetExecutorDeps>["listPage"],
) {
    const clearableItems: Array<{ item: ResetScanItem; label: string }> = [];
    const clearedCounts = new Map<string, number>();
    const preservedCounts = new Map<string, number>();
    const items = await listAllPaginatedItems((input) =>
        listPage({ ...input, tableName }),
    );

    for (const item of items) {
        const classification = classifyResetItem(item);

        if (classification.action === "clear") {
            clearableItems.push({ item, label: classification.label });
            incrementCount(clearedCounts, classification.label);
            continue;
        }

        if (classification.action === "preserve") {
            incrementCount(preservedCounts, classification.label);
        }
    }

    return {
        clearableItems,
        clearedCounts,
        preservedCounts,
    } satisfies ResetCollectionResult;
}

function subtractRemainingCounts(
    initialCounts: Map<string, number>,
    remainingCounts: Map<string, number>,
) {
    const clearedCounts = new Map<string, number>();

    for (const [label, count] of initialCounts.entries()) {
        clearedCounts.set(
            label,
            Math.max(0, count - (remainingCounts.get(label) ?? 0)),
        );
    }

    return clearedCounts;
}

export async function executeReset(
    input: {
        tableName: string;
        targetLabel: string;
    },
    deps: ResetExecutorDeps = {},
): Promise<ResetExecutionResult> {
    const resolvedDeps = { ...getDefaultDeps(), ...deps };
    const startedAt = resolvedDeps.now().toISOString();
    const failureReasons: string[] = [];

    await resolvedDeps.acquireLock(input.tableName, input.targetLabel);

    try {
        const initialState = await collectScopedItems(
            input.tableName,
            resolvedDeps.listPage,
        );

        const deleteKeys: ResetDeleteKey[] = [];

        for (const { item, label } of initialState.clearableItems) {
            const deleteKey = getResetDeleteKey(item);

            if (!deleteKey) {
                failureReasons.push(
                    `${label} item is missing pk/sk and could not be deleted.`,
                );
                continue;
            }

            deleteKeys.push(deleteKey);
        }

        for (const chunk of chunkRecords(deleteKeys)) {
            try {
                await resolvedDeps.deleteBatch({
                    tableName: input.tableName,
                    keys: chunk,
                });
            } catch (error) {
                failureReasons.push(
                    error instanceof Error
                        ? error.message
                        : "A reset batch failed to delete.",
                );
            }
        }

        const remainingState = await collectScopedItems(
            input.tableName,
            resolvedDeps.listPage,
        );
        const finishedAt = resolvedDeps.now().toISOString();
        const remainingCounts = remainingState.clearedCounts;
        const clearedCounts = subtractRemainingCounts(
            initialState.clearedCounts,
            remainingCounts,
        );

        if (
            remainingState.clearableItems.length === 0 &&
            failureReasons.length === 0
        ) {
            return {
                status: "success",
                targetLabel: input.targetLabel,
                startedAt,
                finishedAt,
                clearedCounts: buildCountEntries(clearedCounts),
                preservedCounts: buildCountEntries(
                    initialState.preservedCounts,
                ),
            };
        }

        return {
            status: "incomplete",
            targetLabel: input.targetLabel,
            startedAt,
            finishedAt,
            clearedCounts: buildCountEntries(clearedCounts),
            preservedCounts: buildCountEntries(initialState.preservedCounts),
            remainingCounts: buildCountEntries(remainingCounts),
            failureReasons,
        };
    } finally {
        await resolvedDeps.releaseLock(input.tableName, input.targetLabel);
    }
}
