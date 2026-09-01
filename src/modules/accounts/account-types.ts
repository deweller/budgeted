export const accountTypeValues = [
    "cash",
    "checking",
    "savings",
    "creditCard",
    "transfers",
    "tracking",
] as const;

export type AccountType = (typeof accountTypeValues)[number];

export function isBudgetFundingAccountType(accountType: AccountType) {
    return (
        accountType === "cash" ||
        accountType === "checking" ||
        accountType === "savings"
    );
}

export function isBudgetCategoryActivityAccountType(accountType: AccountType) {
    return (
        isBudgetFundingAccountType(accountType) ||
        accountType === "creditCard" ||
        accountType === "transfers"
    );
}

export function accountTypeSupportsOpeningBalance(accountType: AccountType) {
    return accountType !== "transfers";
}

export function accountTypeSupportsPlaid(accountType: AccountType) {
    return accountType !== "transfers";
}

function toPeriodCutoffTimestamp(value: string) {
    return new Date(`${value}T23:59:59.999Z`).getTime();
}

export function isBudgetFundingAccountEligibleForPeriod(account: {
    accountType: AccountType;
    openedOn: string;
}, periodEndDate: string) {
    const periodCutoffTimestamp = toPeriodCutoffTimestamp(periodEndDate);
    const openedOnTimestamp = toPeriodCutoffTimestamp(account.openedOn);

    return (
        isBudgetFundingAccountType(account.accountType) &&
        openedOnTimestamp <= periodCutoffTimestamp
    );
}

export function formatAccountTypeLabel(accountType: AccountType) {
    if (accountType === "creditCard") {
        return "Credit card";
    }

    if (accountType === "transfers") {
        return "Transfers";
    }

    return accountType.charAt(0).toUpperCase() + accountType.slice(1);
}
