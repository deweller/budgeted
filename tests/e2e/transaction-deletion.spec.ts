import { expect, test } from "@playwright/test";

import {
    signInTestUser,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { createAccount } from "./support/accounts";
import { createTransaction, getTransactionRow } from "./support/transactions";

test("transaction delete preview can be cancelled", async ({ page }) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const accountName = `Transaction Wallet ${nonce}`;
    const payeeName = `Transaction Merchant ${nonce}`;

    await signInTestUser(page);
    await createAccount(page, { name: accountName });
    await createTransaction(page, {
        accountName,
        amount: "-22.10",
        payeeName,
    });

    const transactionRow = getTransactionRow(page, payeeName);
    await transactionRow.locator("td").first().click();
    await page
        .getByRole("region", { name: "Selected row actions" })
        .getByRole("button", { name: "Delete" })
        .click();

    await expect(
        page.getByRole("heading", { name: `Delete ${payeeName}?` }),
    ).toBeVisible();
    await expect(
        page.getByText(
            "This deletion is permanent. All related data will be deleted.",
        ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(transactionRow).toBeVisible();
});

test("transaction deletion removes the saved row from the ledger", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const accountName = `Ledger Wallet ${nonce}`;
    const payeeName = `Ledger Merchant ${nonce}`;

    await signInTestUser(page);
    await createAccount(page, { name: accountName });
    await createTransaction(page, {
        accountName,
        amount: "-22.10",
        payeeName,
    });

    const transactionRow = getTransactionRow(page, payeeName);
    await transactionRow.locator("td").first().click();
    await page
        .getByRole("region", { name: "Selected row actions" })
        .getByRole("button", { name: "Delete" })
        .click();
    await expect(
        page.getByRole("heading", { name: `Delete ${payeeName}?` }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Delete permanently" }).click();

    await expect(transactionRow).toHaveCount(0);
});
