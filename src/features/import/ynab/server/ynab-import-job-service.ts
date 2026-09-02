import { ulid } from "ulid";

import type {
    CreateYnabImportUploadInput,
    PreviewYnabImportInput,
    YnabImportJobPublic,
    YnabImportJobStatus,
} from "@/features/import/ynab/models/ynab-import-job";
import type {
    YnabAccountMapping,
    YnabImportSummary,
} from "@/features/import/ynab/planner";
import {
    createYnabImportUploadTargets,
    type YnabImportSourceFile,
} from "@/features/import/ynab/server/ynab-import-artifact-service";
import { assertLedgerNameIsAvailable } from "@/features/ledgers/server/ledger-service";
import { HttpError } from "@/lib/api/errors";
import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

const JOB_TTL_SECONDS = 2 * 24 * 60 * 60;
const WORKER_LEASE_SECONDS = 16 * 60;
const activeStatuses = new Set<YnabImportJobStatus>([
    "analyzing",
    "importing",
    "ready",
    "uploading",
]);

export type YnabImportWorkerAction = "analyze" | "cleanup" | "import";

export type YnabImportJobRecord = {
    accountMappingsJson?: string;
    completedAt?: string;
    createdAt: string;
    endMonth?: string;
    error?: string;
    expiresAt: number;
    filesJson: string;
    jobId: string;
    lastAction?: YnabImportWorkerAction;
    leaseExpiresAt?: number;
    ledgerName?: string;
    previewRevision: number;
    recordCount?: number;
    status: YnabImportJobStatus;
    summaryJson?: string;
    targetLedgerId: string;
    updatedAt: string;
    userId: string;
    workspaceId: string;
};

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function withWorkerLease(record: YnabImportJobRecord) {
    return {
        ...record,
        leaseExpiresAt: nowSeconds() + WORKER_LEASE_SECONDS,
    };
}

function parseJson<T>(value: string | undefined, fallback: T): T {
    if (!value) {
        return fallback;
    }

    return JSON.parse(value) as T;
}

export function getYnabImportSourceFiles(record: YnabImportJobRecord) {
    return parseJson<YnabImportSourceFile[]>(record.filesJson, []);
}

export function getYnabImportAccountMappings(record: YnabImportJobRecord) {
    return parseJson<YnabAccountMapping[] | undefined>(
        record.accountMappingsJson,
        undefined,
    );
}

function toPublicJob(record: YnabImportJobRecord): YnabImportJobPublic {
    return {
        accountMappings: getYnabImportAccountMappings(record) ?? [],
        completedAt: record.completedAt,
        createdAt: record.createdAt,
        endMonth: record.endMonth,
        error: record.error,
        jobId: record.jobId,
        ledgerName: record.ledgerName,
        previewRevision: record.previewRevision,
        recordCount: record.recordCount,
        status: record.status,
        summary: parseJson<YnabImportSummary | undefined>(
            record.summaryJson,
            undefined,
        ),
        targetLedgerId: record.targetLedgerId,
        updatedAt: record.updatedAt,
    };
}

async function putJob(record: YnabImportJobRecord) {
    await getBudgetedSchema().entities.ynabImportJobs.put(record).go();
    return record;
}

function nextJobUpdatedAt(record: Pick<YnabImportJobRecord, "updatedAt">) {
    const currentTime = Date.now();
    const previousTime = Date.parse(record.updatedAt);
    const nextTime = Number.isFinite(previousTime)
        ? Math.max(currentTime, previousTime + 1)
        : currentTime;

    return new Date(nextTime).toISOString();
}

async function putJobIfUnchanged(
    existing: YnabImportJobRecord,
    record: YnabImportJobRecord,
) {
    const result = await getBudgetedSchema().entities.ynabImportJobs
        .put(record)
        .where((attributes, operations) =>
            operations.eq(attributes.updatedAt, existing.updatedAt),
        )
        .go({ returnOnConditionCheckFailure: true });

    if (result.rejected) {
        throw new HttpError(
            409,
            "ynab_import_changed",
            "This YNAB import changed. Refresh and try again.",
        );
    }

    return record;
}

