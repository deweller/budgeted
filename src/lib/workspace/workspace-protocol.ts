import { parseWorkspaceCursor } from "@/lib/workspace/cursor";
import { WORKSPACE_ENTITY_TYPES } from "@/lib/workspace/entity-config";
import {
    hasCompleteWorkspaceBatchManifest,
    type WorkspaceChange,
    type WorkspaceEntityCounts,
    type WorkspaceKnowledge,
    type WorkspaceSnapshot,
    type WorkspaceSyncResult,
} from "@/lib/workspace/sync-types";

export type WorkspaceTransactionQuery = {
    accountId?: string;
    accountIds?: string[];
    periodIds?: string[];
    periodThrough?: string;
    source?: "manual" | "plaid" | "venmo";
    status?: WorkspaceSnapshot["transactions"][number]["status"];
    transactionId?: string;
    uncategorizedOnly?: boolean;
};

export function isTransactionFamilyFullyHydrated(
    input: Pick<WorkspaceSnapshot, "transactionHydration">,
) {
    return input.transactionHydration !== "configuration";
}

export function getWorkspaceGeneration(
    knowledge: Pick<WorkspaceKnowledge, "workspaceGeneration">,
) {
    return knowledge.workspaceGeneration ?? 1;
}

export function compareWorkspaceKnowledgeRevision(
    current: Pick<
        WorkspaceKnowledge,
        "workspaceGeneration" | "workspaceRevision"
    >,
    candidate: Pick<
        WorkspaceKnowledge,
        "workspaceGeneration" | "workspaceRevision"
    >,
) {
    const currentGeneration = getWorkspaceGeneration(current);
    const candidateGeneration = getWorkspaceGeneration(candidate);

    if (currentGeneration !== candidateGeneration) {
        return candidateGeneration < currentGeneration ? -1 : 1;
    }

    const currentRevision = current.workspaceRevision ?? -1;
    const candidateRevision = candidate.workspaceRevision ?? -1;

    if (candidateRevision !== currentRevision) {
        return candidateRevision < currentRevision ? -1 : 1;
    }

    return 0;
}

export function isWorkspaceKnowledgeNewer(
    candidate: Pick<
        WorkspaceKnowledge,
        "changeCursor" | "workspaceGeneration" | "workspaceRevision"
    >,
    current: Pick<
        WorkspaceKnowledge,
        "changeCursor" | "workspaceGeneration" | "workspaceRevision"
    >,
) {
    const candidateGeneration = getWorkspaceGeneration(candidate);
    const currentGeneration = getWorkspaceGeneration(current);

    if (candidateGeneration !== currentGeneration) {
        return candidateGeneration > currentGeneration;
    }

    if (
        candidate.workspaceRevision !== undefined &&
        current.workspaceRevision !== undefined
    ) {
        return candidate.workspaceRevision > current.workspaceRevision;
    }

    return candidate.changeCursor.localeCompare(current.changeCursor) > 0;
}

export function areWorkspaceEntityCountsEqual(
    left: WorkspaceEntityCounts,
    right: WorkspaceEntityCounts,
) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
        const entityType = key as keyof WorkspaceEntityCounts;

        if ((left[entityType] ?? 0) !== (right[entityType] ?? 0)) {
            return false;
        }
    }

    return true;
}

export function areWorkspaceEntityDigestsEqual(
    left: WorkspaceKnowledge["entityDigests"],
    right: WorkspaceKnowledge["entityDigests"],
) {
    if (!left || !right) {
        return false;
    }

    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
        const entityType = key as keyof typeof left;

        if (left[entityType] !== right[entityType]) {
            return false;
        }
    }

    return true;
}

export function areWorkspaceEntityRevisionsEqual(
    left: WorkspaceKnowledge["entityRevisions"],
    right: WorkspaceKnowledge["entityRevisions"],
) {
    if (!left && !right) {
        return true;
    }

    if (!left || !right) {
        return false;
    }

    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
        const entityType = key as keyof typeof left;

        if (left[entityType] !== right[entityType]) {
            return false;
        }
    }

    return true;
}

