import { buildWorkspaceKnowledge } from "@/features/workspace/server/workspace-sync-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET() {
    return workspaceReadJson((context) =>
        buildWorkspaceKnowledge(context.user),
    );
}
