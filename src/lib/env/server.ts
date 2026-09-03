import { z } from "zod";

import { getLinkedSecret } from "@/lib/db/resource";

const runtimeServerEnvSchema = z.object({
    nodeEnv: z
        .enum(["development", "test", "production"])
        .default("development"),
    authSecret: z
        .string()
        .min(32, "The linked SST AuthSecret must be at least 32 characters."),
});

const testAuthSecret = "budgeted-test-auth-secret-32-characters-minimum";

export type ServerEnv = z.infer<typeof runtimeServerEnvSchema>;

export function resolveNodeEnv(env: NodeJS.ProcessEnv = process.env) {
    return env.NODE_ENV;
}

export function resolveAuthSecret(env: NodeJS.ProcessEnv = process.env) {
    return (
        getLinkedSecret("AuthSecret") ??
        (env.NODE_ENV === "test" ? testAuthSecret : undefined)
    );
}

export function resolvePlaidClientId(env: NodeJS.ProcessEnv = process.env) {
    return env.PLAID_CLIENT_ID ?? getLinkedSecret("PlaidClientId");
}

export function resolvePlaidEnv(env: NodeJS.ProcessEnv = process.env) {
    return env.PLAID_ENV ?? getLinkedSecret("PlaidEnv") ?? "sandbox";
}

export function resolvePlaidSecret(env: NodeJS.ProcessEnv = process.env) {
    return env.PLAID_SECRET ?? getLinkedSecret("PlaidSecret");
}

export function resolveGoogleGenerativeAiApiKey(
    env: NodeJS.ProcessEnv = process.env,
) {
    return (
        env.GOOGLE_GENERATIVE_AI_API_KEY ??
        getLinkedSecret("GoogleGenerativeAiApiKey")
    );
}

export function resolveGoogleAiModel(env: NodeJS.ProcessEnv = process.env) {
    return env.GOOGLE_AI_MODEL?.trim() || "gemini-3.5-flash";
}

export function resolveOpenAiApiKey(env: NodeJS.ProcessEnv = process.env) {
    return env.OPENAI_API_KEY ?? getLinkedSecret("OpenAiApiKey");
}

export function getServerEnv(overrides?: Partial<ServerEnv>) {
    return runtimeServerEnvSchema.parse({
        nodeEnv: resolveNodeEnv(),
        authSecret: resolveAuthSecret(),
        ...overrides,
    });
}
