// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseVenmoEmail } from "@/features/venmo/models/venmo-email-parser";

const fixture = (name: string) => readFile(resolve(process.cwd(), "tests/fixtures/venmo", name));

describe("parseVenmoEmail", () => {
    it("parses an externally funded payment with quoted-printable emoji and an empty text part", async () => {
        const result = await parseVenmoEmail(await fixture("payment-sent.eml"));
        expect(result).toMatchObject({
            disposition: "activity",
            activity: {
                amountCents: 3500,
                counterpartyName: "Sample Friend",
                fundingInstitution: "SAMPLE BANK",
                fundingLast4: "1234",
                kind: "paymentSent",
                memo: "Shared dinner 🍕",
                occurredDate: "2026-05-26",
                providerTransactionId: "sent-provider-1",
            },
        });
    });

    it("parses a Gmail manual forward from an explicitly allowed sender", async () => {
        await expect(
            parseVenmoEmail(await fixture("payment-sent-forwarded.eml"), {
                allowedForwarders: ["trusted-forwarder@example.com"],
            }),
        ).resolves.toMatchObject({
            disposition: "activity",
            activity: {
                amountCents: 3500,
                kind: "paymentSent",
                memo: "Shared dinner 🍕",
                providerTransactionId: "forwarded-sent-provider-1",
            },
            subject: "You paid Sample Friend $35.00",
        });
    });

    it("rejects manual forwards unless both the outer and embedded senders are trusted", async () => {
        const raw = await fixture("payment-sent-forwarded.eml");
        await expect(parseVenmoEmail(raw)).resolves.toMatchObject({
            disposition: "malformed",
        });
        await expect(
            parseVenmoEmail(
                raw.toString().replace(
                    "From: Venmo &lt;venmo@venmo.com&gt;",
                    "From: Attacker &lt;attacker@example.com&gt;",
                ),
                { allowedForwarders: ["trusted-forwarder@example.com"] },
            ),
        ).resolves.toMatchObject({ disposition: "malformed" });
    });

    it("parses a received payment and preserves emoji memo text", async () => {
        const result = await parseVenmoEmail(await fixture("payment-received.eml"));
        expect(result).toMatchObject({ disposition: "activity", activity: { amountCents: 3230, kind: "paymentReceived", memo: "Game night 🏐", occurredDate: "2026-05-20" } });
    });

    it("parses abbreviated month names from received-payment emails", async () => {
        const raw = (await fixture("payment-received.eml"))
            .toString()
            .replace("May 20, 2026", "Jul 13, 2026");
        await expect(parseVenmoEmail(raw)).resolves.toMatchObject({
            disposition: "activity",
            activity: { occurredDate: "2026-07-13" },
        });
    });

    it("parses a standard transfer destination and dates", async () => {
        const result = await parseVenmoEmail(await fixture("standard-transfer.eml"));
        expect(result).toMatchObject({ disposition: "activity", activity: { amountCents: 1000, destinationInstitution: "SAMPLE CREDIT UNION", destinationLast4: "5678", estimatedArrivalDate: "2026-07-08", kind: "standardTransfer", occurredDate: "2026-07-05" } });
    });

    it.each([
        "ignored-request.eml",
        "payment-request.eml",
        "friend-notice.eml",
        "transaction-history.eml",
        "general-notice.eml",
    ])("ignores non-financial Venmo mail from %s", async (filename) => {
        await expect(parseVenmoEmail(await fixture(filename))).resolves.toMatchObject({ disposition: "ignored" });
    });

    it("rejects a financial-looking message from a different sender", async () => {
        const raw = (await fixture("payment-received.eml")).toString().replace("venmo@venmo.com", "attacker@example.com");
        await expect(parseVenmoEmail(raw)).resolves.toMatchObject({ disposition: "malformed" });
    });

    it("parses folded financial subject headers", async () => {
        const raw = (await fixture("payment-received.eml")).toString().replace(
            "Subject: Sample Friend paid you $32.30",
            "Subject: Sample Friend paid you\n $32.30",
        );
        await expect(parseVenmoEmail(raw)).resolves.toMatchObject({ disposition: "activity", activity: { providerTransactionId: "received-provider-1" } });
    });

    it("preserves long settlement descriptions as received-payment memos", async () => {
        const memo = "Your sample consumer settlement payment is now available in Venmo.";
        await expect(parseVenmoEmail(await fixture("payment-received-settlement.eml"))).resolves.toMatchObject({ disposition: "activity", activity: { amountCents: 467, memo } });
    });

    it("reports malformed financial messages instead of partially posting them", async () => {
        const raw = (await fixture("payment-sent.eml")).toString().replace("<div>sent-provider-1</div>", "");
        await expect(parseVenmoEmail(raw)).resolves.toMatchObject({ disposition: "malformed" });
    });
});
