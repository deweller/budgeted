import { indexedDbWorkspaceRepository } from "@/lib/workspace/repository";
import type {
    WorkspaceCommitSyncResult,
    WorkspaceKnowledge,
    WorkspaceReplicaSnapshotPayload,
    WorkspaceSyncResult,
    WorkspaceVersionResult,
} from "@/lib/workspace/sync-types";
import { workspaceKnowledgeToVersionResult } from "@/lib/workspace/sync-v2";
import type { WorkspaceSyncControllerPorts } from "@/lib/workspace/workspace-sync-controller";

const MAX_ERROR_RESPONSE_LENGTH = 16_000;
const MAX_WORKSPACE_MUTATION_RETRY_ATTEMPTS = 5;
const WORKSPACE_MUTATION_RETRY_ERROR_CODE = "workspace_mutation_in_progress";
const DEFAULT_WORKSPACE_MUTATION_RETRY_DELAY_MS = 500;
const MAX_WORKSPACE_MUTATION_RETRY_DELAY_MS = 2_000;

type WorkspaceSyncRequestErrorInput = {
    cause?: unknown;
    durationMs: number;
    errorCode?: string;
    endpoint: string;
    requestedAt: string;
    responseBody?: string;
    responseRequestId?: string;
    retryAfterMs?: number;
    status?: number;
    statusText?: string;
};

export class WorkspaceSyncRequestError extends Error {
    readonly cause: unknown;
    readonly durationMs: number;
    readonly errorCode?: string;
    readonly endpoint: string;
    readonly requestedAt: string;
    readonly responseBody?: string;
    readonly responseRequestId?: string;
    readonly retryAfterMs?: number;
    readonly status?: number;
    readonly statusText?: string;

    constructor(input: WorkspaceSyncRequestErrorInput) {
        super(
            input.status
                ? `Workspace sync request failed: ${input.endpoint} returned ${input.status}.`
                : `Workspace sync request failed: ${input.endpoint} could not be reached.`,
        );
        this.name = "WorkspaceSyncRequestError";
        this.cause = input.cause;
        this.durationMs = input.durationMs;
        this.errorCode = input.errorCode;
        this.endpoint = input.endpoint;
        this.requestedAt = input.requestedAt;
        this.responseBody = input.responseBody;
        this.responseRequestId = input.responseRequestId;
        this.retryAfterMs = input.retryAfterMs;
        this.status = input.status;
        this.statusText = input.statusText;
    }
}

function getElapsedMilliseconds(startedAt: number) {
    return Math.round(performance.now() - startedAt);
}

function getResponseRequestId(response: Response) {
    return (
        response.headers.get("x-amzn-requestid") ??
        response.headers.get("x-amzn-trace-id") ??
        response.headers.get("x-request-id") ??
        undefined
    );
}

async function getResponseBody(response: Response) {
    try {
        const body = await response.text();
        return body.length > MAX_ERROR_RESPONSE_LENGTH
            ? `${body.slice(0, MAX_ERROR_RESPONSE_LENGTH)}\n[truncated]`
            : body;
    } catch {
        return undefined;
    }
}

function reportRequestFailure(error: WorkspaceSyncRequestError) {
    if (process.env.NODE_ENV === "test") {
        return;
    }

    console.error("[workspace-sync] Request failed.", {
        cause: error.cause,
        durationMs: error.durationMs,
        endpoint: error.endpoint,
        errorCode: error.errorCode,
        requestedAt: error.requestedAt,
        responseBody: error.responseBody,
        responseRequestId: error.responseRequestId,
        retryAfterMs: error.retryAfterMs,
        status: error.status,
        statusText: error.statusText,
    });
}

function parseErrorResponseDetails(responseBody?: string) {
    if (!responseBody) {
        return {};
    }

    try {
        const body = JSON.parse(responseBody) as {
            error?: { code?: unknown; details?: { retryAfterMs?: unknown } };
        };
        const errorCode =
            typeof body.error?.code === "string" ? body.error.code : undefined;
        const retryAfterMs = body.error?.details?.retryAfterMs;

        return {
            errorCode,
            retryAfterMs:
                typeof retryAfterMs === "number" &&
                Number.isFinite(retryAfterMs) &&
                retryAfterMs >= 0
                    ? retryAfterMs
                    : undefined,
        };
    } catch {
        return {};
    }
}

