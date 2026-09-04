import { existsSync, readFileSync } from "node:fs";

import { parse as parseToml } from "smol-toml";
import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.number().int().positive();
const nonNegativeIntegerSchema = z.number().int().nonnegative();

type SstFunctionTimeout = `${number} ${
    | "second"
    | "seconds"
    | "minute"
    | "minutes"}`;
type SstFunctionMemory = `${number} ${"MB" | "GB"}`;
type SstSchedule = `rate(${string})` | `cron(${string})` | `at(${string})`;

const sstFunctionTimeoutSchema = z
    .string()
    .trim()
    .regex(
        /^\d+(?:\.\d+)? (?:second|seconds|minute|minutes)$/,
        'Expected an SST function duration such as "15 minutes".',
    )
    .transform((value): SstFunctionTimeout => value as SstFunctionTimeout);
const sstFunctionMemorySchema = z
    .string()
    .trim()
    .regex(
        /^\d+(?:\.\d+)? (?:MB|GB)$/,
        'Expected an SST function memory size such as "2 GB".',
    )
    .transform((value): SstFunctionMemory => value as SstFunctionMemory);
const sstScheduleSchema = z
    .string()
    .trim()
    .regex(
        /^(?:rate|cron|at)\(.+\)$/,
        'Expected an SST schedule such as "cron(0/2 * * * ? *)".',
    )
    .transform((value): SstSchedule => value as SstSchedule);

const domainConfigSchema = z
    .object({
        cert: nonEmptyStringSchema.optional(),
        dns: z.enum(["external", "aws"]),
        name: nonEmptyStringSchema,
        route53ZoneId: nonEmptyStringSchema.optional(),
    })
    .strict()
    .superRefine((config, context) => {
        if (config.dns === "external" && !config.cert) {
            context.addIssue({
                code: "custom",
                message:
                    'cert is required when webDomain.dns is "external".',
                path: ["cert"],
            });
        }
        if (config.dns !== "aws" && config.route53ZoneId) {
            context.addIssue({
                code: "custom",
                message:
                    'route53ZoneId can only be used when webDomain.dns is "aws".',
                path: ["route53ZoneId"],
            });
        }
    });

const venmoEmailConfigSchema = z
    .object({
        allowedForwarders: z.array(nonEmptyStringSchema).optional(),
        dns: z.enum(["external", "aws"]),
        recipient: z.string().trim().email(),
        route53ZoneId: nonEmptyStringSchema.optional(),
    })
    .strict()
    .superRefine((config, context) => {
        if (config.dns !== "aws" && config.route53ZoneId) {
            context.addIssue({
                code: "custom",
                message:
                    'route53ZoneId can only be used when dns is "aws".',
                path: ["route53ZoneId"],
            });
        }
    });

const stageConfigSchema = z
    .object({
        deployment: z
            .object({
                protect: z.boolean().optional(),
                removal: z
                    .enum(["remove", "retain", "retain-all"])
                    .optional(),
            })
            .strict()
            .optional(),
        infrastructure: z
            .object({
                artifacts: z
                    .object({
                        ledgerExportRetentionDays:
                            positiveIntegerSchema.optional(),
                        ynabImportAllowedOrigins: z
                            .array(nonEmptyStringSchema)
                            .min(1)
                            .optional(),
                        ynabImportRetentionDays:
                            positiveIntegerSchema.optional(),
                    })
                    .strict()
                    .optional(),
                assetLifecycle: z
                    .object({
                        enabled: z.boolean().optional(),
                        expireUntaggedAfterDays:
                            positiveIntegerSchema.optional(),
                        repository: nonEmptyStringSchema.optional(),
                    })
                    .strict()
                    .optional(),
                automation: z
                    .object({
                        enabled: z.boolean().optional(),
                        retries: nonNegativeIntegerSchema.optional(),
                        schedule: sstScheduleSchema.optional(),
                        timeout: sstFunctionTimeoutSchema.optional(),
                    })
                    .strict()
                    .optional(),
                web: z
                    .object({
                        timeout: sstFunctionTimeoutSchema.optional(),
                    })
                    .strict()
                    .optional(),
                ynabImportWorker: z
                    .object({
                        memory: sstFunctionMemorySchema.optional(),
                        timeout: sstFunctionTimeoutSchema.optional(),
                    })
                    .strict()
                    .optional(),
            })
            .strict()
            .optional(),
        integrations: z
            .object({
                amazonOrders: z
                    .object({
                        apiUrl: nonEmptyStringSchema.optional(),
                    })
                    .strict()
                    .optional(),
                plaid: z
                    .object({
                        environment: z
                            .enum(["sandbox", "development", "production"])
                            .optional(),
                    })
                    .strict()
                    .optional(),
            })
            .strict()
            .optional(),
        venmoEmail: venmoEmailConfigSchema.optional(),
        webDomain: domainConfigSchema.optional(),
    })
    .strict();

const budgetedConfigSchema = z
    .object({
        app: z
            .object({
                name: nonEmptyStringSchema.optional(),
                productionStage: nonEmptyStringSchema.optional(),
            })
            .strict()
            .optional(),
        stages: z.record(z.string(), stageConfigSchema).optional(),
    })
    .strict();

