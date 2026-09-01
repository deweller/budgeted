import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";
import {
    createWorkspaceMutationBatch,
    findWorkspaceMutationBatch,
    getNextWorkspaceMutationVersion,
    prepareWorkspaceStateUpdateBeforeWrite,
    toWorkspaceMutationBatchRecord,
    toWorkspaceMutationOperationRecord,
    toWorkspaceMutationReceiptRecord,
    toWorkspaceStateRecord,
    type WorkspaceMutationBatch,
    type WorkspaceMutationChangeInput,
    type WorkspaceMutationOperation,
} from "@/features/workspace/server/workspace-sync-service";
import {
    assertWorkspaceTransactionCommitted,
    isRetryableWorkspaceTransactionConflict,
    isWorkspaceRevisionConflict,
} from "@/features/workspace/server/workspace-transaction-conflict";

type BudgetedSchema = ReturnType<typeof getBudgetedSchema>;
type TransactionWrite = BudgetedSchema["service"]["transaction"]["write"];
type TransactionWriteCallback = Parameters<TransactionWrite>[0];
type TransactionEntities = Parameters<TransactionWriteCallback>[0];
type TransactionItems = ReturnType<TransactionWriteCallback>;

const MAX_COMMIT_ATTEMPTS = 5;
const RETRY_DELAYS_MILLISECONDS = [20, 40, 80, 160] as const;

function waitBeforeRetry(attempt: number) {
    const delay = RETRY_DELAYS_MILLISECONDS[attempt] ?? 160;

    return new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
    });
}

export type AtomicWorkspaceMutationInput<TResponse> = {
    buildDomainItems: (
        entities: TransactionEntities,
    ) => TransactionItems;
    changes: WorkspaceMutationChangeInput[];
    domainItemCount: number;
    ledgerId: string;
    maxItemCount?: number;
    mutationId: string;
    mutationType: string;
    operation?: WorkspaceMutationOperation;
    response: TResponse;
};

export type AtomicWorkspaceMutationResult<TResponse> = {
    batch: WorkspaceMutationBatch;
    replayed: boolean;
    response: TResponse;
    workspaceChanges: WorkspaceMutationBatch["changes"];
};

function getWorkspaceInfrastructureItemCount(input: {
    hasWorkspaceState: boolean;
    operation?: WorkspaceMutationOperation;
}) {
    return 3 + (input.hasWorkspaceState ? 1 : 0) + (input.operation ? 1 : 0);
}

function assertAtomicWorkspaceItemCount(input: {
    domainItemCount: number;
    infrastructureItemCount: number;
    maxItemCount: number;
}) {
    const itemCount = input.domainItemCount + input.infrastructureItemCount;

    if (itemCount > input.maxItemCount) {
        throw new Error(
            `Workspace mutation requires ${itemCount} DynamoDB transaction items, exceeding the ${input.maxItemCount}-item limit.`,
        );
    }
}

function createWorkspaceInfrastructureItems(input: {
    batch: WorkspaceMutationBatch;
    entities: TransactionEntities;
    operation?: WorkspaceMutationOperation;
    workspaceState: Awaited<
        ReturnType<typeof prepareWorkspaceStateUpdateBeforeWrite>
    >;
}) {
    return [
        input.entities.workspaceMutationBatches
            .put(toWorkspaceMutationBatchRecord(input.batch))
            .where((attributes, operations) =>
                operations.notExists(attributes.mutationId),
            )
            .commit(),
        input.entities.workspaceMutationReceipts
            .put(toWorkspaceMutationReceiptRecord(input.batch))
            .where((attributes, operations) =>
                operations.notExists(attributes.mutationId),
            )
            .commit(),
        ...(input.workspaceState
            ? [
                  input.entities.workspaceStates
                      .put(toWorkspaceStateRecord(input.workspaceState))
                      .commit(),
              ]
            : []),
        ...(input.operation
            ? [
                  input.entities.workspaceMutationOperations
                      .put(toWorkspaceMutationOperationRecord(input.operation))
                      .commit(),
              ]
            : []),
        input.entities.ledgers
            .update({
                ledgerId: input.batch.ledgerId,
                workspaceId: GLOBAL_WORKSPACE_ID,
            })
            .set({
                workspaceGeneration: input.batch.workspaceGeneration,
                workspaceRevision: input.batch.workspaceRevision,
            })
            .where((attributes, operations) => {
                const generationCondition = operations.eq(
                    attributes.workspaceGeneration,
                    input.batch.expectedWorkspaceGeneration!,
                );
                const revisionCondition =
                    input.batch.expectedWorkspaceRevision === undefined
                        ? operations.notExists(attributes.workspaceRevision)
                        : operations.eq(
                              attributes.workspaceRevision,
                              input.batch.expectedWorkspaceRevision,
                          );

                return `${generationCondition} AND ${revisionCondition}`;
            })
            .commit(),
    ] as TransactionItems;
}

function toAtomicWorkspaceMutationResult<TResponse>(
    batch: WorkspaceMutationBatch,
    replayed: boolean,
) {
    return {
        batch,
        replayed,
        response: batch.response as TResponse,
        workspaceChanges: batch.changes,
    };
}

export async function commitAtomicWorkspaceMutation<TResponse>(
    input: AtomicWorkspaceMutationInput<TResponse>,
): Promise<AtomicWorkspaceMutationResult<TResponse>> {
    const existingBatch = await findWorkspaceMutationBatch({
        ledgerId: input.ledgerId,
        mutationId: input.mutationId,
        mutationType: input.mutationType,
    });

    if (existingBatch) {
        return toAtomicWorkspaceMutationResult<TResponse>(existingBatch, true);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt += 1) {
        const batch = createWorkspaceMutationBatch({
            changes: input.changes,
            ledgerId: input.ledgerId,
            mutationId: input.mutationId,
            mutationType: input.mutationType,
            response: input.response,
            ...(await getNextWorkspaceMutationVersion(input.ledgerId)),
        });
        const workspaceState = await prepareWorkspaceStateUpdateBeforeWrite(batch);
        const infrastructureItemCount = getWorkspaceInfrastructureItemCount({
            hasWorkspaceState: Boolean(workspaceState),
            operation: input.operation,
        });

        assertAtomicWorkspaceItemCount({
            domainItemCount: input.domainItemCount,
            infrastructureItemCount,
            maxItemCount: input.maxItemCount ?? 100,
        });

        try {
            const { service } = getBudgetedSchema();
            const transactionResult = await service.transaction
                .write((entities) => [
                    ...input.buildDomainItems(entities),
                    ...createWorkspaceInfrastructureItems({
                        batch,
                        entities,
                        operation: input.operation,
                        workspaceState,
                    }),
                ])
                .go();
            assertWorkspaceTransactionCommitted(transactionResult);

            return toAtomicWorkspaceMutationResult<TResponse>(batch, false);
        } catch (error) {
            lastError = error;

            const replayBatch = await findWorkspaceMutationBatch({
                ledgerId: input.ledgerId,
                mutationId: input.mutationId,
                mutationType: input.mutationType,
            });

            if (replayBatch) {
                return toAtomicWorkspaceMutationResult<TResponse>(
                    replayBatch,
                    true,
                );
            }

            if (
                !isWorkspaceRevisionConflict(error) &&
                !isRetryableWorkspaceTransactionConflict(error)
            ) {
                throw error;
            }

            if (attempt < MAX_COMMIT_ATTEMPTS - 1) {
                await waitBeforeRetry(attempt);
            }
        }
    }

    throw lastError ?? new Error("Unable to commit atomic workspace mutation.");
}
