import { NextResponse } from "next/server";

import { previewYnabImportSchema } from "@/features/import/ynab/models/ynab-import-job";
import { invokeYnabImportWorker } from "@/features/import/ynab/server/ynab-import-invocation-service";
import {
    beginYnabImportPreview,
    failYnabImportJob,
} from "@/features/import/ynab/server/ynab-import-job-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function POST(
    request: Request,
    context: { params: Promise<{ jobId: string }> },
) {
    const { jobId } = await context.params;

    return handleWorkspaceRoute(async (workspaceContext) => {
        const input = await parseJsonBody(request, previewYnabImportSchema);
        const job = await beginYnabImportPreview(
            jobId,
            workspaceContext.user.userId,
            input,
        );

        try {
            await invokeYnabImportWorker({ action: "analyze", jobId });
        } catch (error) {
            await failYnabImportJob(jobId, error);
            throw error;
        }

        return NextResponse.json({ job }, { status: 202 });
    });
}
