import { NextResponse } from "next/server";

import {
    automationRunNowInputSchema,
    automationScheduleInputSchema,
} from "@/features/automation/models/automation";
import { invokeQueuedAutomationWorker } from "@/features/automation/server/automation-invocation-service";
import {
    getAutomationOverview,
    scheduleAutomationRunNow,
    updateAutomationSchedule,
} from "@/features/automation/server/automation-service";
import {
    handleWorkspaceRoute,
    workspaceReadJson,
} from "@/lib/api/workspace-route";
import { parseJsonBody } from "@/lib/api/validation";

export async function GET() {
    return workspaceReadJson(() => getAutomationOverview());
}

export async function PATCH(request: Request) {
    return handleWorkspaceRoute(async () => {
        const input = await parseJsonBody(
            request,
            automationScheduleInputSchema,
        );

        return NextResponse.json(await updateAutomationSchedule(input));
    });
}

export async function POST(request: Request) {
    return handleWorkspaceRoute(async () => {
        const input = await parseJsonBody(request, automationRunNowInputSchema);
        const taskRuns = await scheduleAutomationRunNow(input.taskType);

        if (taskRuns.length > 0) {
            await invokeQueuedAutomationWorker();
        }

        return NextResponse.json({ taskRuns });
    });
}
