"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { controlClassNames } from "@/lib/theme/theme-recipes";

type HeaderStatusDisclosureProps = {
    children: ReactNode;
    label: ReactNode;
    panelClassName?: string;
    summaryClassName?: string;
};

export function HeaderStatusDisclosure({
    children,
    label,
    panelClassName = "",
    summaryClassName = "",
}: HeaderStatusDisclosureProps) {
    const disclosureRef = useRef<HTMLDetailsElement>(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        function handlePointerDown(event: PointerEvent) {
            const target = event.target;

            if (
                target instanceof Node &&
                disclosureRef.current?.contains(target)
            ) {
                return;
            }

            setIsOpen(false);
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    return (
        <details
            ref={disclosureRef}
            open={isOpen}
            onToggle={(event) => setIsOpen(event.currentTarget.open)}
            className="group relative"
        >
            <summary
                className={`flex cursor-pointer list-none items-center gap-2 whitespace-nowrap [&::-webkit-details-marker]:hidden ${controlClassNames.secondaryActionSmall} ${summaryClassName}`}
            >
                {label}
                <FontAwesomeIcon
                    aria-hidden="true"
                    icon={faChevronDown}
                    className="h-3 w-3 transition group-open:rotate-180"
                />
            </summary>
            <div
                className={`absolute right-0 z-30 mt-2 grid w-72 gap-3 border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3 text-xs text-[var(--color-muted)] shadow-[var(--shadow-panel)] ${panelClassName}`}
            >
                {children}
            </div>
        </details>
    );
}
