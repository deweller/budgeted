"use client";

import { faCircleNotch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import type { ReactNode } from "react";

import {
    getWorkspaceStatusToneStyles,
    type WorkspaceStatusTone,
} from "@/lib/theme/theme-recipes";

type WorkspaceStatusPanelProps = {
    actionHref?: string;
    actionLabel?: string;
    compact?: boolean;
    isLoading?: boolean;
    message: string;
    onAction?: () => void;
    title: ReactNode;
    tone: WorkspaceStatusTone;
};

export function WorkspaceStatusPanel({
    actionHref,
    actionLabel,
    compact = false,
    isLoading = false,
    message,
    onAction,
    title,
    tone,
}: WorkspaceStatusPanelProps) {
    const styles = getWorkspaceStatusToneStyles(tone);
    const role = tone === "error" ? "alert" : "status";
    const paddingClass = compact ? "p-4" : "p-5";

    return (
        <section
            role={role}
            className={`grid gap-3 border ${paddingClass} ${styles.body}`}
        >
            <div>
                <p
                    className={`font-[family:var(--font-mono)] text-xs uppercase tracking-[0.2em] ${styles.eyebrow}`}
                >
                    {styles.label}
                </p>
                <h2 className="mt-2 flex items-center gap-2 text-lg font-semibold tracking-tight">
                    {isLoading ? (
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={faCircleNotch}
                            className="h-4 w-4 animate-spin"
                        />
                    ) : null}
                    <span>{title}</span>
                </h2>
                {message ? (
                    <p className="mt-2 text-sm leading-6">{message}</p>
                ) : null}
            </div>

            {actionLabel ? (
                actionHref ? (
                    <Link
                        href={actionHref}
                        className={`w-fit border px-4 py-2 text-sm font-medium ${styles.button}`}
                    >
                        {actionLabel}
                    </Link>
                ) : onAction ? (
                    <button
                        type="button"
                        onClick={onAction}
                        className={`w-fit border px-4 py-2 text-sm font-medium ${styles.button}`}
                    >
                        {actionLabel}
                    </button>
                ) : null
            ) : null}
        </section>
    );
}
