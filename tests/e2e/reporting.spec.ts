import { expect, test } from "@playwright/test";

import {
    signInTestUser,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";

test("category detail reporting is reachable when test user credentials are provided", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    await signInTestUser(page);

    await page.goto("/reporting");
    await expect(
        page.getByRole("link", { name: /Category detail/i }),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: /Category tracking/i }),
    ).toBeVisible();

    await page.getByRole("link", { name: /Category detail/i }).click();
    await expect(
        page.getByRole("combobox", { name: "Category" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter" })).toBeVisible();
    await expect(page.getByText("Running total")).toBeVisible();
});

test("category tracking shows yearly available category activity", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    await signInTestUser(page);
    await page.goto("/reporting/category-tracking");

    await expect(page.getByRole("combobox", { name: "Category" })).toBeVisible();
    await expect(page.getByLabel("Year")).toBeVisible();
    await expect(
        page.getByRole("heading", { name: /Category balance for/i }),
    ).toBeVisible();
    await expect(
        page.getByTestId("category-tracking-zero-line"),
    ).toBeVisible();
});
