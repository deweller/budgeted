"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { signOut } from "next-auth/react";

type SignOutButtonProps = {
    ariaLabel?: string;
    className: string;
    label?: ReactNode;
    pendingLabel?: ReactNode;
    title?: string;
};

export function SignOutButton({
    ariaLabel,
    className,
    label = "Sign out",
    pendingLabel = "Signing out...",
    title,
}: SignOutButtonProps) {
    const [isPending, startTransition] = useTransition();

    return (
        <button
            type="button"
            aria-label={ariaLabel}
            title={title}
            onClick={() => {
                startTransition(async () => {
                    await signOut({ callbackUrl: "/sign-in" });
                });
            }}
            disabled={isPending}
            className={className}
        >
            {isPending ? pendingLabel : label}
        </button>
    );
}
