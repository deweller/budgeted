import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const state = {
        existingBatch: null as Record<string, unknown> | null,
        revision: 0,
        transactionResults: [] as unknown[],
        writtenItems: [] as unknown[][],
    };

    const commitBuilder = (item: unknown) => ({
        commit: () => item,
        set: () => commitBuilder(item),
        where: () => commitBuilder(item),
    });
    const entity = (name: string) => ({
        delete: (record: unknown) =>
            commitBuilder({ action: "delete", name, record }),
        put: (record: unknown) =>
            commitBuilder({ action: "put", name, record }),
        update: (record: unknown) =>
            commitBuilder({ action: "update", name, record }),
    });
    const entities = {
        ledgers: entity("ledger"),
        transactions: entity("transaction"),
        workspaceMutationBatches: entity("workspaceMutationBatch"),
        workspaceMutationOperations: entity("workspaceMutationOperation"),
        workspaceMutationReceipts: entity("workspaceMutationReceipt"),
        workspaceStates: entity("workspaceState"),
    };
    const go = vi.fn(async () => {
        return (
            state.transactionResults.shift() ?? {
                canceled: false,
                data: [],
            }
        );
    });
    const write = vi.fn((callback: (value: typeof entities) => unknown[]) => {
        state.writtenItems.push(callback(entities));

        return { go };
    });
    const findWorkspaceMutationBatch = vi.fn(async () => state.existingBatch);
    const getNextWorkspaceMutationVersion = vi.fn(async () => {
        state.revision += 1;

        return {
            expectedWorkspaceGeneration: "generation-1",
            expectedWorkspaceRevision:
                state.revision === 1 ? undefined : `revision-${state.revision - 1}`,
            workspaceGeneration: "generation-1",
            workspaceRevision: `revision-${state.revision}`,
        };
    });
    const prepareWorkspaceStateUpdateBeforeWrite = vi.fn(async () => ({
        entityCounts: {},
        entityDigests: {},
        ledgerId: "ledger-1",
        revisionTokens: {},
        workspaceGeneration: "generation-1",
        workspaceRevision: `revision-${state.revision}`,
    }));
    const createWorkspaceMutationBatch = vi.fn(
        (input: Record<string, unknown>) => input,
    );

    return {
        createWorkspaceMutationBatch,
        findWorkspaceMutationBatch,
        getNextWorkspaceMutationVersion,
        go,
        prepareWorkspaceStateUpdateBeforeWrite,
        state,
        write,
    };
});

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        service: {
            transaction: {
                write: mocks.write,
            },
        },
    }),
}));

vi.mock("@/features/workspace/server/workspace-sync-service", () => ({
    createWorkspaceMutationBatch: mocks.createWorkspaceMutationBatch,
    findWorkspaceMutationBatch: mocks.findWorkspaceMutationBatch,
    getNextWorkspaceMutationVersion: mocks.getNextWorkspaceMutationVersion,
    prepareWorkspaceStateUpdateBeforeWrite:
        mocks.prepareWorkspaceStateUpdateBeforeWrite,
    toWorkspaceMutationBatchRecord: (batch: unknown) => batch,
    toWorkspaceMutationOperationRecord: (operation: unknown) => operation,
    toWorkspaceMutationReceiptRecord: (batch: unknown) => batch,
    toWorkspaceStateRecord: (state: unknown) => state,
}));

import { commitAtomicWorkspaceMutation } from "@/features/workspace/server/workspace-atomic-commit";
import { WorkspaceTransactionCanceledError } from "@/features/workspace/server/workspace-transaction-conflict";

const change = {
    entityId: "transaction-1",
    entityType: "transaction" as const,
    operation: "upsert" as const,
    previousRecordDigest: null,
    record: {
        ledgerId: "ledger-1",
        transactionId: "transaction-1",
    },
};

function commitMutation(
    overrides: Partial<Parameters<typeof commitAtomicWorkspaceMutation>[0]> = {},
) {
    return commitAtomicWorkspaceMutation({
        buildDomainItems: () => [{ name: "domain" } as never],
        changes: [change],
        domainItemCount: 1,
        ledgerId: "ledger-1",
        mutationId: "mutation-1",
        mutationType: "transaction.save",
        response: { transactionId: "transaction-1" },
        ...overrides,
    });
}

