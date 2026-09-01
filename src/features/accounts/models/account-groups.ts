import type { AccountWithBalance } from "@/features/accounts/server/account-balance-service";
import { formatAccountTypeLabel } from "@/modules/accounts/account-types";

export type AccountTypeGroup = {
    accounts: AccountWithBalance[];
    label: string;
    type: AccountWithBalance["accountType"];
};

export function groupAccountsByType(
    accounts: AccountWithBalance[],
): AccountTypeGroup[] {
    const accountsByType = accounts.reduce<
        Partial<Record<AccountWithBalance["accountType"], AccountWithBalance[]>>
    >((groups, account) => {
        const group = groups[account.accountType] ?? [];

        return {
            ...groups,
            [account.accountType]: [...group, account],
        };
    }, {});

    return Object.entries(accountsByType)
        .map(([type, groupedAccounts]) => ({
            accounts: [...groupedAccounts].sort((left, right) =>
                left.name.localeCompare(right.name),
            ),
            label: formatAccountTypeLabel(
                type as AccountWithBalance["accountType"],
            ),
            type: type as AccountWithBalance["accountType"],
        }))
        .sort((left, right) => left.label.localeCompare(right.label));
}
