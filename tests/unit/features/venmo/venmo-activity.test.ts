import { describe, expect, it } from "vitest";

import {
    createVenmoExternalAccountKey,
    venmoFinancialDetailsEqual,
    type VenmoParsedActivity,
} from "@/features/venmo/models/venmo-activity";

const activity: VenmoParsedActivity = { amountCents: 3500, fundingInstitution: "Capital One, N.A.", fundingLast4: "1234", kind: "paymentSent", occurredDate: "2026-05-26", providerTransactionId: "provider-1" };

describe("Venmo activity identity", () => {
    it("uses normalized institution plus last four for external mappings", () => {
        expect(createVenmoExternalAccountKey({ institution: "Capital One, N.A.", last4: "1234" })).toBe("capital one n a:1234");
    });

    it("treats changed financial details for the same provider id as a conflict", () => {
        expect(venmoFinancialDetailsEqual(activity, { ...activity })).toBe(true);
        expect(venmoFinancialDetailsEqual(activity, { ...activity, amountCents: 3600 })).toBe(false);
        expect(venmoFinancialDetailsEqual(activity, { ...activity, occurredDate: "2026-05-27" })).toBe(false);
        expect(venmoFinancialDetailsEqual(activity, { ...activity, kind: "paymentReceived" })).toBe(false);
    });
});
