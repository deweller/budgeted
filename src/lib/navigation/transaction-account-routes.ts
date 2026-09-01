export const ALL_TRANSACTION_ACCOUNTS_SLUG = "all-accounts";

export type TransactionAccountRouteAccount = {
    accountId: string;
    name: string;
};

function slugifyAccountSegment(value: string) {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "account"
    );
}

export function getTransactionAccountSlug(
    account: TransactionAccountRouteAccount,
    accounts: TransactionAccountRouteAccount[],
) {
    const baseSlug = slugifyAccountSegment(account.name);
    const hasDuplicateSlug = accounts.some(
        (candidate) =>
            candidate.accountId !== account.accountId &&
            slugifyAccountSegment(candidate.name) === baseSlug,
    );

    if (baseSlug === ALL_TRANSACTION_ACCOUNTS_SLUG || hasDuplicateSlug) {
        return `${baseSlug}-${slugifyAccountSegment(account.accountId)}`;
    }

    return baseSlug;
}

export function getTransactionsAccountHref(
    account: TransactionAccountRouteAccount | null,
    accounts: TransactionAccountRouteAccount[],
) {
    const slug = account
        ? getTransactionAccountSlug(account, accounts)
        : ALL_TRANSACTION_ACCOUNTS_SLUG;

    return `/transactions/${slug}` as const;
}

export function findAccountByTransactionSlug<
    Account extends TransactionAccountRouteAccount,
>(accounts: Account[], accountSlug: string) {
    if (accountSlug === ALL_TRANSACTION_ACCOUNTS_SLUG) {
        return null;
    }

    return (
        accounts.find(
            (account) =>
                getTransactionAccountSlug(account, accounts) === accountSlug,
        ) ?? undefined
    );
}
