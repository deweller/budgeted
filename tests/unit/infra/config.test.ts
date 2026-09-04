import { describe, expect, it } from "vitest";

import {
    getIntegrationEnvironment,
    getSstAssetLifecyclePolicy,
    loadBudgetedConfig,
    parseBudgetedConfig,
    resolveStageConfig,
} from "../../../infra/config";

describe("Budgeted infrastructure configuration", () => {
    it("keeps both checked-in examples valid", () => {
        expect(() =>
            loadBudgetedConfig("config/budgeted-config.example.toml"),
        ).not.toThrow();
        expect(() =>
            loadBudgetedConfig(
                "config/budgeted-advanced-config.example.toml",
            ),
        ).not.toThrow();
    });

    it("keeps infrastructure controls out of the standard example", () => {
        const example = loadBudgetedConfig(
            "config/budgeted-config.example.toml",
        );
        const production = example.stages.production;

        expect(example.app).not.toHaveProperty("home");
        expect(example.app).not.toHaveProperty("watchIgnore");
        expect(production).not.toHaveProperty("deployment");
        expect(production).not.toHaveProperty("infrastructure");
        expect(production?.webDomain).toBeUndefined();
        expect(production?.venmoEmail).toBeUndefined();
        expect(production?.integrations?.amazonOrders).toBeUndefined();
    });

    it("documents deployment and infrastructure overrides in the advanced example", () => {
        const example = loadBudgetedConfig(
            "config/budgeted-advanced-config.example.toml",
        );

        expect(example.stages.production?.deployment).toBeDefined();
        expect(example.stages.production?.infrastructure).toBeDefined();
    });

    it("provides safe application and non-production defaults", () => {
        const config = parseBudgetedConfig({});
        const stage = resolveStageConfig(config, "development");

        expect(config.app).toEqual({
            name: "budgeted",
            productionStage: "production",
        });
        expect(stage.deployment).toEqual({
            protect: false,
            removal: "remove",
        });
        expect(stage.infrastructure.assetLifecycle.enabled).toBe(false);
        expect(stage.infrastructure.automation.enabled).toBe(false);
        expect(stage.integrations.plaid.environment).toBe("sandbox");
        expect(stage.integrations.amazonOrders.apiUrl).toBeUndefined();
    });

    it("protects and retains the configured production stage by default", () => {
        const config = parseBudgetedConfig({
            app: { productionStage: "live" },
        });
        const stage = resolveStageConfig(config, "live");

        expect(stage.deployment).toEqual({
            protect: true,
            removal: "retain",
        });
        expect(stage.infrastructure.assetLifecycle.enabled).toBe(true);
        expect(stage.infrastructure.automation.enabled).toBe(true);
    });

    it("applies explicit stage overrides without dropping defaults", () => {
        const config = parseBudgetedConfig({
            stages: {
                production: {
                    deployment: {
                        removal: "retain-all",
                    },
                    infrastructure: {
                        artifacts: {
                            ledgerExportRetentionDays: 7,
                        },
                        automation: {
                            schedule: "cron(0 6 * * ? *)",
                        },
                    },
                    integrations: {
                        amazonOrders: {
                            apiUrl: "https://scraper.example.com",
                        },
                        plaid: {
                            environment: "production",
                        },
                    },
                },
            },
        });
        const stage = resolveStageConfig(config, "production");

        expect(stage.deployment).toEqual({
            protect: true,
            removal: "retain-all",
        });
        expect(
            stage.infrastructure.artifacts.ledgerExportRetentionDays,
        ).toBe(7);
        expect(stage.infrastructure.artifacts.ynabImportRetentionDays).toBe(2);
        expect(stage.infrastructure.automation.schedule).toBe(
            "cron(0 6 * * ? *)",
        );
        expect(stage.integrations).toEqual({
            amazonOrders: {
                apiUrl: "https://scraper.example.com",
            },
            plaid: {
                environment: "production",
            },
        });
        expect(getIntegrationEnvironment(stage)).toEqual({
            AMAZON_ORDER_SCRAPER_API_URL: "https://scraper.example.com",
            PLAID_ENV: "production",
        });
        expect(JSON.parse(getSstAssetLifecyclePolicy(stage))).toMatchObject({
            rules: [
                {
                    selection: {
                        countNumber: 3,
                    },
                },
            ],
        });
    });

    it("supports external and Route 53 DNS for the Venmo inbox", () => {
        const external = resolveStageConfig(
            parseBudgetedConfig({
                stages: {
                    production: {
                        venmoEmail: {
                            dns: "external",
                            recipient: "venmo@inbox.example.com",
                        },
                    },
                },
            }),
            "production",
        );
        const route53 = resolveStageConfig(
            parseBudgetedConfig({
                stages: {
                    production: {
                        venmoEmail: {
                            dns: "route53",
                            recipient: "venmo@inbox.example.com",
                            route53ZoneId: "Z0123456789ABCDEFGHIJ",
                        },
                    },
                },
            }),
            "production",
        );

        expect(external.venmoEmail).toEqual({
            dns: "external",
            recipient: "venmo@inbox.example.com",
        });
        expect(route53.venmoEmail).toEqual({
            dns: "route53",
            recipient: "venmo@inbox.example.com",
            route53ZoneId: "Z0123456789ABCDEFGHIJ",
        });
    });

    it("rejects unknown settings and invalid integration environments", () => {
        expect(() => parseBudgetedConfig({ unknown: true })).toThrow();
        expect(() =>
            parseBudgetedConfig({ app: { home: "aws" } }),
        ).toThrow();
        expect(() =>
            parseBudgetedConfig({ app: { watchIgnore: [] } }),
        ).toThrow();
        expect(() =>
            parseBudgetedConfig({
                stages: {
                    production: {
                        integrations: {
                            plaid: { environment: "live" },
                        },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            parseBudgetedConfig({
                stages: {
                    production: {
                        venmoEmail: {
                            dns: "external",
                            recipient: "not-an-email-address",
                        },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            parseBudgetedConfig({
                stages: {
                    production: {
                        venmoEmail: {
                            dns: "external",
                            recipient: "venmo@inbox.example.com",
                            route53ZoneId: "Z0123456789ABCDEFGHIJ",
                        },
                    },
                },
            }),
        ).toThrow();
    });

    it("rejects function settings that SST cannot accept", () => {
        expect(() =>
            parseBudgetedConfig({
                stages: {
                    production: {
                        infrastructure: {
                            automation: { timeout: "1 hour" },
                        },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            parseBudgetedConfig({
                stages: {
                    production: {
                        infrastructure: {
                            ynabImportWorker: { memory: "2 gb" },
                        },
                    },
                },
            }),
        ).toThrow();
        expect(() =>
            parseBudgetedConfig({
                stages: {
                    production: {
                        infrastructure: {
                            automation: { schedule: "every 2 minutes" },
                        },
                    },
                },
            }),
        ).toThrow();
    });
});
