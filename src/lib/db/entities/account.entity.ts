import { Entity } from "electrodb";

import type { EntityOptions } from "@/lib/db/entity-options";

export function createAccountEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "account",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                accountId: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                name: { type: "string", required: true },
                accountType: {
                    type: [
                        "cash",
                        "checking",
                        "savings",
                        "creditCard",
                        "transfers",
                        "tracking",
                    ] as const,
                    required: true,
                },
                ledgerAccountId: { type: "string", required: true },
                openingBalanceCents: { type: "number", required: true },
                openedOn: { type: "string", required: true },
                plaidAccountLinkId: { type: "string" },
                plaidAccountMask: { type: "string" },
                plaidAccountName: { type: "string" },
                plaidAccountSubtype: { type: "string" },
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
                plaidInstitutionLogo: { type: "string" },
                plaidInstitutionName: { type: "string" },
                plaidInstitutionPrimaryColor: { type: "string" },
                plaidInstitutionUrl: { type: "string" },
                plaidLastSyncedAt: { type: "string" },
                plaidLastSyncStatus: {
                    type: ["never", "succeeded", "failed"] as const,
                },
                plaidLinkStatus: {
                    type: ["linked", "error", "disabled"] as const,
                },
                plaidSyncStartDate: { type: "string" },
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
                byAccount: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["accountId"] },
                },
            },
        },
        options,
    );
}
