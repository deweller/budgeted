// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

import type { VenmoEmailConfig } from "./config";

const VENMO_RECEIPT_RULE_NAME = "BudgetedVenmoInbox";
const VENMO_RECEIPT_RULE_SET_SUFFIX = "venmo-email";

export function getVenmoEmailDomain(recipient: string) {
    return recipient.slice(recipient.lastIndexOf("@") + 1);
}

export function getSesInboundEndpoint(region: string) {
    return `inbound-smtp.${region}.amazonaws.com`;
}

export function getVenmoEmailDnsRecords(input: {
    domain: string;
    region: string;
    verificationToken: string;
}) {
    return [
        {
            name: `_amazonses.${input.domain}`,
            type: "TXT",
            value: input.verificationToken,
        },
        {
            name: input.domain,
            priority: 10,
            type: "MX",
            value: getSesInboundEndpoint(input.region),
        },
    ];
}

export function formatVenmoEmailDnsRecords(
    records: ReturnType<typeof getVenmoEmailDnsRecords>,
) {
    const formattedRecords = records
        .map((record) =>
            [
                `  ${record.type} record`,
                `    Name: ${record.name}`,
                ...(record.priority === undefined
                    ? []
                    : [`    Priority: ${record.priority}`]),
                `    Value: ${record.value}`,
            ].join("\n"),
        )
        .join("\n\n");

    return `\n${formattedRecords}`;
}

function getReceiptRuleSetName() {
    return `${$app.name}-${$app.stage}-${VENMO_RECEIPT_RULE_SET_SUFFIX}`;
}

export function defineVenmoEmailIngestion(input: {
    config: VenmoEmailConfig;
    ledgerTable: ReturnType<typeof import("./dynamo").defineLedgerTable>;
}) {
    const caller = aws.getCallerIdentityOutput();
    const region = aws.getRegionOutput();
    const domain = getVenmoEmailDomain(input.config.recipient);
    const domainIdentity = new aws.ses.DomainIdentity(
        "VenmoEmailDomainIdentity",
        { domain },
    );
    const externalDnsRecords =
        input.config.dns === "external"
            ? region.name.apply((regionName) =>
                  domainIdentity.verificationToken.apply(
                      (verificationToken) =>
                          formatVenmoEmailDnsRecords(
                              getVenmoEmailDnsRecords({
                                  domain,
                                  region: regionName,
                                  verificationToken,
                              }),
                          ),
                  ),
              )
            : undefined;
    const managedDns =
        input.config.dns === "route53"
            ? defineRoute53Dns({
                  domain,
                  regionName: region.name,
                  route53ZoneId: input.config.route53ZoneId,
                  verificationToken: domainIdentity.verificationToken,
              })
            : undefined;
    const domainVerification = managedDns
        ? new aws.ses.DomainIdentityVerification(
              "VenmoEmailDomainVerification",
              { domain: domainIdentity.domain },
              { dependsOn: [managedDns.verificationRecord] },
          )
        : undefined;
    const receiptRuleSet = new aws.ses.ReceiptRuleSet(
        "VenmoEmailReceiptRuleSet",
        { ruleSetName: getReceiptRuleSetName() },
    );
    const receiptRuleArn = receiptRuleSet.arn.apply(
        (ruleSetArn) =>
            `${ruleSetArn}:receipt-rule/${VENMO_RECEIPT_RULE_NAME}`,
    );
    const failureQueue = new sst.aws.Queue("VenmoEmailFailures", {
        transform: {
            queue: (args) => {
                args.messageRetentionSeconds = 7 * 24 * 60 * 60;
            },
        },
    });
    const artifacts = new sst.aws.Bucket("VenmoEmailArtifacts", {
        cors: false,
        lifecycle: [
            {
                expiresIn: "7 days",
                id: "expire-venmo-emails",
                prefix: "venmo-emails/",
            },
        ],
        policy: [
            {
                actions: ["s3:PutObject"],
                conditions: [
                    {
                        test: "StringEquals",
                        variable: "AWS:SourceAccount",
                        values: [caller.accountId],
                    },
                    {
                        test: "ArnLike",
                        variable: "AWS:SourceArn",
                        values: [receiptRuleArn],
                    },
                ],
                paths: ["venmo-emails/*"],
                principals: [
                    {
                        identifiers: ["ses.amazonaws.com"],
                        type: "service",
                    },
                ],
            },
        ],
    });
    const handler = new sst.aws.Function("VenmoEmailHandler", {
        environment: {
            VENMO_EMAIL_ALLOWED_FORWARDERS: JSON.stringify(
                input.config.allowedForwarders ?? [],
            ),
            VENMO_EMAIL_RECIPIENT: input.config.recipient,
        },
        handler: "src/functions/venmo-email-handler.handler",
        link: [input.ledgerTable, artifacts, failureQueue],
        retries: 2,
        timeout: "2 minutes",
        transform: {
            eventInvokeConfig: (args) => {
                args.destinationConfig = {
                    onFailure: { destination: failureQueue.arn },
                };
                args.maximumEventAgeInSeconds = 6 * 60 * 60;
            },
        },
    });

    const lambdaPermission = new aws.lambda.Permission("VenmoEmailHandlerSesPermission", {
        action: "lambda:InvokeFunction",
        function: handler.name,
        principal: "ses.amazonaws.com",
        sourceAccount: caller.accountId,
        sourceArn: receiptRuleArn,
    });
    const receiptRule = new aws.ses.ReceiptRule(
        "VenmoEmailReceiptRule",
        {
            enabled: true,
            lambdaActions: [{ functionArn: handler.arn, invocationType: "Event", position: 2 }],
            name: VENMO_RECEIPT_RULE_NAME,
            recipients: [input.config.recipient],
            ruleSetName: receiptRuleSet.ruleSetName,
            s3Actions: [{ bucketName: artifacts.name, objectKeyPrefix: "venmo-emails/", position: 1 }],
            scanEnabled: true,
            stopActions: [{ position: 3, scope: "RuleSet" }],
            tlsPolicy: "Require",
        },
        {
            dependsOn: [
                domainVerification ?? domainIdentity,
                lambdaPermission,
                receiptRuleSet,
            ],
        },
    );
    const activeReceiptRuleSet = new aws.ses.ActiveReceiptRuleSet(
        "VenmoEmailActiveReceiptRuleSet",
        { ruleSetName: receiptRuleSet.ruleSetName },
        { dependsOn: [receiptRule] },
    );

    return {
        activeReceiptRuleSet,
        artifacts,
        externalDnsRecords,
        domainIdentity,
        failureQueue,
        handler,
        receiptRule,
        receiptRuleSet,
    };
}

function defineRoute53Dns(input: {
    domain: string;
    regionName: ReturnType<typeof aws.getRegionOutput>["name"];
    route53ZoneId?: string;
    verificationToken: InstanceType<
        typeof aws.ses.DomainIdentity
    >["verificationToken"];
}) {
    const dns = sst.aws.dns(
        input.route53ZoneId ? { zone: input.route53ZoneId } : {},
    );
    const verificationRecord = dns.createRecord(
        "VenmoEmailIdentity",
        {
            name: `_amazonses.${input.domain}`,
            type: "TXT",
            value: input.verificationToken,
        },
        {},
    );
    const mxRecord = dns.createRecord(
        "VenmoEmailInbox",
        {
            name: input.domain,
            priority: 10,
            type: "MX",
            value: input.regionName.apply(getSesInboundEndpoint),
        },
        {},
    );

    return { mxRecord, verificationRecord };
}