export type DomainConfig = z.infer<typeof domainConfigSchema>;
export type VenmoEmailConfig = z.infer<typeof venmoEmailConfigSchema>;
type StageConfig = z.infer<typeof stageConfigSchema>;

export type BudgetedConfig = {
    app: {
        name: string;
        productionStage: string;
    };
    stages: Record<string, StageConfig | undefined>;
};

export type ResolvedStageConfig = {
    deployment: {
        protect: boolean;
        removal: "remove" | "retain" | "retain-all";
    };
    infrastructure: {
        artifacts: {
            ledgerExportRetentionDays: number;
            ynabImportAllowedOrigins: string[];
            ynabImportRetentionDays: number;
        };
        assetLifecycle: {
            enabled: boolean;
            expireUntaggedAfterDays: number;
            repository: string;
        };
        automation: {
            enabled: boolean;
            retries: number;
            schedule: SstSchedule;
            timeout: SstFunctionTimeout;
        };
        web: {
            timeout: SstFunctionTimeout;
        };
        ynabImportWorker: {
            memory: SstFunctionMemory;
            timeout: SstFunctionTimeout;
        };
    };
    integrations: {
        amazonOrders: {
            apiUrl?: string;
        };
        plaid: {
            environment: "sandbox" | "development" | "production";
        };
    };
    venmoEmail?: VenmoEmailConfig;
    webDomain?: DomainConfig;
};

export function parseBudgetedConfig(input: unknown): BudgetedConfig {
    const parsed = budgetedConfigSchema.parse(input);

    return {
        app: {
            name: parsed.app?.name ?? "budgeted",
            productionStage: parsed.app?.productionStage ?? "production",
        },
        stages: parsed.stages ?? {},
    };
}

export function loadBudgetedConfig(filePath: string): BudgetedConfig {
    if (!existsSync(filePath)) {
        return parseBudgetedConfig({});
    }

    try {
        return parseBudgetedConfig(parseToml(readFileSync(filePath, "utf8")));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read ${filePath}: ${message}`);
    }
}

export function resolveStageConfig(
    config: BudgetedConfig,
    stageName: string | undefined,
): ResolvedStageConfig {
    const isProduction = stageName === config.app.productionStage;
    const stage = (stageName && config.stages[stageName]) || {};
    const infrastructure = stage.infrastructure;

    return {
        deployment: {
            protect: stage.deployment?.protect ?? isProduction,
            removal:
                stage.deployment?.removal ??
                (isProduction ? "retain" : "remove"),
        },
        infrastructure: {
            artifacts: {
                ledgerExportRetentionDays:
                    infrastructure?.artifacts?.ledgerExportRetentionDays ?? 1,
                ynabImportAllowedOrigins:
                    infrastructure?.artifacts?.ynabImportAllowedOrigins ?? ["*"],
                ynabImportRetentionDays:
                    infrastructure?.artifacts?.ynabImportRetentionDays ?? 2,
            },
            assetLifecycle: {
                enabled:
                    infrastructure?.assetLifecycle?.enabled ?? isProduction,
                expireUntaggedAfterDays:
                    infrastructure?.assetLifecycle
                        ?.expireUntaggedAfterDays ?? 3,
                repository:
                    infrastructure?.assetLifecycle?.repository ?? "sst-asset",
            },
            automation: {
                enabled: infrastructure?.automation?.enabled ?? isProduction,
                retries: infrastructure?.automation?.retries ?? 0,
                schedule:
                    infrastructure?.automation?.schedule ??
                    "cron(0/2 * * * ? *)",
                timeout:
                    infrastructure?.automation?.timeout ?? "15 minutes",
            },
            web: {
                timeout: infrastructure?.web?.timeout ?? "60 seconds",
            },
            ynabImportWorker: {
                memory:
                    infrastructure?.ynabImportWorker?.memory ?? "2 GB",
                timeout:
                    infrastructure?.ynabImportWorker?.timeout ?? "15 minutes",
            },
        },
        integrations: {
            amazonOrders: {
                apiUrl: stage.integrations?.amazonOrders?.apiUrl,
            },
            plaid: {
                environment:
                    stage.integrations?.plaid?.environment ?? "sandbox",
            },
        },
        venmoEmail: stage.venmoEmail,
        webDomain: stage.webDomain,
    };
}

export function getIntegrationEnvironment(stageConfig: ResolvedStageConfig) {
    return {
        ...(stageConfig.integrations.amazonOrders.apiUrl
            ? {
                  AMAZON_ORDER_SCRAPER_API_URL:
                      stageConfig.integrations.amazonOrders.apiUrl,
              }
            : {}),
        PLAID_ENV: stageConfig.integrations.plaid.environment,
    };
}

export function getSstAssetLifecyclePolicy(
    stageConfig: ResolvedStageConfig,
) {
    const expirationDays =
        stageConfig.infrastructure.assetLifecycle.expireUntaggedAfterDays;

    return JSON.stringify({
        rules: [
            {
                rulePriority: 1,
                description: `Expire untagged SST build artifacts after ${expirationDays} days`,
                selection: {
                    tagStatus: "untagged",
                    countType: "sinceImagePushed",
                    countUnit: "days",
                    countNumber: expirationDays,
                },
                action: {
                    type: "expire",
                },
            },
        ],
    });
}
