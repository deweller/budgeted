import { listReusablePlaidInstitutions } from "@/features/plaid/server/plaid-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";

export async function GET() {
    return handleWorkspaceRoute(async () =>
        Response.json({
            institutions: await listReusablePlaidInstitutions(),
        }),
    );
}
