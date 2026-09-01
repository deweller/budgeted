import { NextResponse } from "next/server";

import {
    ledgerDeletionSchema,
    ledgerUpdateSchema,
} from "@/features/ledgers/models/ledger-form";
import {
    deleteLedger,
    setActiveLedger,
    setLedgerArchiveStatusWithWorkspaceChanges,
    updateLedgerWithWorkspaceChanges,
} from "@/features/ledgers/server/ledger-service";
import {
    handleWorkspaceRoute,
    workspacePublishedMutationJson,
    workspaceTrackedMutationJson,
} from "@/lib/api/workspace-route";
import { HttpError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validation";

type LedgerRouteContext = {
    params: Promise<{ ledgerId: string }>;
};

export async function PATCH(
    _request: Request,
    context: LedgerRouteContext,
) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { ledgerId } = await context.params;
        const ledger = await setActiveLedger(
            workspaceContext.user.userId,
            ledgerId,
        );

        return NextResponse.json({ ledger });
    });
}

export async function PUT(request: Request, context: LedgerRouteContext) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { ledgerId } = await context.params;
        const input = await parseJsonBody(request, ledgerUpdateSchema);
        return workspacePublishedMutationJson(workspaceContext, () =>
            updateLedgerWithWorkspaceChanges(ledgerId, input),
        );
    });
}

export async function DELETE(request: Request, context: LedgerRouteContext) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { ledgerId } = await context.params;
        const input = await parseJsonBody(request, ledgerDeletionSchema);
        return workspaceTrackedMutationJson(workspaceContext, () =>
            deleteLedger(workspaceContext.user.userId, ledgerId, input),
        );
    });
}

export async function POST(request: Request, context: LedgerRouteContext) {
    return handleWorkspaceRoute(async (workspaceContext) => {
        const { ledgerId } = await context.params;
        const action = new URL(request.url).searchParams.get("action");

        if (action !== "archive" && action !== "restore") {
            throw new HttpError(
                422,
                "ledger_archive_action_invalid",
                "Choose whether to archive or restore the ledger.",
            );
        }

        return workspacePublishedMutationJson(workspaceContext, () =>
            setLedgerArchiveStatusWithWorkspaceChanges({
                action,
                ledgerId,
            }),
        );
    });
}
