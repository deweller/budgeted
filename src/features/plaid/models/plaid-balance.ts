import type { AccountType } from "@/modules/accounts/account-types";

type BudgetedAccountType = AccountType;

function normalizePlaidText(value: string | null | undefined) {
    return value?.trim().toLowerCase();
}

function isPlaidLiabilityBalance(input: {
    accountType?: BudgetedAccountType;
    plaidAccountSubtype?: string;
    plaidAccountType?: string;
}) {
    const plaidAccountType = normalizePlaidText(input.plaidAccountType);
    const plaidAccountSubtype = normalizePlaidText(input.plaidAccountSubtype);

    return (
        input.accountType === "creditCard" ||
        plaidAccountType === "credit" ||
        plaidAccountType === "loan" ||
        plaidAccountSubtype === "credit card"
    );
}

export function getComparablePlaidBalanceCents(input: {
    accountType?: BudgetedAccountType;
    plaidAccountSubtype?: string;
    plaidAccountType?: string;
    plaidBalanceCurrentCents?: number;
}) {
    if (typeof input.plaidBalanceCurrentCents !== "number") {
        return undefined;
    }

    return isPlaidLiabilityBalance(input)
        ? -input.plaidBalanceCurrentCents
        : input.plaidBalanceCurrentCents;
}
