// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

type VenmoEmailConfig = {
    allowedForwarders?: string[];
    afterRuleName: string;
    receiptRuleSetName: string;
    recipient: string;
};

const VENMO_RECEIPT_RULE_NAME = "BudgetedVenmoInbox";

export function defineVenmoEmailIngestion(input: {
    config: VenmoEmailConfig;
    ledgerTable: ReturnType<typeof import("./dynamo").defineLedgerTable>;
}) {
    const caller = aws.getCallerIdentityOutput();
    const region = aws.getRegionOutput();
    const receiptRuleArn = caller.accountId.apply((accountId) =>
        region.name.apply(
            (regionName) =>
                `arn:aws:ses:${regionName}:${accountId}:receipt-rule-set/${input.config.receiptRuleSetName}:receipt-rule/${VENMO_RECEIPT_RULE_NAME}`,
        ),
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
            after: input.config.afterRuleName,
            enabled: true,
            lambdaActions: [{ functionArn: handler.arn, invocationType: "Event", position: 2 }],
            name: VENMO_RECEIPT_RULE_NAME,
            recipients: [input.config.recipient],
            ruleSetName: input.config.receiptRuleSetName,
            s3Actions: [{ bucketName: artifacts.name, objectKeyPrefix: "venmo-emails/", position: 1 }],
            scanEnabled: true,
            stopActions: [{ position: 3, scope: "RuleSet" }],
            tlsPolicy: "Require",
        },
        { dependsOn: [lambdaPermission] },
    );

    return { artifacts, failureQueue, handler, receiptRule };
}
