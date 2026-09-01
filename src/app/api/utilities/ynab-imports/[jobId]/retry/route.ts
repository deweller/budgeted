import { NextResponse } from "next/server";

import { invokeYnabImportWorker } from "@/features/import/ynab/server/ynab-import-invocation-service";
import {
    failYnabImportJob,
    retryYnabImport,
} from "@/features/import/ynab/server/ynab-import-job-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";

export async function POST(
    _request: Request,
    context: { params: Promise<{ jobId: string }> },
) {
    const { jobId } = await context.params;

    return handleWorkspaceRoute(async (workspaceContext) => {
        const result = await retryYnabImport(
            jobId,
            workspaceContext.user.userId,
        );

        try {
            await invokeYnabImportWorker({ action: result.action, jobId });
        } catch (error) {
            await failYnabImportJob(jobId, error);
            throw error;
        }

        return NextResponse.json({ job: result.job }, { status: 202 });
    });
}
