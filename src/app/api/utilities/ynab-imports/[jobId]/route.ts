import { NextResponse } from "next/server";

import { invokeYnabImportWorker } from "@/features/import/ynab/server/ynab-import-invocation-service";
import {
    beginDiscardYnabImport,
    failYnabImportJob,
    getYnabImportJob,
} from "@/features/import/ynab/server/ynab-import-job-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";

export async function GET(
    _request: Request,
    context: { params: Promise<{ jobId: string }> },
) {
    const { jobId } = await context.params;

    return handleWorkspaceRoute(async (workspaceContext) =>
        NextResponse.json({
            job: await getYnabImportJob(jobId, workspaceContext.user.userId),
        }),
    );
}

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ jobId: string }> },
) {
    const { jobId } = await context.params;

    return handleWorkspaceRoute(async (workspaceContext) => {
        await beginDiscardYnabImport(jobId, workspaceContext.user.userId);

        try {
            await invokeYnabImportWorker({ action: "cleanup", jobId });
        } catch (error) {
            await failYnabImportJob(jobId, error);
            throw error;
        }

        return NextResponse.json({ accepted: true }, { status: 202 });
    });
}
