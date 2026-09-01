import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createPlaidAccountLinkEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "plaidAccountLink",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                plaidAccountLinkId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                accountId: { type: "string", required: true },
                plaidItemId: { type: "string", required: true },
                plaidAccountId: { type: "string", required: true },
                plaidAccountName: { type: "string" },
                plaidAccountMask: { type: "string" },
                plaidAccountOfficialName: { type: "string" },
                plaidAccountSubtype: { type: "string" },
                plaidAccountType: { type: "string" },
                plaidBalanceAvailableCents: { type: "number" },
                plaidBalanceCurrentCents: { type: "number" },
                plaidBalanceIsoCurrencyCode: { type: "string" },
                plaidBalanceLastSyncedAt: { type: "string" },
                plaidBalanceLimitCents: { type: "number" },
                plaidBalanceSyncError: { type: "string" },
                plaidBalanceSyncStatus: {
                    type: ["never", "succeeded", "failed"] as const,
                },
                plaidBalanceUnofficialCurrencyCode: { type: "string" },
                plaidInstitutionId: { type: "string" },
                plaidInstitutionLogo: { type: "string" },
                plaidInstitutionName: { type: "string" },
                plaidInstitutionPrimaryColor: { type: "string" },
                plaidInstitutionUrl: { type: "string" },
                syncStartDate: { type: "string", required: true },
                status: {
                    type: ["linked", "error", "disabled"] as const,
                    required: true,
                },
                lastSyncedAt: { type: "string" },
                lastSyncStatus: {
                    type: ["never", "succeeded", "failed"] as const,
                    required: true,
                },
                lastSyncError: { type: "string" },
                createdAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
                updatedAt: {
                    type: "string",
                    required: true,
                    default: () => new Date().toISOString(),
                },
            },
            indexes: {
                byLink: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: {
                        field: "sk",
                        composite: ["plaidAccountLinkId"],
                    },
                },
                byAccount: {
                    index: "gsi1",
                    pk: { field: "gsi1pk", composite: ["ledgerId", "accountId"] },
                    sk: {
                        field: "gsi1sk",
                        composite: ["status", "plaidAccountLinkId"],
                    },
                },
                byPlaidAccount: {
                    index: "gsi2",
                    pk: {
                        field: "gsi2pk",
                        composite: ["ledgerId", "plaidItemId"],
                    },
                    sk: {
                        field: "gsi2sk",
                        composite: ["plaidAccountId", "plaidAccountLinkId"],
                    },
                },
            },
        },
        options,
    );
}
