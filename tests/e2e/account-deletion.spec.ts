import { expect, test } from "@playwright/test";

import {
    signInTestUser,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { createAccount } from "./support/accounts";
import {
    createTransaction,
    expectTransactionRowVisible,
} from "./support/transactions";

test("account delete preview can be cancelled without changing saved rows", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const accountName = `Delete Preview Wallet ${nonce}`;
    const payeeName = `Delete Preview Merchant ${nonce}`;

    await signInTestUser(page);
    await createAccount(page, { name: accountName });
    await createTransaction(page, {
        accountName,
        amount: "-12.50",
        payeeName,
    });

    await page.goto("/accounts");
    const accountRow = page.locator("tr", { hasText: accountName });

    await accountRow.getByRole("button", { name: "Delete" }).click();

    const deleteDialog = page.getByRole("dialog", {
        name: `Delete ${accountName}?`,
    });

    await expect(deleteDialog).toBeVisible();
    await expect(
        deleteDialog.getByRole("heading", { name: `Delete ${accountName}?` }),
    ).toBeVisible();
    await expect(
        deleteDialog.getByText(
            "This deletion is permanent. All related data will be deleted.",
        ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(accountRow).toBeVisible();

    await page.goto("/transactions/all-accounts");
    await expectTransactionRowVisible(page, payeeName);
});

test("account deletion removes the account and its dependent transactions", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const accountName = `Cascade Wallet ${nonce}`;
    const payeeName = `Cascade Merchant ${nonce}`;

    await signInTestUser(page);
    await createAccount(page, { name: accountName });
    await createTransaction(page, {
        accountName,
        amount: "-12.50",
        payeeName,
    });

    await page.goto("/accounts");
    const accountRow = page.locator("tr", { hasText: accountName });

    await accountRow.getByRole("button", { name: "Delete" }).click();
    await expect(
        page.getByRole("heading", { name: `Delete ${accountName}?` }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByText("Account deleted.")).toBeVisible();
    await expect(accountRow).toHaveCount(0);

    await page.goto("/transactions/all-accounts");
    await expect(page.getByText(payeeName)).toHaveCount(0);
});
