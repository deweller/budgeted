import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIntegrationWorkspaceMutationResponse } from "../helpers/workspace-mutation-response";

const mocks = vi.hoisted(() => ({
    refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/ledgers",
    useRouter: () => ({ refresh: mocks.refresh }),
}));

import { LedgerManager } from "@/components/ledgers/ledger-manager";

describe("ledger manager", () => {
    const ledgers = [
        {
            ledgerId: "ledger-1",
            workspaceId: "global",
            name: "2027 ledger",
            isDefault: false,
            status: "active" as const,
            createdAt: "2026-06-03T00:00:00.000Z",
            updatedAt: "2026-06-03T00:00:00.000Z",
            workspaceGeneration: 1,
            workspaceRevision: 0,
        },
        {
            ledgerId: "ledger-2",
            workspaceId: "global",
            name: "2028 ledger",
            isDefault: false,
            status: "active" as const,
            createdAt: "2026-06-04T00:00:00.000Z",
            updatedAt: "2026-06-04T00:00:00.000Z",
            workspaceGeneration: 1,
            workspaceRevision: 0,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        const renamedLedger = {
            ...ledgers[0],
            name: "Renamed ledger",
        };
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify(
                            createIntegrationWorkspaceMutationResponse({
                                body: { ledger: renamedLedger },
                            }),
                        ),
                        {
                            status: 200,
                            headers: { "content-type": "application/json" },
                        },
                    ),
                )
                .mockResolvedValue({
                    ok: true,
                    json: async () => ({
                    ledgers: ledgers.map((ledger) =>
                        ledger.ledgerId === "ledger-1"
                            ? { ...ledger, name: "Renamed ledger" }
                            : ledger,
                    ),
                }),
                }),
        );
    });

    it("requires the explicit switch action for a highlighted ledger", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify(
                            createIntegrationWorkspaceMutationResponse({
                                body: { ledger: ledgers[1] },
                            }),
                        ),
                        {
                            status: 200,
                            headers: { "content-type": "application/json" },
                        },
                    ),
                )
                .mockResolvedValue({
                    ok: true,
                    json: async () => ({ ledgers }),
                }),
        );

        render(
            <LedgerManager
                activeLedgerId="ledger-1"
                ledgers={ledgers}
            />,
        );

        const ledgerList = screen.getByRole("list", { name: "Ledgers" });
        const activeLedger = screen.getByRole("listitem", {
            name: "2027 ledger",
        });
        const availableLedger = screen.getByRole("listitem", {
            name: "2028 ledger",
        });

        expect(ledgerList).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(activeLedger).toHaveAttribute(
            "data-pane-list-highlighted",
            "true",
        );
        expect(
            within(activeLedger).queryByRole("button", { name: "Selected" }),
        ).not.toBeInTheDocument();

        fireEvent.keyDown(window, { key: "s" });
        expect(fetch).not.toHaveBeenCalled();

        fireEvent.keyDown(window, { key: "ArrowDown" });
        expect(availableLedger).toHaveAttribute(
            "data-pane-list-highlighted",
            "true",
        );

        fireEvent.keyDown(window, { key: "Enter" });
        expect(fetch).not.toHaveBeenCalled();

        fireEvent.keyDown(window, { key: "s" });

        await waitFor(() =>
            expect(fetch).toHaveBeenNthCalledWith(
                1,
                "/api/ledgers/ledger-2",
                { method: "PATCH" },
            ),
        );
    });

    it("renames a ledger in a modal dialog", async () => {
        const user = userEvent.setup();

        render(
            <LedgerManager
                activeLedgerId="ledger-1"
                ledgers={ledgers}
            />,
        );

        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "e" });

        expect(
            screen.getByRole("dialog", { name: "Rename 2027 ledger?" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", {
                name: "Edit ledger name for 2027 ledger",
            }),
        ).not.toBeInTheDocument();

        const nameInput = screen.getByLabelText("Ledger name");
        await waitFor(() => expect(nameInput).toHaveFocus());

        await user.clear(nameInput);
        await user.type(nameInput, "Renamed ledger{Enter}");

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

        expect(fetch).toHaveBeenNthCalledWith(
            1,
            "/api/ledgers/ledger-1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ name: "Renamed ledger" }),
            }),
        );
        expect(fetch).toHaveBeenNthCalledWith(2, "/api/ledgers");
        await waitFor(() =>
            expect(
                screen.queryByRole("dialog", {
                    name: "Rename 2027 ledger?",
                }),
            ).not.toBeInTheDocument(),
        );
        expect(screen.getByText("Renamed ledger")).toBeInTheDocument();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it("deactivates the current ledger without removing its switchable state", async () => {
        const user = userEvent.setup();

        render(
            <LedgerManager
                activeLedgerId="ledger-1"
                ledgers={[
                    {
                        ledgerId: "ledger-1",
                        workspaceId: "global",
                        name: "2027 ledger",
                        isDefault: false,
                        status: "active",
                        createdAt: "2026-06-03T00:00:00.000Z",
                        updatedAt: "2026-06-03T00:00:00.000Z",
                        workspaceGeneration: 1,
                        workspaceRevision: 0,
                    },
                ]}
            />,
        );

        expect(screen.getByRole("list", { name: "Ledgers" })).toBeInTheDocument();
        expect(screen.getByText(/Created .* · Current/)).toBeInTheDocument();
        expect(screen.getByText("Automation on")).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "a" });

        expect(
            screen.getByRole("heading", { name: "Deactivate 2027 ledger?" }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole("button", { name: "Deactivate ledger" }),
        );

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/ledgers/ledger-1?action=archive",
                { method: "POST" },
            ),
        );
    });

    it("shows archived ledgers inline with their date and activates them", async () => {
        const user = userEvent.setup();

        render(
            <LedgerManager
                activeLedgerId="ledger-1"
                ledgers={[
                    {
                        ...ledgers[1],
                        status: "archived",
                    },
                ]}
            />,
        );

        expect(screen.getByText(/Created .* · Archived/)).toBeInTheDocument();
        expect(screen.getByText("Automation off")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Activate" }));

        await waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                "/api/ledgers/ledger-2?action=restore",
                { method: "POST" },
            ),
        );
    });
});
