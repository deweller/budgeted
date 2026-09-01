import { timingSafeEqual } from "node:crypto";

import { hashPassword } from "@/lib/auth/password";
import {
    upsertSeededUserAccount,
    type UserAccountRole,
} from "@/lib/auth/user-account";
import { resolveAuthSecret } from "@/lib/env/server";

function isExpectedSecret(input: string | null, expected?: string) {
    if (!input || !expected) {
        return false;
    }

    const inputBuffer = Buffer.from(input);
    const expectedBuffer = Buffer.from(expected);

    return (
        inputBuffer.length === expectedBuffer.length &&
        timingSafeEqual(inputBuffer, expectedBuffer)
    );
}

function resolveBootstrapRole(): UserAccountRole {
    return process.env.E2E_USER_ROLE === "super" ? "super" : "normal";
}

export async function POST(request: Request) {
    if (process.env.NODE_ENV === "production") {
        return Response.json({ error: "Not found." }, { status: 404 });
    }

    if (
        !isExpectedSecret(
            request.headers.get("x-budgeted-e2e-secret"),
            resolveAuthSecret(),
        )
    ) {
        return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;

    if (!email || !password) {
        return Response.json(
            {
                error:
                    "E2E_USER_EMAIL and E2E_USER_PASSWORD are required.",
            },
            { status: 422 },
        );
    }

    const user = await upsertSeededUserAccount({
        displayName: process.env.E2E_USER_DISPLAY_NAME,
        email,
        passwordHash: await hashPassword(password),
        role: resolveBootstrapRole(),
    });

    return Response.json({
        email: user.email,
        role: user.role,
        userId: user.userId,
    });
}
