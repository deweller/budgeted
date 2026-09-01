"use client";

import Link from "next/link";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type SetStateAction,
    type MouseEventHandler,
    type ReactNode,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCaretDown,
    faCaretRight,
    faEllipsis,
} from "@fortawesome/free-solid-svg-icons";

import { typographyClassNames } from "@/lib/theme/theme-recipes";

export type PaneListKeyboardAction = {
    disabled?: boolean;
    key: string;
    onAction: () => void;
};

export type PaneListActionMenuAction = PaneListKeyboardAction & {
    label: string;
};

type PaneListItemRegistration = {
    defaultAction?: () => void;
    shortcuts: readonly PaneListKeyboardAction[];
};

type PaneListContextValue = {
    highlightedItemId: string | null;
    showHoverStyles: boolean;
    registerItem: (
        itemId: string,
        getRegistration: () => PaneListItemRegistration,
    ) => () => void;
    size: PaneListSize;
};

const PaneListContext = createContext<PaneListContextValue | null>(null);

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }

    if (target.closest("[data-keyboard-shortcuts-ignore='true']")) {
        return true;
    }

    const editableTarget = target.closest(
        "input, select, textarea, [role='combobox'], [role='textbox'], [contenteditable='true']",
    );

    return editableTarget !== null;
}

function isNativeInteractiveTarget(target: EventTarget | null) {
    return (
        target instanceof Element &&
        target.closest(
            "a, button, input, select, textarea, summary, [role='button'], [role='link']",
        ) !== null
    );
}

function hasOpenModalDialog() {
    return document.querySelector("[role='dialog'][aria-modal='true']") !== null;
}

