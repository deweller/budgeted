"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    faBook,
    faChevronLeft,
    faChevronRight,
    faCircleQuestion,
    faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { WorkspaceSection } from "@/lib/navigation/workspace-sections";
import {
    controlClassNames,
    typographyClassNames,
} from "@/lib/theme/theme-recipes";

import { WorkspaceNavLinks } from "@/components/dashboard/workspace-nav-links";
import { KeyboardShortcutsModal } from "@/components/dashboard/keyboard-shortcuts-modal";
import { SidebarMutationActivity } from "@/components/dashboard/sidebar-mutation-activity";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { useWorkspaceStore } from "@/components/workspace/workspace-store-provider";

type SidebarNavProps = {
    ledgerLabel: string;
    sections: WorkspaceSection[];
};

export function SidebarNav({ ledgerLabel, sections }: SidebarNavProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] =
        useState(false);
    const pathname = usePathname();
    const { snapshot } = useWorkspaceStore();
    const currentLedgerLabel = snapshot.activeLedgerName || ledgerLabel;
    const isManagingLedgers = pathname === "/ledgers";
    const toggleLabel = isCollapsed
        ? "Expand navigation"
        : "Collapse navigation";

    return (
        <aside
            className={`hidden min-h-[40rem] border-r border-[var(--color-border)] bg-[var(--color-panel)] transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden ${
                isCollapsed ? "w-[72px]" : "w-60"
            }`}
        >
            <div
                className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
                    isCollapsed ? "px-3 py-5" : "p-5"
                }`}
            >
                <div
                    className={`flex items-start gap-3 ${
                        isCollapsed ? "justify-center" : "justify-between"
                    }`}
                >
                    <div
                        className={
                            isCollapsed
                                ? "sr-only"
                                : "min-w-0 overflow-hidden"
                        }
                    >
                        <p className={typographyClassNames.eyebrow}>Budgeted</p>
                        <p
                            title={currentLedgerLabel}
                            className="mt-3 truncate text-lg font-semibold leading-none tracking-tight"
                        >
                            {currentLedgerLabel}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label={toggleLabel}
                        title={toggleLabel}
                        onClick={() => {
                            setIsCollapsed((currentValue) => !currentValue);
                        }}
                        className={`flex size-10 shrink-0 items-center justify-center ${controlClassNames.secondaryActionSmall}`}
                    >
                        <FontAwesomeIcon
                            aria-hidden="true"
                            icon={
                                isCollapsed ? faChevronRight : faChevronLeft
                            }
                        />
                    </button>
                </div>
                <WorkspaceNavLinks
                    ariaLabel="Primary"
                    collapsed={isCollapsed}
                    layout="stacked"
                    sections={sections}
                />
            </div>
            <nav
                aria-label="Sidebar utilities"
                className={`grid shrink-0 gap-2 border-t border-[var(--color-border)] ${
                    isCollapsed ? "p-3" : "p-5"
                }`}
            >
                <Link
                    href="/ledgers"
                    aria-current={isManagingLedgers ? "page" : undefined}
                    title="Ledgers"
                    className={`flex h-11 w-full items-center gap-3 ${
                        isCollapsed ? "justify-center !px-0" : "justify-start"
                    } ${controlClassNames.secondaryAction} ${
                        isManagingLedgers
                            ? "!border-[var(--color-accent-ink)] !bg-[var(--color-accent-soft)]"
                            : ""
                    }`}
                >
                    <FontAwesomeIcon aria-hidden="true" icon={faBook} />
                    <span className={isCollapsed ? "sr-only" : undefined}>
                        Ledgers
                    </span>
                </Link>
                <button
                    type="button"
                    title="Keyboard shortcuts"
                    onClick={() => setIsKeyboardShortcutsOpen(true)}
                    className={`flex h-11 w-full cursor-pointer items-center gap-3 ${
                        isCollapsed ? "justify-center !px-0" : "justify-start"
                    } ${controlClassNames.secondaryAction}`}
                >
                    <FontAwesomeIcon
                        aria-hidden="true"
                        icon={faCircleQuestion}
                    />
                    <span className={isCollapsed ? "sr-only" : undefined}>
                        Shortcuts
                    </span>
                </button>
                <SignOutButton
                    className={`flex h-11 w-full items-center gap-3 ${
                        isCollapsed ? "justify-center !px-0" : "justify-start"
                    } ${controlClassNames.secondaryAction}`}
                    label={
                        <>
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={faRightFromBracket}
                            />
                            <span className={isCollapsed ? "sr-only" : undefined}>
                                Sign out
                            </span>
                        </>
                    }
                    pendingLabel={
                        <>
                            <FontAwesomeIcon
                                aria-hidden="true"
                                icon={faRightFromBracket}
                            />
                            <span className={isCollapsed ? "sr-only" : undefined}>
                                Signing out...
                            </span>
                        </>
                    }
                    title="Sign out"
                />
            </nav>
            <SidebarMutationActivity
                isCollapsed={isCollapsed}
                onExpandSidebar={() => setIsCollapsed(false)}
            />
            <KeyboardShortcutsModal
                open={isKeyboardShortcutsOpen}
                onClose={() => setIsKeyboardShortcutsOpen(false)}
            />
        </aside>
    );
}