export async function getYnabImportJobRecord(jobId: string) {
    const result = await getBudgetedSchema().entities.ynabImportJobs
        .get({ workspaceId: GLOBAL_WORKSPACE_ID, jobId })
        .go({ consistent: true });

    return (result.data as YnabImportJobRecord | undefined) ?? null;
}

async function requireOwnedJob(jobId: string, userId: string) {
    const record = await getYnabImportJobRecord(jobId);

    if (!record || record.userId !== userId) {
        throw new HttpError(404, "ynab_import_missing", "YNAB import not found.");
    }

    return expireStaleJob(record);
}

export function isYnabImportWorkerLeaseExpired(
    record: Pick<YnabImportJobRecord, "leaseExpiresAt" | "status">,
    currentTimeSeconds = nowSeconds(),
) {
    return (
        (record.status === "analyzing" || record.status === "importing") &&
        Boolean(
            record.leaseExpiresAt &&
                record.leaseExpiresAt <= currentTimeSeconds,
        )
    );
}

async function expireStaleJob(record: YnabImportJobRecord) {
    if (isYnabImportWorkerLeaseExpired(record)) {
        return putJob({
            ...record,
            error: "The YNAB import worker timed out. Retry to run it again.",
            status: "failed",
            updatedAt: new Date().toISOString(),
        });
    }

    return record;
}

async function listUserJobs(userId: string) {
    const result = await getBudgetedSchema().entities.ynabImportJobs.query
        .byUser({ workspaceId: GLOBAL_WORKSPACE_ID, userId })
        .go({ pages: "all" });

    return (result.data as YnabImportJobRecord[]).sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
    );
}

export async function getLatestYnabImportJob(userId: string) {
    const latest = (await listUserJobs(userId))[0];
    return latest ? toPublicJob(await expireStaleJob(latest)) : null;
}

export async function getYnabImportJob(jobId: string, userId: string) {
    return toPublicJob(await requireOwnedJob(jobId, userId));
}

export async function createYnabImportJob(
    userId: string,
    input: CreateYnabImportUploadInput,
) {
    const currentJobs = await Promise.all(
        (await listUserJobs(userId)).map(expireStaleJob),
    );
    const existing = currentJobs.find((job) =>
        activeStatuses.has(job.status),
    );

    if (existing) {
        throw new HttpError(
            409,
            "ynab_import_active",
            "Finish or discard the current YNAB import first.",
        );
    }

    const now = new Date();
    const jobId = ulid(now.getTime());
    const upload = await createYnabImportUploadTargets(jobId, input);
    const record = {
        createdAt: now.toISOString(),
        expiresAt: Math.floor(now.getTime() / 1000) + JOB_TTL_SECONDS,
        filesJson: JSON.stringify(upload.files),
        jobId,
        previewRevision: 0,
        status: "uploading",
        targetLedgerId: ulid(now.getTime() + 1),
        updatedAt: now.toISOString(),
        userId,
        workspaceId: GLOBAL_WORKSPACE_ID,
    } satisfies YnabImportJobRecord;

    await putJob(record);

    return { job: toPublicJob(record), uploads: upload.uploads };
}

export async function beginYnabImportPreview(
    jobId: string,
    userId: string,
    input: PreviewYnabImportInput,
) {
    const existing = await requireOwnedJob(jobId, userId);

    if (existing.status !== "uploading" && existing.status !== "ready") {
        throw new HttpError(
            409,
            "ynab_import_state",
            "This YNAB import cannot be previewed now.",
        );
    }

    await assertLedgerNameIsAvailable({ name: input.ledgerName });
    const previewRevision = existing.previewRevision + 1;
    const record = withWorkerLease({
        ...existing,
        accountMappingsJson: input.accountMappings
            ? JSON.stringify(input.accountMappings)
            : undefined,
        endMonth: input.endMonth,
        error: undefined,
        lastAction: "analyze",
        ledgerName: input.ledgerName,
        previewRevision,
        status: "analyzing",
        summaryJson: undefined,
        updatedAt: nextJobUpdatedAt(existing),
    });

    await putJobIfUnchanged(existing, record);
    return toPublicJob(record);
}