function hasModifierKey(event: KeyboardEvent) {
    return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function normalizeShortcutKey(key: string) {
    return key.length === 1 ? key.toLowerCase() : key;
}

type PaneListRootProps = {
    "aria-label": string;
    children: ReactNode;
    className?: string;
    highlightedItemId?: string | null;
    onHighlightedItemIdChange?: (itemId: string | null) => void;
    size?: PaneListSize;
    suppressHoverWhenHighlighted?: boolean;
};

export type PaneListSize = "compact" | "large";

const paneListGapClassNames: Record<PaneListSize, string> = {
    compact: "gap-2",
    large: "gap-3",
};

function PaneListRoot({
    "aria-label": ariaLabel,
    children,
    className = "",
    highlightedItemId: controlledHighlightedItemId,
    onHighlightedItemIdChange,
    size = "compact",
    suppressHoverWhenHighlighted = false,
}: PaneListRootProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const registrationsRef = useRef(
        new Map<string, () => PaneListItemRegistration>(),
    );
    const [uncontrolledHighlightedItemId, setUncontrolledHighlightedItemId] =
        useState<string | null>(null);
    const isHighlightControlled = controlledHighlightedItemId !== undefined;
    const highlightedItemId = isHighlightControlled
        ? controlledHighlightedItemId
        : uncontrolledHighlightedItemId;
    const highlightedItemIdRef = useRef(highlightedItemId);
    useLayoutEffect(() => {
        highlightedItemIdRef.current = highlightedItemId;
    }, [highlightedItemId]);
    const setHighlightedItemId = useCallback(
        (nextValue: SetStateAction<string | null>) => {
            const current = highlightedItemIdRef.current;
            const next =
                typeof nextValue === "function"
                    ? nextValue(current)
                    : nextValue;

            if (next === current) {
                return;
            }

            highlightedItemIdRef.current = next;

            if (!isHighlightControlled) {
                setUncontrolledHighlightedItemId(next);
            }

            onHighlightedItemIdChange?.(next);
        },
        [isHighlightControlled, onHighlightedItemIdChange],
    );

    const registerItem = useCallback(
        (
            itemId: string,
            getRegistration: () => PaneListItemRegistration,
        ) => {
            registrationsRef.current.set(itemId, getRegistration);

            return () => {
                registrationsRef.current.delete(itemId);
                setHighlightedItemId((current) =>
                    current === itemId ? null : current,
                );
            };
        },
        [setHighlightedItemId],
    );

    useEffect(() => {
        function getVisibleItems() {
            return Array.from(
                rootRef.current?.querySelectorAll<HTMLElement>(
                    "[data-pane-list-item='true']",
                ) ?? [],
            ).filter(
                (item) =>
                    !item.hidden &&
                    item.getAttribute("aria-hidden") !== "true" &&
                    item.closest("[hidden]") === null,
            );
        }

        function focusItem(item: HTMLElement) {
            const itemId = item.dataset.paneListItemId;

            if (!itemId) {
                return;
            }

            setHighlightedItemId(itemId);
            item.focus({ preventScroll: true });
            item.scrollIntoView?.({ block: "nearest" });
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (
                event.defaultPrevented ||
                hasModifierKey(event) ||
                isEditableTarget(event.target) ||
                hasOpenModalDialog()
            ) {
                return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const items = getVisibleItems();

                if (items.length === 0) {
                    return;
                }

                const currentIndex = items.findIndex(
                    (item) =>
                        item.dataset.paneListItemId === highlightedItemId,
                );
                const nextIndex =
                    currentIndex === -1
                        ? event.key === "ArrowDown"
                            ? 0
                            : items.length - 1
                        : event.key === "ArrowDown"
                          ? (currentIndex + 1) % items.length
                          : (currentIndex - 1 + items.length) % items.length;
                const nextItem = items[nextIndex];

                if (!nextItem) {
                    return;
                }

                event.preventDefault();
                focusItem(nextItem);
                return;
            }

            if (!highlightedItemId || event.repeat) {
                return;
            }

            const registration =
                registrationsRef.current.get(highlightedItemId)?.();

            if (!registration) {
                setHighlightedItemId(null);
                return;
            }

            if (event.key === "Enter") {
                if (
                    !registration.defaultAction ||
                    isNativeInteractiveTarget(event.target)
                ) {
                    return;
                }

                event.preventDefault();
                registration.defaultAction();
                return;
            }

            const shortcut = registration.shortcuts.find(
                (candidate) =>
                    !candidate.disabled &&
                    normalizeShortcutKey(candidate.key) ===
                        normalizeShortcutKey(event.key),
            );

            if (!shortcut) {
                return;
            }

            event.preventDefault();
            shortcut.onAction();
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [highlightedItemId, setHighlightedItemId]);

    useEffect(() => {
        if (!highlightedItemId) {
            return;
        }

        const highlightedItem = Array.from(
            rootRef.current?.querySelectorAll<HTMLElement>(
                "[data-pane-list-item='true']",
            ) ?? [],
        ).find(
            (item) => item.dataset.paneListItemId === highlightedItemId,
        );

        if (!highlightedItem || document.activeElement === highlightedItem) {
            return;
        }

        highlightedItem.focus({ preventScroll: true });
        highlightedItem.scrollIntoView?.({ block: "nearest" });
    }, [highlightedItemId]);

    return (
        <PaneListContext.Provider
            value={{
                highlightedItemId,
                registerItem,
                showHoverStyles:
                    !suppressHoverWhenHighlighted || highlightedItemId === null,
                size,
            }}
        >
            <div
                ref={rootRef}
                aria-label={ariaLabel}
                className={`grid ${paneListGapClassNames[size]} ${className}`}
                role="list"
            >
                {children}
            </div>
        </PaneListContext.Provider>
    );
}

type PaneListGroupProps = {
    children: ReactNode;
    className?: string;
    collapsed?: boolean;
    label: string;
    onToggle?: () => void;
    toggleAriaLabel?: string;
};

function PaneListGroup({
    children,
    className = "",
    collapsed = false,
    label,
    onToggle,
    toggleAriaLabel,
}: PaneListGroupProps) {
    return (
        <section
            aria-label={label}
            className={`grid gap-1.5 ${className}`}
            role="group"
        >
            <h2>
                {onToggle ? (
                    <button
                        type="button"
                        aria-expanded={!collapsed}
                        aria-label={toggleAriaLabel}
                        onClick={onToggle}
                        className={`${typographyClassNames.eyebrow} inline-flex cursor-pointer items-center gap-1.5 text-left transition hover:text-[var(--color-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]`}
                    >
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={collapsed ? faCaretRight : faCaretDown}
                            />
                        </span>
                        {label}
                    </button>
                ) : (
                    <span className={typographyClassNames.eyebrow}>{label}</span>
                )}
            </h2>
            {collapsed ? null : <div className="grid gap-2">{children}</div>}
        </section>
    );
}

type PaneListItemProps = {
    "aria-label": string;
    children: ReactNode;
    className?: string;
    "data-testid"?: string;
    href?: string;
    itemId: string;
    onClick?: MouseEventHandler<HTMLElement>;
    onDefaultAction?: () => void;
    shortcuts?: readonly PaneListKeyboardAction[];
};

const paneItemBaseClassName =
    "group grid border bg-[var(--color-panel)] text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]";
const paneItemHoverClassName =
    "hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel-elevated)]";
const paneItemSizeClassNames: Record<PaneListSize, string> = {
    compact: "min-h-14 gap-3 px-3 py-2",
    large: "min-h-24 gap-4 p-5",
};

function PaneListItem({
    "aria-label": ariaLabel,
    children,
    className = "",
    "data-testid": testId,
    href,
    itemId,
    onClick,
    onDefaultAction,
    shortcuts = [],
}: PaneListItemProps) {
    const context = useContext(PaneListContext);
    const elementRef = useRef<HTMLElement | null>(null);
    const registrationRef = useRef<PaneListItemRegistration>({
        shortcuts: [],
    });

    if (!context) {
        throw new Error("PaneList.Item must be rendered inside PaneList.");
    }

    const { highlightedItemId, registerItem, showHoverStyles, size } = context;
    const isHighlighted = highlightedItemId === itemId;
    const setElementRef = useCallback((element: HTMLElement | null) => {
        elementRef.current = element;
    }, []);

    useEffect(() => {
        registrationRef.current.defaultAction = href
            ? () => elementRef.current?.click()
            : onDefaultAction;
        registrationRef.current.shortcuts = shortcuts;
    }, [href, onDefaultAction, shortcuts]);

    useEffect(
        () =>
            registerItem(
                itemId,
                () => registrationRef.current,
            ),
        [itemId, registerItem],
    );

    const itemClassName = `${paneItemBaseClassName} ${
        showHoverStyles ? paneItemHoverClassName : ""
    } ${paneItemSizeClassNames[size]} ${
        href || onDefaultAction ? "cursor-pointer" : ""
    } ${
        isHighlighted
            ? "border-[var(--color-accent-ink)] bg-[var(--color-panel-elevated)] ring-2 ring-[var(--color-accent-ring)]"
            : "border-[var(--color-border)]"
    } ${className}`;
    const sharedProps = {
        "aria-label": ariaLabel,
        "data-pane-list-highlighted": isHighlighted ? "true" : undefined,
        "data-pane-list-item": "true",
        "data-pane-list-item-id": itemId,
        "data-testid": testId,
        className: itemClassName,
        onClick,
    } as const;

    if (href) {
        return (
            <div
                aria-label={ariaLabel}
                className="contents"
                role="listitem"
            >
                <Link
                    ref={setElementRef as (
                        element: HTMLAnchorElement | null,
                    ) => void}
                    href={href}
                    {...sharedProps}
                >
                    {children}
                </Link>
            </div>
        );
    }

    return (
        <div
            ref={setElementRef as (element: HTMLDivElement | null) => void}
            role="listitem"
            tabIndex={-1}
            {...sharedProps}
        >
            {children}
        </div>
    );
}

export function PaneListShortcutLabel({ label }: { label: string }) {
    const firstLetter = label.at(0);

    if (!firstLetter) {
        return null;
    }

    return (
        <>
            <span className="font-bold underline underline-offset-2">
                {firstLetter}
            </span>
            {label.slice(1)}
        </>
    );
}

type PaneListActionMenuProps = {
    actions: readonly PaneListActionMenuAction[];
    ariaLabel: string;
};

export function PaneListActionMenu({
    actions,
    ariaLabel,
}: PaneListActionMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        function closeOnOutsidePointerDown(event: PointerEvent) {
            if (!menuRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        }

        document.addEventListener("pointerdown", closeOnOutsidePointerDown);
        window.addEventListener("keydown", closeOnEscape);

        return () => {
            document.removeEventListener(
                "pointerdown",
                closeOnOutsidePointerDown,
            );
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [isOpen]);

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                aria-label={ariaLabel}
                onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen((current) => !current);
                }}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center border border-[var(--color-border)] bg-[var(--color-panel-elevated)] text-[var(--color-text)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-panel)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]"
            >
                <FontAwesomeIcon aria-hidden="true" icon={faEllipsis} />
            </button>
            {isOpen ? (
                <div
                    role="menu"
                    aria-label={ariaLabel}
                    onClick={(event) => event.stopPropagation()}
                    className="absolute right-0 z-20 mt-2 grid min-w-48 border border-[var(--color-border)] bg-[var(--color-panel-elevated)] p-1 shadow-lg"
                >
                    {actions.map((action) => (
                        <button
                            key={action.key}
                            type="button"
                            role="menuitem"
                            disabled={action.disabled}
                            onClick={(event) => {
                                event.stopPropagation();
                                action.onAction();
                                setIsOpen(false);
                            }}
                            className={`min-h-9 px-3 py-2 text-left text-sm text-[var(--color-text)] transition hover:bg-[var(--color-panel)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent-ring)] disabled:cursor-not-allowed disabled:opacity-60 ${
                                action.disabled ? "" : "cursor-pointer"
                            }`}
                        >
                            <PaneListShortcutLabel label={action.label} />
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export const PaneList = Object.assign(PaneListRoot, {
    ActionMenu: PaneListActionMenu,
    Group: PaneListGroup,
    Item: PaneListItem,
});
