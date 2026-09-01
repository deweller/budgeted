type TransactionCancellationReason = {
    code?: unknown;
    Code?: unknown;
    message?: unknown;
    Message?: unknown;
    rejected?: unknown;
};

export type NormalizedTransactionCancellationReason = {
    code: string;
    message?: string;
    rejected: boolean;
};

export class WorkspaceTransactionCanceledError extends Error {
    readonly cancellationReasons: NormalizedTransactionCancellationReason[];
    readonly hasRevisionFence: boolean;

    constructor(
        cancellationReasons: NormalizedTransactionCancellationReason[],
        options: { hasRevisionFence?: boolean } = {},
    ) {
        const rejectedReasons = cancellationReasons
            .filter((reason) => reason.rejected)
            .map((reason) => reason.code)
            .join(", ");

        super(
            rejectedReasons
                ? `DynamoDB workspace transaction was canceled: ${rejectedReasons}.`
                : "DynamoDB workspace transaction was canceled.",
        );
        this.name = "WorkspaceTransactionCanceledError";
        this.cancellationReasons = cancellationReasons;
        this.hasRevisionFence = options.hasRevisionFence !== false;
    }
}

export class WorkspaceRevisionConflictError extends WorkspaceTransactionCanceledError {
    constructor(cancellationReasons: NormalizedTransactionCancellationReason[]) {
        super(cancellationReasons);
        this.name = "WorkspaceRevisionConflictError";
    }
}

function normalizeCancellationReasons(reasons: readonly unknown[]) {
    return reasons.map((reason) => {
        const record =
            reason && typeof reason === "object"
                ? (reason as TransactionCancellationReason)
                : {};
        const code =
            typeof record.code === "string"
                ? record.code
                : typeof record.Code === "string"
                  ? record.Code
                  : "None";
        const message =
            typeof record.message === "string"
                ? record.message
                : typeof record.Message === "string"
                  ? record.Message
                  : undefined;

        return {
            code,
            message,
            rejected:
                typeof record.rejected === "boolean"
                    ? record.rejected
                    : code !== "None",
        };
    });
}

function readCancellationReasons(value: unknown) {
    if (!value || typeof value !== "object") {
        return null;
    }

    const record = value as Record<string, unknown>;
    const reasons =
        record.cancellationReasons ??
        record.CancellationReasons ??
        (record.canceled === true ? record.data : undefined);

    if (!Array.isArray(reasons)) {
        return null;
    }

    return normalizeCancellationReasons(reasons);
}

function findCancellationReasons(error: unknown) {
    let current: unknown = error;
    const visited = new Set<unknown>();

    while (current && typeof current === "object" && !visited.has(current)) {
        visited.add(current);

        const reasons = readCancellationReasons(current);
        if (reasons) {
            return reasons;
        }

        current = (current as { cause?: unknown }).cause;
    }

    return null;
}

function isRevisionFenceFailure(
    reasons: readonly NormalizedTransactionCancellationReason[],
) {
    if (reasons.length === 0) {
        return false;
    }

    const revisionFenceIndex = reasons.length - 1;

    return reasons.every((reason, index) =>
        index === revisionFenceIndex
            ? reason.rejected && reason.code === "ConditionalCheckFailed"
            : !reason.rejected && reason.code === "None",
    );
}

function isTransactionConflict(
    reasons: readonly NormalizedTransactionCancellationReason[],
) {
    return (
        reasons.some(
            (reason) => reason.rejected && reason.code === "TransactionConflict",
        ) &&
        reasons.every(
            (reason) =>
                (!reason.rejected && reason.code === "None") ||
                (reason.rejected && reason.code === "TransactionConflict"),
        )
    );
}

export function assertWorkspaceTransactionCommitted(
    result: unknown,
    options: { hasRevisionFence?: boolean } = {},
) {
    if (
        !result ||
        typeof result !== "object" ||
        (result as { canceled?: unknown }).canceled !== true
    ) {
        return;
    }

    const reasons = readCancellationReasons(result) ?? [];

    if (
        options.hasRevisionFence !== false &&
        isRevisionFenceFailure(reasons)
    ) {
        throw new WorkspaceRevisionConflictError(reasons);
    }

    throw new WorkspaceTransactionCanceledError(reasons, options);
}

export function isWorkspaceRevisionConflict(error: unknown) {
    if (error instanceof WorkspaceRevisionConflictError) {
        return true;
    }
    if (
        error instanceof WorkspaceTransactionCanceledError &&
        !error.hasRevisionFence
    ) {
        return false;
    }

    const reasons = findCancellationReasons(error);

    return reasons ? isRevisionFenceFailure(reasons) : false;
}

export function isRetryableWorkspaceTransactionConflict(error: unknown) {
    if (error instanceof WorkspaceTransactionCanceledError) {
        return error.hasRevisionFence && isTransactionConflict(error.cancellationReasons);
    }

    const reasons = findCancellationReasons(error);

    return reasons ? isTransactionConflict(reasons) : false;
}
