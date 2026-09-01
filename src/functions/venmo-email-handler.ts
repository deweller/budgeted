import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { SESEvent, SESEventRecord, SESReceiptStatus } from "aws-lambda";

import { parseVenmoEmail } from "@/features/venmo/models/venmo-email-parser";
import { ingestVenmoActivity, reconcileVenmoActivities } from "@/features/venmo/server/venmo-service";
import { persistWorkspaceChanges } from "@/features/workspace/server/workspace-sync-service";
import { createWorkspaceUpsertChange } from "@/features/workspace/server/workspace-change-builder";
import { getBudgetedSchema } from "@/lib/db/schema";
import { requireLinkedBucketName } from "@/lib/db/resource";
import type { WorkspaceVenmoIntegrationRecord } from "@/lib/workspace/sync-types";

const s3 = new S3Client({});
const VENMO_SENDER = "venmo@venmo.com";

function passed(verdict: SESReceiptStatus) {
    return verdict.status === "PASS";
}

function headerMailboxAddress(value: string) {
    const bracketed = /<([^<>]+)>/.exec(value)?.[1];
    const address = (bracketed ?? value).trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+$/.test(address) ? address : undefined;
}

function configuredAllowedForwarders() {
    const configured = JSON.parse(
        process.env.VENMO_EMAIL_ALLOWED_FORWARDERS ?? "[]",
    ) as unknown;
    if (
        !Array.isArray(configured) ||
        configured.some((value) => typeof value !== "string")
    ) {
        throw new Error("VENMO_EMAIL_ALLOWED_FORWARDERS must be a JSON string array.");
    }
    return configured.map((value) => value.trim().toLowerCase());
}

function validateEnvelope(
    record: SESEventRecord,
    recipient: string,
    allowedForwarders: readonly string[] = [],
) {
    const receipt = record.ses.receipt;
    if (receipt.recipients.length !== 1 || receipt.recipients[0]?.toLowerCase() !== recipient) {
        throw new Error("The SES envelope recipient does not match the configured Venmo inbox.");
    }
    if (!passed(receipt.spamVerdict) || !passed(receipt.virusVerdict)) {
        throw new Error("SES rejected the Venmo email security verdicts.");
    }
    if (!passed(receipt.dkimVerdict) || !passed(receipt.dmarcVerdict)) {
        throw new Error("The Venmo email did not pass aligned DKIM and DMARC checks.");
    }
    const from = record.ses.mail.commonHeaders.from ?? [];
    const allowedSenders = new Set([VENMO_SENDER, ...allowedForwarders]);
    if (
        from.length !== 1 ||
        !allowedSenders.has(headerMailboxAddress(from[0]!) ?? "")
    ) {
        throw new Error("The Venmo email does not have an allowed From address.");
    }
}

async function enabledIntegration(recipient: string) {
    const result = await getBudgetedSchema().entities.venmoIntegrations.query
        .byRecipient({ inboundRecipient: recipient })
        .go({ pages: "all" });
    const enabled = (result.data as WorkspaceVenmoIntegrationRecord[]).filter((record) => record.inboxEnabled);
    if (enabled.length !== 1) throw new Error(`Expected exactly one enabled ledger for ${recipient}; found ${enabled.length}.`);
    return enabled[0]!;
}

async function updateIntegrationStatus(integration: WorkspaceVenmoIntegrationRecord, status: "succeeded" | "failed", error?: string) {
    const next: WorkspaceVenmoIntegrationRecord = {
        ...integration,
        lastError: error,
        latestProcessingAt: new Date().toISOString(),
        latestProcessingStatus: status,
        updatedAt: new Date().toISOString(),
    };
    await getBudgetedSchema().entities.venmoIntegrations.put(next).go();
    await persistWorkspaceChanges({
        activeLedgerId: integration.ledgerId,
        changes: [createWorkspaceUpsertChange({
            entityId: next.integrationId,
            entityType: "venmoIntegration",
            previousRecord: integration,
            record: next,
        })],
    });
}

async function readRawMessage(messageId: string) {
    const result = await s3.send(new GetObjectCommand({
        Bucket: requireLinkedBucketName("VenmoEmailArtifacts"),
        Key: `venmo-emails/${messageId}`,
    }));
    if (!result.Body) throw new Error("The raw Venmo email artifact is missing.");
    return result.Body.transformToByteArray();
}

async function processRecord(record: SESEventRecord) {
    const recipient = record.ses.receipt.recipients[0]?.toLowerCase();
    if (!recipient) throw new Error("The SES event has no envelope recipient.");
    const allowedForwarders = configuredAllowedForwarders();
    validateEnvelope(record, recipient, allowedForwarders);
    const integration = await enabledIntegration(recipient);

    try {
        const parsed = await parseVenmoEmail(
            await readRawMessage(record.ses.mail.messageId),
            { allowedForwarders },
        );
        if (parsed.disposition === "ignored") {
            await updateIntegrationStatus(integration, "succeeded");
            return;
        }
        if (parsed.disposition === "malformed") throw new Error(parsed.message);
        const result = await ingestVenmoActivity({
            ledgerId: integration.ledgerId,
            messageId: record.ses.mail.messageId,
            parsed: parsed.activity,
            sourceSubject: parsed.subject,
        });
        const reconciliation = await reconcileVenmoActivities(integration.ledgerId);
        await persistWorkspaceChanges({
            activeLedgerId: integration.ledgerId,
            changes: [...result.workspaceChanges, ...reconciliation.workspaceChanges],
        });
        await updateIntegrationStatus(integration, "succeeded");
    } catch (error) {
        await updateIntegrationStatus(integration, "failed", error instanceof Error ? error.message : String(error));
        throw error;
    }
}

export async function handler(event: SESEvent) {
    for (const record of event.Records) await processRecord(record);
}

export { validateEnvelope };
