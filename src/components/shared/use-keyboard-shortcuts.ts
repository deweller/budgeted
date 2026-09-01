"use client";

import { useEffect } from "react";

import {
    matchesKeyboardShortcut,
    type KeyboardShortcutDefinition,
} from "@/lib/keyboard-shortcuts";

type KeyboardShortcut = KeyboardShortcutDefinition & {
    allowRepeat?: boolean;
    handler: (event: KeyboardEvent) => void;
    preventDefault?: boolean;
};

type UseKeyboardShortcutsInput = {
    capture?: boolean;
    enabled: boolean;
    ignoreEditableTargets?: boolean;
    shortcuts: KeyboardShortcut[];
};

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }

    if (target.closest("[data-keyboard-shortcuts-ignore='true']")) {
        return true;
    }

    const tagName = target.tagName.toLowerCase();

    return (
        tagName === "input" ||
        tagName === "select" ||
        tagName === "textarea" ||
        target.getAttribute("role") === "combobox" ||
        target.getAttribute("role") === "textbox" ||
        target.getAttribute("contenteditable") === "true"
    );
}

export function useKeyboardShortcuts({
    capture = false,
    enabled,
    ignoreEditableTargets = true,
    shortcuts,
}: UseKeyboardShortcutsInput) {
    useEffect(() => {
        if (!enabled || shortcuts.length === 0) {
            return;
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.defaultPrevented) {
                return;
            }

            if (
                ignoreEditableTargets &&
                isEditableTarget(event.target)
            ) {
                return;
            }

            const shortcut = shortcuts.find(
                (candidate) => matchesKeyboardShortcut(event, candidate),
            );

            if (!shortcut || (event.repeat && !shortcut.allowRepeat)) {
                return;
            }

            if (shortcut.preventDefault ?? true) {
                event.preventDefault();
            }

            shortcut.handler(event);
        }

        window.addEventListener("keydown", handleKeyDown, capture);

        return () => {
            window.removeEventListener("keydown", handleKeyDown, capture);
        };
    }, [capture, enabled, ignoreEditableTargets, shortcuts]);
}
