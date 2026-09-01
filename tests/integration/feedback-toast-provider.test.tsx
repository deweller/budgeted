import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    FeedbackToastProvider,
    useFeedbackToasts,
} from "@/components/shared/feedback-toast-provider";

function UpdateToastTrigger() {
    const { notifyWarning } = useFeedbackToasts();

    return (
        <button
            type="button"
            onClick={() =>
                notifyWarning({
                    details: [
                        "Your version: Aug 31, 2026, 10:30 AM",
                        "Server version: Aug 31, 2026, 10:45 AM",
                    ],
                    message:
                        "A newer version of Budgeted is ready. Refresh to load the latest improvements.",
                    title: "Update ready",
                })
            }
        >
            Show update toast
        </button>
    );
}

describe("FeedbackToastProvider", () => {
    it("renders version details as spaced, compact lines", () => {
        render(
            <FeedbackToastProvider>
                <UpdateToastTrigger />
            </FeedbackToastProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Show update toast" }),
        );

        const yourVersion = screen.getByText(
            "Your version: Aug 31, 2026, 10:30 AM",
        );
        expect(yourVersion.parentElement).toHaveClass(
            "mt-3",
            "gap-1",
            "pt-2",
            "text-xs",
        );
        expect(
            screen.getByText("Server version: Aug 31, 2026, 10:45 AM"),
        ).toBeInTheDocument();
    });
});
