// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

const LOCAL_CONFIG_FILE = "config/budgeted-config.toml";

type DomainConfig =
    | string
    | {
          cert?: string;
          dns?: boolean;
          name: string;
      };

type ManagedDomain = {
    name: string;
    dns: ReturnType<typeof sst.aws.dns> | false;
    cert?: string;
};

async function getLocalDevConfig() {
    const {
        buildNextDevArgs,
        createDevServerEnv,
        formatDevServerUrl,
        loadLocalDevServerEnv,
        parseDevServerArgs,
        prepareDevServerOptions,
    } = await import("./scripts/dev-server-options.mjs");
    const options = prepareDevServerOptions(
        parseDevServerArgs([], loadLocalDevServerEnv()),
    );
    const devEnvironment = createDevServerEnv({}, options) as Record<
        string,
        string
    >;
    const environmentAssignments = Object.entries(devEnvironment)
        .map(([name, value]) => `${name}=${shellQuote(value)}`)
        .join(" ");

    return {
        dev: {
            command: `${environmentAssignments} ${buildNextDevArgs([
                "pnpm",
                "dev:turbo",
                "--",
            ], options)
                .map(shellQuote)
                .join(" ")}`,
            url: formatDevServerUrl(options),
        },
        environment: devEnvironment,
    };
}

function shellQuote(value: string) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function domainValue(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function managedDomain(value: DomainConfig | undefined): ManagedDomain | undefined {
    if (!value) {
        return undefined;
    }

    if (typeof value === "string") {
        const name = domainValue(value);
        return name
            ? {
                  name,
                  dns: sst.aws.dns(),
              }
            : undefined;
    }

    const name = domainValue(value.name);
    if (!name) {
        return undefined;
    }

    const domain: ManagedDomain = {
        name,
        dns: value.dns === false ? false : sst.aws.dns(),
    };

    const cert = domainValue(value.cert);
    if (cert) {
        domain.cert = cert;
    }

    return domain;
}

export default $config({
    async app(input) {
        const { loadBudgetedConfig, resolveStageConfig } = await import(
            "./infra/config"
        );
        const budgetedConfig = loadBudgetedConfig(LOCAL_CONFIG_FILE);
        const stageConfig = resolveStageConfig(budgetedConfig, input?.stage);

        return {
            name: budgetedConfig.app.name,
            removal: stageConfig.deployment.removal,
            protect: stageConfig.deployment.protect,
            home: "aws",
            watch: {
                ignore: ["test-results", "playwright-report"],
            },
        };
    },
    async run() {
        const [
            { defineLedgerTable },
            { defineApplicationSecrets },
            {
                getIntegrationEnvironment,
                getSstAssetLifecyclePolicy,
                loadBudgetedConfig,
                resolveStageConfig,
            },
            { defineVenmoEmailIngestion },
        ] =
            await Promise.all([
                import("./infra/dynamo"),
                import("./infra/secrets"),
                import("./infra/config"),
                import("./infra/venmo-email"),
            ]);
        const budgetedConfig = loadBudgetedConfig(LOCAL_CONFIG_FILE);
        const stageConfig = resolveStageConfig(budgetedConfig, $app.stage);
        const webDomain = managedDomain(stageConfig.webDomain);
        const integrationEnvironment = getIntegrationEnvironment(stageConfig);
        const localDevConfig = await getLocalDevConfig();

        if (stageConfig.infrastructure.assetLifecycle.enabled) {
            new aws.ecr.LifecyclePolicy("SstAssetLifecyclePolicy", {
                repository:
                    stageConfig.infrastructure.assetLifecycle.repository,
                policy: getSstAssetLifecyclePolicy(stageConfig),
            });
        }
        const secrets = defineApplicationSecrets();
        const ledgerTable = defineLedgerTable();
        const venmoEmailConfig = stageConfig.venmoEmail;
        const venmoEmail = venmoEmailConfig
            ? defineVenmoEmailIngestion({ config: venmoEmailConfig, ledgerTable })
            : undefined;
        const ledgerExportArtifacts = new sst.aws.Bucket(
            "LedgerExportArtifacts",
            {
                cors: false,
                lifecycle: [
                    {
                        expiresIn: `${stageConfig.infrastructure.artifacts.ledgerExportRetentionDays} days`,
                        id: "expire-ledger-exports",
                        prefix: "ledger-exports/",
                    },
                ],
            },
        );
        const ynabImportArtifacts = new sst.aws.Bucket(
            "YnabImportArtifacts",
            {
                cors: {
                    allowHeaders: ["content-type"],
                    allowMethods: ["PUT"],
                    allowOrigins:
                        stageConfig.infrastructure.artifacts
                            .ynabImportAllowedOrigins,
                },
                lifecycle: [
                    {
                        expiresIn: `${stageConfig.infrastructure.artifacts.ynabImportRetentionDays} days`,
                        id: "expire-ynab-imports",
                        prefix: "ynab-imports/",
                    },
                ],
            },
        );
        const automationHandler = new sst.aws.Function("AutomationHandler", {
            environment: integrationEnvironment,
            handler: "src/functions/automation-scheduler.handler",
            link: [ledgerTable, ...Object.values(secrets)],
            timeout: stageConfig.infrastructure.automation.timeout,
        });
        const ynabImportWorker = new sst.aws.Function("YnabImportWorker", {
            handler: "src/functions/ynab-import-worker.handler",
            link: [ledgerTable, ynabImportArtifacts],
            memory: stageConfig.infrastructure.ynabImportWorker.memory,
            timeout: stageConfig.infrastructure.ynabImportWorker.timeout,
        });
        const web = new sst.aws.Nextjs("Web", {
            dev: localDevConfig.dev,
            ...(webDomain ? { domain: webDomain } : {}),
            environment: {
                ...integrationEnvironment,
                ...($dev ? localDevConfig.environment : {}),
                ...(venmoEmailConfig
                    ? { VENMO_EMAIL_RECIPIENT: venmoEmailConfig.recipient }
                    : {}),
            },
            server: {
                timeout: stageConfig.infrastructure.web.timeout,
            },
            link: [
                ledgerTable,
                ledgerExportArtifacts,
                ynabImportArtifacts,
                automationHandler,
                ynabImportWorker,
                ...Object.values(secrets),
            ],
        });
        const automation =
            stageConfig.infrastructure.automation.enabled
                ? new sst.aws.CronV2("Automation", {
                      function: automationHandler,
                      retries: stageConfig.infrastructure.automation.retries,
                      schedule: stageConfig.infrastructure.automation.schedule,
                  })
                : undefined;

        return {
            app: web.url,
            appCnameTarget: webDomain
                ? web.nodes.cdn?.nodes.distribution.domainName
                : undefined,
            ledgerTable: ledgerTable.name,
            automationSchedule: automation?.nodes.schedule.name,
            venmoEmailBucket: venmoEmail?.artifacts.name,
            venmoEmailExternalDnsRecords: venmoEmail?.dnsRecords,
            venmoEmailRecipient: venmoEmailConfig?.recipient,
            venmoEmailRule: venmoEmail?.receiptRule.name,
            venmoEmailRuleSet: venmoEmail?.receiptRuleSet.ruleSetName,
        };
    },
});
