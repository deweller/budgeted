import { ulid } from "ulid";

import type {
    UserAccountCreateInput,
    UserAccountPasswordInput,
    UserAccountRole,
    UserAccountUpdateInput,
} from "@/features/users/models/user-account-form";
import { HttpError } from "@/lib/api/errors";
import {
    findUserAccountByEmail,
    findUserAccountById,
    getUserAccountRole,
    normalizeEmail,
    type UserAccountRecord,
} from "@/lib/auth/user-account";
import { hashPassword } from "@/lib/auth/password";
import { getBudgetedSchema } from "@/lib/db/schema";
import { GLOBAL_WORKSPACE_ID } from "@/lib/workspace/scope";

export type PublicUserAccount = {
    createdAt: string;
    displayName: string;
    email: string;
    role: UserAccountRole;
    updatedAt: string;
    userId: string;
};

function toPublicUserAccount(record: UserAccountRecord): PublicUserAccount {
    return {
        createdAt: record.createdAt,
        displayName: record.displayName,
        email: record.email,
        role: getUserAccountRole(record),
        updatedAt: record.updatedAt,
        userId: record.userId,
    };
}

function sortPublicUserAccounts(
    left: PublicUserAccount,
    right: PublicUserAccount,
) {
    if (left.role !== right.role) {
        return left.role === "super" ? -1 : 1;
    }

    return left.email.localeCompare(right.email);
}

export async function listUserAccounts() {
    const { entities } = getBudgetedSchema();
    const result = await entities.userAccounts.query
        .byWorkspace({ workspaceId: GLOBAL_WORKSPACE_ID })
        .go();
    return result.data
        .map(toPublicUserAccount)
        .sort(sortPublicUserAccounts);
}

async function requireUserAccount(userId: string) {
    const account = await findUserAccountById(userId);

    if (!account) {
        throw new HttpError(
            404,
            "user_missing",
            "The user account could not be found.",
        );
    }

    return account;
}

async function countSuperUsers() {
    const users = await listUserAccounts();

    return users.filter((user) => user.role === "super").length;
}

function assertCanRemoveSuperRole(input: {
    actorUserId: string;
    target: UserAccountRecord;
}) {
    if (getUserAccountRole(input.target) !== "super") {
        return;
    }

    if (input.target.userId === input.actorUserId) {
        throw new HttpError(
            422,
            "current_user_role_required",
            "You cannot remove your own super user access.",
        );
    }
}

async function assertAtLeastOneOtherSuperUser(target: UserAccountRecord) {
    if (getUserAccountRole(target) !== "super") {
        return;
    }

    const superUserCount = await countSuperUsers();

    if (superUserCount <= 1) {
        throw new HttpError(
            422,
            "last_super_user",
            "At least one super user must remain.",
        );
    }
}

async function assertEmailIsAvailable(input: {
    nextEmail: string;
    targetUserId: string;
}) {
    const nextEmail = normalizeEmail(input.nextEmail);
    const existing = await findUserAccountByEmail(nextEmail);

    if (existing && existing.userId !== input.targetUserId) {
        throw new HttpError(
            409,
            "user_email_exists",
            "A user with this email already exists.",
        );
    }
}

export async function createUserAccount(input: UserAccountCreateInput) {
    const { entities } = getBudgetedSchema();
    const email = normalizeEmail(input.email);
    const existing = await findUserAccountByEmail(email);

    if (existing) {
        throw new HttpError(
            409,
            "user_email_exists",
            "A user with this email already exists.",
        );
    }

    const now = new Date().toISOString();
    const record = {
        userId: ulid(),
        workspaceId: GLOBAL_WORKSPACE_ID,
        email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        role: input.role,
        createdAt: now,
        updatedAt: now,
    };

    await entities.userAccounts.put(record).go();

    return toPublicUserAccount(record);
}

export async function updateUserAccount(input: {
    actorUserId: string;
    userId: string;
    updates: UserAccountUpdateInput;
}) {
    const { entities } = getBudgetedSchema();
    const target = await requireUserAccount(input.userId);
    const currentRole = getUserAccountRole(target);
    const nextRole = input.updates.role;
    const nextEmail = normalizeEmail(input.updates.email);

    if (currentRole === "super" && nextRole !== "super") {
        assertCanRemoveSuperRole({
            actorUserId: input.actorUserId,
            target,
        });
        await assertAtLeastOneOtherSuperUser(target);
    }

    await assertEmailIsAvailable({
        nextEmail,
        targetUserId: target.userId,
    });

    const record = {
        ...target,
        workspaceId: target.workspaceId ?? GLOBAL_WORKSPACE_ID,
        displayName: input.updates.displayName,
        email: nextEmail,
        role: nextRole,
        updatedAt: new Date().toISOString(),
    };

    await entities.userAccounts.upsert(record).go();

    return toPublicUserAccount(record);
}

export async function resetUserAccountPassword(input: {
    passwordInput: UserAccountPasswordInput;
    userId: string;
}) {
    const { entities } = getBudgetedSchema();
    const target = await requireUserAccount(input.userId);
    const record = {
        ...target,
        workspaceId: target.workspaceId ?? GLOBAL_WORKSPACE_ID,
        role: getUserAccountRole(target),
        passwordHash: await hashPassword(input.passwordInput.password),
        updatedAt: new Date().toISOString(),
    };

    await entities.userAccounts.upsert(record).go();

    return toPublicUserAccount(record);
}

export async function deleteUserAccount(input: {
    actorUserId: string;
    userId: string;
}) {
    const { entities } = getBudgetedSchema();
    const target = await requireUserAccount(input.userId);

    if (target.userId === input.actorUserId) {
        throw new HttpError(
            422,
            "current_user_delete",
            "You cannot delete your own user account.",
        );
    }

    await assertAtLeastOneOtherSuperUser(target);
    await entities.userAccounts.delete({ userId: input.userId }).go();

    return toPublicUserAccount(target);
}
