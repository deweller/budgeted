import { expect, type Page } from "@playwright/test";

export async function selectComboboxOption(
    page: Page,
    label: string,
    optionLabel: string,
) {
    const combobox = page.getByRole("combobox", { name: label });

    await combobox.click();
    await combobox.fill(optionLabel);
    const option = page
        .getByRole("option")
        .filter({ hasText: optionLabel })
        .first();

    await expect(option).toBeVisible();
    await option.click();
    await expect(combobox).toHaveValue(optionLabel);
}