describe("atomic workspace commit coordinator", () => {
    beforeEach(() => {
        mocks.state.existingBatch = null;
        mocks.state.revision = 0;
        mocks.state.transactionResults = [];
        mocks.state.writtenItems = [];
        vi.clearAllMocks();
    });

    it("writes domain and workspace infrastructure items atomically", async () => {
        const result = await commitMutation({
            operation: {
                completedStepCount: 0,
                createdAt: "2026-07-17T00:00:00.000Z",
                expiresAt: 1_784_332_800,
                ledgerId: "ledger-1",
                mutationId: "mutation-1",
                mutationType: "transaction.save",
                operation: {},
                status: "running",
                updatedAt: "2026-07-17T00:00:00.000Z",
            },
        });

        expect(result).toMatchObject({
            replayed: false,
            response: { transactionId: "transaction-1" },
            workspaceChanges: [change],
        });
        expect(mocks.write).toHaveBeenCalledTimes(1);
        expect(
            mocks.state.writtenItems[0]?.map(
                (item) => (item as { name: string }).name,
            ),
        ).toEqual([
            "domain",
            "workspaceMutationBatch",
            "workspaceMutationReceipt",
            "workspaceState",
            "workspaceMutationOperation",
            "ledger",
        ]);
    });

    it("returns the original committed result when the mutation is replayed", async () => {
        mocks.state.existingBatch = {
            changes: [change],
            ledgerId: "ledger-1",
            mutationId: "mutation-1",
            mutationType: "transaction.save",
            response: { transactionId: "original-transaction" },
        };

        const result = await commitMutation();

        expect(result).toMatchObject({
            replayed: true,
            response: { transactionId: "original-transaction" },
            workspaceChanges: [change],
        });
        expect(mocks.write).not.toHaveBeenCalled();
        expect(mocks.getNextWorkspaceMutationVersion).not.toHaveBeenCalled();
    });

    it("retries only a failed ledger revision fence", async () => {
        mocks.state.transactionResults = [
            {
                canceled: true,
                data: [
                    { code: "None", rejected: false },
                    { code: "None", rejected: false },
                    { code: "None", rejected: false },
                    {
                        code: "ConditionalCheckFailed",
                        rejected: true,
                    },
                ],
            },
            { canceled: false, data: [] },
        ];

        const result = await commitMutation();

        expect(result.replayed).toBe(false);
        expect(mocks.write).toHaveBeenCalledTimes(2);
        expect(mocks.getNextWorkspaceMutationVersion).toHaveBeenCalledTimes(2);
    });

    it("retries a transient DynamoDB transaction conflict", async () => {
        mocks.state.transactionResults = [
            {
                canceled: true,
                data: [
                    { code: "None", rejected: false },
                    { code: "None", rejected: false },
                    { code: "None", rejected: false },
                    {
                        code: "TransactionConflict",
                        rejected: true,
                    },
                ],
            },
            { canceled: false, data: [] },
        ];

        const result = await commitMutation();

        expect(result.replayed).toBe(false);
        expect(mocks.write).toHaveBeenCalledTimes(2);
        expect(mocks.getNextWorkspaceMutationVersion).toHaveBeenCalledTimes(2);
    });

    it("does not retry an unrelated domain condition failure", async () => {
        mocks.state.transactionResults = [
            {
                canceled: true,
                data: [
                    {
                        code: "ConditionalCheckFailed",
                        rejected: true,
                    },
                    { code: "None", rejected: false },
                    { code: "None", rejected: false },
                    { code: "None", rejected: false },
                ],
            },
        ];

        await expect(commitMutation()).rejects.toBeInstanceOf(
            WorkspaceTransactionCanceledError,
        );
        expect(mocks.write).toHaveBeenCalledTimes(1);
        expect(mocks.getNextWorkspaceMutationVersion).toHaveBeenCalledTimes(1);
    });

    it("reserves capacity for all common workspace records", async () => {
        await expect(
            commitMutation({
                domainItemCount: 96,
                maxItemCount: 100,
                operation: {
                    completedStepCount: 0,
                    createdAt: "2026-07-17T00:00:00.000Z",
                    expiresAt: 1_784_332_800,
                    ledgerId: "ledger-1",
                    mutationId: "mutation-1",
                    mutationType: "transaction.save",
                    operation: {},
                    status: "running",
                    updatedAt: "2026-07-17T00:00:00.000Z",
                },
            }),
        ).rejects.toThrow(
            "Workspace mutation requires 101 DynamoDB transaction items",
        );
        expect(mocks.write).not.toHaveBeenCalled();
    });
});
