import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MoneyExpressionInput } from "@/components/shared/money-expression-input";

describe("MoneyExpressionInput", () => {
    it("shows a formatted live preview while focused", () => {
        render(
            <MoneyExpressionInput aria-label="Amount" defaultValue="4 + 13" />,
        );

        const input = screen.getByLabelText("Amount");

        expect(screen.queryByText("$17.00")).not.toBeInTheDocument();

        fireEvent.focus(input);

        const preview = screen.getByRole("status", {
            name: "Value preview",
        });
        expect(preview).not.toHaveTextContent("Formatted value");
        expect(preview).toHaveTextContent("4 + 13 = $17.00");
        expect(preview.querySelector('[data-icon="calculator"]')).not.toBeNull();

        fireEvent.change(input, { target: { value: "100 + 12" } });

        expect(preview).toHaveTextContent("100 + 12 = $112.00");
    });

    it("shows muted unknown text for unresolved expressions", () => {
        render(<MoneyExpressionInput aria-label="Amount" defaultValue="4 + ." />);

        fireEvent.focus(screen.getByLabelText("Amount"));

        expect(
            screen.getByRole("status", { name: "Value preview" }),
        ).toHaveTextContent("4 + . = unknown");
        expect(screen.getByText("unknown")).toHaveClass(
            "text-[var(--color-muted)]",
        );
    });

    it("shows a signless negative value while preserving the signed input value", () => {
        const changedValues: string[] = [];
        const { container } = render(
            <form>
                <MoneyExpressionInput
                    aria-label="Amount"
                    defaultValue="-1.23"
                    name="amount"
                    onChange={(event) => changedValues.push(event.target.value)}
                />
            </form>,
        );

        const input = screen.getByLabelText("Amount");
        const form = container.querySelector("form")!;

        expect(input).toHaveValue("1.23");
        expect(
            screen.getByRole("button", {
                name: "Negative sign. Switch to positive.",
            }),
        ).toHaveClass("money-negative");
        expect(new FormData(form).get("amount")).toBe("-1.23");

        fireEvent.change(input, { target: { value: "4.56" } });

        expect(changedValues).toEqual(["-4.56"]);
        expect(new FormData(form).get("amount")).toBe("-4.56");
    });

    it("toggles an entered amount between positive and negative", () => {
        const changedValues: string[] = [];

        render(
            <MoneyExpressionInput
                aria-label="Amount"
                defaultValue="1.23"
                onChange={(event) => changedValues.push(event.target.value)}
            />,
        );

        const input = screen.getByLabelText("Amount");

        fireEvent.click(
            screen.getByRole("button", {
                name: "Positive sign. Switch to negative.",
            }),
        );

        expect(input).toHaveValue("1.23");
        expect(changedValues).toEqual(["-1.23"]);
        expect(
            screen.getByRole("button", {
                name: "Negative sign. Switch to positive.",
            }),
        ).toHaveClass("money-negative");

        fireEvent.click(
            screen.getByRole("button", {
                name: "Negative sign. Switch to positive.",
            }),
        );

        expect(changedValues).toEqual(["-1.23", "1.23"]);
        expect(
            screen.getByRole("button", {
                name: "Positive sign. Switch to negative.",
            }),
        ).toHaveClass("money-positive");
    });

    it("remembers a negative sign preference while the field is empty", () => {
        const changedValues: string[] = [];

        render(
            <MoneyExpressionInput
                aria-label="Amount"
                defaultValue=""
                onChange={(event) => changedValues.push(event.target.value)}
            />,
        );

        const input = screen.getByLabelText("Amount");
        const signButton = screen.getByRole("button", {
            name: "No value entered. Sign preference is positive. Switch to negative.",
        });

        expect(signButton).toHaveClass("money-zero");
        expect(signButton).toHaveTextContent("");

        fireEvent.click(signButton);

        expect(
            screen.getByRole("button", {
                name: "No value entered. Sign preference is negative. Switch to positive.",
            }),
        ).toHaveClass("money-zero");

        fireEvent.change(input, { target: { value: "4.56" } });

        expect(changedValues).toEqual(["-4.56"]);
        expect(
            screen.getByRole("button", {
                name: "Negative sign. Switch to positive.",
            }),
        ).toHaveClass("money-negative");
    });

    it("keeps an explicitly typed negative sign visible and saves a negative amount", () => {
        const changedValues: string[] = [];

        render(
            <MoneyExpressionInput
                aria-label="Amount"
                defaultValue=""
                onChange={(event) => changedValues.push(event.target.value)}
            />,
        );

        fireEvent.change(screen.getByLabelText("Amount"), {
            target: { value: "-42.50" },
        });

        expect(changedValues).toEqual(["-42.50"]);
        expect(screen.getByLabelText("Amount")).toHaveValue("-42.50");
        expect(
            screen.getByRole("button", {
                name: "Negative sign. Switch to positive.",
            }),
        ).toBeInTheDocument();
    });

    it("keeps an explicitly typed positive sign visible", () => {
        const changedValues: string[] = [];

        render(
            <MoneyExpressionInput
                aria-label="Amount"
                defaultValue=""
                onChange={(event) => changedValues.push(event.target.value)}
            />,
        );

        fireEvent.change(screen.getByLabelText("Amount"), {
            target: { value: "+42.50" },
        });

        expect(changedValues).toEqual(["+42.50"]);
        expect(screen.getByLabelText("Amount")).toHaveValue("+42.50");
        expect(
            screen.getByRole("button", {
                name: "Positive sign. Switch to negative.",
            }),
        ).toBeInTheDocument();
    });

    it("keeps a typed negative sign while the expression is incomplete", () => {
        const changedValues: string[] = [];

        render(
            <MoneyExpressionInput
                aria-label="Amount"
                defaultValue=""
                onChange={(event) => changedValues.push(event.target.value)}
            />,
        );

        fireEvent.change(screen.getByLabelText("Amount"), {
            target: { value: "-" },
        });

        expect(changedValues).toEqual(["-"]);
        expect(screen.getByLabelText("Amount")).toHaveValue("-");
        expect(
            screen.getByRole("button", {
                name: "Negative sign. Switch to positive.",
            }),
        ).toBeInTheDocument();
    });

    it("uses a supplied empty-field sign preference until a new key is selected", () => {
        const changedValues: string[] = [];
        const { rerender } = render(
            <MoneyExpressionInput
                aria-label="Amount"
                defaultValue=""
                emptySignPreference="negative"
                signPreferenceKey="checking"
                onChange={(event) => changedValues.push(event.target.value)}
            />,
        );

        expect(
            screen.getByRole("button", {
                name: "No value entered. Sign preference is negative. Switch to positive.",
            }),
        ).toBeInTheDocument();

        rerender(
            <MoneyExpressionInput
                aria-label="Amount"
                defaultValue=""
                emptySignPreference="positive"
                signPreferenceKey="savings"
                onChange={(event) => changedValues.push(event.target.value)}
            />,
        );

        fireEvent.change(screen.getByLabelText("Amount"), {
            target: { value: "4.56" },
        });

        expect(changedValues).toEqual(["4.56"]);
    });
});
