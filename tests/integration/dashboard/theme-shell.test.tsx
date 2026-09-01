import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    pathname: "/transactions",
    signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => mocks.pathname,
}));

vi.mock("next-auth/react", () => ({
    signOut: mocks.signOut,
}));

import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { WorkspaceStatusPanel } from "@/components/dashboard/workspace-status-panel";
import { WORKSPACE_SECTIONS } from "@/lib/navigation/workspace-sections";

describe("dashboard theme shell", () => {
    beforeEach(() => {
        mocks.pathname = "/transactions";
        mocks.signOut.mockReset();
    });

    it("renders dark shell classes for shared navigation and status surfaces", () => {
        render(
            <>
                <SidebarNav
                    sections={WORKSPACE_SECTIONS}
                    ledgerLabel="Household Ledger"
                />
                <MobileNav sections={WORKSPACE_SECTIONS} />
                <WorkspaceStatusPanel
                    message="The workspace is in sync."
                    title="Saved state"
                    tone="info"
                />
            </>,
        );

        const desktopNav = screen.getByRole("navigation", { name: "Primary" });
        const mobileNav = screen.getByRole("navigation", {
            name: "Primary mobile",
        });
        const statusPanel = screen.getByRole("status");

        const desktopShell = desktopNav.closest("aside");
        const mobileShell = mobileNav.closest("section");

        expect(desktopShell?.className).toContain(
            "bg-[var(--color-panel)]",
        );
        expect(desktopShell?.className).toContain("lg:sticky");
        expect(desktopShell?.className).toContain("lg:top-0");
        expect(desktopShell?.className).toContain("lg:h-screen");
        expect(desktopShell?.className).toContain("min-h-[40rem]");
        expect(mobileShell?.className).toContain(
            "bg-[var(--color-panel)]",
        );
        expect(statusPanel.className).toContain(
            "bg-[var(--tone-info-surface)]",
        );

        const activeDesktopLink = within(desktopNav).getByRole("link", {
            name: "Transactions",
        });
        const idleDesktopLink = within(desktopNav).getByRole("link", {
            name: "Monthly Budget",
        });

        expect(activeDesktopLink.className).toContain(
            "bg-[var(--color-accent-soft)]",
        );
        expect(idleDesktopLink.className).toContain("bg-[var(--color-panel)]");
        expect(
            screen.queryByRole("button", {
                name: /theme|light mode|dark mode/i,
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText(/theme|appearance/i),
        ).not.toBeInTheDocument();
    });
});
