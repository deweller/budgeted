import { describe, expect, it } from "vitest";

import {
    getSesInboundEndpoint,
    getVenmoEmailDnsRecords,
    getVenmoEmailDomain,
} from "../../../infra/venmo-email";

describe("Venmo email infrastructure", () => {
    it("derives the dedicated inbox domain from the recipient", () => {
        expect(getVenmoEmailDomain("venmo@aws.example.com")).toBe(
            "aws.example.com",
        );
    });

    it("uses the regional SES receiving endpoint", () => {
        expect(getSesInboundEndpoint("us-east-1")).toBe(
            "inbound-smtp.us-east-1.amazonaws.com",
        );
    });

    it("describes every DNS record required for an external provider", () => {
        expect(
            getVenmoEmailDnsRecords({
                domain: "aws.example.com",
                region: "us-east-1",
                verificationToken: "verification-token",
            }),
        ).toEqual([
            {
                name: "_amazonses.aws.example.com",
                type: "TXT",
                value: "verification-token",
            },
            {
                name: "aws.example.com",
                priority: 10,
                type: "MX",
                value: "inbound-smtp.us-east-1.amazonaws.com",
            },
        ]);
    });
});
