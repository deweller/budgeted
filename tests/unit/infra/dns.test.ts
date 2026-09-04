import { describe, expect, it } from "vitest";

import { formatExternalDnsRecords } from "../../../infra/dns";

describe("external DNS output", () => {
    it("formats a web domain CNAME for the SST console", () => {
        expect(
            formatExternalDnsRecords([
                {
                    name: "budgeted.example.com",
                    type: "CNAME",
                    value: "distribution.cloudfront.net",
                },
            ]),
        ).toBe(
            [
                "",
                "  CNAME record",
                "    Name: budgeted.example.com",
                "    Value: distribution.cloudfront.net",
            ].join("\n"),
        );
    });
});
