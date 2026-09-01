import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectionActionBar } from "@/components/shared/selection-action-bar";

describe("SelectionActionBar", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("keeps the last open content while the exit animation runs", () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        const { rerender } = render(
            <SelectionActionBar
                detail="Original detail"
                onClose={onClose}
                open
                title="Original selection"
            >
                <button type="button">Original action</button>
            </SelectionActionBar>,
        );

        expect(screen.getByText("Original selection")).toBeInTheDocument();
        expect(screen.getByText("Original detail")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Original action" }),
        ).toBeInTheDocument();

        rerender(
            <SelectionActionBar
                detail="Replacement detail"
                onClose={onClose}
                open={false}
                title="Replacement selection"
            >
                <button type="button">Replacement action</button>
            </SelectionActionBar>,
        );

        expect(screen.getByText("Original selection")).toBeInTheDocument();
        expect(screen.getByText("Original detail")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Original action" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Replacement selection"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Replacement action" }),
        ).not.toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(180);
        });

        expect(
            screen.queryByRole("region", { name: "Selected row actions" }),
        ).not.toBeInTheDocument();
    });

    it("keeps long details constrained so actions remain on the same row", () => {
        render(
            <SelectionActionBar
                detail={
                    <span className="flex w-full overflow-hidden">
                        Long memo and managed order information
                    </span>
                }
                onClose={vi.fn()}
                open
                title="Selected transaction"
            >
                <button type="button">Edit</button>
                <button type="button">Delete</button>
            </SelectionActionBar>,
        );

        const actionBar = screen.getByRole("region", {
            name: "Selected row actions",
        });
        const layout = actionBar.firstElementChild;
        const details = screen
            .getByText("Long memo and managed order information")
            .parentElement;
        const actions = screen.getByRole("button", { name: "Edit" }).parentElement;

        expect(layout).toHaveClass("min-w-0", "flex-nowrap");
        expect(details).toHaveClass("min-w-0", "overflow-hidden");
        expect(actions).toHaveClass("shrink-0");
        expect(actions).not.toHaveClass("flex-wrap");
    });
});
