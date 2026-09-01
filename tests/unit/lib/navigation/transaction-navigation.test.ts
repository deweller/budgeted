import { describe, expect, it, vi } from "vitest";

import {
    navigateToTransactionOnClick,
    resolveTransactionReferenceHref,
} from "@/lib/navigation/transaction-navigation";
import type { WorkspaceSnapshot } from "@/lib/workspace/sync-types";

function createClickEvent() {
    return {
        altKey: false,
        button: 0,
        ctrlKey: false,
        currentTarget: { target: "" },
        defaultPrevented: false,
        metaKey: false,
        preventDefault: vi.fn(),
        shiftKey: false,
    };
}

describe("transaction navigation", () => {
    const accounts = [
        {
            accountId: "checking",
            accountType: "checking" as const,
            name: "Checking",
        },
    ];

    it("resolves an account-specific href from a compact reference", () => {
        expect(
            resolveTransactionReferenceHref({
                accounts,
                reference: {
                    accountIds: ["checking"],
                    displayAmountCents: -1_234,
                    occurredAt: "2026-07-16T00:00:00.000Z",
                    transactionId: "transaction-1",
                },
                transactionId: "transaction-1",
            }),
        ).toBe("/transactions/checking?selected=transaction-1");
    });

    it("loads the transaction after click when the snapshot is configuration-only", async () => {
        const event = createClickEvent();
        const loadTransactionReference = vi.fn().mockResolvedValue({
            accountIds: ["checking"],
            displayAmountCents: -1_234,
            occurredAt: "2026-07-16T00:00:00.000Z",
            transactionId: "transaction-1",
        });
        const router = { push: vi.fn() };
        const snapshot = {
            accounts,
            transactionHydration: "configuration",
            transactions: [],
        } as unknown as WorkspaceSnapshot;

        await navigateToTransactionOnClick({
            event: event as never,
            loadTransactionReference,
            router,
            snapshot,
            transactionId: "transaction-1",
        });

        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(loadTransactionReference).toHaveBeenCalledWith("transaction-1");
        expect(router.push).toHaveBeenCalledWith(
            "/transactions/checking?selected=transaction-1",
        );
    });
});
