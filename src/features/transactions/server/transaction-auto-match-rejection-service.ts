import {
    createTransactionAutoMatchDecisionId,
    createTransactionAutoMatchFingerprint,
    type TransactionAutoMatchPair,
    type TransactionAutoMatchRejection,
} from "@/features/transactions/models/transaction-auto-match";
import {
    type WorkspaceMutationChangeInput,
} from "@/features/workspace/server/workspace-sync-service";
import { commitAtomicWorkspaceMutation } from "@/features/workspace/server/workspace-atomic-commit";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { calculateWorkspaceRecordDigest } from "@/lib/workspace/revision";

export type TransactionAutoMatchRejectionRecord =
    TransactionAutoMatchRejection & {
        createdAt: string;
        ledgerId: string;
        rejectedAt: string;
        updatedAt: string;
    };

function toWorkspaceUpsertChange(
    record: TransactionAutoMatchRejectionRecord,
    previousRecord: TransactionAutoMatchRejectionRecord | null,
): WorkspaceMutationChangeInput {
    return {
        entityId: record.matchDecisionId,
        entityType: "transactionAutoMatchRejection",
        operation: "upsert",
        previousRecordDigest: previousRecord
            ? calculateWorkspaceRecordDigest({
                  entityType: "transactionAutoMatchRejection",
                  record: previousRecord,
              })
            : null,
        record,
    };
}

function toWorkspaceDeleteChange(
    record: TransactionAutoMatchRejectionRecord,
): WorkspaceMutationChangeInput {
    return {
        entityId: record.matchDecisionId,
        entityType: "transactionAutoMatchRejection",
        operation: "delete",
        previousRecordDigest: calculateWorkspaceRecordDigest({
            entityType: "transactionAutoMatchRejection",
            record,
        }),
        record: null,
    };
}

export async function listTransactionAutoMatchRejections(ledgerId: string) {
    const { entities } = getBudgetedSchema();

    return (await queryAllPages(
        entities.transactionAutoMatchRejections.query.byRejection({ ledgerId }),
        { consistent: true },
    )) as TransactionAutoMatchRejectionRecord[];
}

export async function rejectTransactionAutoMatch(input: {
    ledgerId: string;
    mutationId: string;
    pair: TransactionAutoMatchPair;
}) {
    const { entities } = getBudgetedSchema();
    const now = new Date().toISOString();
    const [leftTransactionId, rightTransactionId] = [
        input.pair.left.transactionId,
        input.pair.right.transactionId,
    ].sort();
    const matchDecisionId = createTransactionAutoMatchDecisionId(
        leftTransactionId,
        rightTransactionId,
    );
    const existing = (await queryAllPages(
        entities.transactionAutoMatchRejections.query
            .byRejection({ ledgerId: input.ledgerId })
            .begins({ matchDecisionId }),
        { consistent: true },
    ))[0] as TransactionAutoMatchRejectionRecord | undefined;
    const record: TransactionAutoMatchRejectionRecord = {
        accountId: input.pair.account.accountId,
        createdAt: existing?.createdAt ?? now,
        ledgerId: input.ledgerId,
        leftTransactionId,
        matchDecisionId,
        matchFingerprint: createTransactionAutoMatchFingerprint(input.pair),
        rejectedAt: now,
        rightTransactionId,
        updatedAt: now,
    };

    return persistTransactionAutoMatchDecision({
        change: toWorkspaceUpsertChange(record, existing ?? null),
        ledgerId: input.ledgerId,
        mutationId: input.mutationId,
        mutationType: "transaction.autoMatch.reject",
        operation: "upsert",
        record,
    });
}

export async function restoreTransactionAutoMatchRejection(input: {
    ledgerId: string;
    matchDecisionId: string;
    mutationId: string;
}) {
    const { entities } = getBudgetedSchema();
    const records = await queryAllPages(
        entities.transactionAutoMatchRejections.query
            .byRejection({ ledgerId: input.ledgerId })
            .begins({ matchDecisionId: input.matchDecisionId }),
        { consistent: true },
    );
    const record = records[0] as TransactionAutoMatchRejectionRecord | undefined;

    if (!record || record.matchDecisionId !== input.matchDecisionId) {
        return { workspaceChanges: [] };
    }

    return persistTransactionAutoMatchDecision({
        change: toWorkspaceDeleteChange(record),
        ledgerId: input.ledgerId,
        mutationId: input.mutationId,
        mutationType: "transaction.autoMatch.restore",
        operation: "delete",
    });
}

async function persistTransactionAutoMatchDecision(input: {
    change: WorkspaceMutationChangeInput;
    ledgerId: string;
    mutationId: string;
    mutationType: string;
    operation: "delete" | "upsert";
    record?: TransactionAutoMatchRejectionRecord;
}) {
    const result = await commitAtomicWorkspaceMutation({
        buildDomainItems: (entities) => [
            input.operation === "upsert"
                ? entities.transactionAutoMatchRejections
                      .put(input.record!)
                      .commit()
                : entities.transactionAutoMatchRejections
                      .delete({
                          ledgerId: input.ledgerId,
                          matchDecisionId: input.change.entityId,
                      })
                      .commit(),
        ],
        changes: [input.change],
        domainItemCount: 1,
        ledgerId: input.ledgerId,
        mutationId: input.mutationId,
        mutationType: input.mutationType,
        response: input.record ? { record: input.record } : {},
    });
    const record = (
        result.response as { record?: TransactionAutoMatchRejectionRecord }
    ).record;

    return { record, workspaceChanges: result.workspaceChanges };
}

export async function removeTransactionAutoMatchRejectionsForTransactions(input: {
    ledgerId: string;
    transactionIds: readonly string[];
}) {
    const transactionIds = new Set(input.transactionIds);
    const records = (await listTransactionAutoMatchRejections(input.ledgerId)).filter(
        (record) =>
            transactionIds.has(record.leftTransactionId) ||
            transactionIds.has(record.rightTransactionId),
    );
    const { entities } = getBudgetedSchema();

    await Promise.all(
        records.map((record) =>
            entities.transactionAutoMatchRejections
                .delete({
                    ledgerId: input.ledgerId,
                    matchDecisionId: record.matchDecisionId,
                })
                .go(),
        ),
    );

    return {
        records,
        workspaceChanges: records.map((record) =>
            toWorkspaceDeleteChange(record),
        ),
    };
}

export async function restoreTransactionAutoMatchRejections(
    records: readonly TransactionAutoMatchRejectionRecord[],
) {
    if (records.length === 0) {
        return;
    }

    const { entities } = getBudgetedSchema();
    await Promise.all(
        records.map((record) =>
            entities.transactionAutoMatchRejections.put(record).go(),
        ),
    );
}
