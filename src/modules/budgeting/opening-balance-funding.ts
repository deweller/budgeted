import { isBudgetFundingAccountType } from "@/modules/accounts/account-types";
import { getMonthlyPeriodId } from "@/modules/ledger/monthly-period";
import type { AccountType } from "@/modules/accounts/account-types";

export type OpeningBalanceFundingAccount = {
    accountId: string;
    accountType: AccountType;
    name: string;
    openedOn: string;
    openingBalanceCents: number;
};

export type OpeningBalanceFundingRow = {
    accountId: string;
    accountName: string;
    amountCents: number;
};

export function listOpeningBalanceFundingRowsForPeriod(input: {
    accounts: OpeningBalanceFundingAccount[];
    periodId: string;
}): OpeningBalanceFundingRow[] {
    return input.accounts
        .filter((account) => {
            if (
                !isBudgetFundingAccountType(account.accountType) ||
                account.openingBalanceCents === 0
            ) {
                return false;
            }

            try {
                return getMonthlyPeriodId(account.openedOn) === input.periodId;
            } catch {
                return false;
            }
        })
        .map((account) => ({
            accountId: account.accountId,
            accountName: account.name,
            amountCents: account.openingBalanceCents,
        }))
        .sort((left, right) =>
            left.accountName.localeCompare(right.accountName),
        );
}

export function sumOpeningBalanceFundingRows(
    rows: OpeningBalanceFundingRow[],
) {
    return rows.reduce((total, row) => total + row.amountCents, 0);
}