export async function beginYnabImport(
    jobId: string,
    userId: string,
    previewRevision: number,
) {
    const existing = await requireOwnedJob(jobId, userId);

    if (existing.status !== "ready" || !existing.ledgerName) {
        throw new HttpError(
            409,
            "ynab_import_not_ready",
            "Generate a current YNAB preview before importing.",
        );
    }

    if (existing.previewRevision !== previewRevision) {
        throw new HttpError(
            409,
            "ynab_import_preview_stale",
            "The YNAB preview changed. Review it before importing.",
        );
    }

    await assertLedgerNameIsAvailable({ name: existing.ledgerName });
    const record = withWorkerLease({
        ...existing,
        error: undefined,
        lastAction: "import",
        status: "importing",
        updatedAt: nextJobUpdatedAt(existing),
    });

    await putJobIfUnchanged(existing, record);
    return toPublicJob(record);
}

export async function retryYnabImport(jobId: string, userId: string) {
    const existing = await requireOwnedJob(jobId, userId);

    if (existing.status !== "failed" || !existing.lastAction) {
        throw new HttpError(
            409,
            "ynab_import_not_retryable",
            "This YNAB import is not retryable.",
        );
    }

    const action = existing.lastAction;
    const record = withWorkerLease({
        ...existing,
        error: action === "cleanup" ? "Discarding YNAB import…" : undefined,
        lastAction: action,
        status:
            action === "import"
                ? "importing"
                : action === "analyze"
                  ? "analyzing"
                  : "failed",
        updatedAt: nextJobUpdatedAt(existing),
    });

    await putJobIfUnchanged(existing, record);
    return { action, job: toPublicJob(record) };
}

export async function beginDiscardYnabImport(jobId: string, userId: string) {
    const existing = await requireOwnedJob(jobId, userId);

    if (existing.status === "completed") {
        throw new HttpError(
            409,
            "ynab_import_completed",
            "A completed YNAB import cannot be discarded.",
        );
    }

    if (existing.status === "analyzing" || existing.status === "importing") {
        throw new HttpError(
            409,
            "ynab_import_busy",
            "Wait for the current YNAB import work to finish before discarding it.",
        );
    }

    const record = withWorkerLease({
        ...existing,
        error: "Discarding YNAB import…",
        lastAction: "cleanup",
        status: "failed",
        updatedAt: nextJobUpdatedAt(existing),
    });
    await putJobIfUnchanged(existing, record);
    return record;
}

export async function completeYnabImportPreview(input: {
    accountMappings: YnabAccountMapping[];
    jobId: string;
    previewRevision: number;
    summary: YnabImportSummary;
}) {
    const existing = await getYnabImportJobRecord(input.jobId);

    if (
        !existing ||
        existing.status !== "analyzing" ||
        existing.previewRevision !== input.previewRevision
    ) {
        return;
    }

    await putJob({
        ...existing,
        accountMappingsJson: JSON.stringify(input.accountMappings),
        error: undefined,
        leaseExpiresAt: undefined,
        status: "ready",
        summaryJson: JSON.stringify(input.summary),
        updatedAt: new Date().toISOString(),
    });
}

export async function completeYnabImport(input: {
    jobId: string;
    recordCount: number;
}) {
    const existing = await getYnabImportJobRecord(input.jobId);

    if (!existing || existing.status !== "importing") {
        return;
    }

    const now = new Date().toISOString();
    await putJob({
        ...existing,
        completedAt: now,
        error: undefined,
        leaseExpiresAt: undefined,
        recordCount: input.recordCount,
        status: "completed",
        updatedAt: now,
    });
}

export async function failYnabImportJob(jobId: string, error: unknown) {
    const existing = await getYnabImportJobRecord(jobId);

    if (!existing || existing.status === "completed") {
        return;
    }

    await putJob({
        ...existing,
        error: error instanceof Error ? error.message : String(error),
        leaseExpiresAt: undefined,
        status: "failed",
        updatedAt: new Date().toISOString(),
    });
}

export async function deleteYnabImportJobRecord(jobId: string) {
    await getBudgetedSchema().entities.ynabImportJobs
        .delete({ workspaceId: GLOBAL_WORKSPACE_ID, jobId })
        .go();
}
