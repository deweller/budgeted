import { expect, type Page } from "@playwright/test";

type CreateAccountInput = {
    accountType?: string;
    name: string;
    openingBalance?: string;
};

export async function expectAccountsPage(page: Page) {
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(
        page.getByRole("button", { name: "Add account" }),
    ).toBeVisible();
}

export async function createAccount(
    page: Page,
    {
        accountType = "cash",
        name,
        openingBalance = "150.00",
    }: CreateAccountInput,
) {
    await page.goto("/accounts");
    await expectAccountsPage(page);

    const accountNameInput = page.getByLabel("Account name");

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.getByRole("button", { name: "Add account" }).click();

        if (await accountNameInput.isVisible().catch(() => false)) {
            break;
        }

        await page.waitForTimeout(250);
    }

    await expect(accountNameInput).toBeVisible();
    await accountNameInput.fill(name);
    await page.getByLabel("Account type").selectOption(accountType);
    await page.getByLabel("Opening balance").fill(openingBalance);

    const responsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith("/api/accounts") &&
            response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Save account" }).click();
    const response = await responsePromise;

    if (!response.ok()) {
        throw new Error(
            `Account save failed: ${response.status()} ${await response.text()}`,
        );
    }

    await expect(
        page.getByRole("cell", { name, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
}
