// @vitest-environment node

import type { SESEventRecord } from "aws-lambda";
import { describe, expect, it } from "vitest";

import { validateEnvelope } from "@/functions/venmo-email-handler";

function record(overrides: Partial<SESEventRecord["ses"]["receipt"]> = {}): SESEventRecord {
    return {
        eventSource: "aws:ses",
        eventVersion: "1.0",
        ses: {
            mail: {
                commonHeaders: { date: "2026-08-07", from: ["Venmo <venmo@venmo.com>"], messageId: "mime-id", returnPath: "", subject: "Sample paid you $1.00" },
                destination: ["venmo@aws.example.com"], headers: [], headersTruncated: false, messageId: "ses-id", source: "forwarder@example.com", timestamp: "2026-08-07T12:00:00.000Z",
            },
            receipt: {
                action: { functionArn: "arn:lambda", invocationType: "Event", type: "Lambda" },
                dkimVerdict: { status: "PASS" }, dmarcVerdict: { status: "PASS" }, processingTimeMillis: 1,
                recipients: ["venmo@aws.example.com"], spamVerdict: { status: "PASS" }, spfVerdict: { status: "PASS" },
                timestamp: "2026-08-07T12:00:00.000Z", virusVerdict: { status: "PASS" }, ...overrides,
            },
        },
    };
}

describe("Venmo SES envelope validation", () => {
    it("accepts the exact envelope recipient and authenticated Venmo From address", () => {
        expect(() => validateEnvelope(record(), "venmo@aws.example.com")).not.toThrow();
    });

    it("accepts only an explicitly configured secondary forwarder", () => {
        const forwarded = record();
        forwarded.ses.mail.commonHeaders.from = [
            "Trusted Forwarder <trusted-forwarder@example.com>",
        ];
        expect(() =>
            validateEnvelope(forwarded, "venmo@aws.example.com", [
                "trusted-forwarder@example.com",
            ]),
        ).not.toThrow();
        expect(() =>
            validateEnvelope(forwarded, "venmo@aws.example.com"),
        ).toThrow(/allowed From address/i);
    });

    it("rejects routing based on any other envelope recipient", () => {
        expect(() => validateEnvelope(record(), "other@aws.example.com")).toThrow(/envelope recipient/i);
    });

    it.each(["spamVerdict", "virusVerdict", "dkimVerdict", "dmarcVerdict"] as const)("rejects a failed %s", (field) => {
        expect(() => validateEnvelope(record({ [field]: { status: "FAIL" } }), "venmo@aws.example.com")).toThrow();
    });
});
