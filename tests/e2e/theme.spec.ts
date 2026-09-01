import { expect, test, type Page } from "@playwright/test";

import {
    signInTestUserFromSignInPage,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";

async function expectDarkDocument(page: Page) {
    await expect(
        page.locator('meta[name="theme-color"]').first(),
    ).toHaveAttribute("content", "#07101b");

    await expect
        .poll(() =>
            page.evaluate(
                () => window.getComputedStyle(document.documentElement).colorScheme,
            ),
        )
        .toBe("dark");
    await expect
        .poll(() =>
            page.evaluate(() =>
                Array.from(document.documentElement.classList).includes("dark"),
            ),
        )
        .toBe(true);
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
    await expect(
        page.getByRole("combobox", { name: /theme|appearance/i }),
    ).toHaveCount(0);
}

test("public and auth routes render with the dark document theme", async ({
    page,
}) => {
    await page.goto("/");
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await page.reload();
    await expectDarkDocument(page);

    await page.getByRole("link", { name: "Open budget" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await page.reload();
    await expectDarkDocument(page);
});

test("authenticated workspace routes preserve dark mode across navigation", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    await page.goto("/sign-in");
    await signInTestUserFromSignInPage(page);
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await page.reload();
    await expectDarkDocument(page);

    await page.goto("/transactions");
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
    await page.reload();
    await expectDarkDocument(page);

    await page.goto("/reporting");
    await expectDarkDocument(page);
    await expectNoThemeControls(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expectDarkDocument(page);
    await expectNoThemeControls(page);
});