function getWorkspaceMutationRetryDelay(error: WorkspaceSyncRequestError, attempt: number) {
    const baseDelay =
        error.retryAfterMs ?? DEFAULT_WORKSPACE_MUTATION_RETRY_DELAY_MS;

    return Math.min(
        baseDelay * (attempt + 1),
        MAX_WORKSPACE_MUTATION_RETRY_DELAY_MS,
    );
}

function isRetryableWorkspaceMutationError(error: WorkspaceSyncRequestError) {
    return (
        error.status === 503 &&
        error.errorCode === WORKSPACE_MUTATION_RETRY_ERROR_CODE
    );
}

function wait(milliseconds: number) {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}

async function fetchWorkspaceSyncResponse(endpoint: string) {
    const requestedAt = new Date().toISOString();
    const startedAt = performance.now();

    for (let attempt = 0; attempt < MAX_WORKSPACE_MUTATION_RETRY_ATTEMPTS; attempt += 1) {
        let response: Response;

        try {
            response = await fetch(endpoint);
        } catch (cause) {
            const error = new WorkspaceSyncRequestError({
                cause,
                durationMs: getElapsedMilliseconds(startedAt),
                endpoint,
                requestedAt,
            });
            reportRequestFailure(error);
            throw error;
        }

        if (response.ok) {
            return response;
        }

        const responseBody = await getResponseBody(response);
        const error = new WorkspaceSyncRequestError({
            durationMs: getElapsedMilliseconds(startedAt),
            endpoint,
            requestedAt,
            responseBody,
            responseRequestId: getResponseRequestId(response),
            status: response.status,
            statusText: response.statusText,
            ...parseErrorResponseDetails(responseBody),
        });

        if (
            isRetryableWorkspaceMutationError(error) &&
            attempt < MAX_WORKSPACE_MUTATION_RETRY_ATTEMPTS - 1
        ) {
            await wait(getWorkspaceMutationRetryDelay(error, attempt));
            continue;
        }

        reportRequestFailure(error);
        throw error;
    }

    throw new Error("Workspace retry loop ended unexpectedly.");
}

async function fetchWorkspaceKnowledge(input?: {
    onKnowledgeReceived?: (knowledge: WorkspaceKnowledge) => void;
}) {
    const response = await fetchWorkspaceSyncResponse(
        "/api/workspace/knowledge",
    );

    const knowledge = (await response.json()) as WorkspaceKnowledge;
    input?.onKnowledgeReceived?.(knowledge);
    return knowledge;
}

async function fetchWorkspaceSnapshot() {
    const response = await fetchWorkspaceSyncResponse(
        "/api/workspace/snapshot",
    );

    return (await response.json()) as WorkspaceReplicaSnapshotPayload;
}

async function fetchWorkspaceVersion(input?: {
    onVersionReceived?: (version: WorkspaceVersionResult) => void;
}) {
    const response = await fetchWorkspaceSyncResponse("/api/workspace/version");
    const payload = (await response.json()) as
        | WorkspaceKnowledge
        | WorkspaceVersionResult;
    const version =
        "protocolVersion" in payload
            ? payload
            : workspaceKnowledgeToVersionResult(payload);
    input?.onVersionReceived?.(version);
    return version;
}

async function fetchWorkspaceCommits(after: string) {
    const endpoint = `/api/workspace/changes?${new URLSearchParams({ after }).toString()}`;
    const response = await fetchWorkspaceSyncResponse(endpoint);
    return (await response.json()) as WorkspaceCommitSyncResult;
}

async function fetchWorkspaceChanges(after: string) {
    const endpoint = `/api/workspace/changes?${new URLSearchParams({ after }).toString()}`;
    const response = await fetchWorkspaceSyncResponse(
        endpoint,
    );

    return (await response.json()) as WorkspaceSyncResult;
}

export function createBrowserWorkspaceSyncPorts(
    input: Pick<
        WorkspaceSyncControllerPorts,
        "observeEvent" | "publishKnowledge" | "publishSync"
    > & {
        onKnowledgeReceived?: (knowledge: WorkspaceKnowledge) => void;
        onVersionReceived?: (version: WorkspaceVersionResult) => void;
    },
): WorkspaceSyncControllerPorts {
    return {
        fetchCommits: fetchWorkspaceCommits,
        fetchChanges: fetchWorkspaceChanges,
        fetchKnowledge: () => fetchWorkspaceKnowledge(input),
        fetchSnapshot: fetchWorkspaceSnapshot,
        fetchVersion: () => fetchWorkspaceVersion(input),
        observeEvent: input.observeEvent,
        publishKnowledge: input.publishKnowledge,
        publishSync: input.publishSync,
        repository: indexedDbWorkspaceRepository,
    };
}
