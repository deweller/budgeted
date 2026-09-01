import {
    deleteYnabImportArtifacts,
    readYnabImportSource,
} from "@/features/import/ynab/server/ynab-import-artifact-service";
import {
    completeYnabImport,
    completeYnabImportPreview,
    deleteYnabImportJobRecord,
    failYnabImportJob,
    getYnabImportAccountMappings,
    getYnabImportJobRecord,
    getYnabImportSourceFiles,
    type YnabImportWorkerAction,
} from "@/features/import/ynab/server/ynab-import-job-service";
import { createYnabImportPlan } from "@/features/import/ynab/planner";
import { persistYnabImport } from "@/features/import/ynab/persistence";
import {
    assertLedgerNameIsAvailable,
    deleteLedgerScopedRecords,
    getLedgerRecord,
} from "@/features/ledgers/server/ledger-service";
import { countLedgerScopedRecords } from "@/features/ledgers/server/ledger-scoped-record-writer-service";

type YnabImportWorkerEvent = {
    action: YnabImportWorkerAction;
    jobId: string;
};

async function analyze(jobId: string) {
    const job = await getYnabImportJobRecord(jobId);

    if (!job || job.status !== "analyzing") {
        return;
    }

    const plan = createYnabImportPlan({
        accountMappings: getYnabImportAccountMappings(job),
        endMonth: job.endMonth,
        export: await readYnabImportSource(getYnabImportSourceFiles(job)),
        ledgerId: job.targetLedgerId,
    });

    await completeYnabImportPreview({
        accountMappings: plan.accountMappings,
        jobId,
        previewRevision: job.previewRevision,
        summary: plan.summary,
    });
}

async function runImport(jobId: string) {
    const job = await getYnabImportJobRecord(jobId);

    if (!job || job.status !== "importing" || !job.ledgerName) {
        return;
    }

    await assertLedgerNameIsAvailable({
        ledgerId: job.targetLedgerId,
        name: job.ledgerName,
    });
    const plan = createYnabImportPlan({
        accountMappings: getYnabImportAccountMappings(job),
        endMonth: job.endMonth,
        export: await readYnabImportSource(getYnabImportSourceFiles(job)),
        ledgerId: job.targetLedgerId,
    });
    const finalizedLedger = await getLedgerRecord(job.targetLedgerId);

    if (finalizedLedger) {
        await completeYnabImport({
            jobId,
            recordCount: countLedgerScopedRecords(plan.records),
        });
        return;
    }

    const result = await persistYnabImport({
        ledgerId: job.targetLedgerId,
        ledgerName: job.ledgerName,
        plan,
    });

    await completeYnabImport({
        jobId,
        recordCount: result.scopedRecordCount,
    });
}

async function cleanup(jobId: string) {
    const job = await getYnabImportJobRecord(jobId);

    if (!job || job.status === "completed") {
        return;
    }

    if (await getLedgerRecord(job.targetLedgerId)) {
        throw new Error(
            "The imported ledger was already finalized and cannot be discarded.",
        );
    }

    await deleteLedgerScopedRecords({ ledgerId: job.targetLedgerId });
    await deleteYnabImportArtifacts(getYnabImportSourceFiles(job));
    await deleteYnabImportJobRecord(jobId);
}

export async function handler(event: YnabImportWorkerEvent) {
    try {
        switch (event.action) {
            case "analyze":
                await analyze(event.jobId);
                return;
            case "import":
                await runImport(event.jobId);
                return;
            case "cleanup":
                await cleanup(event.jobId);
                return;
        }
    } catch (error) {
        await failYnabImportJob(event.jobId, error);
    }
}
