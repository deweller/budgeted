import {
    expect,
    type Page,
    type PlaywrightTestArgs,
    type PlaywrightTestOptions,
    type PlaywrightWorkerArgs,
    type PlaywrightWorkerOptions,
    type TestType,
} from "@playwright/test";

import {
    getBrowserTestAuthenticatedSkipReason,
    resolveBrowserTestEnvironment,
} from "@/lib/env/browser-test";

type BrowserTest = TestType<
    PlaywrightTestArgs & PlaywrightTestOptions,
    PlaywrightWorkerArgs & PlaywrightWorkerOptions
>;

type TestUserCredentials = {
    email: string;
    password: string;
};

function getTestUserCredentials(): TestUserCredentials | undefined {
    const resolution = resolveBrowserTestEnvironment({ loadLocalEnv: false });
    const email = resolution.userEmail;
    const password = resolution.userPassword;

    if (!email || !password) {
        return undefined;
    }

    return { email, password };
}

export function getAuthenticatedTestUserSkipReason() {
    const resolution = resolveBrowserTestEnvironment({ loadLocalEnv: false });
    const skipReason = getBrowserTestAuthenticatedSkipReason(resolution);

    if (skipReason) {
        return skipReason;
    }

    if (!getTestUserCredentials()) {
        return "Authenticated browser scenarios require test user credentials.";
    }

    return undefined;
}

export function skipIfAuthenticatedTestUserIsUnavailable(test: BrowserTest) {
    const skipReason = getAuthenticatedTestUserSkipReason();

    test.skip(Boolean(skipReason), skipReason);
}

function requireTestUserCredentials() {
    const credentials = getTestUserCredentials();

    if (!credentials) {
        throw new Error(
            getAuthenticatedTestUserSkipReason() ??
                "Authenticated browser scenarios require test user credentials.",
        );
    }

    return credentials;
}

async function submitTestUserCredentials(page: Page) {
    const credentials = requireTestUserCredentials();

    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Password").fill(credentials.password);
    await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInTestUser(page: Page) {
    await page.goto("/sign-in");
    await submitTestUserCredentials(page);
    await expect(page).toHaveURL(/\/dashboard$/);
}

export async function signInTestUserFromSignInPage(page: Page) {
    await submitTestUserCredentials(page);
    await expect(page).toHaveURL(/\/dashboard$/);
}
