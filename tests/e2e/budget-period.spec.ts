import { expect, test } from "@playwright/test";

import {
    signInTestUserFromSignInPage,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { createAccount } from "./support/accounts";
import {
    commitBudgetAssignedAmount,
    createGlobalBudgetCategory,
    expectBudgetPage,
    getSeededPeriodId,
    goToNextBudgetMonth,
    goToPreviousBudgetMonth,
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

function formatPeriodLabel(periodId: string) {
    const [year, month] = periodId.split("-").map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, 1));
    const monthLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        timeZone: "UTC",
    }).format(anchor);

    return `${monthLabel}, ${anchor.getUTCFullYear()}`;
}

async function openBudgetPeriodForCategory(
    page: import("@playwright/test").Page,
    periodId: string,
    categoryName: string,
) {
    const url = `/budget?month=${periodId}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.goto(url);
        await expectBudgetPage(page);

        const categoryRow = page.getByRole("row", {
            name: new RegExp(categoryName),
        });
        const assignedAmountButton = categoryRow.getByRole("button", {
            name: `Edit assigned amount for ${categoryName}`,
        });

        if (await assignedAmountButton.isVisible().catch(() => false)) {
            return { assignedAmountButton, categoryRow };
        }

        await page.reload();
    }

    const categoryRow = page.getByRole("row", {
        name: new RegExp(categoryName),
    });
    const assignedAmountButton = categoryRow.getByRole("button", {
        name: `Edit assigned amount for ${categoryName}`,
    });

    await expect(assignedAmountButton).toBeVisible();

    return { assignedAmountButton, categoryRow };
}

test("sign-in page renders", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(
        page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("budget page is reachable after sign in when test user credentials are provided", async ({
    page,
}) => {
    test.slow();
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const nonce = Date.now();
    const categoryName = `Budget Reload ${nonce}`;
    const initialPeriodId = getSeededPeriodId(nonce, 1);
    const previousPeriodId = shiftPeriodId(initialPeriodId, -1);
    const futurePeriodId = shiftPeriodId(initialPeriodId, 1);
    const secondFuturePeriodId = shiftPeriodId(initialPeriodId, 2);

    await page.goto("/");
    await page.getByRole("link", { name: "Open budget" }).click();
    await signInTestUserFromSignInPage(page);

    await expect(page).toHaveURL(/\/dashboard$/);

    await createAccount(page, {
        name: `Budget Account ${nonce}`,
        openingBalance: "100.00",
    });

    await createGlobalBudgetCategory(page, {
        name: categoryName,
        groupLabel: "Reload checks",
    });
    let { assignedAmountButton, categoryRow } =
        await openBudgetPeriodForCategory(page, initialPeriodId, categoryName);

    await expect(
        page.getByText(formatPeriodLabel(initialPeriodId)),
    ).toBeVisible();

    await commitBudgetAssignedAmount(page, categoryRow, categoryName, "11.00");
    await expect(assignedAmountButton).toHaveText("$11.00");

    await goToPreviousBudgetMonth(page, previousPeriodId);
    await expect(
        page.getByText(formatPeriodLabel(previousPeriodId)),
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(
        new RegExp(`/budget\\?month=${initialPeriodId}$`),
    );
    await expect(
        page.getByText(formatPeriodLabel(initialPeriodId)),
    ).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(
        new RegExp(`/budget\\?month=${previousPeriodId}$`),
    );
    await expect(
        page.getByText(formatPeriodLabel(previousPeriodId)),
    ).toBeVisible();

    ({ assignedAmountButton, categoryRow } = await openBudgetPeriodForCategory(
        page,
        futurePeriodId,
        categoryName,
    ));
    await expect(page).toHaveURL(
        new RegExp(`/budget\\?month=${futurePeriodId}$`),
    );
    await expect(
        page.getByText(formatPeriodLabel(futurePeriodId)),
    ).toBeVisible();
    await expect(page.getByText(categoryName)).toBeVisible();
    await expect(assignedAmountButton).toHaveText("$0.00");

    await commitBudgetAssignedAmount(page, categoryRow, categoryName, "22.00");
    await expect(assignedAmountButton).toHaveText("$22.00");

    await goToNextBudgetMonth(page, secondFuturePeriodId);
    ({ assignedAmountButton, categoryRow } = await openBudgetPeriodForCategory(
        page,
        secondFuturePeriodId,
        categoryName,
    ));
    await expect(
        page.getByText(formatPeriodLabel(secondFuturePeriodId)),
    ).toBeVisible();
    await expect(assignedAmountButton).toHaveText("$0.00");

    await commitBudgetAssignedAmount(page, categoryRow, categoryName, "33.00");
    await expect(assignedAmountButton).toHaveText("$33.00");

    await goToPreviousBudgetMonth(page, futurePeriodId);
    ({ assignedAmountButton, categoryRow } = await openBudgetPeriodForCategory(
        page,
        futurePeriodId,
        categoryName,
    ));
    await expect(assignedAmountButton).toHaveText("$22.00");

    await goToPreviousBudgetMonth(page, initialPeriodId);
    ({ assignedAmountButton, categoryRow } = await openBudgetPeriodForCategory(
        page,
        initialPeriodId,
        categoryName,
    ));
    await expect(assignedAmountButton).toHaveText("$11.00");

    await page.goto("/budget?month=2026-12");
    await expect(page.getByText("December, 2026")).toBeVisible();
    await goToNextBudgetMonth(page, "2027-01");
    await expect(page.getByText("January, 2027")).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/budget\?month=2027-01$/);
    await expect(page.getByText("January, 2027")).toBeVisible();
    await expect(page.getByText(categoryName)).toBeVisible();
});
