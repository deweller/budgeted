import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/api/errors";
import { requireCurrentSuperUserAccount } from "@/lib/auth/current-user";

type CurrentSuperUser = Awaited<
    ReturnType<typeof requireCurrentSuperUserAccount>
>;

export type SuperUserRouteContext = {
    currentUser: CurrentSuperUser;
};

export async function handleSuperUserRoute(
    handler: (context: SuperUserRouteContext) => Promise<Response>,
) {
    try {
        const currentUser = await requireCurrentSuperUserAccount();

        return await handler({ currentUser });
    } catch (error) {
        return toErrorResponse(error);
    }
}

export async function superUserJson<T>(
    read: (context: SuperUserRouteContext) => Promise<T> | T,
    init?: ResponseInit,
) {
    return handleSuperUserRoute(async (context) =>
        NextResponse.json(await read(context), init),
    );
}