export function hasCompleteWorkspaceKnowledgeProof(
    knowledge: Pick<
        WorkspaceKnowledge,
        "entityCounts" | "entityDigests" | "entityRevisions"
    >,
) {
    return WORKSPACE_ENTITY_TYPES.every(
        (entityType) =>
            Number.isSafeInteger(knowledge.entityCounts[entityType]) &&
            (knowledge.entityCounts[entityType] ?? -1) >= 0 &&
            typeof knowledge.entityDigests?.[entityType] === "string" &&
            knowledge.entityDigests[entityType]!.length > 0 &&
            typeof knowledge.entityRevisions?.[entityType] === "string" &&
            knowledge.entityRevisions[entityType]!.length > 0,
    );
}

export function isRevisionedWorkspaceKnowledge(
    knowledge: Pick<
        WorkspaceKnowledge,
        "changeCursor" | "workspaceGeneration" | "workspaceRevision"
    >,
) {
    return (
        parseWorkspaceCursor(knowledge.changeCursor) !== null ||
        (knowledge.workspaceGeneration !== undefined &&
            knowledge.workspaceRevision !== undefined)
    );
}

export function isWorkspaceKnowledgeEquivalent(
    left: WorkspaceKnowledge,
    right: WorkspaceKnowledge,
) {
    const requiresCompleteProof =
        isRevisionedWorkspaceKnowledge(left) ||
        isRevisionedWorkspaceKnowledge(right);

    return (
        left.activeLedgerId === right.activeLedgerId &&
        left.changeCursor === right.changeCursor &&
        getWorkspaceGeneration(left) === getWorkspaceGeneration(right) &&
        left.workspaceRevision === right.workspaceRevision &&
        areWorkspaceEntityCountsEqual(left.entityCounts, right.entityCounts) &&
        areWorkspaceEntityRevisionsEqual(
            left.entityRevisions,
            right.entityRevisions,
        ) &&
        areWorkspaceEntityDigestsEqual(left.entityDigests, right.entityDigests) &&
        (!requiresCompleteProof ||
            (hasCompleteWorkspaceKnowledgeProof(left) &&
                hasCompleteWorkspaceKnowledgeProof(right)))
    );
}

export function hasEquivalentAuthoritativeWorkspaceKnowledge(
    left: WorkspaceKnowledge,
    right: WorkspaceKnowledge,
) {
    return (
        left.activeLedgerId === right.activeLedgerId &&
        left.changeCursor === right.changeCursor &&
        left.workspaceGeneration === right.workspaceGeneration &&
        left.workspaceRevision === right.workspaceRevision &&
        left.oldestRetainedWorkspaceRevision ===
            right.oldestRetainedWorkspaceRevision &&
        left.retainedChangesAfter === right.retainedChangesAfter &&
        WORKSPACE_ENTITY_TYPES.every(
            (entityType) =>
                left.entityCounts[entityType] ===
                    right.entityCounts[entityType] &&
                left.entityDigests?.[entityType] ===
                    right.entityDigests?.[entityType] &&
                left.entityRevisions?.[entityType] ===
                    right.entityRevisions?.[entityType],
        )
    );
}

export function isValidAuthoritativeWorkspaceKnowledge(
    knowledge: WorkspaceKnowledge,
    ledgerId: string,
) {
    const cursor = parseWorkspaceCursor(knowledge.changeCursor);

    return Boolean(
        knowledge.activeLedgerId === ledgerId &&
            cursor &&
            knowledge.workspaceGeneration === cursor.generation &&
            knowledge.workspaceRevision === cursor.revision &&
            Number.isSafeInteger(knowledge.oldestRetainedWorkspaceRevision) &&
            knowledge.oldestRetainedWorkspaceRevision! >= 0 &&
            knowledge.oldestRetainedWorkspaceRevision! <=
                knowledge.workspaceRevision &&
            Object.values(knowledge.entityDigests ?? {}).every(
                (digest) => typeof digest === "string" && digest.length > 0,
            ) &&
            hasCompleteWorkspaceKnowledgeProof(knowledge),
    );
}

function isChangeAfterKnowledge(
    change: WorkspaceChange,
    knowledge: WorkspaceKnowledge,
) {
    if (knowledge.workspaceRevision === undefined) {
        return change.changeId.localeCompare(knowledge.changeCursor) > 0;
    }

    return (
        change.workspaceGeneration === knowledge.workspaceGeneration &&
        change.workspaceRevision !== undefined &&
        change.workspaceRevision > knowledge.workspaceRevision
    );
}

