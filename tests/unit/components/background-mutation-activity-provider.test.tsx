import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    BackgroundMutationActivityProvider,
    useBackgroundMutationActivity,
} from "@/components/shared/background-mutation-activity-provider";

function ActivityControls() {
    const { activities, startActivity } = useBackgroundMutationActivity();
    const firstActivity = useRef<ReturnType<typeof startActivity> | null>(null);
    const secondActivity = useRef<ReturnType<typeof startActivity> | null>(
        null,
    );

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
                Start first
            </button>
            <button
                type="button"
                onClick={() => {
                    secondActivity.current = startActivity({
                        completedLabel: "Account saved.",
                        pendingLabel: "Saving account…",
                    });
                }}
            >
                Start second
            </button>
            <button type="button" onClick={() => firstActivity.current?.complete()}>
                Complete first
            </button>
            <button type="button" onClick={() => secondActivity.current?.fail()}>
                Fail second
            </button>
            <output>{JSON.stringify(activities)}</output>
        </>
    );
}

describe("BackgroundMutationActivityProvider", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("tracks pending work, completed confirmations, and failures", () => {
        vi.useFakeTimers();

        render(
            <BackgroundMutationActivityProvider>
                <ActivityControls />
            </BackgroundMutationActivityProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "Start first" }));
        fireEvent.click(screen.getByRole("button", { name: "Start second" }));
        expect(screen.getByText(/Saving account/)).toBeInTheDocument();
        expect(screen.getByText(/Saving transaction/)).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Complete first" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Fail second" }));
        expect(screen.getByText(/Transaction saved/)).toBeInTheDocument();
        expect(screen.queryByText(/Saving account/)).not.toBeInTheDocument();

        act(() => vi.advanceTimersByTime(5_000));
        expect(screen.queryByText(/Transaction saved/)).not.toBeInTheDocument();
    });
});
