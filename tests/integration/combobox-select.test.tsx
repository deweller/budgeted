import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
    ComboboxSelect,
    type ComboboxSelectOption,
} from "@/components/shared/combobox-select";

const accountOptions: ComboboxSelectOption[] = [
    { label: "Checking", value: "checking" },
    { label: "Savings", value: "savings" },
    {
        description: "Archived",
        descriptionClassName: "money-negative",
        label: "Old credit card",
        value: "old-credit-card",
    },
];

function ComboboxHarness({
    disabled = false,
    emptyOption,
    initialValue = "checking",
    showFollowingInput = false,
}: {
    disabled?: boolean;
    emptyOption?: ComboboxSelectOption;
    initialValue?: string;
    showFollowingInput?: boolean;
}) {
    const [value, setValue] = useState(initialValue);

    return (
        <form aria-label="Combobox form">
            <ComboboxSelect
                disabled={disabled}
                emptyOption={emptyOption}
                label="Account"
                name="accountId"
                noResultsLabel="No accounts found"
                onChange={setValue}
                options={accountOptions}
                value={value}
            />
            <output aria-label="Selected value">{value}</output>
            {showFollowingInput ? <input aria-label="Following input" /> : null}
        </form>
    );
}

function getHiddenInput() {
    return document.querySelector<HTMLInputElement>('input[name="accountId"]');
}

describe("ComboboxSelect", () => {
    it("shows all options when opened before typed filtering", async () => {
        const user = userEvent.setup();

        render(<ComboboxHarness />);

        const combobox = screen.getByRole("combobox", { name: "Account" });

        await user.click(combobox);

        expect(
            screen.getByRole("option", { name: "Checking" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("option", { name: "Savings" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("option", {
                name: /Old credit card/,
            }),
        ).toBeInTheDocument();

        await user.type(combobox, "sav");

        expect(
            screen.getByRole("option", { name: "Savings" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("option", { name: "Checking" }),
        ).not.toBeInTheDocument();
    });

    it("uses high contrast styling for the highlighted option", async () => {
        const user = userEvent.setup();

        render(<ComboboxHarness />);

        const combobox = screen.getByRole("combobox", { name: "Account" });

        await user.click(combobox);

        const highlightedOption = screen.getByRole("option", {
            name: "Checking",
        });
        const unselectedOption = screen.getByRole("option", {
            name: "Savings",
        });

        expect(highlightedOption.className).toContain("bg-[#061126]");
        expect(highlightedOption.className).toContain("border-[#9db7ff]");
        expect(highlightedOption.className).not.toContain(
            "bg-[var(--color-panel-strong)]",
        );
        expect(unselectedOption.className).toContain(
            "bg-[var(--color-panel-strong)]",
        );
        expect(unselectedOption.className).not.toContain(
            "border-[var(--tone-info-ink)]",
        );
    });

    it("renders option descriptions with their supplied tone", async () => {
        const user = userEvent.setup();

        render(<ComboboxHarness />);

        await user.click(screen.getByRole("combobox", { name: "Account" }));

        expect(screen.getByText("Archived")).toHaveClass("money-negative");
    });

    it("filters options and selects with arrow keys and enter", async () => {
        const user = userEvent.setup();

        render(<ComboboxHarness />);

        const combobox = screen.getByRole("combobox", { name: "Account" });

        await user.click(combobox);
        await user.clear(combobox);
        await user.type(combobox, "sav");

        expect(
            screen.getByRole("option", { name: "Savings" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("option", { name: "Checking" }),
        ).not.toBeInTheDocument();

        await user.keyboard("{ArrowDown}{Enter}");

        expect(combobox).toHaveValue("Savings");
        expect(screen.getByLabelText("Selected value")).toHaveTextContent(
            "savings",
        );
        expect(getHiddenInput()).toHaveValue("savings");
        expect(document.querySelector("select")).toBeNull();
    });

    it("selects the typed matching option with enter without keeping a stale highlight", async () => {
        const user = userEvent.setup();

        render(<ComboboxHarness />);

        const combobox = screen.getByRole("combobox", { name: "Account" });

        await user.click(combobox);
        await user.clear(combobox);
        await user.type(combobox, "sav");
        await user.keyboard("{Enter}");

        expect(combobox).toHaveValue("Savings");
        expect(screen.getByLabelText("Selected value")).toHaveTextContent(
            "savings",
        );
        expect(getHiddenInput()).toHaveValue("savings");
    });

    it("restores the selected value for unmatched text on escape and blur", async () => {
        const user = userEvent.setup();

        render(<ComboboxHarness />);

        const combobox = screen.getByRole("combobox", { name: "Account" });

        await user.click(combobox);
        await user.clear(combobox);
        await user.type(combobox, "missing");
        await user.keyboard("{Escape}");

        expect(combobox).toHaveValue("Checking");
        expect(getHiddenInput()).toHaveValue("checking");

        await user.click(combobox);
        await user.clear(combobox);
        await user.type(combobox, "not a saved account");
        await user.tab();

        expect(combobox).toHaveValue("Checking");
        expect(getHiddenInput()).toHaveValue("checking");
    });

    it("moves directly to the following field when tabbing out of the combobox", async () => {
        const user = userEvent.setup();

        render(<ComboboxHarness showFollowingInput />);

        const combobox = screen.getByRole("combobox", { name: "Account" });
        await user.click(combobox);

        expect(
            screen.getByRole("button", { name: "Toggle Account choices" }),
        ).toHaveAttribute("tabindex", "-1");

        await user.tab();

        expect(screen.getByLabelText("Following input")).toHaveFocus();
    });

    it("supports empty options and disabled state", async () => {
        const user = userEvent.setup();
        const { rerender } = render(
            <ComboboxHarness
                emptyOption={{ label: "All accounts", value: "" }}
            />,
        );

        const combobox = screen.getByRole("combobox", { name: "Account" });

        await user.click(combobox);
        await user.clear(combobox);
        await user.type(combobox, "all");
        await user.keyboard("{ArrowDown}{Enter}");

        expect(combobox).toHaveValue("All accounts");
        expect(getHiddenInput()).toHaveValue("");

        rerender(<ComboboxHarness key="disabled-state" disabled />);

        expect(screen.getByRole("combobox", { name: "Account" })).toBeDisabled();
        expect(getHiddenInput()).toHaveValue("checking");
    });
});
