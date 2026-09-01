import { buildWorkspaceSnapshot } from "@/features/workspace/server/workspace-sync-service";
import { workspaceReadJson } from "@/lib/api/workspace-route";

export async function GET() {
    return workspaceReadJson(async (context) => {
        const snapshot = await buildWorkspaceSnapshot(context.user);
        const payload = { ...snapshot };
        delete (payload as Partial<typeof snapshot>).baseChangeCursor;
        delete (payload as Partial<typeof snapshot>).knowledge;
        return payload;
    });
}
