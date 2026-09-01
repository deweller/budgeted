"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";

import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import { useFeedbackToasts } from "@/components/shared/feedback-toast-provider";
import { useBackgroundMutationActivity } from "@/components/shared/background-mutation-activity-provider";
import { useEscapeToClose } from "@/components/shared/use-escape-to-close";
import { useInitialFocus } from "@/components/shared/use-initial-focus";
import type { UserAccountRole } from "@/features/users/models/user-account-form";
import { parseApiErrorMessage } from "@/lib/api/client-errors";
import { formatMediumDisplayDate } from "@/lib/dates/local-date";
import {
    controlClassNames,
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type ManagedUser = {
    createdAt: string;
    displayName: string;
    email: string;
    role: UserAccountRole;
    updatedAt: string;
    userId: string;
};

type UserManagementPanelProps = {
    canManageUsers: boolean;
};

type UserDialogState =
    | {
          mode: "create";
          user?: never;
      }
    | {
          mode: "edit";
          user: ManagedUser;
      };

function formatRole(role: UserAccountRole) {
    return role === "super" ? "Super user" : "Normal user";
}

async function requestManagedUsers() {
    const response = await fetch("/api/users");

    if (!response.ok) {
        throw new Error(
            await parseApiErrorMessage(response, "Unable to load users."),
        );
    }

    const payload = (await response.json()) as { users: ManagedUser[] };

    return payload.users;
}

function UserDialog({
    isSubmitting,
    onClose,
    onSubmit,
    state,
}: {
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (formData: FormData) => void;
    state: UserDialogState | null;
}) {
    const displayNameInputRef = useRef<HTMLInputElement>(null);

    useEscapeToClose({
        enabled: state !== null && !isSubmitting,
        onClose,
    });
    useInitialFocus(displayNameInputRef, {
        enabled: state !== null,
        select: state?.mode === "edit",
    });

    if (!state) {
        return null;
    }

    const isCreate = state.mode === "create";

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="user-dialog-title"
                className={`max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className={typographyClassNames.eyebrow}>
                            User account
                        </p>
                        <h2
                            id="user-dialog-title"
                            className="mt-2 text-2xl font-semibold tracking-tight"
                        >
                            {isCreate ? "Add user" : "Edit user"}
                        </h2>
                    </div>
                    <DialogCloseButton
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close user dialog"
                    />
                </div>

                <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
                    <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                        Display name
                        <input
                            ref={displayNameInputRef}
                            required
                            name="displayName"
                            defaultValue={
                                state.mode === "edit"
                                    ? state.user.displayName
                                    : ""
                            }
                            className={controlClassNames.fieldCompact}
                        />
                    </label>

                    {isCreate ? (
                        <>
                            <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                                Email
                                <input
                                    required
                                    name="email"
                                    type="email"
                                    className={controlClassNames.fieldCompact}
                                />
                            </label>
                            <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                                Initial password
                                <input
                                    required
                                    minLength={8}
                                    name="password"
                                    type="password"
                                    className={controlClassNames.fieldCompact}
                                />
                            </label>
                        </>
                    ) : (
                        <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                            Email
                            <input
                                required
                                name="email"
                                type="email"
                                defaultValue={state.user.email}
                                className={controlClassNames.fieldCompact}
                            />
                        </label>
                    )}

                    <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                        Role
                        <select
                            name="role"
                            defaultValue={
                                state.mode === "edit"
                                    ? state.user.role
                                    : "normal"
                            }
                            className={controlClassNames.fieldCompact}
                        >
                            <option value="normal">Normal user</option>
                            <option value="super">Super user</option>
                        </select>
                    </label>

                    <div className="flex flex-wrap justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className={controlClassNames.secondaryAction}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={controlClassNames.primaryAction}
                        >
                            {isSubmitting
                                ? "Saving..."
                                : isCreate
                                  ? "Add user"
                                  : "Save user"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PasswordDialog({
    isSubmitting,
    onClose,
    onSubmit,
    user,
}: {
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (formData: FormData) => void;
    user: ManagedUser | null;
}) {
    const passwordInputRef = useRef<HTMLInputElement>(null);

    useEscapeToClose({
        enabled: user !== null && !isSubmitting,
        onClose,
    });
    useInitialFocus(passwordInputRef, { enabled: user !== null });

    if (!user) {
        return null;
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="password-dialog-title"
                className={`max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain p-6 ${surfaceClassNames.panel}`}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className={typographyClassNames.eyebrow}>
                            Password reset
                        </p>
                        <h2
                            id="password-dialog-title"
                            className="mt-2 text-2xl font-semibold tracking-tight"
                        >
                            Reset password
                        </h2>
                    </div>
                    <DialogCloseButton
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close password reset dialog"
                    />
                </div>

                <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
                    <p className={`text-sm ${typographyClassNames.mutedBody}`}>
                        Set a new password for {user.email}.
                    </p>
                    <label className="grid gap-2 text-sm font-medium text-[var(--color-ink)]">
                        New password
                        <input
                            ref={passwordInputRef}
                            required
                            minLength={8}
                            name="password"
                            type="password"
                            className={controlClassNames.fieldCompact}
                        />
                    </label>
                    <div className="flex flex-wrap justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className={controlClassNames.secondaryAction}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={controlClassNames.primaryAction}
                        >
                            {isSubmitting
                                ? "Resetting..."
                                : "Reset password"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function UserManagementPanel({
    canManageUsers,
}: UserManagementPanelProps) {
    const { notifyError } = useFeedbackToasts();
    const { startActivity } = useBackgroundMutationActivity();
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [isLoading, setIsLoading] = useState(canManageUsers);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [userDialogState, setUserDialogState] =
        useState<UserDialogState | null>(null);
    const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
    const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);

    async function loadUsers() {
        if (!canManageUsers) {
            return;
        }

        setIsLoading(true);
        setLoadError(null);

        try {
            setUsers(await requestManagedUsers());
        } catch (error) {
            setLoadError(
                error instanceof Error
                    ? error.message
                    : "Unable to load users.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (!canManageUsers) {
            return;
        }

        let isActive = true;

        void requestManagedUsers()
            .then((nextUsers) => {
                if (!isActive) {
                    return;
                }

                setUsers(nextUsers);
                setLoadError(null);
            })
            .catch((error: unknown) => {
                if (!isActive) {
                    return;
                }

                setLoadError(
                    error instanceof Error
                        ? error.message
                        : "Unable to load users.",
                );
            })
            .finally(() => {
                if (isActive) {
                    setIsLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [canManageUsers]);

    if (!canManageUsers) {
        return null;
    }

    async function saveUser(formData: FormData) {
        if (!userDialogState) {
            return;
        }

        setIsSubmitting(true);
        const activity = startActivity({
            completedLabel:
                userDialogState.mode === "create" ? "User added." : "User saved.",
            pendingLabel:
                userDialogState.mode === "create" ? "Adding user…" : "Saving user…",
        });

        try {
            const isCreate = userDialogState.mode === "create";
            const response = await fetch(
                isCreate
                    ? "/api/users"
                    : `/api/users/${userDialogState.user.userId}`,
                {
                    method: isCreate ? "POST" : "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        displayName: String(
                            formData.get("displayName") ?? "",
                        ),
                        email: String(formData.get("email") ?? ""),
                        password: String(formData.get("password") ?? ""),
                        role: String(formData.get("role") ?? "normal"),
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(response, "Unable to save user."),
                );
            }

            const payload = (await response.json()) as ManagedUser & {
                requiresSignOut?: boolean;
            };

            setUserDialogState(null);
            await loadUsers();
            activity.complete();

            if (payload.requiresSignOut) {
                void signOut({ callbackUrl: "/sign-in" });
            }
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to save user.",
                title: "User could not be saved.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    async function resetPassword(formData: FormData) {
        if (!passwordUser) {
            return;
        }

        setIsSubmitting(true);
        const activity = startActivity({
            completedLabel: "Password reset.",
            pendingLabel: "Resetting password…",
        });

        try {
            const response = await fetch(
                `/api/users/${passwordUser.userId}/password`,
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        password: String(formData.get("password") ?? ""),
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to reset password.",
                    ),
                );
            }

            setPasswordUser(null);
            await loadUsers();
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to reset password.",
                title: "Password could not be reset.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    async function deleteUserNow() {
        if (!deleteUser) {
            return;
        }

        setIsSubmitting(true);
        const activity = startActivity({
            completedLabel: "User deleted.",
            pendingLabel: "Deleting user…",
        });

        try {
            const response = await fetch(`/api/users/${deleteUser.userId}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error(
                    await parseApiErrorMessage(
                        response,
                        "Unable to delete user.",
                    ),
                );
            }

            setDeleteUser(null);
            await loadUsers();
            activity.complete();
        } catch (error) {
            activity.fail();
            notifyError({
                message:
                    error instanceof Error
                        ? error.message
                        : "Unable to delete user.",
                title: "User could not be deleted.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <section className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                        Manage user accounts
                    </h2>
                </div>
                <button
                    type="button"
                    className={`${controlClassNames.primaryActionCompact} cursor-pointer`}
                    onClick={() => setUserDialogState({ mode: "create" })}
                >
                    Add user
                </button>
            </div>

            {loadError ? (
                <div className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] p-4 text-sm text-[var(--tone-error-ink)]">
                    {loadError}
                </div>
            ) : null}

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                            <th className="px-4 py-3 font-medium">User</th>
                            <th className="px-4 py-3 font-medium">Role</th>
                            <th className="px-4 py-3 font-medium">Created</th>
                            <th className="px-4 py-3 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="px-4 py-8 text-center text-[var(--color-muted)]"
                                >
                                    Loading users...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="px-4 py-8 text-center text-[var(--color-muted)]"
                                >
                                    No users found.
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr
                                    key={user.userId}
                                    className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                >
                                    <td className="px-4 py-3 align-middle">
                                        <div className="grid gap-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium text-[var(--color-ink)]">
                                                    {user.displayName}
                                                </span>
                                            </div>
                                            <span
                                                className={`text-xs ${typographyClassNames.mutedBody}`}
                                            >
                                                {user.email}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                        {formatRole(user.role)}
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                        {formatMediumDisplayDate(
                                            user.createdAt,
                                        )}
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                className={
                                                    controlClassNames.secondaryActionSmall
                                                }
                                                onClick={() =>
                                                    setUserDialogState({
                                                        mode: "edit",
                                                        user,
                                                    })
                                                }
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className={
                                                    controlClassNames.secondaryActionSmall
                                                }
                                                onClick={() =>
                                                    setPasswordUser(user)
                                                }
                                            >
                                                Reset password
                                            </button>
                                            <button
                                                type="button"
                                                className="border border-[var(--tone-error-border)] bg-[var(--tone-error-surface)] px-3 py-2 text-xs font-medium text-[var(--tone-error-ink)] transition hover:bg-[var(--tone-error-surface-strong)]"
                                                onClick={() =>
                                                    setDeleteUser(user)
                                                }
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <UserDialog
                isSubmitting={isSubmitting}
                onClose={() => setUserDialogState(null)}
                onSubmit={(formData) => void saveUser(formData)}
                state={userDialogState}
            />
            <PasswordDialog
                isSubmitting={isSubmitting}
                onClose={() => setPasswordUser(null)}
                onSubmit={(formData) => void resetPassword(formData)}
                user={passwordUser}
            />
            <DeleteConfirmationDialog
                canConfirm
                confirmLabel="Delete user"
                isSubmitting={isSubmitting}
                onClose={() => setDeleteUser(null)}
                onConfirm={() => void deleteUserNow()}
                open={deleteUser !== null}
                title={
                    deleteUser ? `Delete ${deleteUser.displayName}?` : undefined
                }
                warningMessage="This permanently deletes the user account. Ledger data is not deleted."
            />
        </section>
    );
}
