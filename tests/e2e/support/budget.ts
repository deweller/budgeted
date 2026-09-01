import { expect, type Locator, type Page } from "@playwright/test";

type GlobalBudgetCategoryInput = {
    groupLabel: string;
    name: string;
};

export async function expectBudgetPage(page: Page) {
    await expect(page).toHaveURL(/\/budget(?:\?month=\d{4}-\d{2})?$/);
    await expect(page.getByText("Active period")).toBeVisible();
}

export async function expectGlobalBudgetPage(page: Page) {
    await expect(page).toHaveURL(/\/global-budget$/);
    await expect(page.getByRole("button", { name: "Add group" })).toBeVisible();
}

async function clickBudgetPeriodNavigation(input: {
    expectedPeriodId: string;
    page: Page;
    direction: "next" | "previous";
}) {
    const expectedUrl = new RegExp(
        `/budget\\?month=${input.expectedPeriodId}$`,
    );
    const buttonName =
        input.direction === "next"
            ? "Go to next month"
            : "Go to previous month";

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const button = input.page.getByRole("button", { name: buttonName });

        await expect(button).toBeVisible();
        await button.click();

        if (
            await input.page
                .waitForURL(expectedUrl, { timeout: 2_000 })
                .then(() => true)
                .catch(() => false)
        ) {
            return;
        }

        await input.page.waitForTimeout(250);
    }

    await expect(input.page).toHaveURL(expectedUrl);
}

export async function goToNextBudgetMonth(
    page: Page,
    expectedPeriodId: string,
) {
    await clickBudgetPeriodNavigation({
        direction: "next",
        expectedPeriodId,
        page,
    });
}

export async function goToPreviousBudgetMonth(
    page: Page,
    expectedPeriodId: string,
) {
    await clickBudgetPeriodNavigation({
        direction: "previous",
        expectedPeriodId,
        page,
    });
}

export async function createGlobalBudgetCategory(
    page: Page,
    input: GlobalBudgetCategoryInput,
) {
    await page.goto("/global-budget");
    await expectGlobalBudgetPage(page);
    await page.getByRole("button", { name: "Add group" }).click();
    await page.getByLabel("Group name").fill(input.groupLabel);

    const groupResponsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith("/api/budget/groups") &&
            response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Save group" }).click();
    const groupResponse = await groupResponsePromise;

    if (!groupResponse.ok()) {
        throw new Error(
            `Budget group save failed: ${groupResponse.status()} ${await groupResponse.text()}`,
        );
    }

    await page.reload();
    await expectGlobalBudgetPage(page);

    const groupHeading = page.getByRole("heading", { name: input.groupLabel }).last();

    await expect(groupHeading).toBeVisible();

    await groupHeading
        .locator("xpath=ancestor::section[1]")
        .getByRole("button", { name: "Add category" })
        .click();
    await page.getByLabel("Category name").fill(input.name);

    const categoryResponsePromise = page.waitForResponse(
        (response) =>
            response.url().endsWith("/api/budget/categories") &&
            response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Save category" }).click();
    const categoryResponse = await categoryResponsePromise;

    if (!categoryResponse.ok()) {
        throw new Error(
            `Budget category save failed: ${categoryResponse.status()} ${await categoryResponse.text()}`,
        );
    }

    await page.reload();
    await expectGlobalBudgetPage(page);
    await expect(
        page.getByRole("row", { name: new RegExp(input.name) }),
    ).toBeVisible();
}

export async function commitBudgetAssignedAmount(
    page: Page,
    categoryRow: Locator,
    categoryName: string,
    amount: string,
) {
    const editButton = categoryRow.getByRole("button", {
        name: `Edit assigned amount for ${categoryName}`,
        exact: true,
    });

    await editButton.click();

    const input = categoryRow.getByRole("textbox", {
        name: `Assigned amount for ${categoryName}`,
        exact: true,
    });

    await expect(input).toBeVisible();
    await input.fill(amount);

    const saveResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());

        return (
            /\/api\/budget\/periods\/[^/]+\/allocations$/u.test(
                url.pathname,
            ) && response.request().method() === "PUT"
        );
    });

    await input.press("Enter");
    const saveResponse = await saveResponsePromise;

    if (!saveResponse.ok()) {
        throw new Error(
            `Budget allocation save failed: ${saveResponse.status()} ${await saveResponse.text()}`,
        );
    }

    const summary = (await saveResponse.json()) as {
        categories: Array<{
            assignedCents: number;
            name: string;
        }>;
    };
    const savedCategory = summary.categories.find(
        (category) => category.name === categoryName,
    );

    expect(savedCategory?.assignedCents).toBe(parseBudgetAmountCents(amount));
    await expect(editButton).toHaveText(formatBudgetAmount(amount), {
        timeout: 15_000,
    });
}

export function getSeededPeriodId(seed: number, lane = 0) {
    const normalizedSeed = Math.abs(seed + lane * 9_973);
    const year = 2100 + (normalizedSeed % 240);
    const month = Math.floor(normalizedSeed / 240) % 12;

    return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function formatBudgetAmount(amount: string) {
    const cents = parseBudgetAmountCents(amount);
    const absoluteAmount = Math.abs(cents) / 100;
    const formattedAmount = absoluteAmount.toLocaleString("en-US", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
    });

    return `${cents < 0 ? "-" : ""}$${formattedAmount}`;
}

function parseBudgetAmountCents(amount: string) {
    const parsedAmount = Number(amount.replace(/[$,\s]/gu, ""));

    return Math.round(parsedAmount * 100);
}
