import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    userAccountDelete: vi.fn(),
    userAccountGet: vi.fn(),
    userAccountPut: vi.fn(),
    userAccountUpsert: vi.fn(),
    userAccountsByEmail: vi.fn(),
    userAccountsByWorkspace: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            userAccounts: {
                delete: mocks.userAccountDelete,
                get: mocks.userAccountGet,
                put: mocks.userAccountPut,
                query: {
                    byEmail: mocks.userAccountsByEmail,
                    byWorkspace: mocks.userAccountsByWorkspace,
                },
                upsert: mocks.userAccountUpsert,
            },
        },
    }),
}));

import {
    createUserAccount,
    deleteUserAccount,
    listUserAccounts,
    resetUserAccountPassword,
    updateUserAccount,
} from "@/features/users/server/user-account-service";
import { verifyPassword } from "@/lib/auth/password";

type TestUserAccount = {
    activeLedgerId?: string;
    createdAt: string;
    displayName: string;
    email: string;
    passwordHash: string;
    role: "normal" | "super";
    updatedAt: string;
    userId: string;
    workspaceId: string;
};

function createAccount(input: {
    email: string;
    role: "normal" | "super";
    userId: string;
}): TestUserAccount {
    return {
        userId: input.userId,
        workspaceId: "global",
        email: input.email,
        passwordHash: "salt:hash",
        displayName: input.email,
        role: input.role,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

describe("user account service", () => {
    let accounts: Map<string, TestUserAccount>;

    beforeEach(() => {
        vi.clearAllMocks();
        accounts = new Map();

        mocks.userAccountsByEmail.mockImplementation(
            ({ email }: { email: string }) => ({
                go: async () => ({
                    data: Array.from(accounts.values()).filter(
                        (account) => account.email === email,
                    ),
                }),
            }),
        );
        mocks.userAccountsByWorkspace.mockImplementation(
            ({ workspaceId }: { workspaceId: string }) => ({
                go: async () => ({
                    data: Array.from(accounts.values()).filter(
                        (account) => account.workspaceId === workspaceId,
                    ),
                }),
            }),
        );
        mocks.userAccountGet.mockImplementation(
            ({ userId }: { userId: string }) => ({
                go: async () => ({ data: accounts.get(userId) ?? null }),
            }),
        );
        mocks.userAccountPut.mockImplementation((record: TestUserAccount) => ({
            go: async () => {
                accounts.set(record.userId, record);
            },
        }));
        mocks.userAccountUpsert.mockImplementation(
            (record: TestUserAccount) => ({
                go: async () => {
                    accounts.set(record.userId, record);
                },
            }),
        );
        mocks.userAccountDelete.mockImplementation(
            ({ userId }: { userId: string }) => ({
                go: async () => {
                    accounts.delete(userId);
                },
            }),
        );
    });

    it("creates a normal user with a normalized unique email and hashed password", async () => {
        const user = await createUserAccount({
            displayName: "New User",
            email: " NEW@example.COM ",
            password: "change-me",
            role: "normal",
        });
        const saved = Array.from(accounts.values())[0];

        expect(user).toMatchObject({
            displayName: "New User",
            email: "new@example.com",
            role: "normal",
        });
        expect(user).not.toHaveProperty("passwordHash");
        await expect(
            verifyPassword("change-me", saved.passwordHash),
        ).resolves.toBe(true);
    });

    it("rejects duplicate user emails", async () => {
        accounts.set(
            "user-1",
            createAccount({
                email: "existing@example.com",
                role: "normal",
                userId: "user-1",
            }),
        );

        await expect(
            createUserAccount({
                displayName: "Existing",
                email: "existing@example.com",
                password: "change-me",
                role: "normal",
            }),
        ).rejects.toMatchObject({
            code: "user_email_exists",
            status: 409,
        });
    });

    it("updates a user email with normalization", async () => {
        accounts.set(
            "owner-1",
            createAccount({
                email: "owner@example.com",
                role: "super",
                userId: "owner-1",
            }),
        );
        accounts.set(
            "user-1",
            createAccount({
                email: "user@example.com",
                role: "normal",
                userId: "user-1",
            }),
        );

        const user = await updateUserAccount({
            actorUserId: "owner-1",
            updates: {
                displayName: "Updated User",
                email: " UPDATED@example.COM ",
                role: "normal",
            },
            userId: "user-1",
        });

        expect(user).toMatchObject({
            displayName: "Updated User",
            email: "updated@example.com",
            role: "normal",
        });
        expect(accounts.get("user-1")).toMatchObject({
            email: "updated@example.com",
        });
    });

    it("rejects duplicate emails when updating a user", async () => {
        accounts.set(
            "owner-1",
            createAccount({
                email: "owner@example.com",
                role: "super",
                userId: "owner-1",
            }),
        );
        accounts.set(
            "user-1",
            createAccount({
                email: "user@example.com",
                role: "normal",
                userId: "user-1",
            }),
        );
        accounts.set(
            "user-2",
            createAccount({
                email: "taken@example.com",
                role: "normal",
                userId: "user-2",
            }),
        );

        await expect(
            updateUserAccount({
                actorUserId: "owner-1",
                updates: {
                    displayName: "Updated User",
                    email: "taken@example.com",
                    role: "normal",
                },
                userId: "user-1",
            }),
        ).rejects.toMatchObject({
            code: "user_email_exists",
            status: 409,
        });
    });

    it("allows changing the current super user email", async () => {
        accounts.set(
            "owner-1",
            createAccount({
                email: "owner@example.com",
                role: "super",
                userId: "owner-1",
            }),
        );

        await expect(
            updateUserAccount({
                actorUserId: "owner-1",
                updates: {
                    displayName: "Owner",
                    email: " NEW-OWNER@example.COM ",
                    role: "super",
                },
                userId: "owner-1",
            }),
        ).resolves.toMatchObject({
            displayName: "Owner",
            email: "new-owner@example.com",
            role: "super",
        });
    });

    it("blocks demoting the current super user", async () => {
        accounts.set(
            "owner-1",
            createAccount({
                email: "owner@example.com",
                role: "super",
                userId: "owner-1",
            }),
        );

        await expect(
            updateUserAccount({
                actorUserId: "owner-1",
                updates: {
                    displayName: "Owner",
                    email: "owner@example.com",
                    role: "normal",
                },
                userId: "owner-1",
            }),
        ).rejects.toMatchObject({
            code: "current_user_role_required",
            status: 422,
        });
    });

    it("blocks deleting the current user but allows deleting another super user", async () => {
        accounts.set(
            "owner-1",
            createAccount({
                email: "owner@example.com",
                role: "super",
                userId: "owner-1",
            }),
        );
        accounts.set(
            "super-2",
            createAccount({
                email: "super@example.com",
                role: "super",
                userId: "super-2",
            }),
        );

        await expect(
            deleteUserAccount({
                actorUserId: "owner-1",
                userId: "owner-1",
            }),
        ).rejects.toMatchObject({
            code: "current_user_delete",
            status: 422,
        });

        await expect(
            deleteUserAccount({
                actorUserId: "super-2",
                userId: "owner-1",
            }),
        ).resolves.toMatchObject({
            email: "owner@example.com",
            role: "super",
        });
        expect(accounts.has("owner-1")).toBe(false);
    });

    it("blocks deleting the last super user", async () => {
        accounts.set(
            "super-1",
            createAccount({
                email: "super@example.com",
                role: "super",
                userId: "super-1",
            }),
        );

        await expect(
            deleteUserAccount({
                actorUserId: "normal-1",
                userId: "super-1",
            }),
        ).rejects.toMatchObject({
            code: "last_super_user",
            status: 422,
        });
    });

    it("hard deletes a user", async () => {
        accounts.set(
            "owner-1",
            createAccount({
                email: "owner@example.com",
                role: "super",
                userId: "owner-1",
            }),
        );
        accounts.set(
            "user-1",
            createAccount({
                email: "user@example.com",
                role: "normal",
                userId: "user-1",
            }),
        );

        await deleteUserAccount({
            actorUserId: "owner-1",
            userId: "user-1",
        });

        expect(accounts.has("user-1")).toBe(false);
    });

    it("resets a user password", async () => {
        accounts.set(
            "user-1",
            createAccount({
                email: "user@example.com",
                role: "normal",
                userId: "user-1",
            }),
        );

        await resetUserAccountPassword({
            passwordInput: { password: "new-secret" },
            userId: "user-1",
        });

        await expect(
            verifyPassword("new-secret", accounts.get("user-1")!.passwordHash),
        ).resolves.toBe(true);
    });

    it("lists super users first", async () => {
        accounts.set(
            "normal-1",
            createAccount({
                email: "normal@example.com",
                role: "normal",
                userId: "normal-1",
            }),
        );
        accounts.set(
            "owner-1",
            createAccount({
                email: "owner@example.com",
                role: "super",
                userId: "owner-1",
            }),
        );

        await expect(listUserAccounts()).resolves.toMatchObject([
            { email: "owner@example.com", role: "super" },
            { email: "normal@example.com", role: "normal" },
        ]);
    });
});
