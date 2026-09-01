import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LedgerLoadRecovery } from "@/components/workspace/ledger-load-recovery";

describe("LedgerLoadRecovery", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("switches to an available ledger without loading the failed ledger", async () => {
        const user = userEvent.setup();
        const onSwitched = vi.fn().mockResolvedValue(undefined);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        ledgers: [
                            { ledgerId: "legacy", name: "Legacy ledger" },
                            { ledgerId: "current", name: "Current ledger" },
                        ],
                    }),
                    {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    },
                ),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        render(
            <LedgerLoadRecovery
                activeLedgerId="legacy"
                onSwitched={onSwitched}
            />,
        );

        await user.click(
            await screen.findByRole("button", { name: "Switch ledger" }),
        );

        await waitFor(() =>
            expect(fetchMock).toHaveBeenNthCalledWith(
                2,
                "/api/ledgers/current",
                { method: "PATCH" },
            ),
        );
        await waitFor(() => expect(onSwitched).toHaveBeenCalledOnce());
    });
});
