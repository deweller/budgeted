// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    interactionsGo: vi.fn(),
    interactionsPut: vi.fn(),
    interactionsPutGo: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
    getBudgetedSchema: () => ({
        entities: {
            transactionClassificationInteractions: {
                put: mocks.interactionsPut,
                query: {
                    byInteraction: () => ({ go: mocks.interactionsGo }),
                },
            },
        },
    }),
}));

import { transactionClassificationPromptVersion } from "@/features/transaction-classification/models/transaction-classification";
import {
    listRecentTransactionClassificationInteractions,
    recordTransactionClassificationInteraction,
} from "@/features/transaction-classification/server/transaction-classification-interaction-service";

describe("transaction classification interaction service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));
        mocks.interactionsPut.mockReturnValue({ go: mocks.interactionsPutGo });
        mocks.interactionsPutGo.mockResolvedValue({});
        mocks.interactionsGo.mockResolvedValue({ data: [] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stores AI interactions with a twelve hour ttl", async () => {
        await recordTransactionClassificationInteraction({
            ledgerId: "ledger-1",
            modelId: "gemini-3.5-flash",
            requestText: "query text",
            responseText: "response text",
        });

        expect(mocks.interactionsPut).toHaveBeenCalledWith(
            expect.objectContaining({
                createdAt: "2026-07-07T12:00:00.000Z",
                expiresAt: 1_783_468_800,
                ledgerId: "ledger-1",
                modelId: "gemini-3.5-flash",
                promptVersion: transactionClassificationPromptVersion,
                requestText: "query text",
                responseText: "response text",
            }),
        );
    });

    it("lists only retained recent interactions newest first", async () => {
        mocks.interactionsGo.mockResolvedValue({
            data: [
                {
                    createdAt: "2026-07-07T11:00:00.000Z",
                    expiresAt: 1_783_512_000,
                    interactionId: "newer",
                    ledgerId: "ledger-1",
                    modelId: "gemini-3.5-flash",
                    promptVersion: "2026-07-07.v1",
                    requestText: "newer query",
                    responseText: "newer response",
                },
                {
                    createdAt: "2026-07-07T02:00:00.000Z",
                    expiresAt: 1_783_479_600,
                    interactionId: "older",
                    ledgerId: "ledger-1",
                    modelId: "gemini-3.5-flash",
                    promptVersion: "2026-07-07.v1",
                    requestText: "older query",
                    responseText: "older response",
                },
                {
                    createdAt: "2026-07-06T23:30:00.000Z",
                    expiresAt: 1_783_470_600,
                    interactionId: "expired",
                    ledgerId: "ledger-1",
                    modelId: "gemini-3.5-flash",
                    promptVersion: "2026-07-07.v1",
                    requestText: "expired query",
                    responseText: "expired response",
                },
            ],
        });

        await expect(
            listRecentTransactionClassificationInteractions("ledger-1"),
        ).resolves.toEqual([
            expect.objectContaining({
                interactionId: "newer",
                requestText: "newer query",
            }),
            expect.objectContaining({
                interactionId: "older",
                requestText: "older query",
            }),
        ]);
    });
});
