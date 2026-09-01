import { ScanCommand } from "@aws-sdk/lib-dynamodb";

import { deleteItemsInBatches } from "@/lib/db/batch-delete";
import { documentClient } from "@/lib/db/client";
import { listAllPaginatedItems } from "@/lib/db/paginated-list";

export type WorkspaceChangePurgeStatus = "incomplete" | "success";

export type WorkspaceChangePurgeResult = {
    failureReasons?: string[];
    finishedAt: string;
    matchedCount: number;
    purgedCount: number;
    remainingCount: number;
    startedAt: string;
    status: WorkspaceChangePurgeStatus;
    targetLabel: string;
};

type WorkspaceChangePurgeScanItem = {
    pk?: string;
    sk?: string;
};

type WorkspaceChangePurgeScanPage = {
    items: WorkspaceChangePurgeScanItem[];
    lastEvaluatedKey?: Record<string, unknown>;
};

type WorkspaceChangePurgeDeps = {
    deleteBatch?: (input: {
        keys: Array<{ pk: string; sk: string }>;
        tableName: string;
    }) => Promise<void>;
    listPage?: (input: {
        exclusiveStartKey?: Record<string, unknown>;
        tableName: string;
    }) => Promise<WorkspaceChangePurgeScanPage>;
    now?: () => Date;
};

function getDefaultDeps(): Required<WorkspaceChangePurgeDeps> {
    return {
        deleteBatch: async ({ keys, tableName }) => {
            await deleteItemsInBatches({ keys, tableName });
        },
        listPage: async ({ exclusiveStartKey, tableName }) => {
            const result = await documentClient.send(
                new ScanCommand({
                    TableName: tableName,
                    ExclusiveStartKey: exclusiveStartKey,
                    FilterExpression:
                        "#entity IN (:workspaceChange, :workspaceMutationBatch, :workspaceMutationReceipt, :workspaceMutationOperation)",
                    ProjectionExpression: "#pk, #sk",
                    ExpressionAttributeNames: {
                        "#entity": "__edb_e__",
                        "#pk": "pk",
                        "#sk": "sk",
                    },
                    ExpressionAttributeValues: {
                        ":workspaceChange": "workspaceChange",
                        ":workspaceMutationBatch": "workspaceMutationBatch",
                        ":workspaceMutationReceipt": "workspaceMutationReceipt",
                        ":workspaceMutationOperation":
                            "workspaceMutationOperation",
                    },
                }),
            );

            return {
                items:
                    (result.Items as WorkspaceChangePurgeScanItem[] | undefined) ??
                    [],
                lastEvaluatedKey: result.LastEvaluatedKey,
            };
        },
        now: () => new Date(),
    };
}

async function listWorkspaceChangeItems(
    tableName: string,
    listPage: Required<WorkspaceChangePurgeDeps>["listPage"],
) {
    return listAllPaginatedItems((input) =>
        listPage({ ...input, tableName }),
    );
}

function toDeleteKey(item: WorkspaceChangePurgeScanItem) {
    if (typeof item.pk !== "string" || typeof item.sk !== "string") {
        return null;
    }

    return {
        pk: item.pk,
        sk: item.sk,
    };
}

export async function executeWorkspaceChangePurge(
    input: {
        tableName: string;
        targetLabel: string;
    },
    deps: WorkspaceChangePurgeDeps = {},
): Promise<WorkspaceChangePurgeResult> {
    const resolvedDeps = { ...getDefaultDeps(), ...deps };
    const startedAt = resolvedDeps.now().toISOString();
    const failureReasons: string[] = [];
    const initialItems = await listWorkspaceChangeItems(
        input.tableName,
        resolvedDeps.listPage,
    );
    const deleteKeys = [];

    for (const item of initialItems) {
        const deleteKey = toDeleteKey(item);

        if (!deleteKey) {
            failureReasons.push(
                "A workspace change item is missing pk/sk and could not be deleted.",
            );
            continue;
        }

        deleteKeys.push(deleteKey);
    }

    if (deleteKeys.length > 0) {
        try {
            await resolvedDeps.deleteBatch({
                keys: deleteKeys,
                tableName: input.tableName,
            });
        } catch (error) {
            failureReasons.push(
                error instanceof Error
                    ? error.message
                    : "A workspace change delete batch failed.",
            );
        }
    }

    const remainingItems = await listWorkspaceChangeItems(
        input.tableName,
        resolvedDeps.listPage,
    );
    const finishedAt = resolvedDeps.now().toISOString();
    const purgedCount = Math.max(0, initialItems.length - remainingItems.length);
    const status =
        remainingItems.length === 0 && failureReasons.length === 0
            ? "success"
            : "incomplete";

    return {
        failureReasons:
            failureReasons.length > 0 ? failureReasons : undefined,
        finishedAt,
        matchedCount: initialItems.length,
        purgedCount,
        remainingCount: remainingItems.length,
        startedAt,
        status,
        targetLabel: input.targetLabel,
    };
}
