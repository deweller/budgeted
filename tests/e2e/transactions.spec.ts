import { test } from "@playwright/test";

import {
    signInTestUser,
    skipIfAuthenticatedTestUserIsUnavailable,
} from "./support/auth";
import { createAccount } from "./support/accounts";
import {
    createTransaction,
    expectTransactionRowVisible,
} from "./support/transactions";

test("accounts and transactions are reachable after sign in when test user credentials are provided", async ({
    page,
}) => {
    skipIfAuthenticatedTestUserIsUnavailable(test);

    const accountName = `Wallet ${Date.now()}`;
    const payeeName = `Employer ${Date.now()}`;

    await signInTestUser(page);

    await createAccount(page, { name: accountName });

    await createTransaction(page, {
        accountName,
        amount: "45.00",
        payeeName,
    });

    await page.reload();
    await expectTransactionRowVisible(page, payeeName);
});
