import { ulid } from "ulid";

import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

export type UserAccountRole = "normal" | "super";

export function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

export async function findUserAccountByEmail(email: string) {
    const { entities } = getBudgetedSchema();
    const normalizedEmail = normalizeEmail(email);
    const result = await entities.userAccounts.query
        .byEmail({ email: normalizedEmail })
        .go({
            limit: 1,
        });

    return result.data[0] ?? null;
}

export async function findUserAccountById(userId: string) {
    const { entities } = getBudgetedSchema();
    const result = await entities.userAccounts
        .get({ userId })
        .go({ consistent: true });

    return result.data ?? null;
}

export type UserAccountRecord = NonNullable<
    Awaited<ReturnType<typeof findUserAccountByEmail>>
>;

export function getUserAccountRole(account: {
    role?: UserAccountRole;
}): UserAccountRole {
    return account.role ?? "normal";
}

export async function upsertSeededUserAccount(input: {
    displayName?: string;
    email: string;
    passwordHash: string;
    role: UserAccountRole;
}) {
    const { entities } = getBudgetedSchema();
    const existing = await findUserAccountByEmail(input.email);
    const now = new Date().toISOString();

    const record = {
        userId: existing?.userId ?? ulid(),
        workspaceId: existing?.workspaceId ?? GLOBAL_WORKSPACE_ID,
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        displayName:
            input.displayName ?? existing?.displayName ?? input.email,
        role: input.role,
        activeLedgerId: existing?.activeLedgerId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };

    await entities.userAccounts.upsert(record).go();

    return record;
}
