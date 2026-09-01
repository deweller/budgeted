import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    completeActivity: vi.fn(),
    failActivity: vi.fn(),
    notifyError: vi.fn(),
    startActivity: vi.fn(),
}));

vi.mock("@/components/shared/feedback-toast-provider", () => ({
    useFeedbackToasts: () => ({
        notifyError: mocks.notifyError,
    }),
}));

vi.mock("@/components/shared/background-mutation-activity-provider", () => ({
    useBackgroundMutationActivity: () => ({
        activities: [],
        startActivity: mocks.startActivity,
    }),
}));

import { UserManagementPanel } from "@/components/utilities/user-management-panel";

const usersPayload = {
    users: [
        {
            createdAt: "2026-01-01T00:00:00.000Z",
            displayName: "Super User",
            email: "super@example.com",
            role: "super",
            updatedAt: "2026-01-01T00:00:00.000Z",
            userId: "super-1",
        },
        {
            createdAt: "2026-01-02T00:00:00.000Z",
            displayName: "Normal User",
            email: "user@example.com",
            role: "normal",
            updatedAt: "2026-01-02T00:00:00.000Z",
            userId: "user-1",
        },
    ],
};

describe("UserManagementPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.startActivity.mockReturnValue({
            complete: mocks.completeActivity,
            fail: mocks.failActivity,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);

                if (url === "/api/users" && !init) {
                    return new Response(JSON.stringify(usersPayload), {
                        headers: { "content-type": "application/json" },
                        status: 200,
                    });
                }

                if (url === "/api/users" && init?.method === "POST") {
                    return new Response(
                        JSON.stringify({
                            createdAt: "2026-01-02T00:00:00.000Z",
                            displayName: "New User",
                            email: "new@example.com",
                            role: "normal",
                            updatedAt: "2026-01-02T00:00:00.000Z",
                            userId: "user-1",
                        }),
                        {
                            headers: { "content-type": "application/json" },
                            status: 201,
                        },
                    );
                }

                if (url === "/api/users/user-1" && init?.method === "PATCH") {
                    return new Response(
                        JSON.stringify({
                            createdAt: "2026-01-02T00:00:00.000Z",
                            displayName: "Updated User",
                            email: "updated@example.com",
                            role: "normal",
                            updatedAt: "2026-01-03T00:00:00.000Z",
                            userId: "user-1",
                        }),
                        {
                            headers: { "content-type": "application/json" },
                            status: 200,
                        },
                    );
                }

                return new Response("Not found", { status: 404 });
            }),
        );
    });

    it("does not render or fetch users for normal users", () => {
        render(<UserManagementPanel canManageUsers={false} />);

        expect(
            screen.queryByRole("heading", { name: "Manage user accounts" }),
        ).not.toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("loads users and posts a new user from the add dialog", async () => {
        const user = userEvent.setup();

        render(<UserManagementPanel canManageUsers />);

        expect(await screen.findByText("super@example.com")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Add user" }));

        const dialog = screen.getByRole("dialog", { name: "Add user" });
        await user.type(within(dialog).getByLabelText("Display name"), "New User");
        await user.type(within(dialog).getByLabelText("Email"), "new@example.com");
        await user.type(
            within(dialog).getByLabelText("Initial password"),
            "change-me",
        );
        await user.click(within(dialog).getByRole("button", { name: "Add user" }));

        await waitFor(() => {
            expect(mocks.completeActivity).toHaveBeenCalledOnce();
        });
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "User added.",
            pendingLabel: "Adding user…",
        });
        expect(mocks.failActivity).not.toHaveBeenCalled();

        const fetchMock = vi.mocked(fetch);
        const postCall = fetchMock.mock.calls.find(
            ([url, init]) => url === "/api/users" && init?.method === "POST",
        );

        expect(postCall).toBeDefined();
        expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
            displayName: "New User",
            email: "new@example.com",
            password: "change-me",
            role: "normal",
        });
    });

    it("sends an edited email from the edit dialog", async () => {
        const user = userEvent.setup();

        render(<UserManagementPanel canManageUsers />);

        expect(await screen.findByText("user@example.com")).toBeInTheDocument();

        const userRow = screen.getByText("user@example.com").closest("tr");

        expect(userRow).not.toBeNull();

        await user.click(
            within(userRow as HTMLTableRowElement).getByRole("button", {
                name: "Edit",
            }),
        );

        const dialog = screen.getByRole("dialog", { name: "Edit user" });

        await user.clear(within(dialog).getByLabelText("Display name"));
        await user.type(
            within(dialog).getByLabelText("Display name"),
            "Updated User",
        );
        await user.clear(within(dialog).getByLabelText("Email"));
        await user.type(
            within(dialog).getByLabelText("Email"),
            "updated@example.com",
        );
        await user.click(
            within(dialog).getByRole("button", { name: "Save user" }),
        );

        await waitFor(() => {
            expect(mocks.completeActivity).toHaveBeenCalledOnce();
        });
        expect(mocks.startActivity).toHaveBeenCalledWith({
            completedLabel: "User saved.",
            pendingLabel: "Saving user…",
        });
        expect(mocks.failActivity).not.toHaveBeenCalled();

        const fetchMock = vi.mocked(fetch);
        const patchCall = fetchMock.mock.calls.find(
            ([url, init]) =>
                url === "/api/users/user-1" && init?.method === "PATCH",
        );

        expect(patchCall).toBeDefined();
        expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
            displayName: "Updated User",
            email: "updated@example.com",
            role: "normal",
        });
    });
});
