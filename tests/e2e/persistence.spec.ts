import { expect, test } from "@playwright/test";

import {
    signInTestUser,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { createAccount } from "./support/accounts";
import {
    commitBudgetAssignedAmount,
    createGlobalBudgetCategory,
    expectBudgetPage,
    getSeededPeriodId,
} from "./support/budget";
import {
    createTransaction,
    expectTransactionRowVisible,
} from "./support/transactions";
import { selectComboboxOption } from "./support/combobox";

async function openBudgetPeriodForCategory(
    page: import("@playwright/test").Page,
    periodId: string,
    categoryName: string,
) {
    const url = `/budget?month=${periodId}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.goto(url);
        await expectBudgetPage(page);

        const budgetRow = page.locator("tr", { hasText: categoryName });
        const assignedAmountButton = budgetRow.getByRole("button", {
            name: `Edit assigned amount for ${categoryName}`,
        });

        if (await assignedAmountButton.isVisible().catch(() => false)) {
            return { assignedAmountButton, budgetRow };
        }

        await page.reload();
    }

    const budgetRow = page.locator("tr", { hasText: categoryName });
    const assignedAmountButton = budgetRow.getByRole("button", {
        name: `Edit assigned amount for ${categoryName}`,
    });

    await expect(assignedAmountButton).toBeVisible();

    return { assignedAmountButton, budgetRow };
}

test("saved workspace data persists across refresh and later sign-in", async ({
    page,
}) => {
    test.slow();
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const accountName = `Persistence Wallet ${nonce}`;
    const categoryName = `Persistence Groceries ${nonce}`;
    const payeeName = `Persistence Market ${nonce}`;
    const targetPeriodId = getSeededPeriodId(nonce, 3);

    await signInTestUser(page);

    await createAccount(page, { name: accountName });

    await createGlobalBudgetCategory(page, {
        name: categoryName,
        groupLabel: "Persistence",
    });
    const { assignedAmountButton, budgetRow } =
        await openBudgetPeriodForCategory(page, targetPeriodId, categoryName);

    await commitBudgetAssignedAmount(page, budgetRow, categoryName, "75.00");
    await expect(page.getByText("Allocations saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByText(categoryName)).toBeVisible();
    await expect(assignedAmountButton).toHaveText("$75.00");

    await createTransaction(page, {
        accountName,
        amount: "-23.50",
        categoryName,
        payeeName,
    });

    await page.reload();
    await expectTransactionRowVisible(page, payeeName);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await signInTestUser(page);

    await page.goto("/accounts");
    await expect(page.getByText(accountName)).toBeVisible();

    const revisitedBudget = await openBudgetPeriodForCategory(
        page,
        targetPeriodId,
        categoryName,
    );
    await expect(revisitedBudget.budgetRow).toBeVisible();
    await expect(revisitedBudget.assignedAmountButton).toHaveText("$75.00");

    await page.goto("/transactions/all-accounts");
    await expectTransactionRowVisible(page, payeeName);

    await page.goto("/reporting");
    await page.getByRole("link", { name: /Category detail/i }).click();
    await selectComboboxOption(page, "Category", categoryName);
    await expect(page.getByText(`${categoryName} total`)).toBeVisible();
});
