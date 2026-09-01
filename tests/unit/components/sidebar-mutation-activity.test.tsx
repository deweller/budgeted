import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";

import { SidebarMutationActivity } from "@/components/dashboard/sidebar-mutation-activity";
import {
    BackgroundMutationActivityProvider,
    useBackgroundMutationActivity,
} from "@/components/shared/background-mutation-activity-provider";

function ActivityFixture() {
    const { startActivity } = useBackgroundMutationActivity();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const firstActivity = useRef<ReturnType<typeof startActivity> | null>(null);

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    firstActivity.current = startActivity({
                        completedLabel: "Transaction saved.",
                        pendingLabel: "Saving transaction…",
                    });
                }}
            >
                Start transaction
            </button>
            <button
                type="button"
                onClick={() => {
                    startActivity({
                        completedLabel: "Account saved.",
                        pendingLabel: "Saving account…",
                    });
                }}
            >
                Start account
            </button>
            <SidebarMutationActivity
                isCollapsed={isCollapsed}
                onExpandSidebar={() => setIsCollapsed(false)}
            />
            <button type="button" onClick={() => setIsCollapsed(true)}>
                Collapse sidebar
            </button>
        </>
    );
}

describe("SidebarMutationActivity", () => {
    it("prioritizes active work, expands additional activity, and supports collapsed navigation", () => {
        render(
            <BackgroundMutationActivityProvider>
                <ActivityFixture />
            </BackgroundMutationActivityProvider>,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Start transaction" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Start account" }));

        expect(screen.getByText("Saving account…")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "and 1 more" }));
        expect(screen.getByRole("list", { name: "Background activity" })).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Collapse sidebar" }),
        );
        expect(screen.getByText("+1")).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole("button", { name: "Show background activity" }),
        );
        expect(
            screen.queryByRole("button", { name: "Show background activity" }),
        ).not.toBeInTheDocument();
    });
});
