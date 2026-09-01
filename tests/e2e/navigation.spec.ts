import { expect, test, type Page } from "@playwright/test";

import {
    signInTestUserFromSignInPage,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { expectBudgetPage } from "./support/budget";

async function expectDarkDocument(page: Page) {
    await expect
        .poll(() =>
            page.evaluate(
                () => window.getComputedStyle(document.documentElement).colorScheme,
            ),
        )
        .toBe("dark");
    await expect
        .poll(() =>
            page.evaluate(() => window.getComputedStyle(document.body).backgroundColor),
        )
        .toBe("rgb(6, 11, 25)");
}

async function expectNoThemeControls(page: Page) {
    await expect(
        page.getByRole("button", { name: /theme|light mode|dark mode/i }),
    ).toHaveCount(0);
}

async function expectLandingRoute(page: Page) {
    await expect(page).toHaveURL(/\/dashboard$/);
}

test("public entry offers a direct path into the shared workspace", async ({
    page,
}) => {
    await page.goto("/");
    await expectDarkDocument(page);
    await expectNoThemeControls(page);

    await expect(
        page.getByRole("heading", {
            name: "Budgeted",
        }),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "Open budget" }),
    ).toHaveAttribute("href", "/budget");
});

test("mobile navigation reaches every primary section after sign in", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("link", { name: "Open budget" }).click();
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await signInTestUserFromSignInPage(page);
    await expectLandingRoute(page);
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await page.reload();
    await expectLandingRoute(page);
    await expectDarkDocument(page);

    const mobileNav = page.getByRole("navigation", { name: "Primary mobile" });

    await expect(mobileNav).toBeVisible();

    await mobileNav.getByRole("link", { name: "Transactions" }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await expect(
        page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByText("Transactions", { exact: true }),
    ).toBeVisible();

    await mobileNav.getByRole("link", { name: "Accounts" }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await expect(
        page.getByRole("button", { name: "Add account" }),
    ).toBeVisible();

    await mobileNav.getByRole("link", { name: "Reporting" }).click();
    await expect(page).toHaveURL(/\/reporting$/);
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await expect(
        page.getByRole("link", { name: /Category detail/i }),
    ).toBeVisible();

    await mobileNav
        .getByRole("link", { name: "Monthly Budget", exact: true })
        .click();
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await expectBudgetPage(page);
});
