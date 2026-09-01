import { describe, expect, it } from "vitest";

import { getTransactionMergeEligibility } from "@/features/transactions/models/transaction-merge-eligibility";

function transaction(providerRecordId?: string, memo?: string) {
    return {
        displayAmountCents: -1200,
        lines: [{}],
        status: "entered" as const,
        ...(providerRecordId
            ? {
                  importActivities: [{
                      activityId: `venmo:${providerRecordId}`,
                      createdAt: "2026-08-08T12:00:00.000Z",
                      detailsJson: "{}",
                      detailsVersion: 2,
                      direction: "outflow" as const,
                      financialFingerprint: providerRecordId,
                      ledgerId: "ledger-1",
                      memo,
                      occurredDate: "2026-08-08",
                      provider: "venmo" as const,
                      providerAmountCents: 1_200,
                      providerRecordId,
                      state: "posted" as const,
                      updatedAt: "2026-08-08T12:00:00.000Z",
                  }],
              }
            : {}),
    };
}

describe("Venmo transaction merge eligibility", () => {
    it("allows one Venmo activity to merge into a Plaid duplicate", () => {
        expect(
            getTransactionMergeEligibility([
                transaction("venmo-1"),
                transaction(),
            ]),
        ).toEqual({ canMerge: true });
    });

    it("rejects merging two different Venmo activities", () => {
        expect(
            getTransactionMergeEligibility([
                transaction("venmo-1"),
                transaction("venmo-2"),
            ]),
        ).toMatchObject({
            canMerge: false,
            reason: expect.stringMatching(/different venmo importer activities/i),
        });
    });

    it("allows the same canonical Venmo activity to merge", () => {
        expect(
            getTransactionMergeEligibility([
                transaction("venmo-1", "Dinner"),
                transaction("venmo-1", "Different memo"),
            ]),
        ).toEqual({ canMerge: true });
    });
});
