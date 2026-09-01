import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getLinkedSecret: vi.fn(),
}));

vi.mock("@/lib/db/resource", () => ({
    getLinkedSecret: mocks.getLinkedSecret,
}));

import {
    fetchAmazonScraperManifest,
    fetchAmazonScraperOrders,
} from "@/features/amazon/server/amazon-scraper-client";

describe("Amazon scraper client", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getLinkedSecret.mockImplementation((name: string) => {
            if (name === "AmazonOrderScraperApiUrl") {
                return "https://scraper.test";
            }

            if (name === "AmazonOrderScraperApiToken") {
                return "secret-token";
            }

            return undefined;
        });
    });

    it("sends bearer auth to scraper requests", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ state: "complete" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchAmazonScraperManifest()).resolves.toEqual({
            state: "complete",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            new URL("https://scraper.test/manifest"),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer secret-token",
                }),
            }),
        );
    });

    it("throws when the scraper returns a non-OK response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
            }),
        );

        await expect(fetchAmazonScraperOrders()).rejects.toThrow(
            "Amazon order scraper request failed.",
        );
    });
});
