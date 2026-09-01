import { expect, type Page } from "@playwright/test";

import { selectComboboxOption } from "./combobox";

type CreateTransactionInput = {
    accountName: string;
    amount: string;
    categoryName?: string;
    memo?: string;
    payeeName: string;
};

export function getTransactionRow(page: Page, payeeName: string) {
    return page.locator("tr", { hasText: payeeName });
}

export async function expectTransactionRowVisible(
    page: Page,
    payeeName: string,
) {
    await expect(getTransactionRow(page, payeeName)).toBeVisible({
        timeout: 15_000,
    });
}

export async function expectAllAccountsTransactionsPage(page: Page) {
    await expect(page).toHaveURL(/\/transactions\/all-accounts$/);
    await expect(
        page.getByRole("button", { name: "New transaction" }),
    ).toBeVisible();
}

async function openNewTransactionDialog(page: Page) {
    await page.goto("/transactions/all-accounts");
    await expectAllAccountsTransactionsPage(page);

    const amountInput = page.getByLabel("Amount");

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.getByRole("button", { name: "New transaction" }).click();

        if (await amountInput.isVisible().catch(() => false)) {
            break;
        }

        await page.waitForTimeout(250);
    }

    await expect(amountInput).toBeVisible();

    return amountInput;
}

export async function createTransaction(
    page: Page,
    {
        accountName,
        amount,
        categoryName,
        memo,
        payeeName,
    }: CreateTransactionInput,
) {
    const amountInput = await openNewTransactionDialog(page);

    await selectComboboxOption(page, "Account", accountName);

    if (categoryName) {
        await selectComboboxOption(page, "Category", categoryName);
    }

    await amountInput.fill(amount);
    await page.getByLabel("Payee").fill(payeeName);

    if (memo) {
        await page.getByLabel("Memo").fill(memo);
    }

    const responsePromise = page.waitForResponse(
        (response) =>
            response.url().includes("/api/transactions") &&
            response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Save transaction" }).click();

    const response = await responsePromise;

    if (!response.ok()) {
        throw new Error(
            `Transaction save failed with HTTP ${response.status()}.`,
        );
    }

    await expectTransactionRowVisible(page, payeeName);
}
