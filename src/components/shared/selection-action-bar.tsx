"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import { useEscapeToClose } from "./use-escape-to-close";

const actionBarAnimationMs = 180;

type SelectionActionBarProps = {
    ariaLabel?: string;
    children: ReactNode;
    closeOnEscape?: boolean;
    detail?: ReactNode;
    eyebrow?: ReactNode;
    onClose: () => void;
    open: boolean;
    title: ReactNode;
    titleClearsSelection?: boolean;
};

type SelectionActionBarContent = Pick<
    SelectionActionBarProps,
    "children" | "detail" | "eyebrow" | "title" | "titleClearsSelection"
>;

export function SelectionActionBar({
    ariaLabel = "Selected row actions",
    children,
    closeOnEscape = true,
    detail,
    eyebrow,
    onClose,
    open,
    title,
    titleClearsSelection = false,
}: SelectionActionBarProps) {
    const [shouldRender, setShouldRender] = useState(open);
    const [isExiting, setIsExiting] = useState(false);
    const currentContent = {
        children,
        detail,
        eyebrow,
        title,
        titleClearsSelection,
    };
    const [renderedContent, setRenderedContent] =
        useState<SelectionActionBarContent>(() => currentContent);
    const visibleContent = open ? currentContent : renderedContent;

    useEffect(() => {
        if (open) {
            const contentTimeout = window.setTimeout(() => {
                setRenderedContent({
                    children,
                    detail,
                    eyebrow,
                    title,
                    titleClearsSelection,
                });
            }, 0);

            return () => {
                window.clearTimeout(contentTimeout);
            };
        }
    }, [children, detail, eyebrow, open, title, titleClearsSelection]);

    useEffect(() => {
        if (open) {
            const showTimeout = window.setTimeout(() => {
                setShouldRender(true);
                setIsExiting(false);
            }, 0);

            return () => {
                window.clearTimeout(showTimeout);
            };
        }

        if (shouldRender) {
            const exitTimeout = window.setTimeout(() => {
                setIsExiting(true);
            }, 0);
            const hideTimeout = window.setTimeout(() => {
                setShouldRender(false);
                setIsExiting(false);
            }, actionBarAnimationMs);

            return () => {
                window.clearTimeout(exitTimeout);
                window.clearTimeout(hideTimeout);
            };
        }
    }, [open, shouldRender]);

    useEscapeToClose({ enabled: closeOnEscape && shouldRender && open, onClose });

    if (!shouldRender) {
        return null;
    }

    return (
        <div
            aria-label={ariaLabel}
            className="fixed inset-x-0 bottom-0 z-40"
            role="region"
        >
            <div
                className={`flex w-full min-w-0 flex-nowrap items-center justify-between gap-4 border-t border-[var(--color-action-bar-border)] bg-[var(--color-action-bar)] p-4 text-[var(--color-action-bar-ink)] shadow-[var(--shadow-action-bar)] ${
                    isExiting
                        ? "selection-action-bar-exit"
                        : "selection-action-bar-enter"
                }`}
            >
                <div className="min-w-0 flex-1 overflow-hidden">
                    {visibleContent.eyebrow ? (
                        <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.22em] text-[var(--color-action-bar-muted)]">
                            {visibleContent.eyebrow}
                        </p>
                    ) : null}
                    {visibleContent.titleClearsSelection ? (
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-1 inline-flex max-w-full cursor-pointer items-center gap-2 border border-[var(--color-action-bar-border)] bg-[var(--color-action-bar-control)] px-2.5 py-1.5 text-left text-sm font-semibold text-[var(--color-action-bar-ink)] transition hover:bg-[var(--color-action-bar-control-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
                        >
                            <FontAwesomeIcon
                                icon={faXmark}
                                aria-hidden="true"
                                className="h-3.5 w-3.5 shrink-0"
                            />
                            <span className="truncate">
                                {visibleContent.title}
                            </span>
                        </button>
                    ) : (
                        <div className="mt-1 truncate text-sm font-semibold text-[var(--color-action-bar-ink)]">
                            {visibleContent.title}
                        </div>
                    )}
                    {visibleContent.detail ? (
                        <div className="mt-1 min-w-0 overflow-hidden text-xs text-[var(--color-action-bar-muted)]">
                            {visibleContent.detail}
                        </div>
                    ) : null}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {visibleContent.children}
                </div>
            </div>
        </div>
    );
}
