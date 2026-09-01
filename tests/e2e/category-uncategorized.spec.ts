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
import { createTransaction } from "./support/transactions";

async function createCategory(
    page: import("@playwright/test").Page,
    categoryName: string,
) {
    await createGlobalBudgetCategory(page, {
        name: categoryName,
        groupLabel: "Deletion checks",
    });
}

async function confirmCategoryDeletion(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: "Delete permanently" }).click();

    const refreshPreviewButton = page.getByRole("button", {
        name: "Refresh preview",
    });

    if (await refreshPreviewButton.isVisible().catch(() => false)) {
        await refreshPreviewButton.click();
        await expect(refreshPreviewButton).toHaveCount(0);
        await page.getByRole("button", { name: "Delete permanently" }).click();
    }
}

test("category deletion preserves transactions as uncategorized activity", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const accountName = `Uncategorized Wallet ${nonce}`;
    const categoryName = `Uncategorized Groceries ${nonce}`;
    const payeeName = `Uncategorized Merchant ${nonce}`;

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
    await confirmCategoryDeletion(page);

    await expect(categoryRow).toHaveCount(0);

    await page.goto("/transactions/all-accounts");
    const transactionRow = page.locator("tr", { hasText: payeeName });

    await expect(transactionRow).toBeVisible();
    await expect(
        transactionRow.locator("span", { hasText: /^Uncategorized$/ }).first(),
    ).toBeVisible();
});
