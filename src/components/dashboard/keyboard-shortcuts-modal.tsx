"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { useEscapeToClose } from "@/components/shared/use-escape-to-close";
import { DialogCloseButton } from "@/components/shared/dialog-close-button";
import {
    formatKeyboardShortcut,
    keyboardShortcutHelpSections,
} from "@/lib/keyboard-shortcuts";
import {
    surfaceClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

type KeyboardShortcutsModalProps = {
    onClose: () => void;
    open: boolean;
};

export function KeyboardShortcutsModal({
    onClose,
    open,
}: KeyboardShortcutsModalProps) {
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEscapeToClose({ enabled: open, onClose });

    useEffect(() => {
        if (!open) {
            return;
        }

        closeButtonRef.current?.focus();
    }, [open]);

    if (!open) {
        return null;
    }

    if (typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(7,16,27,0.78)] p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="keyboard-shortcuts-title"
                data-keyboard-shortcuts-ignore="true"
                className={`max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto p-6 ${surfaceClassNames.panel}`}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className={typographyClassNames.eyebrow}>
                            Reference
                        </p>
                        <h2
                            id="keyboard-shortcuts-title"
                            className="mt-2 text-2xl font-semibold tracking-tight"
                        >
                            Keyboard shortcuts
                        </h2>
                    </div>
                    <DialogCloseButton
                        ref={closeButtonRef}
                        onClick={onClose}
                        aria-label="Close keyboard shortcuts dialog"
                    />
                </div>

                <div className="mt-6 grid gap-6">
                    {keyboardShortcutHelpSections.map((section) => (
                        <section key={section.title} className="grid gap-3">
                            <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                                {section.title}
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                                            <th className="px-4 py-3 font-medium">
                                                Shortcut
                                            </th>
                                            <th className="px-4 py-3 font-medium">
                                                Where
                                            </th>
                                            <th className="px-4 py-3 font-medium">
                                                Action
                                            </th>
                                            <th className="px-4 py-3 font-medium">
                                                Details
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {section.shortcuts.map((shortcut) => (
                                            <tr
                                                key={shortcut.id}
                                                className="border-b border-[var(--color-border)]/70 last:border-b-0"
                                            >
                                                <td className="whitespace-nowrap px-4 py-3 align-top">
                                                    <kbd className="border border-[var(--color-border)] bg-[var(--color-panel-strong)] px-2 py-1 font-[family:var(--font-mono)] text-xs text-[var(--color-ink)]">
                                                        {formatKeyboardShortcut(
                                                            shortcut,
                                                        )}
                                                    </kbd>
                                                </td>
                                                <td className="px-4 py-3 align-top text-[var(--color-muted)]">
                                                    {shortcut.where}
                                                </td>
                                                <td className="px-4 py-3 align-top font-medium text-[var(--color-ink)]">
                                                    {shortcut.action}
                                                </td>
                                                <td className="px-4 py-3 align-top text-[var(--color-muted)]">
                                                    {shortcut.description}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}
