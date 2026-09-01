import { expect, test } from "@playwright/test";

import {
    signInTestUser,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { createAccount } from "./support/accounts";
import {
    createGlobalBudgetCategory,
    expectGlobalBudgetPage,
} from "./support/budget";
import {
    createTransaction,
    expectTransactionRowVisible,
} from "./support/transactions";

async function createCategory(
    page: import("@playwright/test").Page,
    categoryName: string,
) {
    await createGlobalBudgetCategory(page, {
        name: categoryName,
        groupLabel: "Deletion checks",
    });
}

test("category delete preview explains preserved uncategorized transactions and can be cancelled", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const accountName = `Category Wallet ${nonce}`;
    const categoryName = `Deletion Groceries ${nonce}`;
    const payeeName = `Category Merchant ${nonce}`;

    await signInTestUser(page);
    await createAccount(page, { name: accountName });
    await createCategory(page, categoryName);
    await createTransaction(page, {
        accountName,
        amount: "-18.25",
        categoryName,
        payeeName,
    });

    await page.goto("/global-budget");
    await expectGlobalBudgetPage(page);
    const categoryRow = page.locator("tr", { hasText: categoryName });

    await categoryRow.getByRole("button", { name: "Delete" }).click();

    await expect(
        page.getByRole("heading", { name: `Delete ${categoryName}?` }),
    ).toBeVisible();
    await expect(
        page.getByText(
            "This deletion is permanent. All related data will be deleted.",
        ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(categoryRow).toBeVisible();
    await page.goto("/transactions/all-accounts");
    await expectTransactionRowVisible(page, payeeName);
});
