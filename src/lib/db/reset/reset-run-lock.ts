import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";

import { documentClient } from "@/lib/db/client";

export type ResetRunLockRecord = {
    pk: string;
    sk: "reset-lock";
    recordType: "resetLock";
    lockId: string;
    targetLabel: string;
    status: "active";
    startedAt: string;
    updatedAt: string;
    expiresAt: string;
};

type ResetRunLockDeps = {
    send?: (command: PutCommand | DeleteCommand) => Promise<unknown>;
    now?: () => Date;
    createId?: () => string;
};

const RESET_LOCK_TTL_MS = 10 * 60 * 1000;

function getDefaultDeps(): Required<ResetRunLockDeps> {
    return {
        send: (command) => {
            if (command instanceof PutCommand) {
                return documentClient.send(command);
            }

            return documentClient.send(command);
        },
        now: () => new Date(),
        createId: () => ulid(),
    };
}

export function buildResetRunLockKey(targetLabel: string) {
    return {
        pk: `reset-lock#${targetLabel}`,
        sk: "reset-lock" as const,
    };
}

export async function acquireResetRunLock(
    tableName: string,
    targetLabel: string,
    deps: ResetRunLockDeps = {},
) {
    const resolvedDeps = { ...getDefaultDeps(), ...deps };
    const now = resolvedDeps.now();
    const expiresAt = new Date(now.getTime() + RESET_LOCK_TTL_MS).toISOString();

    const lockRecord: ResetRunLockRecord = {
        ...buildResetRunLockKey(targetLabel),
        recordType: "resetLock",
        lockId: resolvedDeps.createId(),
        targetLabel,
        status: "active",
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt,
    };

    try {
        await resolvedDeps.send(
            new PutCommand({
                TableName: tableName,
                Item: lockRecord,
                ConditionExpression:
                    "attribute_not_exists(pk) OR expiresAt <= :now",
                ExpressionAttributeValues: {
                    ":now": now.toISOString(),
                },
            }),
        );
    } catch (error) {
        if (
            error instanceof Error &&
            "name" in error &&
            error.name === "ConditionalCheckFailedException"
        ) {
            throw new Error(
                `A reset is already running for target \"${targetLabel}\".`,
            );
        }

        throw error;
    }

    return lockRecord;
}

export async function releaseResetRunLock(
    tableName: string,
    targetLabel: string,
    deps: ResetRunLockDeps = {},
) {
    const resolvedDeps = { ...getDefaultDeps(), ...deps };

    await resolvedDeps.send(
        new DeleteCommand({
            TableName: tableName,
            Key: buildResetRunLockKey(targetLabel),
        }),
    );
}
