import { describe, expect, it } from "vitest";

import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { findActivePlaidAccountLink } from "@/features/plaid/models/plaid-balance-summary";
import type { WorkspacePlaidAccountLinkRecord } from "@/lib/workspace/sync-types";

const account: AccountWithBalance = {
    accountId: "account-1",
    accountType: "creditCard",
    balanceCents: 0,
    createdAt: "2026-07-29T09:00:00.000Z",
    ledgerAccountId: "acct_amex",
    ledgerId: "ledger-1",
    name: "AmEx",
    openedOn: "2026-01-01",
    openingBalanceCents: 0,
    plaidAccountLinkId: "disabled-link",
    plaidBalanceSyncError: "one or more of the account IDs is invalid",
    plaidBalanceSyncStatus: "failed",
    plaidLinkStatus: "linked",
    updatedAt: "2026-07-29T09:00:00.000Z",
};

const disabledLink: WorkspacePlaidAccountLinkRecord = {
    accountId: "account-1",
    createdAt: "2026-07-29T09:00:00.000Z",
    lastSyncStatus: "succeeded",
    ledgerId: "ledger-1",
    plaidAccountId: "old-plaid-account",
    plaidAccountLinkId: "disabled-link",
    plaidBalanceSyncError: "one or more of the account IDs is invalid",
    plaidBalanceSyncStatus: "failed",
    plaidItemId: "item-1",
    status: "disabled",
    syncStartDate: "2026-01-01",
    updatedAt: "2026-07-29T09:00:00.000Z",
};

const activeLink: WorkspacePlaidAccountLinkRecord = {
    ...disabledLink,
    plaidAccountId: "current-plaid-account",
    plaidAccountLinkId: "active-link",
    plaidBalanceCurrentCents: 12_345,
    plaidBalanceLastSyncedAt: "2026-07-29T10:00:00.000Z",
    plaidBalanceSyncError: undefined,
    plaidBalanceSyncStatus: "succeeded",
    status: "linked",
    updatedAt: "2026-07-29T10:00:00.000Z",
};

describe("findActivePlaidAccountLink", () => {
    it("ignores a disabled summary link after an account is relinked", () => {
        expect(
            findActivePlaidAccountLink(account, [disabledLink, activeLink]),
        ).toEqual(activeLink);
    });
});
