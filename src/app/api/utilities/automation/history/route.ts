import { listRecentAutomationTaskRuns } from "@/features/automation/server/automation-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET() {
    return workspaceReadJson(async () => ({
        taskRuns: await listRecentAutomationTaskRuns(),
    }));
}
