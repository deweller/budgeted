import { NextResponse } from "next/server";

import { createLedgerExportDownload } from "@/features/utilities/server/ledger-export-download-service";
import { handleWorkspaceRoute } from "@/lib/api/workspace-route";

export const runtime = "nodejs";

export async function GET(request: Request) {
    return handleWorkspaceRoute(async (context) => {
        const download = await createLedgerExportDownload(context.user, {
            timeZone: new URL(request.url).searchParams.get("timeZone") ?? undefined,
        });

        return NextResponse.json(download, {
            headers: {
                "cache-control": "no-store",
            },
        });
    });
}
