import { buildWorkspaceVersion } from "@/features/workspace/server/workspace-sync-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET() {
    return workspaceReadJson((context) => buildWorkspaceVersion(context.user));
}
