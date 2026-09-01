import { expect, test, type Page } from "@playwright/test";

import {
    signInTestUserFromSignInPage,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { createAccount } from "./support/accounts";
import {
    commitBudgetAssignedAmount,
    createGlobalBudgetCategory,
    expectBudgetPage,
    expectGlobalBudgetPage,
    getSeededPeriodId,
} from "./support/budget";

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function getPeriodId(input: Date) {
    return `${input.getUTCFullYear()}-${pad(input.getUTCMonth() + 1)}`;
}

function shiftPeriodId(periodId: string, offset: number) {
    const [year, month] = periodId.split("-").map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, 1));
    anchor.setUTCMonth(anchor.getUTCMonth() + offset);
    return getPeriodId(anchor);
}

async function commitInlineGlobalBudgetField(
    page: Page,
    label: string,
    value: string,
) {
    const saveResponsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith("/api/budget/plan") &&
            response.request().method() === "PUT",
    );

    await page.getByRole("button", { name: label }).click();
    await page.getByLabel(label).fill(value);
    await page.getByLabel(label).press("Enter");

    const saveResponse = await saveResponsePromise;

    if (!saveResponse.ok()) {
        throw new Error(
            `Budget plan save failed: ${saveResponse.status()} ${await saveResponse.text()}`,
        );
    }
}

test("budget plan defaults are saved without auto-assigning untouched months", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);
    test.slow();

    const nonce = Date.now();
    const accountName = `Global Plan Account ${nonce}`;
    const groupName = `Essentials ${nonce}`;
    const categoryName = `Global Groceries ${nonce}`;
    const futurePeriodId = getSeededPeriodId(nonce, 2);
    const untouchedFuturePeriodId = shiftPeriodId(futurePeriodId, 1);

    await page.goto("/");
    await page.getByRole("link", { name: "Open budget" }).click();
    await signInTestUserFromSignInPage(page);

    await expect(page).toHaveURL(/\/dashboard$/);

    await createAccount(page, {
        name: accountName,
        openingBalance: "100.00",
    });
    const primaryNav = page.getByRole("navigation", {
        name: "Primary",
        exact: true,
    });

    await primaryNav
        .getByRole("link", { name: "Budget Plan", exact: true })
        .click();

    await expectGlobalBudgetPage(page);
    await createGlobalBudgetCategory(page, {
        groupLabel: groupName,
        name: categoryName,
    });

    await commitInlineGlobalBudgetField(
        page,
        `Amount for ${categoryName}`,
        "65.00",
    );

    await page.reload();
    await expectGlobalBudgetPage(page);
    await expect(
        page.getByRole("button", {
            name: `Amount for ${categoryName}`,
        }),
    ).toHaveText("$65.00");

    await primaryNav
        .getByRole("link", { name: "Monthly Budget", exact: true })
        .click();
    await page.goto(`/budget?month=${futurePeriodId}`);
    await expectBudgetPage(page);
    await expect(page).toHaveURL(
        new RegExp(`/budget\\?month=${futurePeriodId}$`),
    );
    await expect(
        page.getByRole("button", { name: "Add category" }),
    ).toHaveCount(0);

    const groceriesRow = page.getByRole("row", {
        name: new RegExp(categoryName),
    });

    await expect(
        groceriesRow.getByRole("button", {
            name: `Edit assigned amount for ${categoryName}`,
        }),
    ).toHaveText("$0.00");

    await commitBudgetAssignedAmount(page, groceriesRow, categoryName, "30.00");

    await expect(page.getByText("Allocations saved.")).toBeVisible();

    await primaryNav
        .getByRole("link", { name: "Budget Plan", exact: true })
        .click();
    await expectGlobalBudgetPage(page);

    await commitInlineGlobalBudgetField(
        page,
        `Amount for ${categoryName}`,
        "80.00",
    );

    await page.reload();
    await expectGlobalBudgetPage(page);
    await expect(
        page.getByRole("button", {
            name: `Amount for ${categoryName}`,
        }),
    ).toHaveText("$80.00");

    await page.goto(`/budget?month=${untouchedFuturePeriodId}`);
    await expectBudgetPage(page);
    await expect(page).toHaveURL(
        new RegExp(`/budget\\?month=${untouchedFuturePeriodId}$`),
    );

    const untouchedGroceriesRow = page.getByRole("row", {
        name: new RegExp(categoryName),
    });

    await expect(
        untouchedGroceriesRow.getByRole("button", {
            name: `Edit assigned amount for ${categoryName}`,
        }),
    ).toHaveText("$0.00");

    await page.goto(`/budget?month=${futurePeriodId}`);
    await expect(page).toHaveURL(
        new RegExp(`/budget\\?month=${futurePeriodId}$`),
    );
    await page.reload();
    await expectBudgetPage(page);

    await expect(
        groceriesRow.getByRole("button", {
            name: `Edit assigned amount for ${categoryName}`,
        }),
    ).toHaveText("$30.00");
});
