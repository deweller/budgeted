import { describe, expect, it } from "vitest";

import { partitionE2EArgs } from "../../../scripts/test-e2e-options.mjs";

describe("test-e2e option parsing", () => {
    it("defaults managed SST runs to the e2e stage", () => {
        expect(partitionE2EArgs([])).toEqual({
            playwrightArgs: [],
            sstArgs: ["--stage", "e2e"],
            sstDevArgs: ["--mode=mono"],
            sstStage: "e2e",
        });
    });

    it("preserves an explicit SST stage", () => {
        expect(
            partitionE2EArgs(["--stage", "dev", "tests/e2e/persistence.spec.ts"]),
        ).toEqual({
            playwrightArgs: ["tests/e2e/persistence.spec.ts"],
            sstArgs: ["--stage", "dev"],
            sstDevArgs: ["--mode=mono"],
            sstStage: "dev",
        });
    });

    it("keeps SST config, dev mode, and Playwright args separated", () => {
        expect(
            partitionE2EArgs([
                "--config",
                "sst.config.ts",
                "--mode=basic",
                "--print-logs",
                "--project=chromium",
            ]),
        ).toEqual({
            playwrightArgs: ["--project=chromium"],
            sstArgs: ["--stage", "e2e", "--config", "sst.config.ts", "--print-logs"],
            sstDevArgs: ["--mode=basic"],
            sstStage: "e2e",
        });
    });
});