export function compareWorkspaceChangesInCommitOrder(
    left: WorkspaceChange,
    right: WorkspaceChange,
) {
    if (
        left.workspaceGeneration !== undefined &&
        left.workspaceRevision !== undefined &&
        right.workspaceGeneration !== undefined &&
        right.workspaceRevision !== undefined
    ) {
        if (left.workspaceGeneration !== right.workspaceGeneration) {
            return left.workspaceGeneration - right.workspaceGeneration;
        }

        if (left.workspaceRevision !== right.workspaceRevision) {
            return left.workspaceRevision - right.workspaceRevision;
        }

        return (left.changeIndex ?? 0) - (right.changeIndex ?? 0);
    }

    return left.changeId.localeCompare(right.changeId);
}

export function getContiguousCommittedWorkspaceChanges(input: {
    changes: WorkspaceChange[];
    knowledge: WorkspaceKnowledge;
}) {
    const newerChanges = input.changes.filter((change) =>
        isChangeAfterKnowledge(change, input.knowledge),
    );

    if (input.knowledge.workspaceRevision === undefined) {
        return { changes: newerChanges, requiresReconciliation: false };
    }

    if (newerChanges.length === 0) {
        return { changes: [], requiresReconciliation: false };
    }

    if (
        newerChanges.some(
            (change) =>
                change.workspaceGeneration !==
                    input.knowledge.workspaceGeneration ||
                change.workspaceRevision === undefined,
        )
    ) {
        return { changes: [], requiresReconciliation: true };
    }

    const changesByRevision = groupChangesByRevision(newerChanges);
    let expectedRevision = input.knowledge.workspaceRevision + 1;

    for (const [revision, changes] of changesByRevision) {
        if (
            revision !== expectedRevision ||
            !hasCompleteWorkspaceBatchManifest(changes)
        ) {
            return { changes: [], requiresReconciliation: true };
        }

        expectedRevision += 1;
    }

    return {
        changes: changesByRevision.flatMap(([, changes]) =>
            [...changes].sort(compareWorkspaceChangesInCommitOrder),
        ),
        requiresReconciliation: false,
    };
}

function groupChangesByRevision(changes: readonly WorkspaceChange[]) {
    const changesByRevision = new Map<number, WorkspaceChange[]>();

    for (const change of changes) {
        const revision = change.workspaceRevision!;
        const revisionChanges = changesByRevision.get(revision) ?? [];
        revisionChanges.push(change);
        changesByRevision.set(revision, revisionChanges);
    }

    return Array.from(changesByRevision.entries()).sort(
        ([left], [right]) => left - right,
    );
}

export function hasContiguousIncrementalWorkspaceRevisions(input: {
    changes: WorkspaceChange[];
    current: WorkspaceKnowledge;
    next: WorkspaceKnowledge;
}) {
    const currentGeneration = input.current.workspaceGeneration;
    const currentRevision = input.current.workspaceRevision;
    const nextRevision = input.next.workspaceRevision;

    if (
        currentGeneration === undefined ||
        currentRevision === undefined ||
        nextRevision === undefined ||
        input.next.workspaceGeneration !== currentGeneration
    ) {
        return false;
    }

    for (const change of input.changes) {
        if (
            change.workspaceGeneration !== currentGeneration ||
            change.workspaceRevision === undefined ||
            change.workspaceRevision <= currentRevision ||
            change.workspaceRevision > nextRevision
        ) {
            return false;
        }
    }

    let expectedRevision = currentRevision + 1;

    for (const [revision, changes] of groupChangesByRevision(input.changes)) {
        if (
            revision !== expectedRevision ||
            !hasCompleteWorkspaceBatchManifest(changes)
        ) {
            return false;
        }

        expectedRevision += 1;
    }

    return expectedRevision === nextRevision + 1;
}

