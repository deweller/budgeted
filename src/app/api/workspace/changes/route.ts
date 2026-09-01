import { listWorkspaceCommitsAfter } from "@/features/workspace/server/workspace-sync-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET(request: Request) {
    return workspaceReadJson((context) => {
        const url = new URL(request.url);
        const after = url.searchParams.get("after");
        return listWorkspaceCommitsAfter({ after, user: context.user });
    });
}
