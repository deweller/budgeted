// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import {
    getTransactionClassificationGenerationOptions,
    listAvailableTransactionClassificationModels,
    resolveAvailableTransactionClassificationModelId,
} from "@/features/transaction-classification/server/transaction-classification-models";

const originalEnv = {
    GOOGLE_AI_MODEL: process.env.GOOGLE_AI_MODEL,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function restoreEnvValue(name: keyof typeof originalEnv) {
    const value = originalEnv[name];

    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}

describe("transaction classification models", () => {
    afterEach(() => {
        restoreEnvValue("GOOGLE_AI_MODEL");
        restoreEnvValue("GOOGLE_GENERATIVE_AI_API_KEY");
        restoreEnvValue("OPENAI_API_KEY");
    });

    it("only lists models with configured API keys", () => {
        process.env.GOOGLE_AI_MODEL = "";
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = "";
        process.env.OPENAI_API_KEY = "test-openai-key";

        expect(listAvailableTransactionClassificationModels()).toEqual([
            {
                label: "GPT-5.6 Luna",
                modelId: "gpt-5.6-luna",
                provider: "openai",
            },
        ]);
        expect(resolveAvailableTransactionClassificationModelId()).toBe(
            "gpt-5.6-luna",
        );
    });

    it("omits OpenAI when its API key is blank", () => {
        process.env.GOOGLE_AI_MODEL = "";
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google-key";
        process.env.OPENAI_API_KEY = "";

        expect(listAvailableTransactionClassificationModels()).toEqual([
            {
                label: "Gemini 3.5 Flash",
                modelId: "gemini-3.5-flash",
                provider: "google",
            },
        ]);
        expect(
            resolveAvailableTransactionClassificationModelId("gpt-5-mini"),
        ).toBe("gemini-3.5-flash");
    });

    it("defaults legacy OpenAI selections to Luna while preserving Google selections", () => {
        process.env.GOOGLE_AI_MODEL = "gemini-3.5-flash";
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-google-key";
        process.env.OPENAI_API_KEY = "test-openai-key";

        expect(listAvailableTransactionClassificationModels()).toEqual([
            {
                label: "GPT-5.6 Luna",
                modelId: "gpt-5.6-luna",
                provider: "openai",
            },
            {
                label: "Gemini 3.5 Flash",
                modelId: "gemini-3.5-flash",
                provider: "google",
            },
        ]);
        expect(
            resolveAvailableTransactionClassificationModelId("gpt-5-mini"),
        ).toBe("gpt-5.6-luna");
        expect(
            resolveAvailableTransactionClassificationModelId(
                "gemini-3.5-flash",
            ),
        ).toBe("gemini-3.5-flash");
    });

    it("uses medium reasoning without temperature for Luna and temperature zero for Google", () => {
        expect(
            getTransactionClassificationGenerationOptions("gpt-5.6-luna"),
        ).toEqual({
            providerOptions: {
                openai: { reasoningEffort: "medium" },
            },
        });
        expect(
            getTransactionClassificationGenerationOptions(
                "gemini-3.5-flash",
            ),
        ).toEqual({ temperature: 0 });
    });
});
