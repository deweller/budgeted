import { NextResponse } from "next/server";

import {
    createBudgetPlanWorkbookDownload,
    importBudgetPlanWorkbook,
} from "@/features/utilities/server/budget-plan-workbook-service";
import { HttpError } from "@/lib/api/errors";
import {
    handleWorkspaceRoute,
    workspaceTrackedMutationJson,
} from "@/lib/api/workspace-route";

export const runtime = "nodejs";

export async function GET() {
    return handleWorkspaceRoute(async (context) => {
        const download = await createBudgetPlanWorkbookDownload(context.user);

        return new NextResponse(new Uint8Array(download.content).buffer, {
            headers: {
                "cache-control": "no-store",
                "content-disposition": `attachment; filename="${download.filename}"`,
                "content-type": download.contentType,
            },
        });
    });
}

export async function POST(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const file = (await request.formData()).get("file");

        if (!(file instanceof File)) {
            throw new HttpError(
                422,
                "budget_plan_workbook_missing",
                "Choose a budget plan Excel workbook.",
            );
        }

        return workspaceTrackedMutationJson(context, () =>
            importBudgetPlanWorkbook({ file, user: context.user }),
        );
    });
}
