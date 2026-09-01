// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

const LOCAL_CONFIG_FILE = "sst.local.json";
const SST_ASSET_REPOSITORY = "sst-asset";

const sstAssetLifecyclePolicy = JSON.stringify({
    rules: [
        {
            rulePriority: 1,
            description: "Expire untagged SST build artifacts after 3 days",
            selection: {
                tagStatus: "untagged",
                countType: "sinceImagePushed",
                countUnit: "days",
                countNumber: 3,
            },
            action: {
                type: "expire",
            },
        },
    ],
});

type StageDomains = {
    app?: DomainConfig;
    appDomain?: DomainConfig;
    web?: DomainConfig;
    webDomain?: DomainConfig;
    venmoEmail?: VenmoEmailConfig;
};

type VenmoEmailConfig = {
    allowedForwarders?: string[];
    afterRuleName: string;
    receiptRuleSetName: string;
    recipient: string;
};

type LocalSstConfig = Record<string, StageDomains | undefined>;

type DomainConfig =
    | string
    | {
          name?: unknown;
          dns?: unknown;
          cert?: unknown;
      };

type ManagedDomain = {
    name: string;
    dns: ReturnType<typeof sst.aws.dns> | false;
    cert?: string;
};

async function getLocalDevConfig() {
    const {
        buildNextDevArgs,
        formatDevServerUrl,
        loadLocalDevServerEnv,
        parseDevServerArgs,
        prepareDevServerOptions,
    } = await import("./scripts/dev-server-options.mjs");
    const options = prepareDevServerOptions(
        parseDevServerArgs([], loadLocalDevServerEnv()),
    );

    return {
        command: buildNextDevArgs(["pnpm", "dev:turbo", "--"], options)
            .map(shellQuote)
            .join(" "),
        url: formatDevServerUrl(options),
    };
}

function shellQuote(value: string) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

async function stageDomains() {
    const config = await readLocalSstConfig();
    const stage = config[$app.stage] ?? {};

    return {
        web: managedDomain(
            stage.webDomain ?? stage.web ?? stage.appDomain ?? stage.app,
        ),
    };
}

async function readLocalSstConfig(): Promise<LocalSstConfig> {
    const { existsSync, readFileSync } = await import("node:fs");

    if (!existsSync(LOCAL_CONFIG_FILE)) {
        return {};
    }

    try {
        return JSON.parse(
            readFileSync(LOCAL_CONFIG_FILE, "utf8"),
        ) as LocalSstConfig;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read ${LOCAL_CONFIG_FILE}: ${message}`);
    }
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
    app(input) {
        return {
            name: "budgeted",
            removal: input?.stage === "production" ? "retain" : "remove",
            protect: ["production"].includes(input?.stage),
            home: "aws",
            watch: {
                ignore: ["test-results", "playwright-report"],
            },
        };
    },
    async run() {
        const [{ defineLedgerTable }, { defineApplicationSecrets }, { defineVenmoEmailIngestion }] =
            await Promise.all([
                import("./infra/dynamo"),
                import("./infra/secrets"),
                import("./infra/venmo-email"),
            ]);
        const localConfig = await readLocalSstConfig();
        const domains = await stageDomains();
        if ($app.stage === "production") {
            new aws.ecr.LifecyclePolicy("SstAssetLifecyclePolicy", {
                repository: SST_ASSET_REPOSITORY,
                policy: sstAssetLifecyclePolicy,
            });
        }
        const secrets = defineApplicationSecrets();
        const ledgerTable = defineLedgerTable();
        const venmoEmailConfig = localConfig[$app.stage]?.venmoEmail;
        const venmoEmail = venmoEmailConfig
            ? defineVenmoEmailIngestion({ config: venmoEmailConfig, ledgerTable })
            : undefined;
        const ledgerExportArtifacts = new sst.aws.Bucket(
            "LedgerExportArtifacts",
            {
                cors: false,
                lifecycle: [
                    {
                        expiresIn: "1 day",
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
                    allowOrigins: ["*"],
                },
                lifecycle: [
                    {
                        expiresIn: "2 days",
                        id: "expire-ynab-imports",
                        prefix: "ynab-imports/",
                    },
                ],
            },
        );
        const automationHandler = new sst.aws.Function("AutomationHandler", {
            handler: "src/functions/automation-scheduler.handler",
            link: [ledgerTable, ...Object.values(secrets)],
            timeout: "15 minutes",
        });
        const ynabImportWorker = new sst.aws.Function("YnabImportWorker", {
            handler: "src/functions/ynab-import-worker.handler",
            link: [ledgerTable, ynabImportArtifacts],
            memory: "2 GB",
            timeout: "15 minutes",
        });
        const web = new sst.aws.Nextjs("Web", {
            dev: await getLocalDevConfig(),
            ...(domains.web ? { domain: domains.web } : {}),
            environment: venmoEmailConfig
                ? { VENMO_EMAIL_RECIPIENT: venmoEmailConfig.recipient }
                : {},
            server: {
                timeout: "60 seconds",
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
            $app.stage === "production"
                ? new sst.aws.CronV2("Automation", {
                      function: automationHandler,
                      retries: 0,
                      schedule: "cron(0/2 * * * ? *)",
                  })
                : undefined;

        return {
            app: web.url,
            appCnameTarget: domains.web
                ? web.nodes.cdn?.nodes.distribution.domainName
                : undefined,
            ledgerTable: ledgerTable.name,
            automationSchedule: automation?.nodes.schedule.name,
            venmoEmailBucket: venmoEmail?.artifacts.name,
            venmoEmailRecipient: venmoEmailConfig?.recipient,
            venmoEmailRule: venmoEmail?.receiptRule.name,
        };
    },
});
