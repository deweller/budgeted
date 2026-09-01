import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
    PaneList,
    PaneListActionMenu,
    PaneListShortcutLabel,
} from "@/components/shared/pane-list";

function BasicPaneList({
    onAction = () => undefined,
    onDefaultAction = () => undefined,
    showSecond = true,
}: {
    onAction?: () => void;
    onDefaultAction?: () => void;
    showSecond?: boolean;
}) {
    return (
        <PaneList aria-label="Test panes">
            <PaneList.Item
                aria-label="First pane"
                itemId="first"
                onDefaultAction={onDefaultAction}
                shortcuts={[{ key: "a", onAction }]}
            >
                First pane
            </PaneList.Item>
            {showSecond ? (
                <PaneList.Item
                    aria-label="Second pane"
                    itemId="second"
                    shortcuts={[
                        { disabled: true, key: "d", onAction },
                    ]}
                >
                    Second pane
                </PaneList.Item>
            ) : null}
        </PaneList>
    );
}

describe("PaneList", () => {
    it("supports the large navigation-pane size", () => {
        render(
            <PaneList aria-label="Large panes" size="large">
                <PaneList.Item aria-label="Large pane" itemId="large">
                    Large pane
                </PaneList.Item>
            </PaneList>,
        );

        expect(screen.getByRole("list", { name: "Large panes" })).toHaveClass(
            "gap-3",
        );
        expect(
            screen.getByRole("listitem", { name: "Large pane" }),
        ).toHaveClass("min-h-24", "gap-4", "p-5");
    });

    it("starts idle, navigates page-wide, and wraps in both directions", () => {
        const scrollIntoView = vi.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = scrollIntoView;

        render(<BasicPaneList />);

        const first = screen.getByRole("listitem", { name: "First pane" });
        const second = screen.getByRole("listitem", { name: "Second pane" });

        expect(first).not.toHaveAttribute("data-pane-list-highlighted");
        expect(second).not.toHaveAttribute("data-pane-list-highlighted");

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(first).toHaveAttribute("data-pane-list-highlighted", "true");
        expect(first).toHaveFocus();

        fireEvent.keyDown(window, { key: "ArrowDown", repeat: true });
        expect(second).toHaveAttribute("data-pane-list-highlighted", "true");

        fireEvent.keyDown(window, { key: "ArrowDown", repeat: true });
        expect(first).toHaveAttribute("data-pane-list-highlighted", "true");

        fireEvent.keyDown(window, { key: "ArrowUp" });
        expect(second).toHaveAttribute("data-pane-list-highlighted", "true");
        expect(scrollIntoView).toHaveBeenCalledTimes(4);

        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    });

    it("suppresses mouseover styling while keyboard highlighting is active", () => {
        render(
            <PaneList
                aria-label="Hover-aware panes"
                suppressHoverWhenHighlighted
            >
                <PaneList.Item aria-label="First pane" itemId="first">
                    First pane
                </PaneList.Item>
                <PaneList.Item aria-label="Second pane" itemId="second">
                    Second pane
                </PaneList.Item>
            </PaneList>,
        );

        const first = screen.getByRole("listitem", { name: "First pane" });
        const second = screen.getByRole("listitem", { name: "Second pane" });

        expect(first).toHaveClass(
            "hover:border-[var(--color-accent-ink)]",
            "hover:bg-[var(--color-panel-elevated)]",
        );
        expect(second).toHaveClass(
            "hover:border-[var(--color-accent-ink)]",
            "hover:bg-[var(--color-panel-elevated)]",
        );

        fireEvent.keyDown(window, { key: "ArrowDown" });

        expect(first).not.toHaveClass(
            "hover:border-[var(--color-accent-ink)]",
            "hover:bg-[var(--color-panel-elevated)]",
        );
        expect(second).not.toHaveClass(
            "hover:border-[var(--color-accent-ink)]",
            "hover:bg-[var(--color-panel-elevated)]",
        );
    });

    it("gates Enter and letter actions behind arrow highlighting", () => {
        const onAction = vi.fn();
        const onDefaultAction = vi.fn();

        render(
            <BasicPaneList
                onAction={onAction}
                onDefaultAction={onDefaultAction}
            />,
        );

        fireEvent.keyDown(window, { key: "a" });
        fireEvent.keyDown(window, { key: "Enter" });
        expect(onAction).not.toHaveBeenCalled();
        expect(onDefaultAction).not.toHaveBeenCalled();

        const first = screen.getByRole("listitem", { name: "First pane" });
        fireEvent.click(first);
        first.focus();
        fireEvent.keyDown(first, { key: "a" });
        expect(onAction).not.toHaveBeenCalled();

        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "A" });
        fireEvent.keyDown(window, { key: "Enter" });
        expect(onAction).toHaveBeenCalledOnce();
        expect(onDefaultAction).toHaveBeenCalledOnce();

        fireEvent.keyDown(window, { key: "a", repeat: true });
        expect(onAction).toHaveBeenCalledOnce();

        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "d" });
        expect(onAction).toHaveBeenCalledOnce();
    });

    it("ignores editable targets, modifiers, and open modal dialogs", () => {
        render(
            <>
                <input aria-label="Editable field" />
                <BasicPaneList />
            </>,
        );

        const input = screen.getByRole("textbox", { name: "Editable field" });
        const first = screen.getByRole("listitem", { name: "First pane" });

        input.focus();
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(window, { ctrlKey: true, key: "ArrowDown" });
        expect(first).not.toHaveAttribute("data-pane-list-highlighted");

        const dialog = document.createElement("div");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("role", "dialog");
        document.body.append(dialog);
        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(first).not.toHaveAttribute("data-pane-list-highlighted");
        dialog.remove();
    });

    it("supports optional groups and clears a removed highlight", () => {
        const { rerender } = render(
            <PaneList aria-label="Grouped panes">
                <PaneList.Group collapsed label="Hidden group">
                    <PaneList.Item aria-label="Hidden pane" itemId="hidden">
                        Hidden pane
                    </PaneList.Item>
                </PaneList.Group>
                <PaneList.Group label="Visible group">
                    <PaneList.Item aria-label="Visible pane" itemId="visible">
                        Visible pane
                    </PaneList.Item>
                </PaneList.Group>
            </PaneList>,
        );

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(
            screen.getByRole("listitem", { name: "Visible pane" }),
        ).toHaveAttribute("data-pane-list-highlighted", "true");

        rerender(
            <PaneList aria-label="Grouped panes">
                <PaneList.Group label="Visible group">
                    <PaneList.Item
                        aria-label="Replacement pane"
                        itemId="replacement"
                    >
                        Replacement pane
                    </PaneList.Item>
                </PaneList.Group>
            </PaneList>,
        );

        expect(
            screen.getByRole("listitem", { name: "Replacement pane" }),
        ).not.toHaveAttribute("data-pane-list-highlighted");
    });

    it("styles only the first shortcut-label letter", () => {
        render(
            <button type="button">
                <PaneListShortcutLabel label="View" />
            </button>,
        );

        const button = screen.getByRole("button", { name: "View" });
        expect(button).toHaveTextContent("View");
        expect(button.querySelector("span")).toHaveClass(
            "font-bold",
            "underline",
        );
    });

    it("offers optional overflow actions with shortcut-label formatting", () => {
        const onApplySuggestion = vi.fn();

        render(
            <PaneListActionMenu
                ariaLabel="Suggestion actions"
                actions={[
                    {
                        key: "a",
                        label: "Apply Suggestion",
                        onAction: onApplySuggestion,
                    },
                    {
                        key: "r",
                        label: "Ignore Suggestion",
                        onAction: vi.fn(),
                    },
                ]}
            />,
        );

        const trigger = screen.getByRole("button", {
            name: "Suggestion actions",
        });
        fireEvent.click(trigger);

        const menu = screen.getByRole("menu", { name: "Suggestion actions" });
        const applySuggestion = screen.getByRole("menuitem", {
            name: "Apply Suggestion",
        });
        expect(menu).toBeInTheDocument();
        expect(applySuggestion.querySelector("span")).toHaveClass(
            "font-bold",
            "underline",
        );

        fireEvent.click(applySuggestion);
        expect(onApplySuggestion).toHaveBeenCalledOnce();
        expect(
            screen.queryByRole("menu", { name: "Suggestion actions" }),
        ).not.toBeInTheDocument();
    });
});
