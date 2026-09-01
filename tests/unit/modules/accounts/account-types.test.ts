import { describe, expect, it } from "vitest";

import {
    accountTypeSupportsPlaid,
    accountTypeSupportsOpeningBalance,
    isBudgetCategoryActivityAccountType,
    isBudgetFundingAccountEligibleForPeriod,
    isBudgetFundingAccountType,
} from "@/modules/accounts/account-types";

describe("account type budgeting rules", () => {
    it("treats only cash-style accounts as budget funding", () => {
        expect(isBudgetFundingAccountType("checking")).toBe(true);
        expect(isBudgetFundingAccountType("savings")).toBe(true);
        expect(isBudgetFundingAccountType("cash")).toBe(true);
        expect(isBudgetFundingAccountType("creditCard")).toBe(false);
        expect(isBudgetFundingAccountType("transfers")).toBe(false);
        expect(isBudgetFundingAccountType("tracking")).toBe(false);
    });

    it("treats credit cards and transfers accounts as budget category activity accounts", () => {
        expect(isBudgetCategoryActivityAccountType("checking")).toBe(true);
        expect(isBudgetCategoryActivityAccountType("savings")).toBe(true);
        expect(isBudgetCategoryActivityAccountType("cash")).toBe(true);
        expect(isBudgetCategoryActivityAccountType("creditCard")).toBe(true);
        expect(isBudgetCategoryActivityAccountType("transfers")).toBe(true);
        expect(isBudgetCategoryActivityAccountType("tracking")).toBe(false);
    });

    it("does not allow opening balances for transfer accounts", () => {
        expect(accountTypeSupportsOpeningBalance("cash")).toBe(true);
        expect(accountTypeSupportsOpeningBalance("checking")).toBe(true);
        expect(accountTypeSupportsOpeningBalance("savings")).toBe(true);
        expect(accountTypeSupportsOpeningBalance("creditCard")).toBe(true);
        expect(accountTypeSupportsOpeningBalance("transfers")).toBe(false);
        expect(accountTypeSupportsOpeningBalance("tracking")).toBe(true);
    });

    it("does not allow Plaid links for transfer accounts", () => {
        expect(accountTypeSupportsPlaid("cash")).toBe(true);
        expect(accountTypeSupportsPlaid("checking")).toBe(true);
        expect(accountTypeSupportsPlaid("savings")).toBe(true);
        expect(accountTypeSupportsPlaid("creditCard")).toBe(true);
        expect(accountTypeSupportsPlaid("transfers")).toBe(false);
        expect(accountTypeSupportsPlaid("tracking")).toBe(true);
    });

    it("requires funding accounts to be open by the period end date", () => {
        expect(
            isBudgetFundingAccountEligibleForPeriod(
                { accountType: "checking", openedOn: "2026-01-31" },
                "2026-01-31",
            ),
        ).toBe(true);
        expect(
            isBudgetFundingAccountEligibleForPeriod(
                { accountType: "checking", openedOn: "2026-02-01" },
                "2026-01-31",
            ),
        ).toBe(false);
        expect(
            isBudgetFundingAccountEligibleForPeriod(
                { accountType: "creditCard", openedOn: "2026-01-01" },
                "2026-01-31",
            ),
        ).toBe(false);
        expect(
            isBudgetFundingAccountEligibleForPeriod(
                { accountType: "transfers", openedOn: "2026-01-01" },
                "2026-01-31",
            ),
        ).toBe(false);
        expect(
            isBudgetFundingAccountEligibleForPeriod(
                { accountType: "tracking", openedOn: "2026-01-01" },
                "2026-01-31",
            ),
        ).toBe(false);
    });
});