export function isWorkspaceDeltaContiguous(input: {
    after: string;
    delta: WorkspaceSyncResult;
}) {
    if (input.delta.requiresSnapshot || input.delta.fromCursor !== input.after) {
        return false;
    }

    if (input.delta.toCursor !== input.delta.knowledge.changeCursor) {
        return false;
    }

    const afterCursor = parseWorkspaceCursor(input.after);

    if (afterCursor && input.delta.knowledge.workspaceRevision !== undefined) {
        const current = {
            ...input.delta.knowledge,
            changeCursor: input.after,
            workspaceGeneration: afterCursor.generation,
            workspaceRevision: afterCursor.revision,
        };

        return hasContiguousIncrementalWorkspaceRevisions({
            changes: input.delta.changes,
            current,
            next: input.delta.knowledge,
        });
    }

    let previous = input.after;

    for (const change of input.delta.changes) {
        if (change.changeId.localeCompare(previous) <= 0) {
            return false;
        }

        previous = change.changeId;
    }

    return true;
}

export function hasContiguousWorkspaceRevisions(input: {
    afterRevision: number;
    batches: Array<{
        workspaceGeneration: number;
        workspaceRevision: number;
    }>;
    workspaceGeneration: number;
    workspaceRevision: number;
}) {
    const revisions = input.batches
        .filter(
            (batch) =>
                batch.workspaceGeneration === input.workspaceGeneration &&
                batch.workspaceRevision > input.afterRevision &&
                batch.workspaceRevision <= input.workspaceRevision,
        )
        .map((batch) => batch.workspaceRevision)
        .sort((left, right) => left - right);
    let expectedRevision = input.afterRevision + 1;

    for (const revision of revisions) {
        if (revision !== expectedRevision) {
            return false;
        }

        expectedRevision += 1;
    }

    return expectedRevision === input.workspaceRevision + 1;
}

function isValidPeriodId(value: string | undefined): value is string {
    return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

export function normalizeWorkspaceTransactionQuery(
    query: WorkspaceTransactionQuery = {},
): WorkspaceTransactionQuery {
    const periodThrough = isValidPeriodId(query.periodThrough)
        ? query.periodThrough
        : undefined;
    const periodIds = [
        ...new Set((query.periodIds ?? []).filter(isValidPeriodId)),
    ]
        .filter((periodId) => !periodThrough || periodId <= periodThrough)
        .sort();
    const accountIds = [
        ...new Set(
            (query.accountIds ?? [])
                .map((accountId) => accountId.trim())
                .filter(Boolean),
        ),
    ].sort();

    return {
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(!query.accountId && accountIds.length ? { accountIds } : {}),
        ...(periodIds.length ? { periodIds } : {}),
        ...(periodThrough ? { periodThrough } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.transactionId ? { transactionId: query.transactionId } : {}),
        ...(query.uncategorizedOnly ? { uncategorizedOnly: true } : {}),
    };
}

export function getWorkspaceTransactionQueryKey(
    query: WorkspaceTransactionQuery = {},
) {
    return JSON.stringify(normalizeWorkspaceTransactionQuery(query));
}

export function transactionMatchesWorkspaceQuery(
    transaction: WorkspaceSnapshot["transactions"][number],
    query: WorkspaceTransactionQuery,
) {
    if (query.transactionId && transaction.transactionId !== query.transactionId) {
        return false;
    }

    if (query.accountId || query.accountIds?.length) {
        const accountIds = new Set([
            transaction.referenceAccountId,
            ...transaction.lines.flatMap((line) =>
                [line.fromAccountId, line.toAccountId].filter(
                    (accountId): accountId is string => Boolean(accountId),
                ),
            ),
        ]);

        const queriedAccountIds = query.accountId
            ? [query.accountId]
            : query.accountIds ?? [];

        if (!queriedAccountIds.some((accountId) => accountIds.has(accountId))) {
            return false;
        }
    }

    if (
        query.periodIds?.length &&
        !query.periodIds.includes(transaction.periodId)
    ) {
        return false;
    }

    if (query.periodThrough && transaction.periodId > query.periodThrough) {
        return false;
    }

    if (query.source && transaction.source !== query.source) {
        return false;
    }

    if (query.status && transaction.status !== query.status) {
        return false;
    }

    if (query.uncategorizedOnly) {
        return (
            transaction.kind === "standard" &&
            transaction.lines.some(
                (line) =>
                    Boolean(line.fromAccountId) !== Boolean(line.toAccountId) &&
                    !line.categoryId,
            )
        );
    }

    return true;
}
