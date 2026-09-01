import { render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    activeLedgerName: "Household Ledger",
    pathname: "/transactions",
}));

vi.mock("next/navigation", () => ({
    usePathname: () => mocks.pathname,
}));

vi.mock("@/components/workspace/workspace-store-provider", () => ({
    useWorkspaceStore: () => ({
        snapshot: {
            activeLedgerName: mocks.activeLedgerName,
        },
    }),
}));

import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import {
    formatKeyboardShortcut,
    keyboardShortcutHelpSections,
    keyboardShortcuts,
} from "@/lib/keyboard-shortcuts";
import { WORKSPACE_SECTIONS } from "@/lib/navigation/workspace-sections";

describe("dashboard navigation", () => {
    beforeEach(() => {
        mocks.activeLedgerName = "Household Ledger";
        mocks.pathname = "/transactions";
    });

    it("renders the shared workspace sections for desktop and mobile and marks the current route", () => {
        render(
            <>
                <SidebarNav
                    sections={WORKSPACE_SECTIONS}
                    ledgerLabel="Household Ledger"
                />
                <MobileNav sections={WORKSPACE_SECTIONS} />
            </>,
        );

        const desktopNav = screen.getByRole("navigation", { name: "Primary" });
        const mobileNav = screen.getByRole("navigation", {
            name: "Primary mobile",
        });

        expect(desktopNav).toBeInTheDocument();
        expect(mobileNav).toBeInTheDocument();

        expect(
            within(desktopNav)
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual(WORKSPACE_SECTIONS.map((section) => section.label));
        expect(
            within(mobileNav)
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual(WORKSPACE_SECTIONS.map((section) => section.label));

        for (const section of WORKSPACE_SECTIONS) {
            expect(
                within(desktopNav).getByRole("link", { name: section.label }),
            ).toHaveAttribute("href", section.href);
            expect(
                within(mobileNav).getByRole("link", { name: section.label }),
            ).toHaveAttribute("href", section.href);
        }

        expect(
            within(desktopNav).getByRole("link", { name: "Transactions" }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(mobileNav).getByRole("link", { name: "Transactions" }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(desktopNav).getByRole("link", { name: "Monthly Budget" }),
        ).not.toHaveAttribute("aria-current");
        expect(
            within(mobileNav).getByRole("link", { name: "Monthly Budget" }),
        ).not.toHaveAttribute("aria-current");

        expect(desktopNav.parentElement?.parentElement?.className).toContain(
            "bg-[var(--color-panel)]",
        );
        expect(mobileNav.parentElement?.className).toContain(
            "bg-[var(--color-panel)]",
        );
        expect(
            within(desktopNav).getByRole("link", { name: "Transactions" })
                .className,
        ).toContain("bg-[var(--color-accent-soft)]");
        expect(screen.getByRole("link", { name: "Ledgers" })).toHaveAttribute(
            "href",
            "/ledgers",
        );
        expect(
            within(desktopNav).queryByRole("link", { name: "Ledgers" }),
        ).not.toBeInTheDocument();
        expect(
            within(mobileNav).queryByRole("link", { name: "Ledgers" }),
        ).not.toBeInTheDocument();
        expect(
            within(desktopNav).queryByRole("link", { name: "Extras" }),
        ).not.toBeInTheDocument();
        expect(
            within(mobileNav).queryByRole("link", { name: "Extras" }),
        ).not.toBeInTheDocument();
    });

    it("marks Budget Plan as the active section when the global-budget route is open", () => {
        mocks.pathname = "/global-budget";

        render(
            <>
                <SidebarNav
                    sections={WORKSPACE_SECTIONS}
                    ledgerLabel="Household Ledger"
                />
                <MobileNav sections={WORKSPACE_SECTIONS} />
            </>,
        );

        const desktopNav = screen.getByRole("navigation", { name: "Primary" });
        const mobileNav = screen.getByRole("navigation", {
            name: "Primary mobile",
        });

        expect(
            within(desktopNav).getByRole("link", { name: "Budget Plan" }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(mobileNav).getByRole("link", { name: "Budget Plan" }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(desktopNav).getByRole("link", { name: "Monthly Budget" }),
        ).not.toHaveAttribute("aria-current");
        expect(
            within(mobileNav).getByRole("link", { name: "Monthly Budget" }),
        ).not.toHaveAttribute("aria-current");
    });

    it("marks Transactions as the active section for account-specific transaction routes", () => {
        mocks.pathname = "/transactions/everyday-checking";

        render(
            <>
                <SidebarNav
                    sections={WORKSPACE_SECTIONS}
                    ledgerLabel="Household Ledger"
                />
                <MobileNav sections={WORKSPACE_SECTIONS} />
            </>,
        );

        const desktopNav = screen.getByRole("navigation", { name: "Primary" });
        const mobileNav = screen.getByRole("navigation", {
            name: "Primary mobile",
        });

        expect(
            within(desktopNav).getByRole("link", { name: "Transactions" }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(mobileNav).getByRole("link", { name: "Transactions" }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(desktopNav).getByRole("link", { name: "Accounts" }),
        ).not.toHaveAttribute("aria-current");
    });

    it("marks the Ledgers button active when the ledgers route is open", () => {
        mocks.pathname = "/ledgers";

        render(
            <>
                <SidebarNav
                    sections={WORKSPACE_SECTIONS}
                    ledgerLabel="Household Ledger"
                />
                <MobileNav sections={WORKSPACE_SECTIONS} />
            </>,
        );

        expect(screen.getByRole("link", { name: "Ledgers" })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    it("uses the active ledger name from the workspace snapshot", () => {
        mocks.activeLedgerName = "Imported Ledger";

        render(
            <SidebarNav
                sections={WORKSPACE_SECTIONS}
                ledgerLabel="Household Ledger"
            />,
        );

        expect(screen.getByText("Imported Ledger")).toBeInTheDocument();
        expect(screen.queryByText("Household Ledger")).not.toBeInTheDocument();
    });

    it("groups Ledgers, Shortcuts, and Sign out in the sidebar utility section", async () => {
        const user = userEvent.setup();

        render(
            <SidebarNav
                sections={WORKSPACE_SECTIONS}
                ledgerLabel="Household Ledger"
            />,
        );

        const utilityNavigation = screen.getByRole("navigation", {
            name: "Sidebar utilities",
        });
        const ledgersLink = within(utilityNavigation).getByRole("link", {
            name: "Ledgers",
        });
        const shortcutButton = within(utilityNavigation).getByRole("button", {
            name: "Shortcuts",
        });
        const signOutButton = screen.getByRole("button", { name: "Sign out" });

        expect(utilityNavigation).toHaveClass("border-t");
        expect(ledgersLink).toHaveAttribute("href", "/ledgers");
        expect(ledgersLink.querySelector("svg")).toBeInTheDocument();
        expect(shortcutButton.querySelector("svg")).toBeInTheDocument();
        expect(signOutButton.querySelector("svg")).toBeInTheDocument();
        expect(
            shortcutButton.compareDocumentPosition(signOutButton) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).not.toBe(0);

        await user.click(shortcutButton);

        const dialog = screen.getByRole("dialog", {
            name: "Keyboard shortcuts",
        });
        const firstShortcut = keyboardShortcutHelpSections[0].shortcuts[0];

        expect(dialog.parentElement).toHaveClass("z-[100]");
        expect(dialog.parentElement?.parentElement).toBe(document.body);

        expect(
            within(dialog).getAllByText(keyboardShortcutHelpSections[0].title)
                .length,
        ).toBeGreaterThan(0);
        expect(
            within(dialog).getAllByText(formatKeyboardShortcut(firstShortcut))
                .length,
        ).toBeGreaterThan(0);
        expect(
            within(dialog).getAllByText(firstShortcut.where).length,
        ).toBeGreaterThan(0);
        expect(
            within(dialog).getAllByText(firstShortcut.action).length,
        ).toBeGreaterThan(0);
        expect(
            within(dialog).getAllByText(firstShortcut.description).length,
        ).toBeGreaterThan(0);
        for (const shortcut of [
            keyboardShortcutHelpSections[1].shortcuts.find(
                ({ id }) => id === "transactions.saveMemo",
            ),
        ]) {
            expect(shortcut).toBeDefined();
            expect(
                within(dialog).getAllByText(formatKeyboardShortcut(shortcut!))
                    .length,
            ).toBeGreaterThan(0);
            expect(within(dialog).getAllByText(shortcut!.where).length).toBeGreaterThan(0);
            expect(
                within(dialog).getAllByText(shortcut!.description).length,
            ).toBeGreaterThan(0);
        }
        for (const labeledButtonShortcut of [
            keyboardShortcuts.transactions.applyAiClassification,
            keyboardShortcuts.transactions.rejectAiClassification,
            keyboardShortcuts.transactions.editAiClassification,
            keyboardShortcuts.home.rejectHighlightedAutoMatch,
            keyboardShortcuts.home.mergeHighlightedAutoMatch,
        ]) {
            expect(
                within(dialog).queryByText(labeledButtonShortcut.action),
            ).not.toBeInTheDocument();
        }

        await user.click(
            within(dialog).getByRole("button", {
                name: "Close keyboard shortcuts dialog",
            }),
        );

        expect(
            screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
        ).not.toBeInTheDocument();
    });
});
