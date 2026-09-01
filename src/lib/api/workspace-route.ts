import { NextResponse } from "next/server";

import {
    beginWorkspaceExplicitMutation,
    buildCommittedWorkspaceKnowledge,
    completeWorkspaceExplicitMutation,
    partitionWorkspaceChangesForPersistence,
    persistWorkspaceChanges,
    recoverWorkspaceExplicitMutation,
    trackWorkspaceMutation,
    type WorkspaceMutationChangeInput,
} from "@/features/workspace/server/workspace-sync-service";
import { toErrorResponse } from "@/lib/api/errors";
import { requireCurrentUserAccount } from "@/lib/auth/current-user";
import { createWorkspaceSyncEnvelope } from "@/lib/workspace/sync-v2";

type CurrentWorkspaceRouteUser = Awaited<
    ReturnType<typeof requireCurrentUserAccount>
>;

export type WorkspaceRouteContext = {
    ledgerId: string;
    user: CurrentWorkspaceRouteUser;
};

function toDomainMutationPayload<T extends object>(
    result: T & { workspaceChanges: WorkspaceMutationChangeInput[] },
) {
    const payload = { ...result } as T & {
        workspaceChanges?: WorkspaceMutationChangeInput[];
    };
    delete payload.workspaceChanges;
    return payload as T;
}

export async function handleWorkspaceRoute(
    handler: (context: WorkspaceRouteContext) => Promise<Response>,
) {
    try {
        const user = await requireCurrentUserAccount();

        return await handler({
            ledgerId: user.activeLedgerId,
            user,
        });
    } catch (error) {
        return toErrorResponse(error);
    }
}

export async function workspaceTrackedMutationJson<T>(
    context: WorkspaceRouteContext,
    mutate: () => Promise<T>,
    init?: ResponseInit,
) {
    const mutation = await trackWorkspaceMutation(context.user, mutate);

    return NextResponse.json(
        {
            ...(mutation.result as object),
            workspaceSync: createWorkspaceSyncEnvelope({
                changes: mutation.changes ?? [],
                knowledge: mutation.knowledge,
            }),
        },
        init,
    );
}

export async function workspaceTrackedMutationNoContent(
    context: WorkspaceRouteContext,
    mutate: () => Promise<unknown>,
) {
    const mutation = await trackWorkspaceMutation(context.user, mutate);

    return NextResponse.json(
        {
            workspaceSync: createWorkspaceSyncEnvelope({
                changes: mutation.changes ?? [],
                knowledge: mutation.knowledge,
            }),
        },
        { status: 200 },
    );
}

export async function workspacePublishedMutationJson<T extends object>(
    context: WorkspaceRouteContext,
    mutate: () => Promise<T & { workspaceChanges: WorkspaceMutationChangeInput[] }>,
    init?: ResponseInit,
) {
    const fenceToken = await beginWorkspaceExplicitMutation(context.ledgerId);
    let fenceActive = true;

    try {
        const result = await mutate();
        const workspaceChanges = await persistWorkspaceChanges({
            activeLedgerId: context.ledgerId,
            changes: result.workspaceChanges,
        });
        const workspaceKnowledge = await buildCommittedWorkspaceKnowledge(
            context.user,
        );
        await completeWorkspaceExplicitMutation({
            ledgerId: context.ledgerId,
            token: fenceToken,
        });
        fenceActive = false;

        const responsePayload = toDomainMutationPayload(result);

        return NextResponse.json(
            {
                ...responsePayload,
                workspaceSync: createWorkspaceSyncEnvelope({
                    changes: workspaceChanges,
                    knowledge: workspaceKnowledge,
                }),
            },
            init,
        );
    } catch (error) {
        if (fenceActive) {
            await recoverWorkspaceExplicitMutation({
                ledgerId: context.ledgerId,
                token: fenceToken,
            }).catch(() => undefined);
        }
        throw error;
    }
}

export async function workspaceCommittedMutationJson<T extends object>(
    context: WorkspaceRouteContext,
    mutate: () => Promise<T & { workspaceChanges: WorkspaceMutationChangeInput[] }>,
    init?: ResponseInit,
) {
    const result = await mutate();
    const { persistedChanges, unpublishedChanges } =
        partitionWorkspaceChangesForPersistence(result.workspaceChanges);

    if (unpublishedChanges.length > 0) {
        throw new Error(
            "The mutation returned workspace changes without a durable revision.",
        );
    }

    const workspaceKnowledge = await buildCommittedWorkspaceKnowledge(
        context.user,
    );
    const responsePayload = toDomainMutationPayload(result);

    return NextResponse.json(
        {
            ...responsePayload,
            workspaceSync: createWorkspaceSyncEnvelope({
                changes: persistedChanges,
                knowledge: workspaceKnowledge,
            }),
        },
        init,
    );
}

export async function workspaceReadJson<T>(
    read: (context: WorkspaceRouteContext) => Promise<T>,
    init?: ResponseInit,
) {
    return handleWorkspaceRoute(async (context) =>
        NextResponse.json(await read(context), init),
    );
}
