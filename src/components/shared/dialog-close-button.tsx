"use client";

import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

type DialogCloseButtonProps = Omit<
    ComponentPropsWithoutRef<"button">,
    "children" | "type"
>;

export const DialogCloseButton = forwardRef<
    HTMLButtonElement,
    DialogCloseButtonProps
>(function DialogCloseButton(
    { "aria-label": ariaLabel = "Close dialog", className = "", ...props },
    ref,
) {
    return (
        <button
            {...props}
            ref={ref}
            type="button"
            aria-label={ariaLabel}
            className={`flex size-10 cursor-pointer items-center justify-center text-[var(--color-muted)] transition hover:bg-[var(--color-panel-elevated)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        >
            <FontAwesomeIcon aria-hidden="true" icon={faXmark} />
        </button>
    );
});
