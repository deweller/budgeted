import { describe, expect, it, vi } from "vitest";

import { parseApiError, parseApiErrorMessage } from "@/lib/api/client-errors";

describe("client API errors", () => {
    it("parses the shared server error shape from a response body", async () => {
        const error = await parseApiError(
            {
                json: vi.fn().mockResolvedValue({
                    error: {
                        code: "validation_error",
                        details: { field: "name" },
                        message: "Name is required.",
                    },
                }),
            },
            "Unable to save account.",
        );

        expect(error).toEqual({
            code: "validation_error",
            details: { field: "name" },
            message: "Name is required.",
        });
    });

    it("falls back to the supplied message when the response body is not parseable", async () => {
        await expect(
            parseApiErrorMessage(
                {
                    json: vi.fn().mockRejectedValue(new Error("bad json")),
                },
                "Unable to save transaction.",
            ),
        ).resolves.toBe("Unable to save transaction.");
    });
});
