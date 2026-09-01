import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TransactionAmountDirection } from "@/components/transactions/transaction-amount-direction";

describe("TransactionAmountDirection", () => {
    it("shows negative amounts as red debits", () => {
        render(<TransactionAmountDirection value="-1.23" />);

        const direction = screen.getByText("Debit: $-1.23");

        expect(direction).toHaveClass("money-negative");
    });

    it("shows resolved positive expressions as green credits", () => {
        render(<TransactionAmountDirection value="4 * 5" />);

        const direction = screen.getByText("Credit: $20.00");

        expect(direction).toHaveClass("money-positive");
    });

    it("does not show a direction for zero or invalid values", () => {
        const { rerender } = render(
            <TransactionAmountDirection value="0" />,
        );

        expect(screen.queryByText(/Debit:|Credit:/)).not.toBeInTheDocument();

        rerender(<TransactionAmountDirection value="4 + ." />);

        expect(screen.queryByText(/Debit:|Credit:/)).not.toBeInTheDocument();
    });
});
