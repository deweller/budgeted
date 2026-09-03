import { hashPassword } from "../../../src/lib/auth/password";
import { upsertSeededUserAccount } from "../../../src/lib/auth/user-account";
import { requireLedgerTableName } from "../../../src/lib/db/resource";
import { executeReset } from "../../../src/lib/db/reset/reset-executor";
import {
    getBrowserTestStartupError,
    resolveBrowserTestEnvironment,
} from "../../../src/lib/env/browser-test";
import { createE2ELedger } from "./ledger-lifecycle";

const DEFAULT_E2E_STAGE = "e2e";

async function bootstrapTestUserAccount(input: {
    email: string;
    password: string;
}) {
    await upsertSeededUserAccount({
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: "normal",
    });
}

function resolveManagedE2EStage() {
    return process.env.E2E_SST_STAGE ?? DEFAULT_E2E_STAGE;
}

function assertE2EResetTarget(stage: string) {
    if (
        stage !== DEFAULT_E2E_STAGE &&
        process.env.E2E_ALLOW_NON_E2E_RESET !== "1"
    ) {
        throw new Error(
            `Refusing to reset SST stage "${stage}" for E2E. Use the ${DEFAULT_E2E_STAGE} stage or set E2E_ALLOW_NON_E2E_RESET=1 explicitly.`,
        );
    }
}

async function resetManagedE2EDatabase() {
    const stage = resolveManagedE2EStage();

    assertE2EResetTarget(stage);
    console.log(`Resetting E2E database for SST stage ${stage}...`);

    const outcome = await executeReset({
        tableName: requireLedgerTableName(),
        targetLabel: stage,
    });

    if (outcome.status !== "success") {
        throw new Error(
            `Unable to reset the E2E database for Playwright. Status: ${outcome.status}.`,
        );
    }
}

export default async function globalSetup() {
    const browserTestEnvironment = resolveBrowserTestEnvironment({
        loadLocalEnv: false,
    });
    const startupError = getBrowserTestStartupError(browserTestEnvironment);

    if (startupError) {
        throw new Error(startupError);
    }

    if (browserTestEnvironment.authenticatedPrerequisites.length > 0) {
        return;
    }

    const isManagedSstRun = process.env.PLAYWRIGHT_MANAGED_SST === "1";

    if (
        (browserTestEnvironment.mode === "managedLocal" || isManagedSstRun) &&
        browserTestEnvironment.startupPrerequisites.length === 0
    ) {
        await bootstrapTestUserAccount({
            email: browserTestEnvironment.userEmail!,
            password: browserTestEnvironment.userPassword!,
        });
    }

    if (browserTestEnvironment.userEmail && !process.env.E2E_USER_EMAIL) {
        process.env.E2E_USER_EMAIL = browserTestEnvironment.userEmail;
    }

    if (
        browserTestEnvironment.userPassword &&
        !process.env.E2E_USER_PASSWORD
    ) {
        process.env.E2E_USER_PASSWORD = browserTestEnvironment.userPassword;
    }

    if (isManagedSstRun) {
        await resetManagedE2EDatabase();
    }

    if (isManagedSstRun || browserTestEnvironment.ledgerTableName) {
        await createE2ELedger(browserTestEnvironment.userEmail);
    }
}
