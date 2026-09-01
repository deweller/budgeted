import { calculateAccountBalanceCents } from "@/modules/ledger/account-balance";
import type { AccountType } from "@/modules/accounts/account-types";
import { queryAllPages } from "@/lib/db/query-all-pages";
import { getBudgetedSchema } from "@/lib/db/schema";

export type AccountRecord = {
    accountId: string;
    accountType: AccountType;
    createdAt: string;
    ledgerAccountId: string;
    name: string;
    openedOn: string;
    openingBalanceCents: number;
    plaidAccountLinkId?: string;
    plaidAccountMask?: string;
    plaidAccountName?: string;
    plaidAccountSubtype?: string;
    plaidBalanceAvailableCents?: number;
    plaidBalanceCurrentCents?: number;
    plaidBalanceIsoCurrencyCode?: string;
    plaidBalanceLastSyncedAt?: string;
    plaidBalanceLimitCents?: number;
    plaidBalanceSyncError?: string;
    plaidBalanceSyncStatus?: "failed" | "never" | "succeeded";
    plaidBalanceUnofficialCurrencyCode?: string;
    plaidInstitutionLogo?: string;
    plaidInstitutionName?: string;
    plaidInstitutionPrimaryColor?: string;
    plaidInstitutionUrl?: string;
    plaidLastSyncedAt?: string;
    plaidLastSyncStatus?: "failed" | "never" | "succeeded";
    plaidLinkStatus?: "disabled" | "error" | "linked";
    plaidSyncStartDate?: string;
    updatedAt: string;
    ledgerId: string;
};

export type AccountWithBalance = AccountRecord & {
    balanceCents: number;
};

export { calculateAccountBalanceCents };

export async function listAccountBalancesForAccounts(
    ledgerId: string,
    accounts: AccountRecord[],
    asOf?: Date | string,
) {
    const { entities } = getBudgetedSchema();

    const balances = await Promise.all(
        accounts.map(async (account) => {
            const postings = await queryAllPages(
                entities.ledgerPostings.query.byLedgerAccount({
                    ledgerId,
                    ledgerAccountId: account.ledgerAccountId,
                }),
            );

            return [
                account.accountId,
                calculateAccountBalanceCents(account, postings, asOf),
            ] as const;
        }),
    );

    return new Map(balances);
}

export async function hydrateAccountsWithBalances(
    ledgerId: string,
    accounts: AccountRecord[],
    asOf?: Date | string,
): Promise<AccountWithBalance[]> {
    const balances = await listAccountBalancesForAccounts(
        ledgerId,
        accounts,
        asOf,
    );

    return accounts.map((account) => ({
        ...account,
        balanceCents:
            balances.get(account.accountId) ?? account.openingBalanceCents,
    }));
}
