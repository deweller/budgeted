import {
    createWorkspaceDeleteChange,
    createWorkspaceUpsertChange,
} from "@/features/workspace/server/workspace-change-builder";
import type { WorkspaceMutationChangeInput } from "@/features/workspace/server/workspace-sync-service";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";
import { stableStringify } from "@/lib/workspace/revision";
import type { WorkspaceTransactionImportActivityRecord } from "@/lib/workspace/sync-types";

function recordsEqual(
    left: WorkspaceTransactionImportActivityRecord,
    right: WorkspaceTransactionImportActivityRecord,
) {
    return stableStringify(left) === stableStringify(right);
}

export async function getTransactionImportActivity(input: {
    activityId: string;
    ledgerId: string;
}) {
    const result = await getBudgetedSchema().entities.transactionImportActivities
        .get(input)
        .go({ consistent: true });

    return result.data as WorkspaceTransactionImportActivityRecord | null;
}

export async function listTransactionImportActivities(ledgerId: string) {
    return queryAllPages(
        getBudgetedSchema().entities.transactionImportActivities.query.byActivity({
            ledgerId,
        }),
        { consistent: true },
    ) as Promise<WorkspaceTransactionImportActivityRecord[]>;
}

export async function listTransactionImportActivitiesForTransaction(input: {
    ledgerId: string;
    transactionId: string;
}) {
    return (await listTransactionImportActivities(input.ledgerId)).filter(
        (activity) => activity.linkedTransactionId === input.transactionId,
    );
}

function protectImmutableFinancialDetails(input: {
    existing: WorkspaceTransactionImportActivityRecord | null;
    next: WorkspaceTransactionImportActivityRecord;
}) {
    if (
        !input.existing ||
        input.existing.financialFingerprint === input.next.financialFingerprint
    ) {
        return input.next;
    }

    return {
        ...input.existing,
        processingError:
            "The importer supplied changed financial details for an existing provider record. Review the source before retrying.",
        state: "needsReview" as const,
        updatedAt: input.next.updatedAt,
    };
}

export async function synchronizeTransactionImportActivity(
    activity: WorkspaceTransactionImportActivityRecord,
): Promise<{
    activity: WorkspaceTransactionImportActivityRecord;
    workspaceChanges: WorkspaceMutationChangeInput[];
}> {
    const existing = await getTransactionImportActivity({
        activityId: activity.activityId,
        ledgerId: activity.ledgerId,
    });
    const next = protectImmutableFinancialDetails({ existing, next: activity });

    if (existing && recordsEqual(existing, next)) {
        return { activity: existing, workspaceChanges: [] };
    }

    await getBudgetedSchema().entities.transactionImportActivities.put(next).go();

    return {
        activity: next,
        workspaceChanges: [
            createWorkspaceUpsertChange({
                entityId: next.activityId,
                entityType: "transactionImportActivity",
                previousRecord: existing,
                record: next,
            }),
        ],
    };
}

export async function synchronizeTransactionImportActivities(
    activities: readonly WorkspaceTransactionImportActivityRecord[],
) {
    const results = await Promise.all(
        activities.map(synchronizeTransactionImportActivity),
    );

    return {
        activities: results.map((result) => result.activity),
        workspaceChanges: results.flatMap((result) => result.workspaceChanges),
    };
}

export async function deleteTransactionImportActivity(input: {
    activityId: string;
    ledgerId: string;
}) {
    const existing = await getTransactionImportActivity(input);

    if (!existing) {
        return { workspaceChanges: [] as WorkspaceMutationChangeInput[] };
    }

    await getBudgetedSchema().entities.transactionImportActivities
        .delete(input)
        .go();

    return {
        workspaceChanges: [
            createWorkspaceDeleteChange({
                entityId: existing.activityId,
                entityType: "transactionImportActivity",
                previousRecord: existing,
            }),
        ],
    };
}

export function createRelinkedTransactionImportActivities(input: {
    activities: readonly WorkspaceTransactionImportActivityRecord[];
    now: string;
    transactionId: string;
}) {
    return input.activities.map((activity) => ({
        previous: activity,
        record: {
            ...activity,
            linkedTransactionId: input.transactionId,
            state:
                activity.state === "unmatched" ||
                activity.state === "conflict" ||
                activity.state === "provisional"
                    ? "autoMatched" as const
                    : activity.state,
            updatedAt: input.now,
        },
    }));
}

export function createReopenedTransactionImportActivities(input: {
    activities: readonly WorkspaceTransactionImportActivityRecord[];
    now: string;
}) {
    return input.activities.map((activity) => ({
        previous: activity,
        record: {
            ...activity,
            candidateTransactionIdsJson: undefined,
            linkedTransactionId: undefined,
            processingError:
                "The linked transaction was deleted. Review this imported activity before matching it again.",
            state: "needsReview" as const,
            updatedAt: input.now,
        },
    }));
}
