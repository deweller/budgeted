import { describe, expect, it } from "vitest";

import {
    chunkRecords,
    writeChunkedRecords,
} from "@/lib/db/chunked-write";

describe("chunked-write", () => {
    it("splits records into stable chunks", () => {
        expect(chunkRecords([1, 2, 3, 4, 5], 2)).toEqual([
            [1, 2],
            [3, 4],
            [5],
        ]);
    });

    it("writes one chunk at a time", async () => {
        const events: string[] = [];

        await writeChunkedRecords(
            [1, 2, 3, 4, 5],
            async (record) => {
                events.push(`start:${record}`);
                await Promise.resolve();
                events.push(`end:${record}`);
            },
            2,
        );

        expect(events.indexOf("end:2")).toBeLessThan(
            events.indexOf("start:3"),
        );
        expect(events.indexOf("end:4")).toBeLessThan(
            events.indexOf("start:5"),
        );
        expect(events).toEqual(
            expect.arrayContaining([
                "start:1",
                "end:1",
                "start:5",
                "end:5",
            ]),
        );
    });
});
