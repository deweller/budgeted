import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createUserAccount: vi.fn(),
    deleteUserAccount: vi.fn(),
    listUserAccounts: vi.fn(),
    requireCurrentSuperUserAccount: vi.fn(),
    resetUserAccountPassword: vi.fn(),
    updateUserAccount: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
    requireCurrentSuperUserAccount: mocks.requireCurrentSuperUserAccount,
}));

vi.mock("@/features/users/server/user-account-service", () => ({
    createUserAccount: mocks.createUserAccount,
    deleteUserAccount: mocks.deleteUserAccount,
    listUserAccounts: mocks.listUserAccounts,
    resetUserAccountPassword: mocks.resetUserAccountPassword,
    updateUserAccount: mocks.updateUserAccount,
}));

import { GET, POST } from "@/app/api/users/route";
import {
    DELETE,
    PATCH,
} from "@/app/api/users/[userId]/route";
import { PUT } from "@/app/api/users/[userId]/password/route";
import { HttpError } from "@/lib/api/errors";

describe("users routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireCurrentSuperUserAccount.mockResolvedValue({
            role: "super",
            userId: "super-1",
        });
    });

    it("lists sanitized user accounts for super users", async () => {
        mocks.listUserAccounts.mockResolvedValue([
            {
                createdAt: "2026-01-01T00:00:00.000Z",
                displayName: "Super User",
                email: "super@example.com",
                role: "super",
                updatedAt: "2026-01-01T00:00:00.000Z",
                userId: "super-1",
            },
        ]);

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            users: [
                expect.not.objectContaining({
                    passwordHash: expect.anything(),
                }),
            ],
        });
    });

    it("creates a user account", async () => {
        mocks.createUserAccount.mockResolvedValue({
            displayName: "New User",
            email: "new@example.com",
            role: "normal",
            userId: "user-1",
        });

        const response = await POST(
            new Request("http://localhost/api/users", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    displayName: "New User",
                    email: "new@example.com",
                    password: "change-me",
                    role: "normal",
                }),
            }),
        );

        expect(response.status).toBe(201);
        expect(mocks.createUserAccount).toHaveBeenCalledWith({
            displayName: "New User",
            email: "new@example.com",
            password: "change-me",
            role: "normal",
        });
    });

    it("updates a user account", async () => {
        mocks.updateUserAccount.mockResolvedValue({
            displayName: "Updated User",
            email: "updated@example.com",
            role: "super",
            userId: "user-1",
        });

        const response = await PATCH(
            new Request("http://localhost/api/users/user-1", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    displayName: "Updated User",
                    email: "updated@example.com",
                    role: "super",
                }),
            }),
            { params: Promise.resolve({ userId: "user-1" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.updateUserAccount).toHaveBeenCalledWith({
            actorUserId: "super-1",
            updates: {
                displayName: "Updated User",
                email: "updated@example.com",
                role: "super",
            },
            userId: "user-1",
        });
    });

    it("resets a user password", async () => {
        mocks.resetUserAccountPassword.mockResolvedValue({
            userId: "user-1",
        });

        const response = await PUT(
            new Request("http://localhost/api/users/user-1/password", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    password: "new-secret",
                }),
            }),
            { params: Promise.resolve({ userId: "user-1" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.resetUserAccountPassword).toHaveBeenCalledWith({
            passwordInput: { password: "new-secret" },
            userId: "user-1",
        });
    });

    it("hard deletes a user account", async () => {
        mocks.deleteUserAccount.mockResolvedValue({
            userId: "user-1",
        });

        const response = await DELETE(
            new Request("http://localhost/api/users/user-1", {
                method: "DELETE",
            }),
            { params: Promise.resolve({ userId: "user-1" }) },
        );

        expect(response.status).toBe(200);
        expect(mocks.deleteUserAccount).toHaveBeenCalledWith({
            actorUserId: "super-1",
            userId: "user-1",
        });
    });

    it("rejects normal users", async () => {
        mocks.requireCurrentSuperUserAccount.mockRejectedValue(
            new HttpError(
                403,
                "forbidden",
                "Only super users can manage user accounts.",
            ),
        );

        const response = await GET();

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "forbidden",
            },
        });
    });
});
