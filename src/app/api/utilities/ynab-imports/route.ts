import { NextResponse } from "next/server";

import { createYnabImportUploadSchema } from "@/features/import/ynab/models/ynab-import-job";
import {
    createYnabImportJob,
    getLatestYnabImportJob,
} from "@/features/import/ynab/server/ynab-import-job-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return handleWorkspaceRoute(async (context) =>
        NextResponse.json({
            job: await getLatestYnabImportJob(context.user.userId),
        }),
    );
}

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const input = await parseJsonBody(
            request,
            createYnabImportUploadSchema,
        );

        return NextResponse.json(
            await createYnabImportJob(context.user.userId, input),
            { status: 201 },
        );
    });
}
