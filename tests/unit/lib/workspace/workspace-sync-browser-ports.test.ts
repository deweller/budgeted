import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createBrowserWorkspaceSyncPorts,
    WorkspaceSyncRequestError,
} from "@/lib/workspace/workspace-sync-browser-ports";

describe("browser workspace sync ports", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("preserves change-request failure diagnostics", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response('{"error":"Workspace state is invalid."}', {
                headers: { "x-amzn-requestid": "request-123" },
                status: 500,
                statusText: "Internal Server Error",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const ports = createBrowserWorkspaceSyncPorts({
            publishKnowledge: vi.fn(),
        });

        const result = ports.fetchChanges("g1:r20");

        await expect(result).rejects.toMatchObject({
            durationMs: expect.any(Number),
            endpoint: "/api/workspace/changes?after=g1%3Ar20",
            requestedAt: expect.any(String),
            responseBody: '{"error":"Workspace state is invalid."}',
            responseRequestId: "request-123",
            status: 500,
            statusText: "Internal Server Error",
        });
        await expect(result).rejects.toBeInstanceOf(WorkspaceSyncRequestError);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/workspace/changes?after=g1%3Ar20",
        );
    });

    it("captures a transport failure without a response", async () => {
        const transportError = new Error("Network unavailable");
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(transportError));
        const ports = createBrowserWorkspaceSyncPorts({
            publishKnowledge: vi.fn(),
        });

        await expect(ports.fetchKnowledge()).rejects.toMatchObject({
            cause: transportError,
            endpoint: "/api/workspace/knowledge",
            status: undefined,
        });
    });

    it("retries a workspace mutation-in-progress response before returning knowledge", async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        error: {
                            code: "workspace_mutation_in_progress",
                            details: { retryAfterMs: 1 },
                            message: "A workspace change is being finalized. Retrying shortly.",
                        },
                    }),
                    { status: 503 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ activeLedgerId: "ledger-1" }), {
                    status: 200,
                }),
            );
        vi.stubGlobal("fetch", fetchMock);
        const ports = createBrowserWorkspaceSyncPorts({
            publishKnowledge: vi.fn(),
        });

        const result = ports.fetchKnowledge();
        await vi.runAllTimersAsync();

        await expect(result).resolves.toEqual({ activeLedgerId: "ledger-1" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("gives up after five retryable workspace-mutation responses", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(
            () =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            error: {
                                code: "workspace_mutation_in_progress",
                                details: { retryAfterMs: 1 },
                                message: "A workspace change is being finalized. Retrying shortly.",
                            },
                        }),
                        { status: 503 },
                    ),
                ),
        );
        vi.stubGlobal("fetch", fetchMock);
        const ports = createBrowserWorkspaceSyncPorts({
            publishKnowledge: vi.fn(),
        });

        const result = ports.fetchKnowledge();
        const rejection = expect(result).rejects.toMatchObject({
            errorCode: "workspace_mutation_in_progress",
            retryAfterMs: 1,
            status: 503,
        });
        await vi.runAllTimersAsync();

        await rejection;
        expect(fetchMock).toHaveBeenCalledTimes(5);
    });
});
